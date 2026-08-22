-- ═══════════════════════════════════════════════════════════════════════
-- push_suscripciones: soportar tokens de FCM además de Web Push
-- ═══════════════════════════════════════════════════════════════════════
-- La app nativa (Capacitor/Android) no puede usar Web Push — recibe un
-- token de FCM en su lugar. endpoint/p256dh/auth (Web Push) pasan a ser
-- opcionales; fcm_token es la contraparte para el otro camino. El check
-- constraint exige que cada fila tenga los datos completos de UN solo
-- camino, no una mezcla a medias.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.push_suscripciones
  add column if not exists tipo text not null default 'webpush',
  add column if not exists fcm_token text;

alter table public.push_suscripciones
  add constraint push_suscripciones_tipo_check check (tipo in ('webpush', 'fcm'));

alter table public.push_suscripciones alter column endpoint drop not null;
alter table public.push_suscripciones alter column p256dh drop not null;
alter table public.push_suscripciones alter column auth drop not null;

alter table public.push_suscripciones
  add constraint push_suscripciones_datos_completos check (
    (tipo = 'webpush' and endpoint is not null and p256dh is not null and auth is not null)
    or
    (tipo = 'fcm' and fcm_token is not null)
  );

create unique index if not exists push_suscripciones_fcm_token_idx
  on public.push_suscripciones (fcm_token) where fcm_token is not null;
