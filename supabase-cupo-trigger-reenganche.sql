-- ═══ PRONET · El trigger del cupo apuntaba a la función vieja ══════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- SIN begin/commit: el editor ya corre todo en su propia transacción, y
-- anidar una hace que diga "Success" sin aplicar nada.
--
-- ── Qué pasó ───────────────────────────────────────────────────────────
-- `supabase-cupo-vecino-parametrizable.sql` migró el cupo del vecino de
-- "3 por año" a "N por mes, con N en config_app". Creó la función nueva,
-- `chequear_cupo_publicacion`.
--
-- Pero el trigger vivo se llama `trg_cupo_publicacion_mercado` y apunta a
-- `chequear_cupo_publicacion_mercado` — otro nombre. Así que la función
-- nueva quedó creada y sin usar, y el servidor siguió aplicando la regla
-- anual vieja.
--
-- La verificación de aquella migración decía "el trigger sigue enganchado" y
-- comprobaba `select tgname from pg_trigger`. Eso sólo prueba que EXISTE un
-- trigger, no a qué función llama. Pasó estando mal.
--
-- ── Por qué importa ────────────────────────────────────────────────────
-- El cliente y el servidor quedaron aplicando reglas distintas:
--
--   cliente (app.js): mes, límite config_app.mkt_pub_vecino_mes = 5
--   servidor:         año, límite planes_limites.mkt_publicaciones_anio = 3
--
-- El vecino veía que podía publicar y el insert le rebotaba, o al revés.
--
-- ── Además ─────────────────────────────────────────────────────────────
-- La función nueva tenía el límite de Plus hardcodeado en 10, mientras el
-- cliente lo lee de planes_limites.mkt_publicaciones_mes. Mismo tipo de
-- desacuerdo, un plan más arriba: si el admin lo cambia desde Parametrías,
-- el cliente obedece y el servidor no. Se corrige acá.

create or replace function public.chequear_cupo_publicacion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_plan     text;
  v_inicio   timestamptz;
  v_usadas   int;
  v_creditos int;
  v_limite   int;
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  -- Grandfathering: suscriptores de la vieja ProMarket siguen ilimitados
  -- hasta que venza naturalmente su período ya pagado.
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
    -- Desde planes_limites, no hardcodeado: es de donde lo lee el cliente.
    select coalesce(mkt_publicaciones_mes, 10) into v_limite
      from planes_limites where plan = 'plus';
    v_limite := coalesce(v_limite, 10);
    if v_usadas >= v_limite then
      raise exception 'limite_publicaciones_mes: el plan plus permite % publicaciones por mes', v_limite
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
$fn$;

-- ── Reenganchar el trigger ─────────────────────────────────────────────
drop trigger if exists trg_cupo_publicacion_mercado on public.publicaciones;
drop trigger if exists trg_cupo_publicacion on public.publicaciones;

create trigger trg_cupo_publicacion
  before insert on public.publicaciones
  for each row execute function public.chequear_cupo_publicacion();

-- La vieja queda sin ningún trigger que la use. Se borra: dos funciones casi
-- idénticas con nombres parecidos son exactamente cómo apareció este bug.
drop function if exists public.chequear_cupo_publicacion_mercado();

notify pgrst, 'reload schema';

-- ── Verificación: a QUÉ función apunta, no si existe un trigger ────────
select t.tgname                     as trigger,
       p.proname                    as llama_a,
       (p.prosrc like '%mkt_pub_vecino_mes%') as usa_la_parametria_mensual
  from pg_trigger t
  join pg_proc  p on p.oid = t.tgfoid
  join pg_class c on c.oid = t.tgrelid
 where c.relname = 'publicaciones' and not t.tgisinternal;
