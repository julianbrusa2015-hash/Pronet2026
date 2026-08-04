-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Índices de rendimiento (P0/P1 del plan de performance)
-- Fecha: 2026-08-03
--
-- CONTEXTO: la línea base medida con EXPLAIN ANALYZE sobre el feed de
-- pedidos dio "Seq Scan ... Rows Removed by Filter: 40". Hoy ejecuta en
-- 0,167 ms porque la tabla tiene 55 filas — el plan ya es el equivocado,
-- simplemente todavía no duele. Estos índices existen para que el plan
-- correcto ya esté disponible cuando el volumen crezca.
--
-- NOTA SOBRE EL BLOQUEO: se usa CREATE INDEX plano (no CONCURRENTLY)
-- porque a este tamaño de tabla se completa en microsegundos. Si estos
-- índices se recrean alguna vez sobre volumen real (decenas de miles de
-- filas), usar CREATE INDEX CONCURRENTLY para no bloquear escrituras
-- — CONCURRENTLY no puede correr dentro de un bloque de transacción.
--
-- Todo es aditivo y reversible: DROP INDEX <nombre>; revierte cada uno
-- sin tocar datos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── P0 · pedidos ───────────────────────────────────────────────────────
-- La tabla solo tenía índices en (id) y (usuario_id). El feed principal
-- filtra por estado/rubro/zona y ordena por creado: nada de eso estaba
-- indexado. Columnas de igualdad primero, la de orden al final, para que
-- un único índice resuelva filtro y ORDER BY sin sort adicional.
create index if not exists idx_pedidos_feed_filtrado
  on public.pedidos (estado, rubro, zona, creado desc);

-- listar('pedidos') no aplica filtros: solo ordena por creado desc.
-- El índice compuesto de arriba no sirve sin las columnas líderes.
create index if not exists idx_pedidos_creado
  on public.pedidos (creado desc);

-- ── P0 · prestadores ───────────────────────────────────────────────────
-- listarPrestadores() filtra por activo/rubro/zona y ordena por rating.
-- El índice (lat,lng) que ya existía no lo usa ninguna consulta actual
-- (el filtro de cercanía resuelve por igualdad de texto sobre zona).
create index if not exists idx_prestadores_listado
  on public.prestadores (activo, zona, rubro, rating desc);

-- ── P1 · resenas ───────────────────────────────────────────────────────
-- Confirmado ausente: leer las reseñas de un prestador implicaba scan
-- secuencial de toda la tabla. Es la consulta de la ficha pública.
create index if not exists idx_resenas_prestador
  on public.resenas (prestador_id, creado desc);

-- ── P0 · búsqueda por texto (pg_trgm) ──────────────────────────────────
-- listarPrestadores() y listarPublicaciones() usan ILIKE '%término%'.
-- Un comodín INICIAL no puede usar un índice B-tree bajo ninguna
-- circunstancia: sin trigramas, esa búsqueda es scan secuencial
-- obligatorio con una evaluación de patrón por fila.
-- pg_trgm + GIN es lo único que la vuelve indexable.
create extension if not exists pg_trgm;

create index if not exists idx_prestadores_busqueda_trgm
  on public.prestadores using gin (
    (coalesce(nombre,'') || ' ' || coalesce(rubro,'') || ' ' || coalesce(subrubro,''))
    gin_trgm_ops
  );

create index if not exists idx_publicaciones_busqueda_trgm
  on public.publicaciones using gin (
    (coalesce(titulo,'') || ' ' || coalesce(descripcion,''))
    gin_trgm_ops
  );

-- IMPORTANTE — los índices trigram de arriba son sobre una EXPRESIÓN
-- concatenada. El planner solo los usa si la consulta filtra sobre esa
-- misma expresión. El código hoy hace:
--     .or('nombre.ilike.%t%,rubro.ilike.%t%,subrubro.ilike.%t%')
-- que son tres ILIKE por columna separada y NO matchea la expresión.
-- Para aprovecharlos hay que migrar la búsqueda a un RPC que filtre por
-- la expresión concatenada (ver supabase-perf-rpc-busqueda.sql).
-- Mientras tanto quedan creados pero inactivos: no hacen daño, y evitan
-- una segunda migración cuando se cambie el código.

-- ── Verificación ───────────────────────────────────────────────────────
select tablename, indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname like 'idx_%'
   and tablename in ('pedidos','prestadores','resenas','publicaciones')
 order by tablename, indexname;
