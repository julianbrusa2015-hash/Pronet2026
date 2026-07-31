-- ═══ PRONET · D1: unificar precios en planes_limites (fuente única para cobro) ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Antes: el precio vivía duplicado en dos lugares que había que sincronizar a
-- mano — window.PRONET_CONFIG.PLANES (config.js, cliente) y la constante
-- PRECIOS en supabase/functions/crear-preferencia/index.ts (Edge Function).
-- planes_limites ya existía pero solo tenía propuestas_mes/fotos_portfolio.
--
-- Ahora: planes_limites también guarda precio_mes/precio_anual/nombre, y
-- crear-preferencia los lee de acá en vez de tener su propia copia. La
-- Edge Function es la que de verdad decide cuánto se le cobra a alguien —
-- que lea de la misma tabla que ya es la fuente real de los límites cierra
-- una de las dos duplicaciones sin tocar el bootstrap del cliente.
--
-- config.js sigue teniendo su propia copia para pintar la UI del checkout
-- (nombre, emoji, badges, loyalty_boost — nada de eso mueve plata). Si se
-- cambia un precio hay que actualizar los dos lugares igual, pero ahora un
-- desfase entre ellos como mucho muestra un número desactualizado en pantalla
-- antes de pagar — ya no puede hacer que se cobre un monto distinto al que
-- decidió el servidor, porque el servidor dejó de tener su propia copia.

alter table public.planes_limites
  add column if not exists nombre       text,
  add column if not exists precio_mes   int,
  add column if not exists precio_anual int;

update public.planes_limites set nombre = 'Base',  precio_mes = 0,     precio_anual = 0      where plan = 'base';
update public.planes_limites set nombre = 'Plus',  precio_mes = 4990,  precio_anual = 49900  where plan = 'plus';
update public.planes_limites set nombre = 'Pro',   precio_mes = 9990,  precio_anual = 99900  where plan = 'pro';
update public.planes_limites set nombre = 'Elite', precio_mes = 19990, precio_anual = 199900 where plan = 'elite';

-- ── Verificación ────────────────────────────────────────────────────────
select plan, nombre, precio_mes, precio_anual, propuestas_mes, fotos_portfolio
  from public.planes_limites
 order by precio_mes;
