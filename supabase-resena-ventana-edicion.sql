-- ═══ PRONET · reseña: ventana de edición de 48hs (C11-05) ═══
--
-- Antes: dejar_resena hacía `on conflict (chat_id) do update`, así que el
-- vecino podía re-calificar el MISMO trabajo cuantas veces quisiera y cada
-- cambio pisaba el rating del prestador (probado: 4.5 → 2.5 con un 1★ dejado
-- después). Eso contradecía la promesa de que las reseñas no se editan y
-- abría un uso hostil: bajarle la nota a alguien semanas más tarde.
--
-- Ahora: se puede corregir sólo dentro de las 48hs de dejada (el "me
-- equivoqué de estrellas" honesto). Pasado ese plazo, queda fija. El corte va
-- en el servidor, medido contra resenas.creado, que no se toca en el update.
--
-- La firma se mantiene EXACTA (p_chat_id, p_puntos, p_comentario, p_recomendar)
-- para no crear un overload: dos firmas de dejar_resena y PostgREST deja de
-- poder elegir (PGRST203). El resto del cuerpo es idéntico al desplegado.

create or replace function public.dejar_resena(
  p_chat_id uuid, p_puntos integer,
  p_comentario text default null, p_recomendar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_chat        record;
  v_rating      numeric;
  v_resenas     int;
  v_destino     uuid;
  v_nombre      text;
  v_creado      timestamptz;
begin
  select * into v_chat from public.chats_trabajo where id = p_chat_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Chat no encontrado');
  end if;

  if v_chat.vecino_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Solo el vecino puede dejar una reseña');
  end if;

  -- ── Ventana de edición de 48hs ──────────────────────────────────────
  -- Si ya hay reseña y pasaron más de 48hs desde que se dejó, queda fija.
  select creado into v_creado from public.resenas where chat_id = p_chat_id;
  if found and (now() - v_creado) > interval '48 hours' then
    return jsonb_build_object('ok', false,
      'error', 'La reseña ya no se puede editar: pasaron más de 48 horas desde que la dejaste.');
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

  -- ── El aviso al prestador ───────────────────────────────────────────
  select pf.id into v_destino
    from public.perfiles pf
   where pf.prestador_id = v_chat.prestador_id
   limit 1;

  select coalesce(nombre, 'Un vecino') into v_nombre
    from public.perfiles where id = auth.uid();

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
