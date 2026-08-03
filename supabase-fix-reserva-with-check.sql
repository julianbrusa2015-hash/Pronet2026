-- CRÍTICO: la policy de UPDATE para reservas en mensajes_mercado tenía
-- with_check = true (sin restricción). USING sí valida que la fila de
-- ORIGEN sea una reserva en un chat del que el usuario participa, pero
-- WITH CHECK sin restricción permite reescribir la fila resultante a
-- CUALQUIER valor — incluido chat_id, autor_id, tipo y texto. Un usuario
-- que alguna vez participó de UNA reserva podía usar esa fila como punto
-- de entrada para inyectar contenido falso en CUALQUIER OTRO chat de la
-- app (moviendo chat_id a uno ajeno), o transformarla en un mensaje común
-- suplantando autoría.
--
-- Fix: WITH CHECK exige que la fila resultante siga siendo tipo='reserva'
-- Y que el chat_id resultante siga perteneciendo a un chat del que el
-- usuario participa — así la fila no puede "viajar" a un chat ajeno.
drop policy if exists "mensajes_mercado_update_reserva" on public.mensajes_mercado;
create policy "mensajes_mercado_update_reserva"
  on public.mensajes_mercado for update
  to authenticated
  using (
    tipo = 'reserva'
    and auth.uid() in (
      select consultante_id from public.chats_mercado where id = chat_id
      union
      select autor_id       from public.chats_mercado where id = chat_id
    )
  )
  with check (
    tipo = 'reserva'
    and auth.uid() in (
      select consultante_id from public.chats_mercado where id = chat_id
      union
      select autor_id       from public.chats_mercado where id = chat_id
    )
  );
