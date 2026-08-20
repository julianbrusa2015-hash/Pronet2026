-- ═══ PRONET · Coordenada de entrega en el perfil ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Punto FIJO opcional del vecino (lat/lng), capturado a pedido con
-- getCurrentPosition (nunca watchPosition — no es tracking en tiempo real).
-- Vive al lado del lote en Editar perfil, con el mismo criterio de
-- privacidad: guardarlo no lo expone en ningún lado por sí solo.
--
-- `perfiles` usa permisos por columna, no el grant genérico de la tabla
-- (auditoría 2026-08-03) — una columna nueva sin GRANT explícito queda sin
-- SELECT/UPDATE para 'authenticated' aunque exista la policy de RLS.

alter table public.perfiles add column if not exists lat double precision;
alter table public.perfiles add column if not exists lng double precision;

grant select (lat, lng), update (lat, lng) on public.perfiles to authenticated;

-- ── Verificación ────────────────────────────────────────────────────────
select column_name from information_schema.columns
 where table_name = 'perfiles' and column_name in ('lat', 'lng');
select grantee, privilege_type, column_name from information_schema.column_privileges
 where table_name = 'perfiles' and column_name in ('lat', 'lng') and grantee = 'authenticated';
