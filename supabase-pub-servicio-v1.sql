-- ═══ PRONET · Publicar Servicio — columnas faltantes en prestadores ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- El formulario "Publicar servicio" (s-publicar, 5 pasos) recolecta datos
-- que el prestador ingresa para aparecer en el marketplace. Estas columnas
-- guardan precio, tipo de tarifa y disponibilidad de urgencias.

alter table public.prestadores
  add column if not exists precio_min   numeric,
  add column if not exists precio_max   numeric,
  add column if not exists tipo_tarifa  text default 'Por visita',
  add column if not exists urgencias_24h boolean default false;

-- Verificación
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'prestadores'
  and column_name in ('precio_min','precio_max','tipo_tarifa','urgencias_24h')
order by column_name;
