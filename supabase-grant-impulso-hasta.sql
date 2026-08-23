-- ═══ El feed necesita leer impulso_hasta para ordenar por él ═══
--
-- 2026-08-23.
--
-- ── Por qué hace falta ─────────────────────────────────────────────────
-- `publicaciones` tiene los permisos de SELECT otorgados COLUMNA POR COLUMNA
-- (supabase-lote-opcional.sql), para que `lote` —la dirección del vendedor— no
-- salga en un select directo.
--
-- Consecuencia del mecanismo: toda columna NUEVA nace sin permiso. Y ordenar
-- por una columna requiere SELECT sobre ella igual que leerla, así que agregar
-- `.order('impulso_hasta')` al feed lo rompía entero:
--
--   select id, titulo, creado              → ok
--   select id, titulo, creado, impulso_hasta → 42501 permission denied
--   PronetDB.listarPublicaciones()          → 0 publicaciones
--
-- Entre Vecinos quedaba vacío. Detectado antes de desplegar, midiendo el feed
-- real en el navegador y no sólo la consulta suelta.
--
-- ── Qué se otorga y qué no ─────────────────────────────────────────────
-- `impulso_hasta` sí: el feed la necesita para ordenar, y la tarjeta para
-- mostrar el sello de destacada. No es dato sensible — que algo esté destacado
-- es público por definición.
--
-- `impulsos_comprados` NO: es métrica comercial nuestra. Cuántas veces alguien
-- pagó por destacar no le importa a los demás vecinos.
--
-- `lote` sigue afuera, como estaba.

grant select (impulso_hasta) on public.publicaciones to anon, authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Que impulso_hasta esté otorgada y impulsos_comprados NO:
select column_name, grantee
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'publicaciones'
   and privilege_type = 'SELECT'
   and column_name in ('impulso_hasta', 'impulsos_comprados', 'lote')
 order by column_name, grantee;
-- impulso_hasta → anon y authenticated
-- impulsos_comprados y lote → sin filas
--
-- 2. Desde el navegador, con sesión, el feed tiene que volver a traer filas:
--      await PronetDB.listarPublicaciones({ limit: 3 })
