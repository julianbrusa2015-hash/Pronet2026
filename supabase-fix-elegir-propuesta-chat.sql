-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Elegir una propuesta no actualizaba el chat
--
-- SÍNTOMA: el vecino acepta una propuesta, la pantalla dice que salió bien,
-- pero el chat sigue mostrando lo de antes. Ni "Trabajo en curso" para el
-- vecino, ni "¡Te eligieron!" para el prestador, ni el botón de marcar
-- terminado. El trabajo queda colgado sin forma de avanzar.
--
-- CAUSA: `elegir_propuesta` actualizaba la propuesta ('elegida'), las demás
-- ('rechazada'), el pedido ('Cerrado') y el servicio fijo si era recurrente
-- — pero NO tocaba `chats_trabajo`. El chat se quedaba en
-- 'propuesta_enviada'.
--
-- Y el estado del chat es lo que manejan TODOS los carteles de la pantalla
-- (`actualizarBannersChat` en app.js hace un switch sobre él). Por eso el
-- resto de la base quedaba coherente y la única pantalla que importa no.
--
-- Verificado en el caso real: pedido "Destapacion de Cañeria Cocina" con
-- pedido=Cerrado, propuesta=elegida y chat=propuesta_enviada.
--
-- Se corrige donde estaba mal: la misma función que cierra el pedido pone
-- el chat en 'activo'. Va en la misma transacción, así que o cambia todo o
-- no cambia nada — que es la razón por la que esto vive en un RPC y no en
-- tres llamadas del cliente.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.elegir_propuesta(p_propuesta_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido_id     uuid;
  v_prestador_id  uuid;
  v_pedido        record;
  v_precio        integer;
  v_servicio_id   uuid;
  v_chats_activos int;
begin
  select pr.pedido_id, pr.prestador_id, pr.precio
    into v_pedido_id, v_prestador_id, v_precio
  from public.propuestas pr
  join public.pedidos pe on pe.id = pr.pedido_id
  where pr.id = p_propuesta_id
    and pr.estado = 'pendiente'
    and pe.usuario_id = auth.uid()
    and pe.estado = 'Publicado'
  for update of pr, pe;

  if not found then
    raise exception 'PROPUESTA_NO_ELEGIBLE'
      using hint = 'No existe, no está pendiente, el pedido no es tuyo o ya está cerrado.';
  end if;

  update public.propuestas set estado = 'elegida'   where id = p_propuesta_id;
  update public.propuestas set estado = 'rechazada'
   where pedido_id = v_pedido_id and id <> p_propuesta_id and estado = 'pendiente';
  update public.pedidos    set estado = 'Cerrado'   where id = v_pedido_id;

  -- LO QUE FALTABA. El chat del elegido pasa a 'activo': es el estado que
  -- destraba los carteles de "Trabajo en curso" y "Marcar como terminado".
  update public.chats_trabajo
     set estado = 'activo', ultimo_evento_at = now()
   where propuesta_id = p_propuesta_id
     and estado not in ('activo', 'terminado_prestador', 'terminado_por_vecino', 'calificado');

  get diagnostics v_chats_activos = row_count;

  -- Los chats de las propuestas descartadas dejan de estar en juego. Se
  -- marcan para que el prestador vea por qué no avanza, en vez de quedarse
  -- esperando una respuesta que no va a llegar.
  update public.chats_trabajo c
     set estado = 'rechazada', ultimo_evento_at = now()
    from public.propuestas pr
   where pr.id = c.propuesta_id
     and pr.pedido_id = v_pedido_id
     and pr.id <> p_propuesta_id
     and pr.estado = 'rechazada'
     and c.estado in ('consulta', 'propuesta_enviada');

  -- Si el pedido era recurrente, queda el acuerdo registrado.
  select modalidad, frecuencia_veces, frecuencia_periodo, rubro, usuario_id
    into v_pedido
    from public.pedidos where id = v_pedido_id;

  if v_pedido.modalidad = 'recurrente' then
    insert into public.servicios_fijos (
      pedido_id, propuesta_id, vecino_id, prestador_id, rubro,
      frecuencia_veces, frecuencia_periodo, precio, precio_unidad
    ) values (
      v_pedido_id, p_propuesta_id, v_pedido.usuario_id, v_prestador_id, v_pedido.rubro,
      coalesce(v_pedido.frecuencia_veces, 1),
      coalesce(v_pedido.frecuencia_periodo, 'semana'),
      v_precio, 'visita'
    )
    returning id into v_servicio_id;
  end if;

  return json_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'prestador_id', v_prestador_id,
    'chats_activados', v_chats_activos,
    'servicio_fijo_id', v_servicio_id
  );
end;
$function$;

notify pgrst, 'reload schema';

-- ── Reparación de lo que quedó colgado ─────────────────────────────────
-- Los chats de propuestas ya elegidas que se quedaron en el estado viejo.
update public.chats_trabajo c
   set estado = 'activo', ultimo_evento_at = now()
  from public.propuestas pr
 where pr.id = c.propuesta_id
   and pr.estado = 'elegida'
   and c.estado in ('consulta', 'propuesta_enviada');

select c.id, c.estado as chat, pr.estado as propuesta, pe.estado as pedido, pe.titulo
  from public.chats_trabajo c
  join public.propuestas pr on pr.id = c.propuesta_id
  join public.pedidos pe on pe.id = c.pedido_id
 where pr.estado = 'elegida'
 order by c.creado desc
 limit 5;
