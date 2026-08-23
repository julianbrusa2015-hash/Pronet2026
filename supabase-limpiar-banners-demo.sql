-- ═══════════════════════════════════════════════════════════════════════
-- Los 4 banners [DEMO] ocupaban espacios reales
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- El máximo son 6 espacios (config_app.banners_activos_max) y estaban los
-- 6 ocupados: 2 avisos reales (Restaurante, Nave Puertos) y 4 sembrados el
-- 2026-08-09 con el prefijo "[DEMO]" para probar el carrusel, que nunca se
-- limpiaron.
--
-- Se nota en que nunca pasaron por el flujo de compra real: `dias`, `desde`
-- y `hasta` están en null, cuando crear_banner() siempre los completa. Y uno
-- de ellos, "[DEMO] Coffee House", tiene `enlace = 'https://ejemplo.com'`
-- — un dominio de ejemplo, no un negocio real. Detectado porque el click
-- llevaba "a internet" sin ir a ningún lado.
--
-- Se borran (no se desactivan): son datos de prueba sin dueño real ni
-- pago asociado, no hay nada que conservar.

delete from public.banners where nombre like '[DEMO]%';

-- ── Verificación ───────────────────────────────────────────────────────
select nombre, estado, enlace from public.banners
 where estado in ('aprobado', 'activo') order by creado desc;
-- Sólo Restaurante y Nave Puertos.

select public.banners_espacios_libres();
-- 4
