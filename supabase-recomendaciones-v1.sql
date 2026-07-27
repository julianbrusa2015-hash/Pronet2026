-- ═══ PRONET · Recomendaciones — columna en resenas ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Agrega el campo `recomendar` a la tabla resenas y actualiza la función
-- dejar_resena para que lo guarde cuando el vecino tilda "Lo recomendaría".
-- Los analytics de prestador leen este campo para mostrar las recomendaciones reales.

-- ── 1. Columna recomendar ────────────────────────────────────────────────────
alter table public.resenas
  add column if not exists recomendar boolean not null default false;

-- ── 2. Actualizar la función dejar_resena para aceptar p_recomendar ──────────
create or replace function public.dejar_resena(
  p_chat_id     uuid,
  p_puntos      int,
  p_comentario  text default null,
  p_recomendar  boolean default false
)
returns jsonb language plpgsql security definer as $$
declare
  v_chat      record;
  v_rating    numeric;
  v_resenas   int;
begin
  -- Verificar que el chat existe y obtener los participantes
  select * into v_chat from public.chats_trabajo where id = p_chat_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Chat no encontrado');
  end if;

  -- Solo el vecino puede dejar reseña
  if v_chat.vecino_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Solo el vecino puede dejar una reseña');
  end if;

  -- Insertar (el unique(chat_id) previene duplicados)
  insert into public.resenas (chat_id, vecino_id, prestador_id, puntos, comentario, recomendar)
  values (p_chat_id, auth.uid(), v_chat.prestador_id, p_puntos, p_comentario, p_recomendar)
  on conflict (chat_id) do update
    set puntos     = excluded.puntos,
        comentario = excluded.comentario,
        recomendar = excluded.recomendar;

  -- Recalcular rating promedio
  select avg(puntos), count(*) into v_rating, v_resenas
  from public.resenas where prestador_id = v_chat.prestador_id;

  update public.prestadores
  set rating = round(v_rating, 1), resenas = v_resenas
  where id = v_chat.prestador_id;

  -- Cerrar el chat como calificado
  update public.chats_trabajo
  set estado = 'calificado'
  where id = p_chat_id and estado <> 'calificado';

  return jsonb_build_object('ok', true, 'rating_nuevo', v_rating, 'resenas', v_resenas);
end;
$$;

-- ── 3. Verificación ─────────────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'resenas' and column_name = 'recomendar';
