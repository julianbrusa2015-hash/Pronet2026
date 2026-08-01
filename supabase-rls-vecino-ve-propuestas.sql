-- Permite que el vecino (dueño del pedido) vea las propuestas recibidas.
-- Sin esta policy, PronetDB.listar('propuestas') devuelve vacío para el vecino:
-- la pantalla de detalle del pedido siempre mostraba "Todavía no recibiste propuestas"
-- aunque hubiera propuestas en la DB.
--
-- La policy existente solo daba SELECT al prestador (auth.uid() = prestador_id).
-- Esta policy complementa esa: el vecino puede ver propuestas de SUS pedidos.
CREATE POLICY "vecinos_ven_propuestas_de_sus_pedidos"
ON public.propuestas
FOR SELECT
TO authenticated
USING (
  pedido_id IN (
    SELECT id FROM public.pedidos WHERE usuario_id = auth.uid()
  )
);
