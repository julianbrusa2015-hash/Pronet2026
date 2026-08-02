-- Likes y comentarios de publicaciones ProMarket
-- Likes: PK compuesto (usuario_id, publicacion_id) — idempotente por diseño.
-- Comentarios: tabla separada, texto libre, paginable.
-- Ambos contadores se mantienen por trigger en publicaciones para evitar COUNT en el feed.

-- ── 1. Likes ─────────────────────────────────────────────────────────
create table if not exists public.likes_publicaciones (
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  creado         timestamptz not null default now(),
  primary key (usuario_id, publicacion_id)
);

alter table public.likes_publicaciones enable row level security;

drop policy if exists "likes_pub_ver"       on public.likes_publicaciones;
drop policy if exists "likes_pub_gestionar" on public.likes_publicaciones;
create policy "likes_pub_ver"
  on public.likes_publicaciones for select to authenticated using (true);
create policy "likes_pub_gestionar"
  on public.likes_publicaciones for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ── 2. Comentarios ───────────────────────────────────────────────────
create table if not exists public.comentarios_publicaciones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  autor_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto          text not null check (length(trim(texto)) > 0 and length(texto) <= 500),
  creado         timestamptz not null default now()
);

create index if not exists idx_comentarios_pub on public.comentarios_publicaciones(publicacion_id, creado);

alter table public.comentarios_publicaciones enable row level security;

drop policy if exists "comentarios_pub_ver"      on public.comentarios_publicaciones;
drop policy if exists "comentarios_pub_escribir" on public.comentarios_publicaciones;
drop policy if exists "comentarios_pub_borrar"   on public.comentarios_publicaciones;
create policy "comentarios_pub_ver"
  on public.comentarios_publicaciones for select to authenticated using (true);
create policy "comentarios_pub_escribir"
  on public.comentarios_publicaciones for insert to authenticated
  with check (autor_id = auth.uid());
create policy "comentarios_pub_borrar"
  on public.comentarios_publicaciones for delete to authenticated
  using (autor_id = auth.uid());

-- ── 3. Contadores en publicaciones ───────────────────────────────────
alter table public.publicaciones add column if not exists likes_count      int not null default 0;
alter table public.publicaciones add column if not exists comentarios_count int not null default 0;

-- Trigger likes
create or replace function public.fn_sync_likes_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.publicaciones set likes_count = likes_count + 1 where id = NEW.publicacion_id;
  elsif TG_OP = 'DELETE' then
    update public.publicaciones set likes_count = greatest(likes_count - 1, 0) where id = OLD.publicacion_id;
  end if;
  return null;
end;$$;

drop trigger if exists trg_sync_likes_count on public.likes_publicaciones;
create trigger trg_sync_likes_count
  after insert or delete on public.likes_publicaciones
  for each row execute function public.fn_sync_likes_count();

-- Trigger comentarios
create or replace function public.fn_sync_comentarios_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.publicaciones set comentarios_count = comentarios_count + 1 where id = NEW.publicacion_id;
  elsif TG_OP = 'DELETE' then
    update public.publicaciones set comentarios_count = greatest(comentarios_count - 1, 0) where id = OLD.publicacion_id;
  end if;
  return null;
end;$$;

drop trigger if exists trg_sync_comentarios_count on public.comentarios_publicaciones;
create trigger trg_sync_comentarios_count
  after insert or delete on public.comentarios_publicaciones
  for each row execute function public.fn_sync_comentarios_count();
