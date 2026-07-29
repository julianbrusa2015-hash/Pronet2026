-- RPC: contar_propuestas_pedido
-- Devuelve el número de propuestas activas para un pedido dado.
-- SECURITY DEFINER permite que cualquier prestador logueado vea el COUNT real
-- sin que RLS filtre por propietario, y sin exponer precios ni identidades.
CREATE OR REPLACE FUNCTION contar_propuestas_pedido(p_pedido_id UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM propuestas
  WHERE pedido_id = p_pedido_id
    AND estado != 'retirada';
$$;

-- Dar permiso de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION contar_propuestas_pedido(UUID) TO authenticated;
