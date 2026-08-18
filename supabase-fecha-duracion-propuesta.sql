-- ═══ PRONET · Fecha tentativa y duración aproximada en propuestas ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Campos opcionales para que el prestador precise cuándo podría empezar
-- y cuánto estima que dura el trabajo. No reemplazan "Disponibilidad"
-- (plazo), la complementan.

alter table public.propuestas
  add column if not exists fecha_tentativa date,
  add column if not exists duracion_aprox text;

-- Verificación:
select column_name, data_type from information_schema.columns
 where table_name = 'propuestas' and column_name in ('fecha_tentativa', 'duracion_aprox');
