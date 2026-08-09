-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · notificar_usuario no conocía los chats de mercado
--
-- SÍNTOMA: le mandás un pedido o una consulta a un vecino por Entre Vecinos
-- y no le llega nada. Ni campanita ni push. El mensaje sí queda en el chat,
-- pero el vendedor no se entera hasta que entra a mirar.
--
-- CAUSA: `notificar_usuario` exige una relación previa entre las dos
-- personas —para que nadie pueda escribirle al buzón de cualquiera— y las
-- relaciones que conocía eran sólo tres: admin, `comparte_chat_con` (que
-- mira `chats_trabajo`) y `oferto_en_pedido_de`. Ninguna cubre "abrimos un
-- chat de mercado".
--
-- El resultado es engañoso: la notificación llega sólo si las dos personas
-- YA tenían relación por otro lado. Verificado en los datos — todas las
-- notificaciones de mercado que existen tienen como destinatario a la única
-- cuenta que comparte chats de trabajo con el resto. Para dos vecinos que
-- nunca trataron, que es el caso normal de un marketplace, no llega nunca.
--
-- Se agrega la relación que faltaba. NO se afloja el guard: sigue haciendo
-- falta una relación real, sólo que ahora "compartimos un chat de mercado"
-- cuenta como tal — que es exactamente lo que es.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.comparte_chat_mercado_con(p_otro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chats_mercado c
     where (c.consultante_id = auth.uid() and c.autor_id = p_otro)
        or (c.autor_id       = auth.uid() and c.consultante_id = p_otro)
  );
$$;

comment on function public.comparte_chat_mercado_con(uuid) is
  'Si el usuario actual y el otro comparten un chat de Entre Vecinos. Relación válida para notificar.';

revoke all on function public.comparte_chat_mercado_con(uuid) from public;
grant execute on function public.comparte_chat_mercado_con(uuid) to authenticated;

create or replace function public.notificar_usuario(
  p_usuario_id uuid,
  p_tipo       text,
  p_titulo     text,
  p_cuerpo     text default null,
  p_url        text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'falta título');
  end if;

  -- Relación legítima: admin, chat de trabajo, chat de mercado, oferta en su
  -- pedido, o uno mismo. `comparte_chat_mercado_con` es la que faltaba.
  if not (
       es_admin()
    or p_usuario_id = v_uid
    or comparte_chat_con(p_usuario_id)
    or comparte_chat_mercado_con(p_usuario_id)
    or oferto_en_pedido_de(p_usuario_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin relación con el destinatario');
  end if;

  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  values (p_usuario_id, v_uid, coalesce(p_tipo, 'general'),
          left(p_titulo, 120), left(p_cuerpo, 300), p_url);

  return jsonb_build_object('ok', true, 'enviadas', 1);
end;
$function$;

notify pgrst, 'reload schema';

select 'ok' as estado;
