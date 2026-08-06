-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Aviso previo al vencimiento + renovación del pedido
--
-- Hasta ahora el pedido moría en silencio: el vecino entraba y ya no
-- estaba. Ahora recibe un aviso 24hs antes y puede renovarlo de un toque.
-- Además de ser más amable, es lo que le da sentido al mecanismo: el
-- vencimiento no adivina cuánto dura la necesidad, pide una señal de que
-- sigue viva. Sin forma de responder esa señal, sólo destruye.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Columnas ─────────────────────────────────────────────────────────
-- expira_en: fecha explícita de vencimiento. El CLIENTE YA LA LEE
-- (app.js: `pedido.expira_en ? … : creado + PROPUESTA_EXPIRACION_HS`),
-- así que con crearla la renovación se refleja sola en las tarjetas.
-- Queda NULL en los pedidos existentes: ahí sigue valiendo creado + ventana.
alter table public.pedidos add column if not exists expira_en timestamptz;

-- Marca del aviso, para no mandarlo una vez por hora.
alter table public.pedidos add column if not exists aviso_vencimiento_en timestamptz;

-- Índice del job: busca por estado + vencimiento y descarta los ya avisados.
create index if not exists idx_pedidos_vencimiento
  on public.pedidos (estado, expira_en, creado)
  where estado = 'Publicado';

-- ── 2. Vencimiento efectivo, en un solo lugar ───────────────────────────
-- Tres consultas necesitan la misma fórmula; tenerla suelta garantiza que
-- alguna se desincronice.
create or replace function public.pedido_vence_en(p_expira timestamptz, p_creado timestamptz)
returns timestamptz
language sql
immutable
as $function$
  select coalesce(
    p_expira,
    p_creado + ((select coalesce(nullif(valor,'')::int, 168) from public.config_app
                  where clave = 'propuesta_expiracion_hs') || ' hours')::interval
  );
$function$;

-- ── 3. Vencer (actualizada para respetar expira_en) ─────────────────────
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
     and pedido_vence_en(p.expira_en, p.creado) < now()
     -- Una negociación abierta mantiene vivo el pedido, sin importar la fecha.
     and not exists (
       select 1 from propuestas x
        where x.pedido_id = p.id and x.estado in ('pendiente','elegida')
     );
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ── 4. Aviso 24hs antes ─────────────────────────────────────────────────
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
       -- Con propuestas abiertas el pedido no vence, así que avisar sería
       -- una alarma falsa.
       and not exists (
         select 1 from propuestas x
          where x.pedido_id = p.id and x.estado in ('pendiente','elegida')
       )
  ), avisados as (
    update pedidos set aviso_vencimiento_en = now()
     where id in (select id from candidatos)
    returning id, usuario_id, titulo
  )
  -- Inserción directa, no notificar_usuario(): ese RPC exige una relación
  -- con auth.uid(), y el cron corre sin sesión.
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

-- ── 5. Renovar (la llama el vecino desde la app) ────────────────────────
create or replace function public.renovar_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hs   int;
  v_nuevo timestamptz;
  v_filas int;
begin
  select coalesce(nullif(valor,'')::int, 168) into v_hs
    from config_app where clave = 'propuesta_expiracion_hs';
  v_hs := coalesce(v_hs, 168);
  v_nuevo := now() + (v_hs || ' hours')::interval;

  -- El dueño y sólo el dueño. La cláusula usuario_id = auth.uid() es la
  -- que impide renovar pedidos ajenos: sin ella, el uuid del pedido
  -- alcanzaría para revivir cualquiera.
  update pedidos
     set expira_en = v_nuevo,
         estado = 'Publicado',          -- revive uno recién vencido
         aviso_vencimiento_en = null    -- vuelve a avisarse la próxima vez
   where id = p_pedido_id
     and usuario_id = auth.uid()
     and estado in ('Publicado','Vencido');

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'No se pudo renovar: el pedido no es tuyo o ya está cerrado.');
  end if;
  return jsonb_build_object('ok', true, 'expira_en', v_nuevo);
end;
$function$;

grant execute on function public.renovar_pedido(uuid) to authenticated;

-- ── 6. Programación ─────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'avisar-pedidos-por-vencer') then
    perform cron.unschedule('avisar-pedidos-por-vencer');
  end if;
end $$;

select cron.schedule(
  'avisar-pedidos-por-vencer',
  '17 * * * *',   -- 10 min después de vencer-pedidos, para no solaparse
  $$select public.avisar_pedidos_por_vencer();$$
);

notify pgrst, 'reload schema';

-- ── 7. Verificación ─────────────────────────────────────────────────────
select public.avisar_pedidos_por_vencer() as avisos_enviados;
