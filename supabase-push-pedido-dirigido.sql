-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Push para pedidos dirigidos (recontratación)
--
-- La campanita in-app ya le llegaba al prestador, pero el push al celular
-- no: la Edge Function que lo manda (`bright-service`) sólo entiende los
-- destinos 'usuario' y 'prestadores_rubro', y no conoce 'prestador'.
--
-- La salida obvia sería enseñarle el destino nuevo a la Edge Function. No
-- hace falta, y además su código no está versionado en el repo — sólo vive
-- en el dashboard de Supabase, así que tocarlo es un cambio que no queda
-- registrado en ningún lado.
--
-- En vez de eso, `notificar_prestador` devuelve el usuario que YA resolvió
-- para escribir la campanita, y el cliente llama a la Edge Function con el
-- destino 'usuario', que sí entiende. Cero cambios en la función.
--
-- No expone nada nuevo: el id sólo se devuelve DESPUÉS de pasar el guard
-- del pedido dirigido reciente, y `perfiles.prestador_id` ya es legible por
-- cualquier usuario logueado. Lo único que cambia es una clave más en el
-- JSON de respuesta.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.notificar_prestador(
  p_prestador_id uuid,
  p_tipo         text,
  p_titulo       text,
  p_cuerpo       text default null,
  p_url          text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_destino uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'falta título');
  end if;

  -- Sólo se le puede escribir a alguien a quien le dirigiste un pedido hace
  -- menos de una hora. Sin esto sería un canal abierto para escribirle a
  -- cualquier ficha.
  if not exists (
    select 1 from pedidos
     where usuario_id = v_uid
       and dirigido_a = p_prestador_id
       and creado     > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin pedido dirigido reciente');
  end if;

  select pf.id into v_destino
    from perfiles pf
   where pf.prestador_id = p_prestador_id
   limit 1;

  if v_destino is null then
    return jsonb_build_object('ok', false, 'error', 'la ficha no tiene cuenta asociada');
  end if;

  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  values (v_destino, v_uid, coalesce(p_tipo, 'general'),
          left(p_titulo, 120), left(p_cuerpo, 300), p_url);

  -- `usuario_id` es lo único nuevo: con esto el cliente puede pedirle el
  -- push a la Edge Function usando un destino que ya soporta.
  return jsonb_build_object('ok', true, 'enviadas', 1, 'usuario_id', v_destino);
end;
$function$;

notify pgrst, 'reload schema';

select 'ok' as estado;
