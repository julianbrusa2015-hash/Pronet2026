-- ═══ FIX · La duración del banner pago la decidía el cliente ═══
--
-- Detectado 2026-08-22 revisando valores hardcodeados.
--
-- ── El problema ────────────────────────────────────────────────────────
-- `app.js` manda `dias: 30` fijo al comprar un banner, y `crear_banner` lo
-- aceptaba con `greatest(1, coalesce(p_dias, 30))`: mínimo 1, SIN MÁXIMO.
--
-- Desde la consola del navegador:
--
--     await _sb.rpc('crear_banner', { p_nombre:'x', p_imagen_url:'y',
--                                     p_enlace:'z', p_dias: 3650 })
--
-- pedía un banner de diez años al precio de uno. Lo mitigaba que nace en
-- 'pendiente' y que el panel de admin muestra los días en la tarjeta — o sea,
-- no era un robo automático, era una trampa que dependía de que el admin
-- leyera antes de aprobar. Con el carrusel lleno y aprobaciones rápidas, es
-- cuestión de tiempo.
--
-- Además era inconsistente: el impulso —el otro producto pago con duración—
-- ya lee su plazo de `config_app.impulso_dias`. El banner no.
--
-- ── El fix ─────────────────────────────────────────────────────────────
-- El plazo pasa a ser parametría y el servidor IGNORA lo que manda el
-- cliente. Mismo patrón que activar_impulso_pagado().
--
-- ── Por qué p_dias sigue en la firma ───────────────────────────────────
-- Porque cambiarla rompería PostgREST: un `create or replace` con otra firma
-- deja las dos funciones conviviendo y PostgREST no puede elegir. Ya pasó con
-- buscar_prestadores (ver el aviso en supabase-ranking-bayesiano.sql). El
-- parámetro queda, sin uso, y el cliente puede seguir mandándolo: no cambia
-- nada. Se saca de la firma recién cuando haya que tocar la función por otro
-- motivo y se pueda hacer el drop viejo en la misma migración.
--
-- La pantalla de compra NO promete ningún plazo, así que no hay copy que
-- quede desincronizado si mañana se cambia el valor.

insert into public.config_app (clave, valor)
values ('banner_dias', '30')
on conflict (clave) do nothing;

create or replace function public.crear_banner(
  p_nombre     text,
  p_imagen_url text,
  p_enlace     text default null,
  p_dias       integer default 30,   -- IGNORADO, ver nota de arriba
  p_destino    text default 'whatsapp'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_abiertos int;
  v_dias int;
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
  if btrim(coalesce(p_enlace,'')) = '' then
    return jsonb_build_object('ok', false, 'error',
      case when p_destino = 'whatsapp' then 'Falta el WhatsApp de contacto'
           else 'Falta la imagen que se abre al tocarlo' end);
  end if;

  -- Se avisa acá, antes de que cargue nada, y no al aprobar: enterarse de que
  -- no hay lugar después de preparar la pieza es la peor versión de esto.
  if public.banners_espacios_libres() <= 0 then
    return jsonb_build_object('ok', false, 'error',
      'Por ahora no quedan espacios libres. Se liberan cuando vence alguno.', 'codigo', 'sin_espacio');
  end if;

  -- Tope de piezas sin resolver por usuario: sin esto, alguien puede llenar
  -- la cola de moderación sin haber pagado nunca.
  select count(*) into v_abiertos from public.banners
   where usuario_id = v_uid and estado in ('borrador','pendiente','aprobado');
  if v_abiertos >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tenés 3 banners sin publicar. Resolvé esos primero.');
  end if;

  -- El plazo sale de la parametría, NO del parámetro. Es lo que se compra.
  select coalesce(nullif(valor, '')::int, 30) into v_dias
    from public.config_app where clave = 'banner_dias';
  v_dias := greatest(1, coalesce(v_dias, 30));

  insert into public.banners (nombre, imagen_url, enlace, destino_tipo, usuario_id, estado, dias, activo, orden)
  values (btrim(p_nombre), btrim(p_imagen_url), btrim(p_enlace), p_destino,
          v_uid, 'pendiente', v_dias, false, 999)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.crear_banner(text,text,text,integer,text) from public, anon;
grant execute on function public.crear_banner(text,text,text,integer,text) to authenticated;

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La parametría existe:
select clave, valor from public.config_app where clave in ('banner_dias', 'impulso_dias');

-- 2. Desde la consola del navegador, con sesión de un usuario común, pedir un
--    banner con p_dias absurdo y confirmar que se guarda con el valor de la
--    parametría y no con el enviado:
--
--      await _sb.rpc('crear_banner', { p_nombre:'PRUEBA BORRAR',
--        p_imagen_url:'https://x/y.png', p_enlace:'1122334455',
--        p_dias: 3650, p_destino:'whatsapp' })
--
--    Después mirar la fila y BORRARLA:
--      select id, nombre, dias from public.banners where nombre = 'PRUEBA BORRAR';
--      delete from public.banners where nombre = 'PRUEBA BORRAR';
--
--    `dias` tiene que decir 30, no 3650.
