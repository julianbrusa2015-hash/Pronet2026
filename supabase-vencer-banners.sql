-- ═══ PRONET · Vencimiento automático de banners ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- 2026-08-23. Mismo patrón que supabase-vencer-suscripciones.sql y
-- supabase-vencer-pedidos.sql: nada marcaba un banner como vencido cuando
-- pasaba su `hasta`. El carrusel del Home ya lo dejaba de mostrar —
-- listarBannersVigentes() filtra por fecha en cada lectura—, pero:
--
--   1. banners_espacios_libres() cuenta `estado in ('aprobado','activo')`
--      sin mirar la fecha, así que un banner vencido seguía ocupando uno
--      de los 6 espacios para siempre. Nadie podía comprar el que dejó
--      libre hasta que un admin lo borrara a mano.
--   2. "Mis banners" (renderMisBanners) mostraba "Publicado" para siempre,
--      con una fecha "hasta el ..." ya pasada — el dueño no se enteraba de
--      que se le venció.
--
-- Se hace igual que las suscripciones: un UPDATE diario, no un chequeo de
-- fecha agregado en cada función de lectura. Así el estado real vive en la
-- columna y no hay que acordarse de repetir el filtro en cada lugar que
-- lee banners.

create extension if not exists pg_cron with schema extensions;

create or replace function public.vencer_banners()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update banners
     set estado = 'vencido'
   where estado = 'activo'
     and hasta is not null
     and hasta < now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'vencer-banners') then
    perform cron.unschedule('vencer-banners');
  end if;
end $$;

select cron.schedule(
  'vencer-banners',
  '5 3 * * *',
  $$select public.vencer_banners();$$
);

-- ── Verificación ───────────────────────────────────────────────────────
select jobname, schedule, active from cron.job where jobname = 'vencer-banners';

-- Para correrlo a mano (devuelve cuántos venció):
--   select public.vencer_banners();
