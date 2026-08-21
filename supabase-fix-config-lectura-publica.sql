-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Fix: la lista blanca de config_app perdió 10 claves
-- ═══════════════════════════════════════════════════════════════════════
--
-- supabase-aviso-sistema.sql (2026-08-21) reemplazó la policy
-- config_lectura_publica entera para sumar 3 claves nuevas
-- (aviso_sistema_*), en vez de agregarlas a la lista vigente. Se llevó
-- puestas las otras 10 que ya estaban desde supabase-publicaciones-
-- prestador.sql (2026-08-12) — entre ellas `publicaciones_prestador`,
-- que es la que decide si se ve el toggle Vecinos/Prestadores en
-- Servicios. Sin poder leerla, un vecino/prestador normal la ve como
-- `undefined` (RLS bloquea la fila), `pubsPrestadorActivo()` da false, y
-- el toggle desaparece — sin ningún error visible, mismo patrón "circuito
-- apagado para siempre y en silencio" que ya había pasado con los banners.
--
-- Esta es la lista completa: las 10 originales + las 3 de hoy. Cualquier
-- clave nueva que necesite lectura pública se agrega a este arreglo, NUNCA
-- reemplazando la policy entera sin mirar antes qué había.

drop policy if exists "config_lectura_publica" on public.config_app;
create policy "config_lectura_publica"
  on public.config_app for select
  to anon, authenticated
  using (clave = any (array[
    'planes_pagos_activos', 'mp_checkout_activo', 'propuesta_expiracion_hs',
    'pedido_vencimiento_hs', 'inactividad_cierre_dias', 'pedido_fotos_max',
    'adjunto_max_mb', 'promarket_activo', 'features_off',
    'banners_pagos_activos', 'publicaciones_prestador',
    'aviso_sistema_activo', 'aviso_sistema_mensaje', 'aviso_sistema_color'
  ]));

-- ── Verificación ────────────────────────────────────────────────────────
select roles, cmd from pg_policies
 where tablename = 'config_app' and policyname = 'config_lectura_publica';
