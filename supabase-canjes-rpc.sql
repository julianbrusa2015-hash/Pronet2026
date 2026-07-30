-- ═══ PRONET · Parte 3: canjes por RPC ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- Requiere supabase-loyalty-server-side.sql (usa acreditar_puntos()).
--
-- Cierra los tres caminos que todavía escribían `loyalty` desde el navegador:
-- el débito del canje, el bonus de puntos_extra y el reembolso.
--
-- Además tapa dos agujeros que tenía el flujo viejo:
--
--   1. EL COSTO LO MANDABA EL CLIENTE. canjearPuntos(costo, nombre, canjeId)
--      recibía el costo por parámetro, así que se podía llamar con costo=0 y
--      obtener un beneficio de 5.000 puntos gratis. Acá el costo se lee de
--      loyalty_canjes en el servidor y el parámetro desaparece.
--
--   2. LA APROBACIÓN NO ERA IDEMPOTENTE. accionCanje() actualizaba el estado y
--      después aplicaba el beneficio; dos clicks seguidos aplicaban el
--      beneficio dos veces. Acá el UPDATE exige estado='pendiente' y si no
--      cambió ninguna fila se corta sin aplicar nada.

-- ── Chequeo de dependencia ──────────────────────────────────────────────
-- Los dos RPC llaman a acreditar_puntos(), que se crea en la Parte 2. Si se
-- corre este archivo primero, el revoke del final deja el saldo inescribible
-- sin nada que lo reemplace: los puntos quedan congelados en los dos caminos.
do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'acreditar_puntos'
  ) then
    raise exception
      'Falta acreditar_puntos(): corré primero supabase-loyalty-server-side.sql (Parte 2), después este archivo.';
  end if;
end $$;

-- ── RPC 1: el usuario solicita un canje ─────────────────────────────────
create or replace function public.canjear_puntos(p_canje_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_prestador_id uuid;
  v_canje        record;
  v_saldo        int;
  v_nuevo        int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  -- El costo y el nombre salen de la base, nunca del cliente.
  select id, nombre, costo_puntos, activo, tipo into v_canje
    from loyalty_canjes where id = p_canje_id;
  if v_canje.id is null then
    return jsonb_build_object('ok', false, 'error', 'canje inexistente');
  end if;
  if not coalesce(v_canje.activo, false) then
    return jsonb_build_object('ok', false, 'error', 'canje no disponible');
  end if;

  select prestador_id into v_prestador_id from perfiles where id = v_uid;

  -- Un canje del catálogo de prestadores no lo pide un vecino, y al revés.
  if v_canje.tipo = 'prestador' and v_prestador_id is null then
    return jsonb_build_object('ok', false, 'error', 'canje solo para prestadores');
  end if;

  select coalesce(puntos, 0) into v_saldo from loyalty where usuario_id = v_uid;
  if coalesce(v_saldo, 0) < v_canje.costo_puntos then
    return jsonb_build_object('ok', false, 'error', 'puntos insuficientes');
  end if;

  -- Evitar que se apilen solicitudes del mismo canje sin resolver.
  if exists (
    select 1 from loyalty_solicitudes
     where usuario_id = v_uid and canje_id = p_canje_id and estado = 'pendiente'
  ) then
    return jsonb_build_object('ok', false, 'error', 'ya tenés una solicitud pendiente de este canje');
  end if;

  insert into loyalty_solicitudes
    (usuario_id, prestador_id, canje_id, nombre_canje, puntos_descontados, estado)
  values
    (v_uid, v_prestador_id, p_canje_id, v_canje.nombre, v_canje.costo_puntos, 'pendiente');

  v_nuevo := acreditar_puntos(v_uid, -v_canje.costo_puntos, 'canje',
                              'Canje: ' || v_canje.nombre, v_prestador_id);

  return jsonb_build_object('ok', true, 'puntos', v_nuevo);
end;
$$;

-- ── RPC 2: el admin resuelve un canje ───────────────────────────────────
create or replace function public.resolver_canje(p_solicitud_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol      record;
  v_tipo_ben text;
  v_valor    text;
  v_base     timestamptz;
  v_filas    int;
  v_mensaje  text;
begin
  if not es_admin() then
    return jsonb_build_object('ok', false, 'error', 'solo admin');
  end if;
  if p_estado not in ('aprobado', 'rechazado') then
    return jsonb_build_object('ok', false, 'error', 'estado inválido');
  end if;

  select * into v_sol from loyalty_solicitudes where id = p_solicitud_id;
  if v_sol.id is null then
    return jsonb_build_object('ok', false, 'error', 'solicitud inexistente');
  end if;

  -- Guarda de idempotencia: sólo transiciona desde 'pendiente'. Un segundo
  -- click no actualiza nada y sale sin volver a aplicar el beneficio.
  update loyalty_solicitudes
     set estado = p_estado, resuelto = now()
   where id = p_solicitud_id and estado = 'pendiente';
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'la solicitud ya estaba resuelta');
  end if;

  -- ── Rechazo: devolver los puntos ──
  if p_estado = 'rechazado' then
    perform acreditar_puntos(v_sol.usuario_id, v_sol.puntos_descontados, 'canje',
                             'Reembolso: ' || v_sol.nombre_canje, v_sol.prestador_id);
    return jsonb_build_object('ok', true,
      'mensaje', 'Tu canje "' || v_sol.nombre_canje || '" fue rechazado. Se te devolvieron los puntos.');
  end if;

  -- ── Aprobación: aplicar el beneficio según su tipo ──
  select tipo_beneficio, valor_beneficio into v_tipo_ben, v_valor
    from loyalty_canjes where id = v_sol.canje_id;
  v_tipo_ben := coalesce(v_tipo_ben, 'manual');

  if v_tipo_ben = 'plan_mes' then
    select vence_en into v_base from suscripciones where usuario_id = v_sol.usuario_id;
    if v_base is null or v_base < now() then v_base := now(); end if;

    insert into suscripciones (usuario_id, plan, estado, periodo, vence_en, activado_en)
         values (v_sol.usuario_id, v_valor, 'activo', 'mensual',
                 v_base + interval '1 month', now())
    on conflict (usuario_id) do update
       set plan = v_valor, estado = 'activo', periodo = 'mensual',
           vence_en = v_base + interval '1 month', activado_en = now();

    v_mensaje := 'Tu plan ' || v_valor || ' fue activado por 1 mes.';

  elsif v_tipo_ben = 'puntos_extra' then
    perform acreditar_puntos(v_sol.usuario_id, coalesce(v_valor::int, 0), 'canje',
                             'Bonus: ' || v_sol.nombre_canje, v_sol.prestador_id);
    v_mensaje := 'Recibiste ' || v_valor || ' puntos extra.';

  else
    v_mensaje := 'Tu canje "' || v_sol.nombre_canje ||
                 '" fue aprobado. Nos contactaremos para coordinar la entrega.';
  end if;

  return jsonb_build_object('ok', true, 'mensaje', v_mensaje);
end;
$$;

-- ── Cierre: quitarle al cliente la escritura directa ────────────────────
-- Con los RPC en su lugar, el navegador ya no necesita escribir estas tablas.
-- Los RPC son SECURITY DEFINER, así que siguen funcionando.
--
-- Esto es lo que cierra definitivamente la auto-inflación de puntos: mientras
-- el cliente pudiera escribir su propia fila de `loyalty`, ninguna policy
-- podía impedirle poner el saldo que quisiera.
revoke insert, update on public.loyalty             from authenticated;
revoke insert, update on public.loyalty_historial   from authenticated;
revoke insert, update on public.loyalty_solicitudes from authenticated;

-- ── Verificación ────────────────────────────────────────────────────────
select routine_name from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('canjear_puntos', 'resolver_canje', 'acreditar_puntos');

select grantee, privilege_type, table_name
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('loyalty', 'loyalty_historial', 'loyalty_solicitudes')
   and grantee = 'authenticated'
 order by table_name, privilege_type;
