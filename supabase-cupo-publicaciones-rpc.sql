-- ═══ PRONET · Cupo de publicaciones de Entre Vecinos, legible ══════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- Correr DESPUÉS de supabase-cupo-trigger-reenganche.sql.
--
-- ── Por qué ────────────────────────────────────────────────────────────
-- El vecino no tenía forma de saber cuántas publicaciones le quedaban. Se
-- enteraba del límite cuando le rebotaba la siguiente con
-- "sin_creditos_publicacion".
--
-- ── Por qué una RPC y no contarlo en el cliente ────────────────────────
-- Porque el límite ya está escrito en el trigger, y este proyecto ya tuvo el
-- problema de tener cada límite escrito dos veces — de hecho es el bug que
-- destapó esto: el cliente contaba por mes y el servidor por año, y el
-- vecino veía que podía publicar mientras el insert le rebotaba.
--
-- Un contador que no coincide con la regla que rechaza es peor que no tener
-- contador: promete un lugar que después no existe.
--
-- Esto refleja `chequear_cupo_publicacion` exactamente. Si cambia uno hay que
-- cambiar el otro.

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
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesion');
  end if;

  select es_pro_marketplace, pro_marketplace_hasta, coalesce(promarket_creditos, 0)
    into v_legacy_activo, v_legacy_hasta, v_creditos
    from perfiles where id = v_uid;

  if v_legacy_activo and (v_legacy_hasta is null or v_legacy_hasta > now()) then
    return jsonb_build_object('ok', true, 'ilimitado', true, 'motivo', 'promarket');
  end if;

  v_plan := plan_para_limites(coalesce(plan_de_usuario(v_uid), 'base'));

  if v_plan = 'pro' then
    return jsonb_build_object('ok', true, 'ilimitado', true, 'plan', 'pro');
  end if;

  -- Mes calendario en hora de Buenos Aires, igual que el trigger.
  v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';
  select count(*) into v_usadas
    from publicaciones
   where autor_id = v_uid
     and creado >= v_inicio;

  if v_plan = 'plus' then
    select coalesce(mkt_publicaciones_mes, 10) into v_limite
      from planes_limites where plan = 'plus';
    v_limite := coalesce(v_limite, 10);
  else
    select coalesce(nullif(valor, '')::int, 5) into v_limite
      from config_app where clave = 'mkt_pub_vecino_mes';
    v_limite := coalesce(v_limite, 5);
    if v_limite < 0 then
      return jsonb_build_object('ok', true, 'ilimitado', true, 'motivo', 'sin_tope');
    end if;
  end if;

  -- Cuenta las CREADAS en el mes, sin mirar `activa` — igual que el trigger.
  -- Desactivar no devuelve el cupo, y por eso hay que decirlo en la UI.
  return jsonb_build_object(
    'ok', true,
    'ilimitado', false,
    'plan', v_plan,
    'periodo', 'mes',
    'limite', v_limite,
    'usadas', v_usadas,
    'restantes', greatest(v_limite - v_usadas, 0),
    'creditos', coalesce(v_creditos, 0)
  );
end;
$fn$;

-- ── Verificación: los dos números que tienen que coincidir ─────────────
select (select valor from config_app where clave = 'mkt_pub_vecino_mes') as limite_vecino_mes,
       (select mkt_publicaciones_mes from planes_limites where plan = 'plus') as limite_plus_mes,
       (select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          join pg_class c on c.oid = t.tgrelid
         where c.relname = 'publicaciones' and not t.tgisinternal limit 1) as trigger_llama_a;
