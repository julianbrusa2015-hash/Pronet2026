-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Vencimiento automático de pedidos
--
-- PROBLEMA (medido en producción el 2026-08-03): de 23 pedidos con estado
-- 'Publicado', 21 habían pasado las 72hs. El vencimiento era sólo VISUAL
-- —la tarjeta decía "Expira en Xhs" pero nada cambiaba el estado— así que
-- el feed le ofrecía al prestador pedidos muertos.
--
-- CRITERIO (revisado con el usuario tras la primera corrida):
--
-- 1. VENTANA DE 7 DÍAS, plana. La primera versión usaba 72hs para todos y
--    los números mostraron el error: de los 21 vencidos, NINGUNO tenía
--    urgencia 'hoy' — 12 decían "esta semana" y 9 "flexible". O sea, la
--    app le pregunta al vecino cuándo lo necesita y después ignoraba la
--    respuesta.
--    Se evaluó escalonar por urgencia (48hs / 10d / 30d) y se descartó:
--    "flexible = 30 días" habría llenado el feed de pedidos de un mes
--    atrás, recreando el problema que se venía a resolver. El vencimiento
--    no sirve para adivinar cuánto dura la necesidad sino para pedir una
--    señal de que sigue viva; 7 días con renovación da esa señal.
--    La urgencia sigue usándose para ordenar el feed y pintar el badge,
--    que es lo que sabe hacer bien.
--
-- 2. CON PROPUESTAS PENDIENTES NO VENCE. Cortar una negociación de varios
--    presupuestos porque se cumplió un plazo es el peor caso posible, y es
--    lo que pasó: 12 de los 21 tenían propuestas (15 en total).
--
-- El cliente filtra por (estado === 'Publicado') en las tres vistas que
-- listan pedidos, así que marcar el estado alcanza. El vecino que lo
-- publicó lo sigue viendo en "Mis pedidos" — esa lista no filtra por
-- estado.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Ventana: 72hs → 168hs (7 días) ───────────────────────────────────
-- Misma clave que lee el cliente (PROPUESTA_EXPIRACION_HS), así app y
-- base no pueden discrepar.
insert into public.config_app (clave, valor) values ('propuesta_expiracion_hs','168')
  on conflict (clave) do update set valor = '168';

-- ── 2. Reparar la primera corrida ───────────────────────────────────────
-- Se revierte lo que no debió vencer bajo el criterio nuevo: los de menos
-- de 7 días y los que tienen una negociación abierta.
-- Antes de esa corrida no existía ningún pedido en 'Vencido', así que
-- tocar ese estado sólo alcanza filas que marcó el job.
update public.pedidos p
   set estado = 'Publicado'
 where p.estado = 'Vencido'
   and (
     p.creado >= now() - interval '168 hours'
     or exists (
       select 1 from public.propuestas x
        where x.pedido_id = p.id and x.estado in ('pendiente','elegida')
     )
   );

-- ── 3. Función ──────────────────────────────────────────────────────────
create or replace function public.vencer_pedidos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hs int;
  v_n  int;
begin
  select coalesce(nullif(valor, '')::int, 168) into v_hs
    from config_app where clave = 'propuesta_expiracion_hs';
  v_hs := coalesce(v_hs, 168);

  update pedidos p
     set estado = 'Vencido'
   where p.estado = 'Publicado'
     and p.creado < now() - (v_hs || ' hours')::interval
     -- Una negociación abierta mantiene vivo el pedido, sin importar la fecha.
     and not exists (
       select 1 from propuestas x
        where x.pedido_id = p.id and x.estado in ('pendiente','elegida')
     );

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Sólo el job. Ningún cliente necesita llamarla, y abierta permitiría
-- vencer pedidos ajenos.
revoke execute on function public.vencer_pedidos() from public;
revoke execute on function public.vencer_pedidos() from anon;
revoke execute on function public.vencer_pedidos() from authenticated;
grant  execute on function public.vencer_pedidos() to service_role;

-- ── 4. Programación horaria ─────────────────────────────────────────────
-- Cada hora y no diaria: con corrida diaria un pedido seguiría ofertable
-- hasta 24hs después de haber vencido.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vencer-pedidos') then
    perform cron.unschedule('vencer-pedidos');
  end if;
end $$;

select cron.schedule(
  'vencer-pedidos',
  '7 * * * *',   -- minuto 7, para no chocar con otros jobs
  $$select public.vencer_pedidos();$$
);

-- ── 5. Corrida y verificación ───────────────────────────────────────────
select public.vencer_pedidos() as vencidos_ahora;
