-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · La ubicación del banner la valida el servidor, no el cliente
--
-- `crear_banner` validaba que la ubicación fuera UNA DE LAS DOS, pero
-- aceptaba la que le mandaran. El cliente manda la correcta según el rol
-- (promoUbicacion() en app.js), pero eso es una sugerencia: cualquiera
-- podía llamar al RPC desde la consola con p_ubicacion='portada' y meter
-- su aviso en el carrusel de los prestadores, ocupando uno de esos 6
-- espacios.
--
-- No llegaba a publicarse —queda 'pendiente' y lo tiene que aprobar un
-- admin— pero sí reservaba el lugar: banners_espacios_libres() cuenta los
-- 'aprobado', y el tope de 3 piezas abiertas por persona no distingue
-- carrusel. Alcanzaba para tomarle lugar a quien sí puede comprar ahí.
--
-- ── La regla ───────────────────────────────────────────────────────────
-- La portada es el carrusel de los prestadores. Comprar ahí exige tener
-- ficha de prestador; 'vecinos' lo puede comprar cualquiera.
--
-- Se valida por `perfiles.prestador_id` y NO se fuerza la ubicación por
-- rol: un prestador con doble perfil, navegando como vecino, elige
-- 'vecinos' a propósito y el servidor tiene que respetarlo. Lo que se
-- cierra es el camino de abajo hacia arriba, que es el único que importa.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.crear_banner(
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
  v_es_prestador boolean;
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

  -- La portada es el carrusel de los prestadores: comprar ahí exige tener
  -- ficha. Sin esto, el rol lo decidía sólo el cliente.
  select prestador_id is not null into v_es_prestador
    from public.perfiles where id = v_uid;
  if v_ubi = 'portada' and not coalesce(v_es_prestador, false) then
    return jsonb_build_object('ok', false, 'error',
      'El carrusel de la portada es para prestadores. Tu aviso va en Entre Vecinos.');
  end if;

  if btrim(coalesce(p_enlace,'')) = '' then
    return jsonb_build_object('ok', false, 'error',
      case when p_destino = 'whatsapp' then 'Falta el WhatsApp de contacto'
           else 'Falta la imagen que se abre al tocarlo' end);
  end if;

  -- Se avisa acá, antes de que cargue nada, y no al aprobar: enterarse de que
  -- no hay lugar después de preparar la pieza es la peor versión de esto.
  -- Pregunta por SU carrusel: que la portada esté llena no debe bloquear a
  -- quien compra en Entre Vecinos.
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
-- Una sola firma (dos harían que PostgREST no pueda elegir).
select count(*) as firmas_crear_banner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'crear_banner';
