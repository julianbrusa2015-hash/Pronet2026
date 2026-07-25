-- ═══ PRONET · Etapa 3: Perfil de prestador completo ═══
-- Ejecutar en Supabase → SQL Editor. Es idempotente (se puede correr 2 veces).

-- ── 1. Columnas nuevas ─────────────────────────────────────────────
alter table public.prestadores add column if not exists foto_url text;
alter table public.prestadores add column if not exists medios_pago text[] default array['Efectivo'];
alter table public.prestadores add column if not exists especialidades text[] default '{}';
alter table public.prestadores add column if not exists descripcion text;
alter table public.perfiles    add column if not exists telefono text;

-- ── 2. RLS: el prestador puede editar SU propia fila ───────────────
-- (la vinculación usuario→prestador vive en perfiles.prestador_id)
drop policy if exists "prestador_edita_su_fila" on public.prestadores;
create policy "prestador_edita_su_fila"
  on public.prestadores for update
  to authenticated
  using (
    id = (select prestador_id from public.perfiles where perfiles.id = auth.uid())
  )
  with check (
    id = (select prestador_id from public.perfiles where perfiles.id = auth.uid())
  );

-- El usuario puede editar su propio perfil (nombre, teléfono)
drop policy if exists "usuario_edita_su_perfil" on public.perfiles;
create policy "usuario_edita_su_perfil"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── 3. Storage: bucket público para fotos de perfil ────────────────
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- Cada usuario sube/actualiza SOLO dentro de su carpeta (uid/...)
drop policy if exists "avatar_subir_propio" on storage.objects;
create policy "avatar_subir_propio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_actualizar_propio" on storage.objects;
create policy "avatar_actualizar_propio"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lectura pública (el bucket ya es público, esta política cubre listados via API)
drop policy if exists "avatar_lectura_publica" on storage.objects;
create policy "avatar_lectura_publica"
  on storage.objects for select
  to public
  using (bucket_id = 'avatares');
