-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Los RPCs de banners pasan a saber de ubicación
--
-- Complemento de supabase-banners-ubicacion.sql. Con dos carruseles, el
-- cupo y el alta tienen que preguntarse "¿de cuál?": si no, los 6 espacios
-- son una bolsa compartida y el que compra para la portada le come el
-- lugar al que compra para Entre Vecinos.
--
-- ⚠️ DROP antes del CREATE, a propósito. Agregarle un parámetro a una
-- función NO la reemplaza: crea una SOBRECARGA. Con las dos firmas vivas,
-- PostgREST no puede decidir cuál llamar y devuelve PGRST203 — es
-- exactamente lo que rompió `ranking_prestadores` en su momento. Se borra
-- la vieja primero y recién ahí se crea la nueva.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Cupo por carrusel ────────────────────────────────────────────────
drop function if exists public.banners_espacios_libres();
drop function if exists public.banners_espacios_libres(text);

create function public.banners_espacios_libres(p_ubicacion text default 'portada')
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select greatest(0,
    coalesce((select valor from public.config_app where clave='banners_activos_max'),'6')::int
    - (select count(*) from public.banners
        where estado in ('aprobado','activo')
          and es_house = false
          and ubicacion = coalesce(p_ubicacion, 'portada'))
  );
$function$;

-- ── 2. El alta declara a qué carrusel va ────────────────────────────────
-- La ubicación NO es una opción del formulario: la decide el rol de quien
-- compra (prestador → portada, vecino → vecinos). Igual se valida acá y no
-- sólo en el cliente, porque el cliente es sugerencia y el servidor manda.
drop function if exists public.crear_banner(text, text, text, integer, text);
drop function if exists public.crear_banner(text, text, text, integer, text, text);

create function public.crear_banner(
  p_nombre     text,
  p_imagen_url text,
  p_enlace     text default null,
  p_dias       integer default 30,
  p_destino    text default 'whatsapp',
  p_ubicacion  text default 'portada'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_abiertos int;
  v_dias int;
  v_ubi text := coalesce(nullif(btrim(p_ubicacion), ''), 'portada');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;
  if coalesce((select valor from public.config_app where clave='banners_pagos_activos'),'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'Los espacios publicitarios no están disponibles por ahora');
  end if;
  if btrim(coalesce(p_nombre,'')) = '' or btrim(coalesce(p_imagen_url,'')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre o la imagen');
  end if;
  if p_destino not in ('whatsapp','imagen') then
    return jsonb_build_object('ok', false, 'error', 'Destino inválido');
  end if;
  if v_ubi not in ('portada','vecinos') then
    return jsonb_build_object('ok', false, 'error', 'Ubicación inválida');
  end if;
  if btrim(coalesce(p_enlace,'')) = '' then
    return jsonb_build_object('ok', false, 'error',
      case when p_destino = 'whatsapp' then 'Falta el WhatsApp de contacto'
           else 'Falta la imagen que se abre al tocarlo' end);
  end if;

  -- Se avisa acá, antes de que cargue nada, y no al aprobar: enterarse de que
  -- no hay lugar después de preparar la pieza es la peor versión de esto.
  -- Ahora pregunta por SU carrusel: que la portada esté llena no debe
  -- bloquear a quien compra en Entre Vecinos.
  if public.banners_espacios_libres(v_ubi) <= 0 then
    return jsonb_build_object('ok', false, 'error',
      'Por ahora no quedan espacios libres. Se liberan cuando vence alguno.', 'codigo', 'sin_espacio');
  end if;

  -- Tope de piezas sin resolver por usuario: sin esto, alguien puede llenar
  -- la cola de moderación sin haber pagado nunca. Es por PERSONA y no por
  -- carrusel: el costo que evita es el de la cola de moderación, que es una
  -- sola.
  select count(*) into v_abiertos from public.banners
   where usuario_id = v_uid and estado in ('borrador','pendiente','aprobado');
  if v_abiertos >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tenés 3 banners sin publicar. Resolvé esos primero.');
  end if;

  -- El plazo sale de la parametría, NO del parámetro. Es lo que se compra.
  select coalesce(nullif(valor, '')::int, 30) into v_dias
    from public.config_app where clave = 'banner_dias';
  v_dias := greatest(1, coalesce(v_dias, 30));

  insert into public.banners (nombre, imagen_url, enlace, destino_tipo, usuario_id, estado, dias, activo, orden, ubicacion)
  values (btrim(p_nombre), btrim(p_imagen_url), btrim(p_enlace), p_destino,
          v_uid, 'pendiente', v_dias, false, 999, v_ubi)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
-- Una sola firma de cada una (si aparecen dos, PostgREST no va a poder
-- elegir y el circuito queda roto sin dar un error claro en el cliente).
select p.proname, count(*) as firmas,
       public.banners_espacios_libres('portada') as libres_portada,
       public.banners_espacios_libres('vecinos') as libres_vecinos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('banners_espacios_libres','crear_banner')
 group by p.proname;
