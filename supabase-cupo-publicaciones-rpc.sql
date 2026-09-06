-- ═══ PRONET · Cupo de publicaciones de Entre Vecinos, legible ══════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── Por qué ────────────────────────────────────────────────────────────
-- El vecino no tenía forma de saber cuántas publicaciones le quedaban. Se
-- enteraba del límite cuando le rebotaba la cuarta con
-- "sin_creditos_publicacion". Existían contarPublicacionesMercadoAnio() y
-- ...Mes() en datos.js para mostrarlo, pero no las llamaba nadie: código
-- muerto desde que se escribió.
--
-- ── Por qué una RPC y no contarlo en el cliente ────────────────────────
-- Porque el límite ya está escrito en `chequear_cupo_publicacion_mercado`, y
-- este proyecto ya tuvo el problema de tener cada límite escrito dos veces:
-- el cliente decía una cosa y el servidor hacía otra. Un contador que no
-- coincide con la regla que rechaza es peor que no tener contador — promete
-- un lugar que después no existe.
--
-- Así que esto NO vuelve a implementar la regla: la lee del mismo lugar y
-- con el mismo criterio que el trigger, y devuelve lo que hay que mostrar.
-- Si mañana cambia el trigger, hay que cambiar acá también — pero los dos
-- viven en este archivo, uno al lado del otro.

create or replace function public.cupo_publicaciones_mercado()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid          uuid := auth.uid();
  v_plan         text;
  v_inicio       timestamptz;
  v_usadas       int;
  v_creditos     int;
  v_limite       int;
  v_periodo      text;
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesion');
  end if;

  select es_pro_marketplace, pro_marketplace_hasta, coalesce(promarket_creditos, 0)
    into v_legacy_activo, v_legacy_hasta, v_creditos
    from perfiles where id = v_uid;

  -- Mismo atajo que el trigger: el flag legacy gana sobre todo lo demás.
  if v_legacy_activo and (v_legacy_hasta is null or v_legacy_hasta > now()) then
    return jsonb_build_object('ok', true, 'ilimitado', true, 'motivo', 'promarket');
  end if;

  v_plan := plan_para_limites(coalesce(plan_de_usuario(v_uid), 'base'));

  if v_plan = 'pro' then
    return jsonb_build_object('ok', true, 'ilimitado', true, 'plan', 'pro');
  end if;

  if v_plan = 'plus' then
    select coalesce(mkt_publicaciones_mes, 10) into v_limite
      from planes_limites where plan = 'plus';
    v_periodo := 'mes';
    v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
                at time zone 'America/Argentina/Buenos_Aires';
  else
    select coalesce(mkt_publicaciones_anio, 3) into v_limite
      from planes_limites where plan = 'base';
    v_periodo := 'anio';
    v_inicio := date_trunc('year', now() at time zone 'America/Argentina/Buenos_Aires')
                at time zone 'America/Argentina/Buenos_Aires';
  end if;

  -- Cuenta las CREADAS, sin mirar `activa` — igual que el trigger.
  -- Desactivar no devuelve el cupo, y por eso hay que decirlo en la UI.
  select count(*) into v_usadas
    from publicaciones
   where autor_id = v_uid
     and creado >= v_inicio;

  return jsonb_build_object(
    'ok', true,
    'ilimitado', false,
    'plan', v_plan,
    'periodo', v_periodo,
    'limite', v_limite,
    'usadas', v_usadas,
    'restantes', greatest(v_limite - v_usadas, 0),
    'creditos', coalesce(v_creditos, 0)
  );
end;
$fn$;

-- ── Verificación ───────────────────────────────────────────────────────
select p.plan, p.mkt_publicaciones_anio, p.mkt_publicaciones_mes
  from planes_limites p order by p.plan;
