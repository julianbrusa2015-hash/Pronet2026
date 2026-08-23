-- ═══ Impulso para las publicaciones del vecino, y umbral de competencia ═══
--
-- 2026-08-22. Definiciones: DEFINICIONES-NEGOCIO.md.
--
-- ── Qué se agrega ──────────────────────────────────────────────────────
-- El vecino puede destacar su publicación de Mercado, igual que el prestador
-- destaca su aviso: $1.500, 7 días, primero en SU CATEGORÍA.
--
-- ── El umbral, que aplica a los DOS ────────────────────────────────────
-- El botón de impulsar sólo aparece si la lista donde vas a aparecer primero
-- tiene competencia real:
--
--   Prestador → avisos activos de SU RUBRO en Servicios
--   Vecino    → publicaciones activas de SU CATEGORÍA en Mercado
--
-- Aparecer primero entre tres no vale nada: el que paga se siente estafado y
-- no vuelve a comprar. Peor que no haberlo ofrecido — se quema la credibilidad
-- del producto antes de que pueda funcionar.
--
-- Con un umbral parametrizable la decisión se vuelve automática: el impulso se
-- ofrece donde vale y desaparece donde no, sin que nadie tenga que acordarse
-- de activarlo.
--
-- ── Precio y duración: los mismos ──────────────────────────────────────
-- $1.500 y 7 días para ambos. La duración reusa `impulso_dias` en vez de tener
-- clave propia: un parámetro menos que mantener y que puede desincronizarse.

begin;

-- ── 1 · Columnas en publicaciones ────────────────────────────────────
alter table public.publicaciones
  add column if not exists impulso_hasta      timestamptz,
  add column if not exists impulsos_comprados integer not null default 0;

comment on column public.publicaciones.impulso_hasta is
  'Hasta cuándo aparece primero en su categoría. El cron la limpia al vencer: si no, el impulso ordenaría para siempre.';

-- Ordenar por impulso primero, después por fecha. Parcial: sólo las activas
-- entran al feed.
create index if not exists idx_publicaciones_impulso
  on public.publicaciones (categoria, impulso_hasta desc nulls last, creado desc)
  where activa;

-- ── 2 · Parametrías ──────────────────────────────────────────────────
insert into public.config_app (clave, valor)
values ('impulso_min_publicaciones', '15')
on conflict (clave) do nothing;

insert into public.planes_limites (plan, nombre, precio_mes, precio_anual)
values ('impulso_mercado', 'Destacar publicación', 1500, 1500)
on conflict (plan) do nothing;

-- ── 3 · ¿Hay competencia suficiente? ─────────────────────────────────
-- Una función por lado porque cuentan tablas distintas. Las dos devuelven
-- true/false para que el cliente no tenga que conocer el umbral ni hacer la
-- cuenta — y para que la regla viva en un solo lugar.

create or replace function public.impulso_vale_en_categoria(p_categoria text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min int;
  v_n   int;
begin
  select coalesce(nullif(valor, '')::int, 15) into v_min
    from config_app where clave = 'impulso_min_publicaciones';
  v_min := coalesce(v_min, 15);
  if v_min <= 0 then return true; end if;   -- 0 = sin umbral, siempre disponible

  select count(*) into v_n
    from publicaciones
   where activa and categoria = p_categoria;

  return v_n >= v_min;
end;
$$;

create or replace function public.impulso_vale_en_rubro(p_rubro text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min int;
  v_n   int;
begin
  select coalesce(nullif(valor, '')::int, 15) into v_min
    from config_app where clave = 'impulso_min_publicaciones';
  v_min := coalesce(v_min, 15);
  if v_min <= 0 then return true; end if;

  select count(*) into v_n
    from publicaciones_prestador
   where estado = 'activa' and vigencia_hasta > now() and rubro = p_rubro;

  return v_n >= v_min;
end;
$$;

grant execute on function public.impulso_vale_en_categoria(text) to authenticated;
grant execute on function public.impulso_vale_en_rubro(text)     to authenticated;

-- ── 4 · Activar el impulso pagado ────────────────────────────────────
-- La llama el webhook con service_role. Vuelve a validar propiedad y estado:
-- que crear-preferencia lo haya chequeado no alcanza — esto corre con permisos
-- elevados y es la última puerta.
create or replace function public.activar_impulso_mercado_pagado(
  p_pub_id uuid, p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias  integer;
  v_filas integer;
begin
  select coalesce(nullif(valor, '')::int, 7) into v_dias
    from config_app where clave = 'impulso_dias';
  v_dias := greatest(1, coalesce(v_dias, 7));

  -- Se ACUMULA sobre uno vigente en vez de pisarlo: si alguien paga dos veces
  -- seguidas, la segunda compra suma días. Pisar sería quedarse con la plata.
  update publicaciones p
     set impulso_hasta      = greatest(coalesce(p.impulso_hasta, now()), now())
                              + make_interval(days => v_dias),
         impulsos_comprados = p.impulsos_comprados + 1
   where p.id = p_pub_id
     and p.activa
     and p.autor_id = p_usuario_id;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'La publicación no es de quien pagó, o ya no está activa');
  end if;

  return jsonb_build_object('ok', true, 'dias', v_dias);
end;
$$;

revoke execute on function public.activar_impulso_mercado_pagado(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.activar_impulso_mercado_pagado(uuid, uuid) to service_role;

-- ── 5 · Limpiar los impulsos vencidos, de las DOS tablas ─────────────
-- Un impulso que vence tiene que dejar de ordenar. Si no, se vende "7 días
-- arriba" y se entrega ranking permanente: mata la recompra y es injusto con
-- quien recién se suma. Ya pasó con el impulso del prestador.
--
-- Una sola función para las dos tablas: la regla es la misma y así no puede
-- quedar media aplicada.
create or replace function public.limpiar_impulsos_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a int;
  v_b int;
begin
  update publicaciones_prestador
     set impulso_hasta = null
   where impulso_hasta is not null and impulso_hasta < now();
  get diagnostics v_a = row_count;

  update publicaciones
     set impulso_hasta = null
   where impulso_hasta is not null and impulso_hasta < now();
  get diagnostics v_b = row_count;

  return v_a + v_b;
end;
$$;

revoke execute on function public.limpiar_impulsos_vencidos() from public, anon, authenticated;
grant  execute on function public.limpiar_impulsos_vencidos() to service_role;

-- vencer_pubs_prestador() vuelve a ocuparse sólo de vencer avisos: la limpieza
-- del impulso se movió a la función de arriba, que cubre las dos tablas. Tener
-- la misma regla en dos lugares es como quedan a medias.
create or replace function public.vencer_pubs_prestador()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update publicaciones_prestador p
     set estado = 'vencida'
   where p.estado = 'activa'
     and p.vigencia_hasta < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.vencer_pubs_prestador() from public, anon, authenticated;
grant  execute on function public.vencer_pubs_prestador() to service_role;

commit;

-- ── 6 · Programación ─────────────────────────────────────────────────
-- Aparte del commit: si pg_cron falla por entorno, lo de arriba ya quedó.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpiar-impulsos-vencidos') then
    perform cron.unschedule('limpiar-impulsos-vencidos');
  end if;
end $$;

select cron.schedule('limpiar-impulsos-vencidos', '47 * * * *',
  $$select public.limpiar_impulsos_vencidos();$$);

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Las parametrías:
--      select clave, valor from config_app
--       where clave in ('impulso_dias', 'impulso_min_publicaciones');
--      select plan, precio_mes from planes_limites where plan = 'impulso_mercado';
--
-- 2. El umbral responde (hoy va a dar false en casi todo, que es lo esperado):
--      select categoria, count(*), public.impulso_vale_en_categoria(categoria)
--        from publicaciones where activa group by categoria;
--
-- 3. El job quedó:
--      select jobname, schedule from cron.job where jobname = 'limpiar-impulsos-vencidos';
--
-- 4. No quedan impulsos vencidos ordenando en ninguna de las dos tablas:
--      select public.limpiar_impulsos_vencidos();   -- devuelve cuántos limpió
