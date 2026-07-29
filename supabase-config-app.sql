-- ═══ PRONET · Configuración de app + interruptor de planes pagos ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- Requiere haber corrido antes supabase-limites-plan.sql.
--
-- Permite activar/desactivar los planes pagos desde el panel de admin, sin
-- tocar código ni redesplegar.
--
-- REGLA DE PRELANZAMIENTO: con los pagos desactivados, los usuarios en Base
-- reciben los límites de Plus (10 propuestas/mes, 10 fotos). Así el número no
-- es arbitrario: es el mismo que después se vende. Al activar los pagos, Base
-- vuelve a 3 automáticamente y Plus pasa a ser la opción paga.

-- ── Tabla de configuración global ───────────────────────────────────────
create table if not exists public.config_app (
  clave       text primary key,
  valor       text not null,
  descripcion text,
  actualizado timestamptz not null default now()
);

insert into public.config_app (clave, valor, descripcion) values
  ('planes_pagos_activos', 'false',
   'Si es true, los planes pagos son visibles y comprables. Si es false (prelanzamiento), solo existe Base y recibe los limites de Plus.')
on conflict (clave) do nothing;  -- no pisar el valor si ya fue configurado

alter table public.config_app enable row level security;

-- Lectura pública, incluidos invitados sin sesión: la app necesita saber si
-- los planes pagos están activos ANTES de que el usuario se loguee, para no
-- mostrarle planes que no puede comprar. No hay nada sensible acá.
drop policy if exists "config_lectura" on public.config_app;
create policy "config_lectura"
  on public.config_app for select
  to anon, authenticated
  using (true);

-- Solo admin la modifica.
drop policy if exists "config_admin_escribe" on public.config_app;
create policy "config_admin_escribe"
  on public.config_app for all
  to authenticated
  using (es_admin())
  with check (es_admin());

-- ── Helper: qué plan define los límites de un usuario ───────────────────
create or replace function public.plan_para_limites(p_plan text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Pagos activos: cada plan usa sus propios límites.
    when coalesce((select valor from config_app where clave = 'planes_pagos_activos'), 'false') = 'true'
      then p_plan
    -- Prelanzamiento: Base recibe los límites de Plus. Los planes superiores
    -- (si alguien ya los tiene) quedan intactos, nunca se degradan.
    when p_plan = 'base' then 'plus'
    else p_plan
  end;
$$;

-- ── Actualizar los triggers de límite para respetar el interruptor ──────
create or replace function public.chequear_limite_propuestas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite int;
  v_usadas int;
  v_inicio timestamptz;
begin
  v_plan := plan_de_prestador(new.prestador_id);
  if v_plan is null then return new; end if;

  select propuestas_mes into v_limite
    from planes_limites where plan = plan_para_limites(v_plan);
  if v_limite is null then return new; end if;  -- plan ilimitado

  v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';

  select count(*) into v_usadas
    from propuestas
   where prestador_id = new.prestador_id
     and creado >= v_inicio;

  if v_usadas >= v_limite then
    raise exception 'limite_propuestas: el plan % permite % propuestas por mes', v_plan, v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.chequear_limite_portfolio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite int;
  v_usadas int;
begin
  v_plan := plan_de_prestador(new.prestador_id);
  if v_plan is null then return new; end if;

  select fotos_portfolio into v_limite
    from planes_limites where plan = plan_para_limites(v_plan);
  if v_limite is null then return new; end if;

  select count(*) into v_usadas
    from portfolio_fotos where prestador_id = new.prestador_id;

  if v_usadas >= v_limite then
    raise exception 'limite_portfolio: el plan % permite % fotos de portfolio', v_plan, v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── Verificación ────────────────────────────────────────────────────────
select clave, valor, descripcion from public.config_app;

-- Límites efectivos hoy (con el interruptor en su valor actual):
select l.plan,
       plan_para_limites(l.plan)                     as usa_limites_de,
       (select propuestas_mes from planes_limites
         where plan = plan_para_limites(l.plan))     as propuestas_mes_efectivo,
       (select fotos_portfolio from planes_limites
         where plan = plan_para_limites(l.plan))     as fotos_efectivo
  from planes_limites l
 order by case l.plan when 'base' then 1 when 'plus' then 2
                      when 'pro' then 3 else 4 end;
