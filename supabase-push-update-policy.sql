-- ═══ PRONET · policy de UPDATE para push_suscripciones (C26-08) ═══
--
-- El registro de push nativo fallaba con:
--   "new row violates row-level security policy (USING expression)"
-- guardarTokenFCM hace upsert({...}, { onConflict: 'fcm_token' }). El teléfono
-- devuelve SIEMPRE el mismo token FCM, así que a partir del 2do intento el
-- upsert entra por ON CONFLICT DO UPDATE. La tabla tenía policies de INSERT,
-- SELECT y DELETE propias, pero NINGUNA de UPDATE, así que la rama de update
-- del upsert quedaba denegada por RLS.
--
-- Reproducido desde el cliente: 1er upsert (insert) OK, 2do upsert del mismo
-- token (update) -> el error de arriba.
--
-- Misma forma que las otras policies de la tabla: sólo el dueño, en las dos
-- direcciones (using para encontrar la fila, with check para el nuevo valor).
-- También cubre un bug latente de webpush: re-suscribir el mismo endpoint.
-- Idempotente.

drop policy if exists push_actualizar_propia on public.push_suscripciones;
create policy push_actualizar_propia on public.push_suscripciones
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
