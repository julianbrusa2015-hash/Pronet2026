-- ═══════════════════════════════════════════════════════════════════════
-- Banners "de la casa": rellenan el carrusel cuando no hay avisos pagos
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- El carrusel del Home quedaba vacío del todo para un prestador cuando no
-- había ningún banner pago vigente: slidesPropias() (el CTA "Publicá tu
-- pedido"/Urgencias) devuelve [] para el rol prestador, así que sin avisos
-- pagos no había NADA que mostrar.
--
-- La idea: uno o dos banners propios de PRONET que ocupan ese hueco, pero
-- SIN competir por el cupo — el requisito explícito es que quien está por
-- comprar un espacio siga viendo el cupo completo (6), nunca menos porque
-- haya banners de la casa activos.
--
-- Se resuelve con una columna, no con una tabla aparte: reusa entero el
-- mecanismo que ya existe (imagen, enlace, orden, activo, clicks) y el
-- panel de administración que ya administra los banners pagos.
--
-- `banners_admin` ya da al admin ALL sobre la tabla via RLS (es_admin()),
-- así que crear uno es un insert directo — no hace falta una RPC nueva.

alter table public.banners add column if not exists es_house boolean not null default false;

comment on column public.banners.es_house is
  'Banner propio de PRONET que rellena el carrusel cuando no hay avisos pagos vigentes. No cuenta para el cupo de 6 espacios ni compite con lo que se vende.';

-- ── El cupo no se toca por banners de la casa ──────────────────────────
create or replace function public.banners_espacios_libres()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select valor from public.config_app where clave='banners_activos_max'),'6')::int
    - (select count(*) from public.banners
        where estado in ('aprobado','activo') and es_house = false)
  );
$$;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La columna existe y arranca en false para todo lo que ya había:
select count(*) filter (where es_house) as house, count(*) filter (where not es_house) as pagos
  from public.banners;
-- house = 0, pagos = 2 (Restaurante, Nave Puertos)

-- 2. El cupo sigue en 4 (no cambia con este archivo, lo cambia crear un
--    house banner de verdad — y ahí tampoco debería moverse):
select public.banners_espacios_libres();
