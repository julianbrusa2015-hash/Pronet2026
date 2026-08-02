-- Se saca el plan Elite de prestador (y de la futura escalera de cupos de
-- ProMarket, que todavía no estaba implementada). Confirmado 0 suscriptores
-- en producción antes de este cambio — sin costo de migración.
--
-- Al borrar la fila de planes_limites, crear-preferencia (Edge Function)
-- rechaza automáticamente cualquier intento de comprar 'elite' con
-- "Plan inválido", sin necesidad de tocar esa función.

delete from public.planes_limites where plan = 'elite';
