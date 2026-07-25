-- ═══ PRONET · Etapa 3: Notificaciones Push (Web Push nativo) ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.

create table if not exists public.push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  creado     timestamptz not null default now()
);

alter table public.push_suscripciones enable row level security;

-- Cada usuario administra SOLO sus propias suscripciones
drop policy if exists "push_insertar_propia" on public.push_suscripciones;
create policy "push_insertar_propia"
  on public.push_suscripciones for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "push_borrar_propia" on public.push_suscripciones;
create policy "push_borrar_propia"
  on public.push_suscripciones for delete
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "push_ver_propia" on public.push_suscripciones;
create policy "push_ver_propia"
  on public.push_suscripciones for select
  to authenticated
  using (usuario_id = auth.uid());

-- NOTA: la lectura para ENVIAR notificaciones la hace la Edge Function
-- con la service_role key (salta RLS), nunca el navegador.
