-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · WhatsApp también en el chat de pedidos (chats_trabajo)
--
-- obtener_telefono_contacto() sólo validaba comprador y vendedor
-- compartiendo un chats_mercado (Entre Vecinos). El chat de pedidos
-- (vecino ↔ prestador, chats_trabajo) no habilitaba nunca el botón de
-- WhatsApp/llamar, aunque las dos partes ya se estaban hablando ahí.
--
-- Se agrega la misma prueba de "ya comparten conversación" para
-- chats_trabajo. `chats_trabajo.prestador_id` no es un id de usuario —
-- apunta a prestadores.id — así que el vínculo pasa por
-- perfiles.prestador_id (ver mi_prestador_id() en
-- supabase-visibilidad-pedidos-fix.sql, mismo patrón).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.obtener_telefono_contacto(p_usuario_id uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select p.telefono from public.perfiles p
  where p.id = p_usuario_id
    and (
      exists (
        select 1 from public.chats_mercado c
        where (c.autor_id = auth.uid() and c.consultante_id = p_usuario_id)
           or (c.consultante_id = auth.uid() and c.autor_id = p_usuario_id)
      )
      or exists (
        select 1 from public.chats_trabajo ct
        where (
          -- Soy el vecino del chat, pido el teléfono del prestador
          ct.vecino_id = auth.uid()
          and exists (
            select 1 from public.perfiles pf
            where pf.id = p_usuario_id and pf.prestador_id = ct.prestador_id
          )
        ) or (
          -- Soy el prestador del chat, pido el teléfono del vecino
          ct.vecino_id = p_usuario_id
          and ct.prestador_id = public.mi_prestador_id()
        )
      )
    );
$$;

grant execute on function public.obtener_telefono_contacto(uuid) to authenticated;

notify pgrst, 'reload schema';
