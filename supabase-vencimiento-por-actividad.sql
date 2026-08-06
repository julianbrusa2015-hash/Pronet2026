-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El reloj del pedido corre desde la última actividad
--
-- PROBLEMA detectado en producción tras aplicar el guard anterior: había
-- pedidos 'Publicado' vencidos hacía 391hs (16 días), sin aviso y sin
-- posibilidad de vencer nunca. El guard decía "con propuestas abiertas no
-- vence" SIN LÍMITE: si el vecino no respondía una propuesta, el pedido
-- quedaba vivo para siempre. Y como el aviso sólo mira lo que vence en
-- las próximas 24hs, esos pedidos tampoco recibían notificación.
--
-- La regla correcta era la otra que se había planteado: la propuesta debe
-- POSTERGAR el vencimiento, no cancelarlo.
--
-- IMPLEMENTACIÓN: en vez de que cada consulta calcule "última propuesta"
-- por su cuenta, un trigger escribe expira_en cuando entra una propuesta.
-- Ventajas:
--   · La fórmula vive en un solo lugar.
--   · El CLIENTE YA LEE expira_en, así que el badge "Expira en Xhs" queda
--     correcto solo — sin esto, la pantalla diría "vencido" mientras el
--     servidor lo mantiene vivo.
--   · vencer_pedidos() vuelve a ser una comparación de fechas, sin
--     subconsulta a propuestas.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. La fórmula: STABLE, no IMMUTABLE ─────────────────────────────────
-- Lee config_app, así que IMMUTABLE era una declaración incorrecta —
-- Postgres puede precalcular e inlinear una immutable asumiendo que su
-- resultado no cambia jamás, y acá cambia si se edita la ventana.
create or replace function public.pedido_vence_en(p_expira timestamptz, p_creado timestamptz)
returns timestamptz
language sql
stable
as $function$
  select coalesce(
    p_expira,
    p_creado + ((select coalesce(nullif(valor,'')::int, 168) from public.config_app
                  where clave = 'propuesta_expiracion_hs') || ' hours')::interval
  );
$function$;

-- ── 2. Trigger: una propuesta corre el reloj ────────────────────────────
create or replace function public.extender_pedido_por_propuesta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hs int;
  v_nuevo timestamptz;
begin
  select coalesce(nullif(valor,'')::int, 168) into v_hs
    from config_app where clave = 'propuesta_expiracion_hs';
  v_hs := coalesce(v_hs, 168);
  v_nuevo := now() + (v_hs || ' hours')::interval;

  -- greatest(): si el vecino ya renovó a una fecha posterior, una
  -- propuesta nueva no debe ACORTAR ese plazo.
  update pedidos p
     set expira_en = greatest(coalesce(p.expira_en, pedido_vence_en(null, p.creado)), v_nuevo),
         aviso_vencimiento_en = null   -- hay plazo nuevo: corresponde volver a avisar
   where p.id = new.pedido_id
     and p.estado in ('Publicado','Vencido');
  return new;
end;
$function$;

drop trigger if exists trg_extender_pedido_por_propuesta on public.propuestas;
create trigger trg_extender_pedido_por_propuesta
  after insert on public.propuestas
  for each row execute function public.extender_pedido_por_propuesta();

-- ── 3. Backfill: aplicar la regla a lo que ya existe ────────────────────
-- Los pedidos con propuestas abiertas pasan a vencer a los 7 días de la
-- ÚLTIMA propuesta, no de la publicación. Los zombis de 391hs quedan con
-- una fecha real y el job puede cerrarlos.
update public.pedidos p
   set expira_en = greatest(
         pedido_vence_en(null, p.creado),
         (select max(x.creado) from public.propuestas x
           where x.pedido_id = p.id and x.estado in ('pendiente','elegida'))
           + ((select coalesce(nullif(valor,'')::int,168) from public.config_app
                where clave='propuesta_expiracion_hs') || ' hours')::interval
       )
 where p.expira_en is null
   and exists (select 1 from public.propuestas x
                where x.pedido_id = p.id and x.estado in ('pendiente','elegida'));

-- ── 4. Vencer: vuelve a ser una comparación de fechas ───────────────────
-- Ya no hace falta excluir los que tienen propuestas: su expira_en ya
-- refleja la prórroga. Sin la subconsulta, un pedido con una propuesta
-- que nadie contestó en 7 días se cierra igual.
create or replace function public.vencer_pedidos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  update pedidos p
     set estado = 'Vencido'
   where p.estado = 'Publicado'
     and pedido_vence_en(p.expira_en, p.creado) < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ── 5. Aviso: misma simplificación ──────────────────────────────────────
create or replace function public.avisar_pedidos_por_vencer()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  with candidatos as (
    select p.id, p.usuario_id, p.titulo
      from pedidos p
     where p.estado = 'Publicado'
       and p.aviso_vencimiento_en is null
       and pedido_vence_en(p.expira_en, p.creado) between now() and now() + interval '24 hours'
  ), avisados as (
    update pedidos set aviso_vencimiento_en = now()
     where id in (select id from candidatos)
    returning id, usuario_id, titulo
  )
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select a.usuario_id, null, 'pedido_por_vencer',
         'Tu pedido vence mañana',
         '«' || left(a.titulo, 60) || '» se cierra en 24hs. Si todavía lo necesitás, renovalo por otros 7 días.',
         '#s-pedidos'
    from avisados a;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke execute on function public.avisar_pedidos_por_vencer() from public, anon, authenticated;
grant  execute on function public.avisar_pedidos_por_vencer() to service_role;

notify pgrst, 'reload schema';

-- ── 6. Corrida ──────────────────────────────────────────────────────────
select public.vencer_pedidos() as vencidos, public.avisar_pedidos_por_vencer() as avisados;
