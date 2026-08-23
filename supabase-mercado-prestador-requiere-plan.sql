-- ═══ El prestador entra a Mercado por su plan, no por el cupo del vecino ═══
--
-- 2026-08-22. Decisión de negocio, ver DEFINICIONES-NEGOCIO.md.
--
-- ── La regla ───────────────────────────────────────────────────────────
-- Publicar en la sección Servicios de Entre Vecinos es beneficio de los planes
-- Plus y Pro. Un prestador con plan Base NO publica ahí; el camino es
-- upgradear, no comprar un crédito suelto — a $5.000 competiría con Plus a
-- $5.990 y canibalizaría el upgrade.
--
-- Y el prestador publica SERVICIOS y nada más: los productos son el mercado del
-- vecino. Que un prestador Base no pueda publicar nada en Mercado es la
-- definición, no un efecto colateral: entra a Entre Vecinos por su oficio.
--
-- ── Antes ──────────────────────────────────────────────────────────────
-- El trigger no distinguía rol: un prestador Base caía al cupo del vecino
-- (5 gratis por mes + créditos), igual que cualquiera.
--
-- ── Dónde va el corte ──────────────────────────────────────────────────
-- Después del grandfathering legacy y después de resolver el plan, pero ANTES
-- de las ramas de cupo. Un prestador Plus o Pro no toca esta rama.
--
-- El cliente hace la misma verificación para no dejar que el usuario llegue
-- hasta acá (puedePublicarMercado, app.js). Este es el que manda; aquél sólo
-- decide qué mostrar antes de que intente.

begin;

create or replace function public.chequear_cupo_publicacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan       text;
  v_inicio     timestamptz;
  v_usadas     int;
  v_creditos   int;
  v_limite     int;
  v_prestador  uuid;
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  -- Grandfathering: suscriptores de la vieja ProMarket ($10.000/mes) siguen
  -- ilimitados hasta que venza naturalmente su período ya pagado.
  select es_pro_marketplace, pro_marketplace_hasta, prestador_id
    into v_legacy_activo, v_legacy_hasta, v_prestador
    from perfiles where id = new.autor_id;
  if v_legacy_activo and (v_legacy_hasta is null or v_legacy_hasta > now()) then
    return new;
  end if;

  v_plan := plan_para_limites(coalesce(plan_de_usuario(new.autor_id), 'base'));

  -- ── El prestador necesita plan ─────────────────────────────────────
  -- `prestador_id is not null` es lo que define a un prestador. Un vecino que
  -- nunca se dio de alta como prestador no entra por acá.
  if v_prestador is not null and v_plan not in ('plus', 'pro') then
    raise exception 'requiere_plan_publicacion: publicar en Servicios es un beneficio de los planes Plus y Pro'
      using errcode = 'check_violation';
  end if;

  if v_plan = 'pro' then
    return new; -- ilimitado
  end if;

  -- Mes calendario en hora de Buenos Aires, igual criterio que propuestas_mes.
  v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';
  select count(*) into v_usadas
    from publicaciones
   where autor_id = new.autor_id
     and creado >= v_inicio;

  if v_plan = 'plus' then
    if v_usadas >= 10 then
      raise exception 'limite_publicaciones_mes: el plan plus permite 10 publicaciones por mes'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- ── Vecino: cupo mensual parametrizable ────────────────────────────
  select coalesce(nullif(valor, '')::int, 5) into v_limite
    from config_app where clave = 'mkt_pub_vecino_mes';
  v_limite := coalesce(v_limite, 5);

  if v_limite < 0 then
    return new;   -- -1 = ilimitado
  end if;

  if v_usadas < v_limite then
    return new;   -- todavía le quedan gratis este mes
  end if;

  -- Agotó el cupo del mes: consumir un crédito comprado.
  select promarket_creditos into v_creditos from perfiles where id = new.autor_id;
  if coalesce(v_creditos, 0) <= 0 then
    raise exception 'sin_creditos_publicacion: comprá una publicación extra para seguir publicando'
      using errcode = 'check_violation';
  end if;

  update perfiles set promarket_creditos = promarket_creditos - 1 where id = new.autor_id;
  return new;
end;
$function$;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. El cuerpo desplegado es el nuevo:
--      select prosrc like '%requiere_plan_publicacion%' from pg_proc
--       where proname = 'chequear_cupo_publicacion';
--
-- 2. Desde una sesión de PRESTADOR con plan Base, intentar publicar en Mercado
--    tiene que fallar con requiere_plan_publicacion. Desde una de VECINO, tiene
--    que seguir funcionando con su cupo mensual.
--
-- 3. OJO con el test que ya existe: supabase-test-cupo-publicacion-mercado.sql
--    prueba el caso Base asumiendo el cupo de vecino. Si la cuenta que usa es
--    prestador, ahora va a fallar por otro motivo — hay que actualizarlo.
