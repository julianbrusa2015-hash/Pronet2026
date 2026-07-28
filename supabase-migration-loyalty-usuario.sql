-- Migración: agregar usuario_id a loyalty_historial para soportar puntos de vecinos
-- Ejecutar en Supabase SQL Editor una sola vez

ALTER TABLE loyalty_historial
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES perfiles(id) ON DELETE CASCADE;

-- Índice para acelerar consultas de historial por usuario (vecinos sin prestador_id)
CREATE INDEX IF NOT EXISTS loyalty_historial_usuario_id_idx
  ON loyalty_historial(usuario_id);
