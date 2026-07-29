-- RPC: iniciar_consulta_prestador
-- Crea (o devuelve existente) un chat de consulta entre prestador y vecino.
-- SECURITY DEFINER bypasa RLS en el INSERT — el prestador no puede modificar
-- vecino_id ni pedido_id porque la función los resuelve desde la DB.
CREATE OR REPLACE FUNCTION iniciar_consulta_prestador(p_pedido_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid         UUID;
  v_prestador_id UUID;
  v_vecino_id   UUID;
  v_chat_id     UUID;
  v_estado      TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Sin sesión');
  END IF;

  -- Obtener prestador_id del perfil del usuario logueado
  SELECT prestador_id INTO v_prestador_id
  FROM perfiles WHERE id = v_uid;

  IF v_prestador_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Solo prestadores pueden consultar');
  END IF;

  -- Devolver chat existente si ya hay uno para este pedido + prestador
  SELECT id, estado INTO v_chat_id, v_estado
  FROM chats_trabajo
  WHERE pedido_id = p_pedido_id AND prestador_id = v_prestador_id
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'chat_id', v_chat_id, 'estado', v_estado);
  END IF;

  -- Obtener vecino dueño del pedido
  SELECT usuario_id INTO v_vecino_id FROM pedidos WHERE id = p_pedido_id;

  IF v_vecino_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Crear el chat de consulta
  INSERT INTO chats_trabajo (pedido_id, propuesta_id, vecino_id, prestador_id, estado, ultimo_evento_at)
  VALUES (p_pedido_id, NULL, v_vecino_id, v_prestador_id, 'consulta', NOW())
  RETURNING id INTO v_chat_id;

  RETURN json_build_object('ok', true, 'chat_id', v_chat_id, 'estado', 'consulta');
END;
$$;

GRANT EXECUTE ON FUNCTION iniciar_consulta_prestador(UUID) TO authenticated;
