-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Al prestador no le llegaba el aviso de su reseña
--
-- SÍNTOMA: el vecino califica y el prestador no se entera. Ni campanita ni
-- push. Se entera si entra a "Mis reseñas" por su cuenta.
--
-- En los datos: 7 reseñas, 1 sola notificación de tipo 'resena'. La última
-- reseña es de hoy; el último aviso, del 29 de julio.
--
-- CAUSA: la reseña se guarda con este RPC, pero la notificación era un paso
-- APARTE del cliente, después de la llamada y condicionado a
-- `if (prestadorActual)`. Si esa variable no está —se llega a calificar
-- después de recargar, se navega distinto— la reseña se guarda igual y el
-- aviso se pierde sin dejar rastro. Nada falla, nadie se entera.
--
-- Se mueve adentro del RPC: mismo criterio que con `elegir_propuesta`. Lo
-- que tiene que pasar sí o sí va donde pasa el hecho, no en una llamada
-- suelta del cliente que puede no ejecutarse.
--
-- El insert va directo y no por `notificar_usuario()`: esta función ya es
-- SECURITY DEFINER y la relación está garantizada — el que califica y el
-- calificado comparten el chat de ese trabajo. Igual se guarda `emisor_id`,
-- que es lo que hace detectable una notificación falsa.
--
-- ── Las dos versiones ──────────────────────────────────────────────────
-- Conviven dos `dejar_resena`: una de 3 parámetros y otra de 4 (con
-- `p_recomendar`). El cliente llama a la de 4. La de 3 queda pero pasa a
-- DELEGAR en la de 4, en vez de tener su propia copia de la lógica: así no
-- pueden volver a divergir. No se borra porque una app instalada con una
-- versión vieja del Service Worker podría seguir llamándola.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.dejar_resena(
  p_chat_id    uuid,
  p_puntos     integer,
  p_comentario text default null,
  p_recomendar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_chat        record;
  v_rating      numeric;
  v_resenas     int;
  v_destino     uuid;
  v_nombre      text;
begin
  select * into v_chat from public.chats_trabajo where id = p_chat_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Chat no encontrado');
  end if;

  if v_chat.vecino_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Solo el vecino puede dejar una reseña');
  end if;

  insert into public.resenas (chat_id, vecino_id, prestador_id, puntos, comentario, recomendar)
  values (p_chat_id, auth.uid(), v_chat.prestador_id, p_puntos, p_comentario, p_recomendar)
  on conflict (chat_id) do update
    set puntos     = excluded.puntos,
        comentario = excluded.comentario,
        recomendar = excluded.recomendar;

  select avg(puntos), count(*) into v_rating, v_resenas
    from public.resenas where prestador_id = v_chat.prestador_id;

  update public.prestadores
     set rating = round(v_rating, 1), resenas = v_resenas
   where id = v_chat.prestador_id;

  update public.chats_trabajo
     set estado = 'calificado', ultimo_evento_at = now()
   where id = p_chat_id and estado <> 'calificado';

  -- ── El aviso, que es lo que faltaba ─────────────────────────────────
  -- El destinatario sale de `perfiles`: `prestadores` no tiene columna de
  -- usuario, el vínculo va al revés por perfiles.prestador_id.
  select pf.id into v_destino
    from public.perfiles pf
   where pf.prestador_id = v_chat.prestador_id
   limit 1;

  select coalesce(nombre, 'Un vecino') into v_nombre
    from public.perfiles where id = auth.uid();

  -- Sin cuenta asociada no hay a quién avisarle, pero la reseña ya quedó:
  -- no tiene sentido hacer fallar todo por el aviso.
  if v_destino is not null then
    insert into public.notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
    values (
      v_destino, auth.uid(), 'resena',
      '⭐ ' || v_nombre || ' te dejó una reseña de ' || p_puntos ||
        ' estrella' || case when p_puntos > 1 then 's' else '' end,
      coalesce(nullif(left(p_comentario, 200), ''), 'Calificó tu trabajo'),
      '#s-miperfil'
    );
  end if;

  return jsonb_build_object('ok', true, 'rating_nuevo', v_rating,
                            'resenas', v_resenas, 'avisado', v_destino is not null);
end;
$function$;

-- La versión vieja de 3 parámetros delega, para que no vuelvan a divergir.
create or replace function public.dejar_resena(
  p_chat_id    uuid,
  p_puntos     integer,
  p_comentario text default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.dejar_resena(p_chat_id, p_puntos, p_comentario, false);
$$;

notify pgrst, 'reload schema';

select (select count(*) from public.resenas)                              as resenas,
       (select count(*) from public.notificaciones where tipo = 'resena') as avisos;
