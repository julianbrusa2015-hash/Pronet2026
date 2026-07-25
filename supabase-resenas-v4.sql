-- ═══ PRONET · Reseñas reales — Etapa 4 ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Modelo: una reseña por chat_trabajo (un vecino reseña un prestador).
-- Al dejar la reseña: el chat se cierra y el rating del prestador se recalcula.

-- ── 1. Tabla de reseñas ──────────────────────────────────────────
create table if not exists public.resenas (
  id              uuid primary key default gen_random_uuid(),
  chat_id         uuid not null references public.chats_trabajo(id) on delete cascade,
  vecino_id       uuid not null references auth.users(id) on delete cascade,
  prestador_id    uuid not null references public.prestadores(id) on delete cascade,
  puntos          int not null check (puntos between 1 and 5),
  comentario      text check (length(comentario) <= 500),
  creado          timestamptz not null default now(),
  unique(chat_id) -- una sola reseña por trabajo
);

alter table public.resenas enable row level security;

-- Solo el vecino del chat puede crear la reseña
drop policy if exists "resena_crear" on public.resenas;
create policy "resena_crear"
  on public.resenas for insert
  to authenticated
  with check (
    vecino_id = auth.uid()
    and exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id and ct.vecino_id = auth.uid()
    )
  );

-- Lectura pública (las reseñas son visibles en el perfil del prestador)
drop policy if exists "resena_leer" on public.resenas;
create policy "resena_leer"
  on public.resenas for select
  to public
  using (true);

-- ── 2. RPC: dejar reseña (cierra el chat + recalcula rating) ─────
create or replace function public.dejar_resena(
  p_chat_id    uuid,
  p_puntos     int,
  p_comentario text default null
) returns jsonb language plpgsql security definer as $$
declare
  v_chat      record;
  v_rating    numeric;
  v_resenas   int;
begin
  -- Verificar que el chat existe y el vecino es quien llama
  select * into v_chat from public.chats_trabajo where id = p_chat_id;
  if not found then raise exception 'CHAT_NO_ENCONTRADO'; end if;
  if v_chat.vecino_id != auth.uid() then raise exception 'SIN_PERMISO'; end if;
  if v_chat.estado = 'cerrado' then raise exception 'CHAT_YA_CERRADO'; end if;

  -- Crear la reseña
  insert into public.resenas (chat_id, vecino_id, prestador_id, puntos, comentario)
  values (p_chat_id, auth.uid(), v_chat.prestador_id, p_puntos, p_comentario)
  on conflict (chat_id) do nothing;

  -- Cerrar el chat
  update public.chats_trabajo set estado = 'cerrado' where id = p_chat_id;

  -- Recalcular el rating del prestador (promedio de todas sus reseñas)
  select avg(puntos), count(*) into v_rating, v_resenas
  from public.resenas where prestador_id = v_chat.prestador_id;

  update public.prestadores
  set rating = round(v_rating, 1), resenas = v_resenas
  where id = v_chat.prestador_id;

  return jsonb_build_object('ok', true, 'rating_nuevo', v_rating, 'resenas', v_resenas);
end;
$$;

-- ── 3. Verificación ──────────────────────────────────────────────
select 'resenas' as tabla, count(*) as politicas
from pg_policies where tablename = 'resenas';
