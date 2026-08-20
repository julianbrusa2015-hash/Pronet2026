-- ═══ PRONET · Lote guardado en el perfil ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- El lote/número de casa se tipeaba de cero en cada publicación de Mercado
-- (pm-lote). Se guarda ahora en el perfil para autocompletar — la decisión
-- de MOSTRARLO sigue siendo por publicación (pm-mostrar-lote), sin cambios:
-- guardar el dato no implica exponerlo.
--
-- `perfiles` usa permisos por columna, no el grant genérico de la tabla
-- (auditoría 2026-08-03) — una columna nueva sin GRANT explícito queda sin
-- SELECT/UPDATE para 'authenticated' aunque exista la policy de RLS.

alter table public.perfiles add column if not exists lote text;

grant select (lote), update (lote) on public.perfiles to authenticated;

-- ── Verificación ────────────────────────────────────────────────────────
select column_name from information_schema.columns
 where table_name = 'perfiles' and column_name = 'lote';
select grantee, privilege_type from information_schema.column_privileges
 where table_name = 'perfiles' and column_name = 'lote' and grantee = 'authenticated';
