-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Banners publicitarios del Inicio
--
-- Carrusel de imágenes en la pantalla de Inicio: para el vecino arriba de
-- "¿Necesitás un servicio?", para el prestador arriba de su tablero.
--
-- Es PUBLICIDAD, no onboarding: son espacios que se venden o se canjean, y
-- por eso el modelo tiene lo que un espacio vendido necesita y un banner
-- decorativo no:
--
--   · `desde` / `hasta` — una pauta se contrata por un período y tiene que
--     apagarse sola. Depender de que alguien entre a desactivarla el día
--     que vence es cómo se siguen mostrando promociones vencidas.
--   · `clicks` — es lo primero que pregunta quien paga.
--
-- El texto no se guarda: son imágenes completas, como el ejemplo de
-- referencia. Meter títulos encima obligaría a resolver contraste y recorte
-- sobre imágenes que no controlamos.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,              -- interno, para reconocerlo en el panel
  imagen_url  text not null,
  enlace      text,                       -- URL externa, o '#s-pantalla' para navegar dentro
  orden       int  not null default 100,
  activo      boolean not null default true,
  desde       timestamptz,                -- null = sin fecha de inicio
  hasta       timestamptz,                -- null = sin vencimiento
  clicks      int  not null default 0,
  creado      timestamptz not null default now()
);

comment on table public.banners is
  'Banners publicitarios del carrusel de Inicio. La vigencia la resuelve la consulta, no un proceso: un banner vencido deja de mostrarse solo.';

alter table public.banners enable row level security;

-- Lectura pública: el carrusel se ve antes de iniciar sesión.
drop policy if exists "banners_leer" on public.banners;
create policy "banners_leer" on public.banners
  for select to anon, authenticated using (true);

drop policy if exists "banners_admin" on public.banners;
create policy "banners_admin" on public.banners
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Índice para la consulta del carrusel: activos y vigentes, por orden.
create index if not exists idx_banners_activos
  on public.banners (orden) where activo;

-- ── Click ──────────────────────────────────────────────────────────────
-- Por RPC y no por UPDATE: la policy de escritura es sólo admin, y quien
-- clickea es un vecino cualquiera. SECURITY DEFINER para poder incrementar
-- sin abrirle la tabla a nadie.
--
-- Sólo suma 1 a un contador: no guarda quién clickeó. Para medir una pauta
-- alcanza con el total, y registrar el usuario convertiría esto en un rastro
-- de navegación que nadie pidió.
create or replace function public.click_banner(p_banner_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.banners set clicks = clicks + 1 where id = p_banner_id;
$$;

revoke all on function public.click_banner(uuid) from public;
grant execute on function public.click_banner(uuid) to anon, authenticated;

-- ── Storage para las imágenes ──────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

drop policy if exists "banners_img_leer" on storage.objects;
create policy "banners_img_leer" on storage.objects
  for select to anon, authenticated using (bucket_id = 'banners');

drop policy if exists "banners_img_admin" on storage.objects;
create policy "banners_img_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'banners' and public.es_admin())
  with check (bucket_id = 'banners' and public.es_admin());

notify pgrst, 'reload schema';

select (select count(*) from public.banners)                        as banners,
       (select count(*) from storage.buckets where id = 'banners')  as bucket;
