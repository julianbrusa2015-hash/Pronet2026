-- ═══ Limpieza · denuncias de prueba dejadas por el test C10 ═══
--
-- El test C10 (tests/admin-c8-c10.spec.js) crea una denuncia real en cada
-- corrida y hasta 2026-08-22 no limpiaba nada. Quedaron acumuladas en el panel
-- de moderación de producción, mezcladas con las denuncias de vecinos reales.
--
-- Por qué va por SQL Editor y no desde la app: `denuncias` no tiene policy de
-- DELETE, así que el borrado desde el cliente vuelve sin error y sin efecto
-- —incluso con cuenta admin—. El test ahora las marca como resueltas para que
-- no figuren como pendientes, pero sacarlas de la tabla requiere esto.
--
-- ── 1. Mirar primero ───────────────────────────────────────────────────
-- Correr SOLO esto y revisar el resultado antes de borrar nada. Tienen que
-- ser todas del test: mismo detalle exacto, ninguna de un vecino real.

select id, estado, resolucion, creado, detalle
  from public.denuncias
 where detalle = 'Test E2E — denuncia de prueba, se desestima sola.'
 order by creado desc;

-- ── 2. Borrar ──────────────────────────────────────────────────────────
-- Recién después de confirmar que el listado de arriba es sólo basura de test.
-- El `where` es por igualdad exacta, no `like`: un like con '%Test%' podría
-- llevarse la denuncia legítima de un vecino que escribió esa palabra.

delete from public.denuncias
 where detalle = 'Test E2E — denuncia de prueba, se desestima sola.';

-- ── 3. Verificar ───────────────────────────────────────────────────────
-- Debe devolver 0.

select count(*) as quedan
  from public.denuncias
 where detalle = 'Test E2E — denuncia de prueba, se desestima sola.';

-- ── Nota ───────────────────────────────────────────────────────────────
-- Al 2026-08-22 había 3 acumuladas. El test ya no las deja crecer: limpia al
-- empezar y al terminar. Pero mientras no exista policy de delete, lo único
-- que puede hacer desde el cliente es marcarlas resueltas — si volvés a ver
-- denuncias "Test E2E" resueltas en el panel, se borran con este archivo.
