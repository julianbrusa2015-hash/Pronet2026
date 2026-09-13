-- ═══ PRONET · alinear loyalty_reglas con lo que se acredita de verdad ═══
--
-- La pantalla "Ganar puntos" (sección prestador) se arma con loyalty_reglas,
-- pero ese catálogo anunciaba beneficios que ningún trigger paga:
--   · reseña por estrellas (5★=500, 4★=400, 3★=200, 2★=50, 1★=0)
--       → la realidad es +100 FIJO por cada reseña recibida, sin escalar.
--   · respuesta_rapida (+50), aniversario (+1000)  → no existen.
--   · trabajo_completado (+100)  → sólo se paga el PRIMER trabajo, y son +400.
--   · referido (+800)  → no existe (ya apagado aparte).
--
-- Las ÚNICAS acreditaciones reales (grep de acreditar_puntos en todo el repo):
--   resena +100 (prestador recibe) · resena +50 (vecino deja) · primer_trabajo +400.
--
-- Se deja el catálogo mostrando sólo lo verdadero. Idempotente.

-- Reseña recibida: +100 fijo (se reusa la fila resena_5, ya visible y en ⭐).
update public.loyalty_reglas
   set descripcion = 'Reseña recibida de un cliente', puntos = 100, orden = 1, activo = true
 where id = 'resena_5';

-- Primer trabajo cerrado: +400 (se reusa trabajo_completado).
update public.loyalty_reglas
   set descripcion = 'Tu primer trabajo cerrado y calificado', puntos = 400, orden = 2, activo = true
 where id = 'trabajo_completado';

-- Todo lo que se anunciaba y no se paga: apagado.
update public.loyalty_reglas set activo = false
 where id in ('resena_4', 'resena_3', 'resena_2', 'resena_1',
              'respuesta_rapida', 'aniversario', 'referido');

select id, descripcion, puntos, activo from public.loyalty_reglas
 where activo order by orden;
