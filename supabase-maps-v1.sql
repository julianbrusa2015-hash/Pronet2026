-- ═══ PRONET · Maps — Coordenadas geográficas para prestadores ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente (safe to re-run).
--
-- Agrega lat/lng a la tabla prestadores para:
--   - Posicionar marcadores reales en Google Maps
--   - Calcular distancias reales desde la ubicación del usuario
--   - Habilitar el filtro "cerca de mí" con datos verdaderos
--
-- Las coordenadas se populan automáticamente cuando el prestador
-- guarda su perfil (geocoding via Google Geocoding API desde el frontend).

-- ── 1. Columnas lat / lng ────────────────────────────────────────────────────
alter table public.prestadores
  add column if not exists lat  double precision,
  add column if not exists lng  double precision;

-- ── 2. Índice para consultas de proximidad ───────────────────────────────────
create index if not exists idx_prestadores_lat_lng
  on public.prestadores (lat, lng)
  where lat is not null and lng is not null;

-- ── 3. Verificación ─────────────────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_name = 'prestadores'
  and column_name in ('lat', 'lng')
order by column_name;
