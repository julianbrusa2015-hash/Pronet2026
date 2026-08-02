-- Corrige FK de autor_id en comentarios_publicaciones para que PostgREST
-- pueda resolver el join perfiles:autor_id(nombre).
-- Mismo patrón que publicaciones_autor_perfiles_fk.

ALTER TABLE public.comentarios_publicaciones
  DROP CONSTRAINT IF EXISTS comentarios_publicaciones_autor_id_fkey;

ALTER TABLE public.comentarios_publicaciones
  ADD CONSTRAINT comentarios_pub_autor_perfiles_fk
  FOREIGN KEY (autor_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;

-- Refrescar cache de esquema PostgREST
NOTIFY pgrst, 'reload schema';
