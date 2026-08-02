-- Agrega tipo y metadata a mensajes_mercado para soportar tarjetas de reserva.
-- tipo: 'texto' (default) | 'reserva'
-- metadata: { fecha, hora, estado } donde estado = 'pendiente' | 'confirmada' | 'cancelada'

ALTER TABLE public.mensajes_mercado
  ADD COLUMN IF NOT EXISTS tipo     text  NOT NULL DEFAULT 'texto',
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Policy de UPDATE para que cualquier participante pueda cambiar el estado de una reserva
drop policy if exists "mensajes_mercado_update_reserva" on public.mensajes_mercado;
create policy "mensajes_mercado_update_reserva"
  on public.mensajes_mercado for update to authenticated
  using (
    tipo = 'reserva'
    and auth.uid() in (
      select consultante_id from public.chats_mercado where id = chat_id
      union
      select autor_id       from public.chats_mercado where id = chat_id
    )
  )
  with check (true);
