-- Agrega policy de UPDATE en chats_mercado para que cualquier participante
-- (autor o consultante) pueda actualizar ultimo_mensaje y hora_ultimo.
-- Sin esta policy, enviarMensajeMercado y enviarReservaMercado fallaban
-- silenciosamente al intentar actualizar el resumen del hilo.

drop policy if exists "chat_mercado_actualizar" on public.chats_mercado;
create policy "chat_mercado_actualizar"
  on public.chats_mercado for update
  to authenticated
  using  (autor_id = auth.uid() or consultante_id = auth.uid())
  with check (autor_id = auth.uid() or consultante_id = auth.uid());
