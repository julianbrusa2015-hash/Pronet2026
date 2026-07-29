-- Storage RLS policies para bucket propuestas-adjuntos
-- Ejecutar en Supabase → SQL Editor

-- Prestadores autenticados pueden subir adjuntos
CREATE POLICY "prestadores_pueden_subir_adjuntos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'propuestas-adjuntos');

-- Usuarios autenticados pueden leer adjuntos (vecinos y prestadores)
CREATE POLICY "autenticados_pueden_ver_adjuntos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'propuestas-adjuntos');
