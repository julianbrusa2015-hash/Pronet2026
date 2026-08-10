-- ═══════════════════════════════════════════════════════════════════════
-- Chequeo: ningún RPC del cliente puede estar duplicado
-- ═══════════════════════════════════════════════════════════════════════
--
-- Un `create or replace function` con una firma distinta NO reemplaza: crea
-- una segunda función. Si las dos tienen los mismos nombres de parámetro,
-- PostgREST no puede elegir y devuelve
--   "Could not choose the best candidate function between: ..."
-- y la llamada falla entera.
--
-- Pasó el 2026-08-10 con `buscar_prestadores`: la app mostró "No hay
-- prestadores en esta categoría aún" durante horas y el síntoma parecía falta
-- de datos, no un error. Ver supabase-ranking-bayesiano.sql.
--
-- ── La consulta a correr después de tocar cualquier RPC ──
-- Lista los nombres con más de una definición. Lo esperable es cero filas.
--
--   select p.proname, count(*) as definiciones,
--          string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as firmas
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--    group by p.proname
--   having count(*) > 1;
--
-- Ojo: tener dos firmas no rompe SIEMPRE. Si los nombres de parámetro
-- difieren, PostgREST puede resolver por nombre — es el caso de
-- `dejar_resena`, donde sólo la versión nueva tiene `p_recomendar`. Igual
-- conviene no dejarlas: el día que alguien llame sin ese parámetro va a
-- pegarle a la versión vieja sin enterarse.

begin;

-- `dejar_resena(uuid, integer, text)` — versión anterior a que la reseña
-- registrara si el vecino recomienda al prestador. Nadie la llama: el cliente
-- (y hasta la copia vieja en los assets de Android) mandan los 4 parámetros.
drop function if exists public.dejar_resena(uuid, integer, text);

commit;
