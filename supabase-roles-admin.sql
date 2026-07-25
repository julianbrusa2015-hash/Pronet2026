-- ═══ PRONET · Roles y administración — Etapa 4 ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Modelo:
--   - Cada usuario tiene un array 'roles' (puede tener múltiples).
--   - Rol 'admin' habilita paneles administrativos.
--   - RLS de tablas admin-only chequea el rol.
--   - Tu cuenta vecinopuertos se marca como admin para retro-compatibilidad.

-- ── 1. Columna roles en perfiles ─────────────────────────────────
alter table public.perfiles
  add column if not exists roles text[] default array['cliente'];

-- Rellenar roles según el tipo actual (migración one-time)
update public.perfiles
set roles = case
  when tipo = 'prestador' then array['prestador']
  else array['cliente']
end
where roles is null or array_length(roles, 1) is null;

-- ── 2. Función helper: es_admin() ────────────────────────────────
create or replace function public.es_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and 'admin' = any(roles)
  );
$$;

-- ── 3. Marcar vecinopuertos como admin ───────────────────────────
-- Ajustá el email si es distinto
update public.perfiles
set roles = array['admin', 'cliente']
where id in (
  select id from auth.users
  where email in ('vecinopuertos@pronet.test', 'julian@pronet.app')
     or email ilike '%vecinopuertos%'
     or email ilike '%argmodelia%'
);

-- ── 4. RLS de tablas admin-only ──────────────────────────────────
-- Catálogo de precios: cualquiera lee, solo admin escribe
drop policy if exists "catalogo_admin_escribe" on public.catalogo_precios;
create policy "catalogo_admin_escribe"
  on public.catalogo_precios for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- ── 5. Verificación ──────────────────────────────────────────────
select
  p.nombre,
  p.tipo,
  p.roles,
  case when 'admin' = any(p.roles) then '🛡 ADMIN' else '' end as marca
from public.perfiles p
order by
  case when 'admin' = any(p.roles) then 0 else 1 end,
  p.nombre;
