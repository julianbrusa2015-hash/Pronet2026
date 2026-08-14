-- Cerrar la autoacreditación de puntos.
-- APLICADO EN PRODUCCIÓN EL 2026-08-14.
--
-- El problema: acreditar_puntos() es SECURITY DEFINER, estaba otorgada a
-- anon/authenticated/PUBLIC, y NO verifica quién la llama — recibe a quién
-- acreditar y cuántos puntos, y los inserta. Verificado desde el cliente real
-- con una cuenta común: devolvía 200 y el saldo pasaba de 1100 a 1101.
-- Como los puntos se canjean por premios reales (canjear_puntos), es un
-- agujero económico, no cosmético.
--
-- Por qué revocar y no agregarle un chequeo adentro: la función es una
-- primitiva interna, no una acción de usuario. El cliente NUNCA la llama
-- (verificado en datos.js y app.js: no hay una sola rpc('acreditar_puntos'),
-- sólo comentarios que aclaran que los puntos los da el servidor).
--
-- Los tres que sí la usan son SECURITY DEFINER de postgres, así que la
-- ejecutan con los permisos del dueño y no se ven afectados:
--   · acreditar_por_resena  (trigger)
--   · canjear_puntos
--   · resolver_canje

revoke execute on function public.acreditar_puntos(uuid, uuid, integer, text, text)
  from public, anon, authenticated;

-- Verificación esperada después de aplicar:
--   Llamada directa desde el cliente  -> 403 permission denied for function
--   canjear_puntos desde el cliente   -> sigue funcionando
