-- ═══ Retención de notificaciones: parametría + limpieza server-side ═══
--
-- 2026-08-22.
--
-- ── Qué había ──────────────────────────────────────────────────────────
-- Una "limpieza lazy" en el cliente (datos.js, listarNotificaciones): cada vez
-- que un usuario abría la campana, se disparaba un delete de SUS notificaciones
-- leídas hace más de 30 días, con el número escrito en el código.
--
-- Tres problemas:
--
--   1. Sólo limpiaba a quien volvía. Las cuentas abandonadas —las que más
--      conviene purgar, porque nadie va a reclamar esos datos— no se limpiaban
--      NUNCA. El mecanismo fallaba justo donde más hacía falta.
--
--   2. Era fire-and-forget: `.then(()=>{}).catch(()=>{})`. Si RLS lo bloqueaba,
--      volvía sin error y sin borrar, y nadie se enteraba. (Verificado
--      2026-08-22: el permiso está, así que funcionaba — pero no por diseño.)
--
--   3. El plazo era una constante en el código. Cambiarlo exigía deploy.
--
-- ── Por qué el cron REEMPLAZA la limpieza lazy, y no la acompaña ───────
-- Si el plazo fuera parametría en el servidor y siguiera hardcodeado en el
-- cliente, poner `notif_retencion_dias = 60` haría que el cron respete 60 y el
-- cliente siga borrando a los 30. El mismo valor escrito dos veces,
-- contradiciéndose. Un solo mecanismo, un solo número.
--
-- El borrado del cliente se saca en el mismo cambio (datos.js).
--
-- ── Por qué importa ahora ──────────────────────────────────────────────
-- El formulario de Seguridad de los datos de Google Play pregunta por
-- retención y eliminación. Tener una política definida, editable y que se
-- ejecute de verdad —sobre todos los usuarios, no sólo los activos— es
-- exactamente lo que ese formulario evalúa.

-- ── ⚠️ CORRER EN DOS PARTES ───────────────────────────────────────────
-- El SQL Editor de Supabase ejecuta el script como UNA transacción: si el
-- bloque de `cron.schedule` del final falla, se revierte TODO, incluido el
-- insert de la parametría. Pasó la primera vez que se corrió este archivo —
-- el resultado fue "corrió" sin que quedara nada.
--
-- Correr los pasos 1 y 2 (hasta el índice) primero, y el paso 3 (el cron)
-- aparte. Si el cron falla, la función igual queda lista y sólo falta
-- agendarla.
--
-- Es la misma clase de trampa que el revoke por columna de esa mañana: la
-- ejecución no dice "éxito" sobre lo que uno cree que hizo. Verificar contra
-- la base, siempre.

-- ── 1 · La parametría ────────────────────────────────────────────────
insert into public.config_app (clave, valor)
values ('notif_retencion_dias', '30')
on conflict (clave) do nothing;

-- ── 2 · La limpieza, sobre TODOS los usuarios ────────────────────────
-- Sólo borra notificaciones LEÍDAS: una sin leer sigue siendo información
-- pendiente para su dueño, por vieja que sea.
create or replace function public.limpiar_notificaciones_viejas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias int;
  v_n    int;
begin
  select coalesce(nullif(valor, '')::int, 30) into v_dias
    from config_app where clave = 'notif_retencion_dias';
  -- Piso de 1 día: un 0 por error de tipeo borraría todo lo leído al instante.
  v_dias := greatest(1, coalesce(v_dias, 30));

  delete from public.notificaciones
   where leida = true
     and leida_at is not null
     and leida_at < now() - make_interval(days => v_dias);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Corre sin sesión, desde el cron. Ningún cliente la ejecuta.
revoke execute on function public.limpiar_notificaciones_viejas() from public, anon, authenticated;
grant  execute on function public.limpiar_notificaciones_viejas() to service_role;

-- Sin esto el delete recorre la tabla entera cada vez.
create index if not exists notificaciones_limpieza_idx
  on public.notificaciones (leida_at)
  where leida = true;

-- ── 3 · Programación ─────────────────────────────────────────────────
-- Una vez por día alcanza: la retención se mide en días, no en horas. Se
-- elige 04:47 para no chocar con los jobs existentes (minutos 07, 17, 27, 37)
-- y para que corra con la app sin uso.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpiar-notificaciones') then
    perform cron.unschedule('limpiar-notificaciones');
  end if;
end $$;

select cron.schedule('limpiar-notificaciones', '47 4 * * *',
  $$select public.limpiar_notificaciones_viejas();$$);

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La parametría existe:
--      select clave, valor from config_app where clave = 'notif_retencion_dias';
--
-- 2. El job quedó agendado:
--      select jobname, schedule, active from cron.job where jobname = 'limpiar-notificaciones';
--
-- 3. Correrla a mano una vez y ver cuántas borró (devuelve el conteo):
--      select public.limpiar_notificaciones_viejas();
--
--    OJO: esto BORRA de verdad. Para ver antes cuántas caerían, sin borrar:
--      select count(*) from notificaciones
--       where leida = true and leida_at is not null
--         and leida_at < now() - make_interval(days =>
--             (select coalesce(nullif(valor,'')::int,30) from config_app
--               where clave='notif_retencion_dias'));
