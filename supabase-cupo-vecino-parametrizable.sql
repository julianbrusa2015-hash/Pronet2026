-- ═══ Cupo de publicaciones del vecino: mensual y parametrizable ═══
--
-- 2026-08-22.
--
-- ── Qué cambia ─────────────────────────────────────────────────────────
-- Antes: 3 gratis por AÑO calendario, con el 3 hardcodeado en el trigger y
-- otra vez en el cliente (app.js, `?? 3`).
-- Ahora: N gratis por MES, con N en `config_app.mkt_pub_vecino_mes`.
--
-- ── Por qué el mes y no el año ─────────────────────────────────────────
-- "3 por año" es la peor forma de contar esto. Nadie recuerda qué publicó en
-- marzo. Un vecino vende tres cosas en una mudanza, agota el año entero en una
-- semana, y en octubre —cuando quiere vender algo— se encuentra con una pared
-- que no entiende ni recuerda haber consumido. Se siente trampa aunque no lo
-- sea.
--
-- Un cupo mensual se explica solo y se recupera: "te quedan 2 este mes" es
-- accionable, "te quedan 0 hasta enero" es una puerta cerrada.
--
-- ── El sentinel ────────────────────────────────────────────────────────
-- -1 = ilimitado. 0 = sin publicaciones gratis (paga desde la primera), que es
-- una configuración legítima y distinta. Por eso 0 no significa "ilimitado".
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────
-- Los prestadores con plan siguen igual: pro ilimitado, plus 10/mes. La
-- discusión sobre separar el plan profesional del cupo de Mercado quedó
-- abierta y no se implementa acá.

begin;

insert into public.config_app (clave, valor)
values ('mkt_pub_vecino_mes', '5')
on conflict (clave) do nothing;

create or replace function public.chequear_cupo_publicacion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan     text;
  v_inicio   timestamptz;
  v_usadas   int;
  v_creditos int;
  v_limite   int;
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

  v_plan := plan_para_limites(coalesce(plan_de_usuario(new.autor_id), 'base'));

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

  -- ── Vecino / Base: cupo mensual parametrizable ─────────────────────
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
-- 1. La parametría existe:
--      select clave, valor from config_app where clave = 'mkt_pub_vecino_mes';
--
-- 2. El trigger sigue enganchado:
--      select tgname from pg_trigger where tgrelid = 'public.publicaciones'::regclass
--       and not tgisinternal;
--
-- 3. El cuerpo desplegado es el nuevo:
--      select prosrc like '%mkt_pub_vecino_mes%' from pg_proc
--       where proname = 'chequear_cupo_publicacion';
--
-- 4. El test de cupo que ya existe (supabase-test-cupo-publicacion-mercado.sql)
--    valida el escenario Plus. OJO: su caso Base espera el límite ANUAL viejo,
--    así que hay que actualizarlo antes de volver a correrlo.
