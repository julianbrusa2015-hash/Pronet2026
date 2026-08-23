-- ═══ FIX · Parametrías que el panel guarda y el cliente nunca ve ═══
--
-- 2026-08-22.
--
-- ── El problema ────────────────────────────────────────────────────────
-- `config_lectura_publica` limita qué claves de config_app puede leer un
-- usuario común — bien, porque ahí vive `admin_pin` en texto plano.
--
-- Pero SIETE archivos .sql redefinen esa misma policy, cada uno con su propia
-- copia de la lista:
--
--   supabase-parametrias-permisos.sql        9 claves
--   supabase-banners-pagos.sql              10
--   supabase-config-descubrimiento.sql      13
--   supabase-publicaciones-prestador.sql    11
--   supabase-pub-prestador-impulso.sql      12
--   supabase-fix-config-lectura-publica.sql 14  ← el que quedó aplicado
--
-- Gana el último que se corrió. Cada feature copió la lista del momento y, al
-- aplicarse, BORRÓ el acceso a las claves que otra feature había agregado.
--
-- Resultado medido: el cliente lee 21 claves de config_app y sólo 14 son
-- legibles. Las otras 7 llegan undefined, `parseFloat` da NaN, el valor se
-- descarta en silencio y queda el default del código. El panel las guarda
-- bien; no hacen nada.
--
--   rating_top, sugeridos_pedido, mapa_prestadores_max, resenas_preview,
--   sesion_vencimiento_dias  → los umbrales de descubrimiento nunca aplicaron
--   impulsos_activos         → el botón de impulsar NO SE MUESTRA a nadie:
--                              impulsosActivos() compara undefined === 'true'.
--                              Sólo lo ve el admin, que lee todas las claves.
--                              Un producto pago que ningún usuario puede
--                              comprar.
--   impulso_dias             → el texto de la UI cae al fallback de 7
--
-- ── El fix ─────────────────────────────────────────────────────────────
-- Una sola policy con TODAS las claves que el cliente lee. Y una regla:
--
--   **Si el cliente lee una clave nueva de config_app, va en esta lista.
--     Este archivo es el único lugar donde se define la policy.**
--
-- Lo que queda AFUERA, a propósito:
--   admin_pin                  → texto plano, nunca sale del panel
--   rate_limit_pedidos_*       → se aplican en un trigger; el cliente no
--                                necesita conocerlos
--   banners_activos_max        → se consulta por RPC (banners_espacios_libres)

begin;

drop policy if exists config_lectura_publica on public.config_app;
drop policy if exists "config_lectura_publica" on public.config_app;

create policy config_lectura_publica on public.config_app
  for select using (clave = any (array[
    -- Circuito de pagos y features
    'planes_pagos_activos', 'mp_checkout_activo', 'promarket_activo',
    'banners_pagos_activos', 'publicaciones_prestador', 'features_off',
    'impulsos_activos',                                  -- FALTABA
    -- Plazos y topes del ciclo de trabajo
    'propuesta_expiracion_hs', 'pedido_vencimiento_hs',
    'inactividad_cierre_dias', 'pedido_fotos_max', 'adjunto_max_mb',
    'impulso_dias',                                      -- FALTABA
    -- Umbrales de descubrimiento
    'rating_top', 'sugeridos_pedido', 'mapa_prestadores_max',             -- FALTABAN
    'resenas_preview', 'sesion_vencimiento_dias',                          -- FALTABAN
    -- Mercado
    'mkt_pub_vecino_mes',                                -- nueva
    -- Aviso de sistema
    'aviso_sistema_activo', 'aviso_sistema_mensaje', 'aviso_sistema_color'
  ]));

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La policy quedó una sola y con 21 claves:
--      select policyname, qual from pg_policies
--       where tablename = 'config_app' and cmd = 'SELECT';
--
-- 2. Desde una sesión de usuario común (no admin), config_app tiene que
--    devolver 21 filas, no 14. Se puede medir con el test de siempre:
--      npx playwright test --project=msedge -g "C4"
--
-- 3. Concreto: el botón de impulsar tiene que aparecerle a un prestador con
--    un aviso activo, no sólo al admin.
