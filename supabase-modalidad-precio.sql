-- ═══ PRONET · Modalidad de precio en propuestas — Etapa 4 ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.

alter table public.propuestas
  add column if not exists modalidad_precio text default 'fijo'
    check (modalidad_precio in ('fijo', 'rango', 'convenir'));

alter table public.propuestas
  add column if not exists precio_min numeric;

alter table public.propuestas
  add column if not exists precio_max numeric;

-- Validación: si modalidad es 'rango', precio_min y precio_max deben estar definidos
alter table public.propuestas drop constraint if exists chk_precio_rango;
alter table public.propuestas add constraint chk_precio_rango check (
  modalidad_precio != 'rango'
  or (precio_min is not null and precio_max is not null and precio_min < precio_max)
);
