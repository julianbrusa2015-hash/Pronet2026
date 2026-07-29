-- ═══ PRONET · Límites de plan del lado del servidor (P-04) ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- La validación en el cliente (app.js) es de UX: avisa antes de que el usuario
-- llene un formulario. Esto es el cierre real — con la consola abierta se puede
-- saltear la primera, no esta.
--
-- IMPORTANTE: planes_limites debe mantenerse en sync con PRONET_CONFIG.PLANES
-- en config.js. Si cambiás un límite, cambialo en los dos lados.

-- ── Tabla de límites (espejo de PLANES en config.js) ────────────────────
create table if not exists public.planes_limites (
  plan            text primary key,
  propuestas_mes  int,   -- null = ilimitado
  fotos_portfolio int    -- null = ilimitado
);

insert into public.planes_limites (plan, propuestas_mes, fotos_portfolio) values
  ('base',  3,    3),
  ('plus',  10,   10),
  ('pro',   null, 20),
  ('elite', null, null)
on conflict (plan) do update
  set propuestas_mes  = excluded.propuestas_mes,
      fotos_portfolio = excluded.fotos_portfolio;

alter table public.planes_limites enable row level security;

-- Lectura pública: el cliente puede querer mostrarlos; no hay nada sensible.
drop policy if exists "limites_lectura" on public.planes_limites;
create policy "limites_lectura"
  on public.planes_limites for select
  to authenticated
  using (true);

-- ── Helper: plan activo de un prestador ─────────────────────────────────
create or replace function public.plan_de_prestador(p_prestador_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_plan       text;
begin
  select id into v_usuario_id
    from perfiles where prestador_id = p_prestador_id limit 1;
  if v_usuario_id is null then return null; end if;

  select plan into v_plan
    from suscripciones
   where usuario_id = v_usuario_id
     and estado = 'activo'
     and (vence_en is null or vence_en > now());

  return coalesce(v_plan, 'base');
end;
$$;

-- ── Trigger: límite de propuestas por mes ───────────────────────────────
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
  -- Sin perfil asociado no bloqueamos: es un dato inconsistente, no un abuso.
  if v_plan is null then return new; end if;

  select propuestas_mes into v_limite from planes_limites where plan = v_plan;
  if v_limite is null then return new; end if;  -- plan ilimitado

  -- Mes calendario en hora de Buenos Aires, para que coincida con lo que
  -- cuenta el cliente (que usa la hora local del dispositivo).
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

drop trigger if exists trg_limite_propuestas on public.propuestas;
create trigger trg_limite_propuestas
  before insert on public.propuestas
  for each row execute function public.chequear_limite_propuestas();

-- ── Trigger: límite de fotos de portfolio ───────────────────────────────
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

  select fotos_portfolio into v_limite from planes_limites where plan = v_plan;
  if v_limite is null then return new; end if;  -- plan ilimitado

  select count(*) into v_usadas
    from portfolio_fotos where prestador_id = new.prestador_id;

  if v_usadas >= v_limite then
    raise exception 'limite_portfolio: el plan % permite % fotos de portfolio', v_plan, v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limite_portfolio on public.portfolio_fotos;
create trigger trg_limite_portfolio
  before insert on public.portfolio_fotos
  for each row execute function public.chequear_limite_portfolio();
