-- ═══ PRONET · Vencimiento automático de suscripciones ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Cierra el circuito de suscripciones: el trigger sync_plan_prestador ya
-- degrada prestadores.plan a 'base' cuando una fila deja de estar activa,
-- pero nada marcaba las filas como vencidas. Esto lo hace, una vez por día.
--
-- El cliente ya trataba una suscripción vencida como 'base' al leerla
-- (obtenerSuscripcion en datos.js), así que esto no cambia lo que ve el
-- usuario: hace que la base diga la verdad, que es de donde leen los
-- triggers de límite de plan.

create extension if not exists pg_cron with schema extensions;

-- ── Función de vencimiento ──────────────────────────────────────────────
create or replace function public.vencer_suscripciones()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update suscripciones
     set estado = 'vencido'
   where estado = 'activo'
     and vence_en is not null
     and vence_en < now();

  get diagnostics v_n = row_count;

  -- El UPDATE dispara trg_sync_plan_prestador en cada fila, que baja
  -- prestadores.plan a 'base'. No hace falta tocar prestadores acá.
  return v_n;
end;
$$;

-- ── Programar: todos los días a las 00:00 de Buenos Aires (03:00 UTC) ───
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vencer-suscripciones') then
    perform cron.unschedule('vencer-suscripciones');
  end if;
end $$;

select cron.schedule(
  'vencer-suscripciones',
  '0 3 * * *',
  $$select public.vencer_suscripciones();$$
);

-- ── Verificación ────────────────────────────────────────────────────────
-- El job quedó programado:
select jobname, schedule, active from cron.job where jobname = 'vencer-suscripciones';

-- Para correrlo a mano (devuelve cuántas filas venció):
--   select public.vencer_suscripciones();

-- Para ver las últimas corridas:
--   select start_time, status, return_message
--     from cron.job_run_details
--    where jobname = 'vencer-suscripciones'
--    order by start_time desc limit 10;
