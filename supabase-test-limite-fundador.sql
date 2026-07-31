CREATE OR REPLACE FUNCTION public.fn_test_limite_fundador(p_prestador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio     timestamptz;
  v_existentes int;
  v_pedidos    uuid[];
  v_faltante   int;
  v_bloqueada  boolean := false;
  v_nuevo_id   uuid;
  i            int;
BEGIN
  -- Limpiar residuos de runs anteriores (idempotente)
  DELETE FROM propuestas
   WHERE prestador_id = p_prestador_id AND mensaje LIKE 'TEST_GF_%';

  v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';

  SELECT count(*) INTO v_existentes FROM propuestas
   WHERE prestador_id = p_prestador_id AND creado >= v_inicio;

  -- Cuántas propuestas hacen falta para llegar a 10
  v_faltante := GREATEST(0, 10 - v_existentes);

  -- Necesitamos v_faltante + 1 pedidos libres (UNIQUE pedido_id, prestador_id)
  SELECT array_agg(id ORDER BY creado DESC) INTO v_pedidos
    FROM (
      SELECT id, creado FROM pedidos
       WHERE id NOT IN (
         SELECT pedido_id FROM propuestas WHERE prestador_id = p_prestador_id
       )
       LIMIT (v_faltante + 1)
    ) sub;

  IF (v_faltante + 1) > coalesce(array_length(v_pedidos, 1), 0) THEN
    RETURN jsonb_build_object(
      'skip', true,
      'reason', 'solo ' || coalesce(array_length(v_pedidos,1),0)
             || ' pedidos disponibles, se necesitan ' || (v_faltante + 1)
    );
  END IF;

  -- Insertar las propuestas que faltan para llegar a 10 (deben pasar)
  FOR i IN 1..v_faltante LOOP
    INSERT INTO propuestas (prestador_id, pedido_id, precio, plazo, mensaje, estado)
    VALUES (p_prestador_id, v_pedidos[i], 1, '1 dia', 'TEST_GF_' || i, 'pendiente');
  END LOOP;

  -- La propuesta siguiente (la 11) DEBE ser bloqueada
  BEGIN
    INSERT INTO propuestas (prestador_id, pedido_id, precio, plazo, mensaje, estado)
    VALUES (p_prestador_id, v_pedidos[v_faltante + 1], 1, '1 dia', 'TEST_GF_BLOCK', 'pendiente');
  EXCEPTION WHEN check_violation THEN
    v_bloqueada := true;
  END;

  -- Limpiar siempre, pase lo que pase
  DELETE FROM propuestas
   WHERE prestador_id = p_prestador_id AND mensaje LIKE 'TEST_GF_%';

  RETURN jsonb_build_object(
    'pass',            v_bloqueada,
    'existentes_prev', v_existentes,
    'insertadas_test', v_faltante,
    'error',           CASE WHEN v_bloqueada THEN NULL
                            ELSE 'trigger NO bloqueo la propuesta ' || (v_existentes + v_faltante + 1) END
  );
END;
$$;
