-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Borra TODO lo que creó supabase-demo-tablero.sql
--
-- No toca ningún dato real: se apoya sólo en las etiquetas '[DEMO]'.
-- Los mensajes van primero por la FK contra chats_trabajo.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- La tabla es mensajes_chat (mensajes_mercado es la del marketplace).
delete from public.mensajes_chat
 where chat_id in (select id from public.chats_trabajo where ultimo_mensaje like '[DEMO]%')
    or texto like '[DEMO]%';

delete from public.chats_trabajo where ultimo_mensaje like '[DEMO]%';

delete from public.propuestas
 where pedido_id in (select id from public.pedidos where titulo like '[DEMO]%');

delete from public.pedidos where titulo like '[DEMO]%';

commit;

select (select count(*) from public.pedidos        where titulo         like '[DEMO]%') as pedidos_demo,
       (select count(*) from public.chats_trabajo  where ultimo_mensaje like '[DEMO]%') as chats_demo;
