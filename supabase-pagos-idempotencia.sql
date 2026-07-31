-- ══════════════════════════════════════════════════════════════════════
-- SEGURIDAD · idempotencia de pagos de MercadoPago
-- ══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (auditoría 2026-07-31):
--   webhook-mp está desplegada con --no-verify-jwt (necesario: la llama
--   MercadoPago, no un usuario logueado), o sea es públicamente
--   invocable. No verificaba firma NI registraba qué pagos ya había
--   procesado, y cada invocación recalculaba vence_en = now() + periodo.
--
--   Un prestador que pagaba UNA vez podía guardar su payment_id y hacer
--   cada mes:
--     POST .../webhook-mp?type=payment&data.id=<su_payment_id>
--   La función consultaba MP, encontraba el pago legítimamente
--   'approved' (lo era) y le extendía la suscripción otro mes.
--   → un pago = suscripción indefinida.
--
--   El chequeo contra la API de MP no ayudaba acá: el pago que se
--   replaya es auténtico.
--
-- SOLUCIÓN:
--   Registrar cada payment_id procesado. El INSERT con PK actúa de
--   candado: si el pago ya se procesó, la unique violation corta el
--   flujo antes de tocar `suscripciones`.
--
--   Bonus: esto también cubre los reintentos LEGÍTIMOS de MercadoPago,
--   que reenvía la misma notificación varias veces por diseño hasta
--   recibir un 200. Antes cada reintento estiraba el vencimiento.
--
--   NOTA: no reemplaza verificar la firma x-signature (pendiente, falta
--   la Secret Key del panel de MP). Son defensas complementarias:
--   la firma prueba que la notificación viene de MP; la idempotencia
--   evita que una notificación válida se aplique más de una vez.

create table if not exists public.pagos_procesados (
  payment_id   text primary key,          -- id del pago en MercadoPago
  usuario_id   uuid references auth.users(id),
  plan         text,
  periodo      text,
  monto        numeric,
  procesado_en timestamptz not null default now()
);

comment on table public.pagos_procesados is
  'Candado de idempotencia para webhook-mp. Un payment_id solo se aplica una vez.';

-- Sin policies a propósito: RLS activo y ninguna policy = nadie desde el
-- cliente puede leer ni escribir. Solo el webhook, que usa service_role
-- y por lo tanto bypassa RLS.
alter table public.pagos_procesados enable row level security;

-- Para poder responder "¿cuándo se procesó el pago X?" desde el panel admin
-- más adelante, agregar una policy de SELECT para es_admin(). Hoy no hace
-- falta y se deja cerrado.
