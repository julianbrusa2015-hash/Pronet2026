-- ═══ PRONET · UNIQUE en push_suscripciones.fcm_token (C26-08) ═══
--
-- El registro de push NATIVO fallaba —no por Google Play Services, como se
-- creía, sino al GUARDAR el token: guardarTokenFCM hace
--   upsert({usuario_id, tipo:'fcm', fcm_token}, { onConflict: 'fcm_token' })
-- y la tabla no tenía una constraint UNIQUE en fcm_token, así que Postgres
-- respondía "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification". El token FCM sí se obtenía (el teléfono está bien);
-- lo que no se podía era persistirlo.
--
-- Para webpush existe push_suscripciones_endpoint_key (por eso la web anda);
-- faltaba el equivalente para fcm.
--
-- fcm_token es nullable y las filas webpush lo tienen NULL: Postgres trata los
-- NULL como distintos en un UNIQUE, así que la constraint no las afecta.
-- No hay filas fcm ni tokens duplicados (verificado), así que se crea directo.
-- Idempotente.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.push_suscripciones'::regclass
       and conname  = 'push_suscripciones_fcm_token_key'
  ) then
    alter table public.push_suscripciones
      add constraint push_suscripciones_fcm_token_key unique (fcm_token);
  end if;
end $$;
