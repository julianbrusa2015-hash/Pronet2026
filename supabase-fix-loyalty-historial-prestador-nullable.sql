-- ═══ PRONET · fix: loyalty_historial.prestador_id debe aceptar null ═══
--
-- Un vecino no tiene prestador_id, pero SÍ tiene puntos (reseñas, referidos,
-- pedidos). Cuando un vecino intenta canjear, canjear_puntos() llama a
-- acreditar_puntos(..., p_prestador_id => null) para debitar el costo, y ese
-- insert en loyalty_historial reventaba con:
--   null value in column "prestador_id" violates not-null constraint
-- Resultado: NINGÚN vecino podía canjear. No lo agarró la suite porque el
-- test C8 corre como prestador (prestador_test), que sí tiene prestador_id.
--
-- La causa es una migración incompleta: supabase-migration-loyalty-usuario.sql
-- agregó usuario_id "para soportar puntos de vecinos" (su propio índice habla
-- de "vecinos sin prestador_id"), pero dejó el NOT NULL viejo de cuando el
-- historial colgaba sólo de prestadores. El dueño canónico del punto ahora es
-- usuario_id; prestador_id es opcional (sólo cuando el movimiento nació en el
-- rol prestador).
--
-- Idempotente: DROP NOT NULL sobre una columna ya nullable no falla.

alter table public.loyalty_historial
  alter column prestador_id drop not null;
