-- Fix (auditoría UX 2026-08-03): el panel de Moderación no mostraba
-- denuncias reales. Causa: denuncias.denunciado_id tiene FK a
-- auth.users(id), no a public.perfiles(id) — PostgREST no puede resolver
-- el embed `perfiles!denunciado_id(...)` que usa renderModeracion() sin
-- una FK directa a perfiles, y falla con "Could not find a relationship".
-- El código destructuraba solo { data } sin revisar error, así que la
-- falla se descartaba en silencio y el panel quedaba siempre vacío.
--
-- perfiles.id ya es 1:1 con auth.users.id (fila creada por handle_new_user
-- en cada alta), y se verificó 0 filas huérfanas antes de aplicar esto.

alter table public.denuncias
  add constraint denuncias_denunciado_id_perfiles_fkey
  foreign key (denunciado_id) references public.perfiles(id);

notify pgrst, 'reload schema';
