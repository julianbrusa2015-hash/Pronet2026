-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Calificar la APP (no a un prestador)
--
-- Distinto de `resenas`, que califica un TRABAJO entre dos personas y
-- cuelga de un `chats_trabajo`. Acá el objeto calificado es PRONET mismo,
-- no hay contraparte, y no hace falta haber contratado nada.
--
-- ── Una por persona, editable ──────────────────────────────────────────
-- `unique (usuario_id)` y se guarda con upsert. Es el modelo de las
-- stores: tu opinión es una sola y podés cambiarla cuando la app mejora o
-- empeora. Permitir varias convertiría el promedio en una encuesta de
-- quién insiste más, y obligaría a construir moderación de spam para algo
-- que no la necesita.
--
-- ── Por qué guarda la versión ──────────────────────────────────────────
-- Sin `version_app`, "la app anda lenta" no se puede ubicar en el tiempo.
-- Con la versión, una caída de puntaje se ata al build que la causó. Lo
-- llena el cliente con CACHE_VERSION; es un dato de diagnóstico, no una
-- verdad que haya que defender.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.resenas_app (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null unique references auth.users(id) on delete cascade,
  puntos      int  not null,
  comentario  text,
  version_app text,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  constraint resenas_app_puntos_check check (puntos between 1 and 5),
  -- 1000 y no 500 como en las reseñas de trabajo: acá el que se toma el
  -- trabajo de escribir suele tener algo largo para decir, y cortarlo es
  -- perder justo el feedback más valioso.
  constraint resenas_app_comentario_check check (comentario is null or length(comentario) <= 1000)
);

create index if not exists idx_resenas_app_creado on public.resenas_app (creado desc);

alter table public.resenas_app enable row level security;

-- Cada uno ve y escribe la suya. El admin las ve todas — es el único que
-- tiene algo que hacer con el conjunto.
drop policy if exists "resenas_app_leer" on public.resenas_app;
create policy "resenas_app_leer" on public.resenas_app
  for select using (usuario_id = auth.uid() or es_admin());

drop policy if exists "resenas_app_crear" on public.resenas_app;
create policy "resenas_app_crear" on public.resenas_app
  for insert with check (usuario_id = auth.uid());

drop policy if exists "resenas_app_editar" on public.resenas_app;
create policy "resenas_app_editar" on public.resenas_app
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Nadie borra: ni el autor ni el admin desde el cliente. Una reseña que se
-- puede borrar de un toque invita a limpiar las malas.
revoke delete on public.resenas_app from anon, authenticated;

-- `actualizado` lo pone el servidor, no el cliente: es el dato que dice
-- cuándo cambió de opinión y no debería poder falsearse.
create or replace function public.resenas_app_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists trg_resenas_app_touch on public.resenas_app;
create trigger trg_resenas_app_touch
  before update on public.resenas_app
  for each row execute function public.resenas_app_touch();

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select
  (select count(*) from public.resenas_app) as resenas,
  (select count(*) from pg_policies where tablename = 'resenas_app') as policies;
