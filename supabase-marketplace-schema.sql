-- ═══ PRONET · Mercado/Plaza — modelo de datos (BORRADOR, no ejecutado) ═══
-- Etapa 9/10 — feature detrás de FEATURES.mercadoPlaza, hoy solo wireframe con mock en el front.
-- Ejecutar en Supabase → SQL Editor SOLO cuando se decida construir el circuito real.
-- Idempotente (create if not exists / drop policy if exists), igual que el resto de los supabase-*.sql.
--
-- Deliberadamente separado de pedidos/propuestas/chats_trabajo (ciclo de bolsa de trabajo):
-- el Mercado es "vidriera + consulta directa", no pedido con propuestas. Cero FKs cruzadas
-- hacia esas tablas para no arriesgar el circuito transaccional ya estabilizado.

-- ── 1. Publicaciones ─────────────────────────────────────────────
create table if not exists public.publicaciones (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null references auth.users(id) on delete cascade,
  categoria     text not null check (categoria in ('gastronomia','productos','comercios','anuncios')),
  titulo        text not null check (length(trim(titulo)) > 0 and length(titulo) <= 120),
  descripcion   text check (descripcion is null or length(descripcion) <= 1000),
  precio        numeric check (precio is null or precio >= 0),
  foto_url      text,
  zona          text,                       -- copiado de perfiles.zona al publicar, para filtrar sin join
  activa        boolean not null default true,
  creado        timestamptz not null default now()
);

create index if not exists idx_publicaciones_autor    on public.publicaciones(autor_id);
create index if not exists idx_publicaciones_categoria on public.publicaciones(categoria, creado desc) where activa;
create index if not exists idx_publicaciones_zona      on public.publicaciones(zona, creado desc) where activa;

-- ── 2. Flag de suscripción Pro Market en perfiles ────────────────
-- Reutiliza el mismo circuito de MercadoPago que suscripcionPro (planes_limites +
-- crear-preferencia + webhook-mp), como una fila de plan más — no requiere integración nueva.
alter table public.perfiles add column if not exists es_pro_marketplace boolean not null default false;
alter table public.perfiles add column if not exists pro_marketplace_hasta timestamptz;

-- ── 3. Consultas (chat) — separado de chats_trabajo a propósito ──
-- Un hilo por (publicación, quien consulta). El autor de la publicación responde
-- dentro del mismo hilo; no hay "propuesta" ni cierre por reseña como en bolsa de trabajo.
create table if not exists public.chats_mercado (
  id              uuid primary key default gen_random_uuid(),
  publicacion_id  uuid not null references public.publicaciones(id) on delete cascade,
  autor_id        uuid not null references auth.users(id) on delete cascade, -- dueño de la publicación
  consultante_id  uuid not null references auth.users(id) on delete cascade, -- quien pregunta
  estado          text not null default 'activo' check (estado in ('activo','cerrado')),
  creado          timestamptz not null default now(),
  ultimo_mensaje  text,
  hora_ultimo     timestamptz,
  unique(publicacion_id, consultante_id)
);

create table if not exists public.mensajes_mercado (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats_mercado(id) on delete cascade,
  autor_id    uuid not null references auth.users(id) on delete cascade,
  texto       text not null check (length(trim(texto)) > 0 and length(texto) <= 2000),
  creado      timestamptz not null default now(),
  leido       boolean not null default false
);

create index if not exists idx_mensajes_mercado_chat on public.mensajes_mercado(chat_id, creado);
create index if not exists idx_chats_mercado_autor       on public.chats_mercado(autor_id);
create index if not exists idx_chats_mercado_consultante on public.chats_mercado(consultante_id);

-- ── 4. Realtime (mismo patrón que mensajes_chat) ─────────────────
alter table public.mensajes_mercado replica identity full;
alter table public.chats_mercado replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mensajes_mercado'
  ) then
    alter publication supabase_realtime add table public.mensajes_mercado;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chats_mercado'
  ) then
    alter publication supabase_realtime add table public.chats_mercado;
  end if;
end $$;

-- ── 5. RLS ────────────────────────────────────────────────────────
alter table public.publicaciones enable row level security;
alter table public.chats_mercado enable row level security;
alter table public.mensajes_mercado enable row level security;

-- Publicaciones activas: visibles para cualquier usuario autenticado (el feed es de todo el barrio)
drop policy if exists "publicaciones_ver_activas" on public.publicaciones;
create policy "publicaciones_ver_activas"
  on public.publicaciones for select
  to authenticated
  using (activa or autor_id = auth.uid());

-- Solo se puede publicar si sos el autor y tenés el flag Pro Market activo
drop policy if exists "publicaciones_crear_pro" on public.publicaciones;
create policy "publicaciones_crear_pro"
  on public.publicaciones for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and (select es_pro_marketplace from public.perfiles where id = auth.uid()) = true
  );

drop policy if exists "publicaciones_editar_propia" on public.publicaciones;
create policy "publicaciones_editar_propia"
  on public.publicaciones for update
  to authenticated
  using (autor_id = auth.uid())
  with check (autor_id = auth.uid());

drop policy if exists "publicaciones_borrar_propia" on public.publicaciones;
create policy "publicaciones_borrar_propia"
  on public.publicaciones for delete
  to authenticated
  using (autor_id = auth.uid());

-- Chats de mercado: solo ven el hilo el autor de la publicación o quien consultó
drop policy if exists "chat_mercado_ver_propio" on public.chats_mercado;
create policy "chat_mercado_ver_propio"
  on public.chats_mercado for select
  to authenticated
  using (autor_id = auth.uid() or consultante_id = auth.uid());

-- Solo quien consulta puede abrir un hilo nuevo (el autor responde, no inicia)
drop policy if exists "chat_mercado_crear" on public.chats_mercado;
create policy "chat_mercado_crear"
  on public.chats_mercado for insert
  to authenticated
  with check (consultante_id = auth.uid());

drop policy if exists "mensajes_mercado_ver_propio" on public.mensajes_mercado;
create policy "mensajes_mercado_ver_propio"
  on public.mensajes_mercado for select
  to authenticated
  using (
    exists (
      select 1 from public.chats_mercado c
      where c.id = chat_id and (c.autor_id = auth.uid() or c.consultante_id = auth.uid())
    )
  );

drop policy if exists "mensajes_mercado_escribir" on public.mensajes_mercado;
create policy "mensajes_mercado_escribir"
  on public.mensajes_mercado for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.chats_mercado c
      where c.id = chat_id and (c.autor_id = auth.uid() or c.consultante_id = auth.uid())
    )
  );

-- ── 6. Storage — bucket 'mercado' (crear el bucket manualmente en el panel primero) ──
-- Carpeta por auth.uid() directo (no por prestador_id, como en 'portfolio': acá publica
-- cualquier vecino Pro Market, no solo prestadores).
drop policy if exists "mercado_lectura_publica" on storage.objects;
create policy "mercado_lectura_publica"
on storage.objects
for select
to public
using (bucket_id = 'mercado');

drop policy if exists "mercado_subir_propio" on storage.objects;
create policy "mercado_subir_propio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mercado'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mercado_borrar_propio" on storage.objects;
create policy "mercado_borrar_propio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mercado'
  and (storage.foldername(name))[1] = auth.uid()::text
);
