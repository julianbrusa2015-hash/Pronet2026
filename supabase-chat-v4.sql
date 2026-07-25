-- ═══ PRONET · Chat real — Etapa 4 ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Modelo: un chat por propuesta (pedido + prestador).
-- Se habilita cuando el vecino envía una propuesta.
-- Se cierra (solo lectura) cuando el vecino deja una reseña.
--
-- Tablas:
--   chats_trabajo  → un registro por propuesta (cabecera del chat)
--   mensajes_chat  → los mensajes de cada chat

-- ── 1. Tabla de chats ────────────────────────────────────────────
create table if not exists public.chats_trabajo (
  id              uuid primary key default gen_random_uuid(),
  propuesta_id    uuid not null references public.propuestas(id) on delete cascade,
  pedido_id       uuid not null references public.pedidos(id) on delete cascade,
  vecino_id       uuid not null references auth.users(id) on delete cascade,
  prestador_id    uuid not null references public.prestadores(id) on delete cascade,
  estado          text not null default 'activo' check (estado in ('activo','cerrado')),
  creado          timestamptz not null default now(),
  ultimo_mensaje  text,
  hora_ultimo     timestamptz,
  unique(propuesta_id)
);

-- ── 2. Tabla de mensajes ─────────────────────────────────────────
create table if not exists public.mensajes_chat (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats_trabajo(id) on delete cascade,
  autor_id    uuid not null references auth.users(id) on delete cascade,
  texto       text not null check (length(trim(texto)) > 0 and length(texto) <= 2000),
  creado      timestamptz not null default now(),
  leido       boolean not null default false
);

-- Índices para consultas frecuentes
create index if not exists idx_mensajes_chat_id on public.mensajes_chat(chat_id, creado);
create index if not exists idx_chats_vecino on public.chats_trabajo(vecino_id);
create index if not exists idx_chats_prestador on public.chats_trabajo(prestador_id);

-- ── 3. Realtime ──────────────────────────────────────────────────
alter table public.mensajes_chat replica identity full;
alter table public.chats_trabajo replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'mensajes_chat'
  ) then
    alter publication supabase_realtime add table public.mensajes_chat;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chats_trabajo'
  ) then
    alter publication supabase_realtime add table public.chats_trabajo;
  end if;
end $$;

-- ── 4. RLS ───────────────────────────────────────────────────────
alter table public.chats_trabajo enable row level security;
alter table public.mensajes_chat enable row level security;

-- chats_trabajo: solo ven sus chats el vecino o el prestador del usuario logueado
drop policy if exists "chat_ver_propio" on public.chats_trabajo;
create policy "chat_ver_propio"
  on public.chats_trabajo for select
  to authenticated
  using (
    vecino_id = auth.uid()
    or prestador_id = (select prestador_id from public.perfiles where id = auth.uid())
  );

drop policy if exists "chat_crear" on public.chats_trabajo;
create policy "chat_crear"
  on public.chats_trabajo for insert
  to authenticated
  with check (vecino_id = auth.uid());

-- mensajes_chat: solo pueden leer/escribir participantes del chat
drop policy if exists "mensaje_ver" on public.mensajes_chat;
create policy "mensaje_ver"
  on public.mensajes_chat for select
  to authenticated
  using (
    exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id
        and (ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid()))
    )
  );

drop policy if exists "mensaje_enviar" on public.mensajes_chat;
create policy "mensaje_enviar"
  on public.mensajes_chat for insert
  to authenticated
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id
        and ct.estado = 'activo'
        and (ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid()))
    )
  );

-- marcar mensajes como leídos
drop policy if exists "mensaje_marcar_leido" on public.mensajes_chat;
create policy "mensaje_marcar_leido"
  on public.mensajes_chat for update
  to authenticated
  using (
    exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id
        and (ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid()))
    )
  )
  with check (true);

-- ── 5. Función: abrir chat al enviar propuesta ───────────────────
create or replace function public.abrir_chat_propuesta(p_propuesta_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_prop    record;
  v_chat_id uuid;
begin
  -- Obtener datos de la propuesta
  select pr.*, pe.usuario_id as vecino_id
  into v_prop
  from public.propuestas pr
  join public.pedidos pe on pe.id = pr.pedido_id
  where pr.id = p_propuesta_id;

  if not found then
    raise exception 'PROPUESTA_NO_ENCONTRADA';
  end if;

  -- Verificar que quien llama es el vecino dueño del pedido
  if v_prop.vecino_id != auth.uid() and
     v_prop.prestador_id != (select prestador_id from public.perfiles where id = auth.uid()) then
    raise exception 'SIN_PERMISO';
  end if;

  -- Crear el chat si no existe (upsert por propuesta_id)
  insert into public.chats_trabajo (
    propuesta_id, pedido_id, vecino_id, prestador_id
  ) values (
    p_propuesta_id, v_prop.pedido_id, v_prop.vecino_id, v_prop.prestador_id
  )
  on conflict (propuesta_id) do nothing
  returning id into v_chat_id;

  -- Si ya existía, obtener el id
  if v_chat_id is null then
    select id into v_chat_id
    from public.chats_trabajo
    where propuesta_id = p_propuesta_id;
  end if;

  return v_chat_id;
end;
$$;

-- ── 6. Verificación ──────────────────────────────────────────────
select
  tablename,
  (select count(*) from pg_policies where tablename = t.tablename) as politicas
from (values ('chats_trabajo'), ('mensajes_chat')) as t(tablename);
