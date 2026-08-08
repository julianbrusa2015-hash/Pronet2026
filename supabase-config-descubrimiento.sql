-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Umbrales de descubrimiento a config_app
--
-- Cuatro números que definen qué ve el usuario y hoy exigen un deploy:
--   · rating_top            — nota mínima para el filtro "Top" (4.5)
--   · sugeridos_pedido      — prestadores sugeridos al publicar (3)
--   · mapa_prestadores_max  — pines máximos en el mapa (8)
--   · resenas_preview       — reseñas antes del "ver todas" (5)
--
-- Van a la lista blanca de lectura pública: el cliente los necesita sin
-- sesión (el filtro "Top" y el mapa existen para el invitado). `admin_pin`
-- sigue afuera.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.config_app (clave, valor) values
  ('rating_top',           '4.5'),
  ('sugeridos_pedido',     '3'),
  ('mapa_prestadores_max', '8'),
  ('resenas_preview',      '5')
on conflict (clave) do nothing;

drop policy if exists "config_lectura_publica" on public.config_app;
create policy "config_lectura_publica" on public.config_app
  for select
  using (clave = any (array[
    'planes_pagos_activos',
    'mp_checkout_activo',
    'propuesta_expiracion_hs',   -- alias histórico; lo leen las PWA viejas
    'pedido_vencimiento_hs',
    'inactividad_cierre_dias',
    'pedido_fotos_max',
    'adjunto_max_mb',
    'promarket_activo',
    'features_off',
    'rating_top',
    'sugeridos_pedido',
    'mapa_prestadores_max',
    'resenas_preview'
  ]));

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select clave, valor from public.config_app
 where clave in ('rating_top','sugeridos_pedido','mapa_prestadores_max','resenas_preview')
 order by clave;
