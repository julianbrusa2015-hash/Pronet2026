-- ═══ PRONET · ProMarket deja de ser un plan flat, pasa a cupos (2026-08-02) ═══
--
-- Reemplaza el plan único de $10.000/mes (es_pro_marketplace) por:
--   - Vecino ocasional (o prestador Base): 3 publicaciones gratis por año
--     calendario, después $5.000 por publicación individual (crédito comprado).
--   - Prestador Plus: 10 publicaciones/mes (mismo número que su límite de
--     propuestas — reusa la escalera ya conocida).
--   - Prestador Pro: ilimitado.
--
-- Los que ya tenían es_pro_marketplace=true activo por la suscripción vieja
-- quedan grandfathereados con acceso ilimitado hasta que venza naturalmente
-- (pro_marketplace_hasta) — no se les corta de golpe algo que ya pagaron.

alter table public.perfiles
  add column if not exists promarket_creditos int not null default 0;

-- ── Helper: plan activo de un usuario (no de un prestador) ──────────────
-- publicaciones.autor_id ya ES el id de perfiles/auth.users, sin la
-- indirección por prestador_id que necesita plan_de_prestador().
create or replace function public.plan_de_usuario(p_usuario_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select plan from public.suscripciones
      where usuario_id = p_usuario_id
        and estado = 'activo'
        and (vence_en is null or vence_en > now())),
    'base'
  );
$$;

-- ── RPC: acredita créditos de publicación (la usan los Edge Functions
--    de pago tras un pago único aprobado) ───────────────────────────────
create or replace function public.incrementar_creditos_promarket(p_usuario_id uuid, p_cantidad int default 1)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles
     set promarket_creditos = promarket_creditos + p_cantidad
   where id = p_usuario_id;
$$;
grant execute on function public.incrementar_creditos_promarket(uuid, int) to service_role;

-- ── Trigger: cupo de publicaciones en ProMarket ──────────────────────────
create or replace function public.chequear_cupo_publicacion_mercado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     text;
  v_inicio   timestamptz;
  v_usadas   int;
  v_creditos int;
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  -- Grandfathering: suscriptores de la vieja ProMarket ($10.000/mes) siguen
  -- ilimitados hasta que venza naturalmente su período ya pagado.
  select es_pro_marketplace, pro_marketplace_hasta
    into v_legacy_activo, v_legacy_hasta
    from perfiles where id = new.autor_id;
  if v_legacy_activo and (v_legacy_hasta is null or v_legacy_hasta > now()) then
    return new;
  end if;

  v_plan := plan_de_usuario(new.autor_id);

  if v_plan = 'pro' then
    return new; -- ilimitado
  end if;

  if v_plan = 'plus' then
    -- Mes calendario en hora de Buenos Aires, igual criterio que propuestas_mes.
    v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
                at time zone 'America/Argentina/Buenos_Aires';
    select count(*) into v_usadas
      from publicaciones
     where autor_id = new.autor_id
       and creado >= v_inicio;
    if v_usadas >= 10 then
      raise exception 'limite_publicaciones_mes: el plan plus permite 10 publicaciones por mes'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Base / vecino ocasional: 3 gratis por año calendario.
  v_inicio := date_trunc('year', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';
  select count(*) into v_usadas
    from publicaciones
   where autor_id = new.autor_id
     and creado >= v_inicio;

  if v_usadas < 3 then
    return new; -- todavía tiene gratis este año
  end if;

  -- Agotó las 3 gratis: consumir un crédito comprado ($5.000 c/u).
  select promarket_creditos into v_creditos from perfiles where id = new.autor_id;
  if coalesce(v_creditos, 0) <= 0 then
    raise exception 'sin_creditos_publicacion: comprá una publicación extra para seguir publicando'
      using errcode = 'check_violation';
  end if;

  update perfiles set promarket_creditos = promarket_creditos - 1 where id = new.autor_id;
  return new;
end;
$$;

drop trigger if exists trg_cupo_publicacion_mercado on public.publicaciones;
create trigger trg_cupo_publicacion_mercado
  before insert on public.publicaciones
  for each row execute function public.chequear_cupo_publicacion_mercado();

-- ── planes_limites: sale el plan flat 'promarket', entra el ítem de pago
--    único 'promarket_credito' (una publicación extra, $5.000). ───────────
delete from public.planes_limites where plan = 'promarket';

insert into public.planes_limites (plan, nombre, precio_mes, precio_anual, propuestas_mes, fotos_portfolio)
values ('promarket_credito', 'Publicación extra ProMarket', 5000, null, null, null)
on conflict (plan) do update
  set nombre = excluded.nombre,
      precio_mes = excluded.precio_mes;

notify pgrst, 'reload schema';
