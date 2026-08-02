-- Fix publicaciones: DEFAULT auth.uid() en autor_id + FK a public.perfiles
-- para que PostgREST pueda resolver el join perfiles:autor_id.
--
-- La FK anterior apuntaba a auth.users(id) — PostgREST no puede hacer joins
-- automáticos sobre auth.users porque está en el schema auth, no en public.
-- Se reemplaza por una FK a public.perfiles(id) (mismo UUID, FK equivalente).
-- El DEFAULT auth.uid() permite INSERT sin mandar autor_id explícitamente.

-- 1. Agregar DEFAULT auth.uid() (no rompe filas existentes)
alter table public.publicaciones
  alter column autor_id set default auth.uid();

-- 2. Quitar FK vieja a auth.users
alter table public.publicaciones
  drop constraint if exists publicaciones_autor_id_fkey;

-- 3. Agregar FK a public.perfiles para que PostgREST resuelva el join
alter table public.publicaciones
  add constraint publicaciones_autor_perfiles_fk
  foreign key (autor_id) references public.perfiles(id) on delete cascade;
