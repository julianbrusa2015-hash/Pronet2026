-- ═══ PRONET · Verificación genérica del límite de propuestas por plan ═══
-- Generaliza fn_test_limite_fundador (hardcodeada a 10) para usar el límite
-- REAL que resuelve plan_de_prestador() + planes_limites, sea cual sea el
-- plan del prestador. Sirve para D4: nunca se había verificado en producción
-- que el trigger bloquee la propuesta 4ª de un plan Base (límite 3).
--
-- Idempotente: limpia sus propios residuos al empezar y al terminar.
CREATE OR REPLACE FUNCTION public.fn_test_limite_propuestas(p_prestador_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_limite     int;
  v_inicio     timestamptz;
  v_existentes int;
  v_pedidos    uuid[];
  v_faltante   int;
  v_bloqueada  boolean := false;
  i            int;
BEGIN
  DELETE FROM propuestas
   WHERE prestador_id = p_prestador_id AND mensaje LIKE 'TEST_LIM_%';

  v_plan := plan_de_prestador(p_prestador_id);
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('skip', true, 'reason', 'prestador sin perfil asociado');
  END IF;

  SELECT propuestas_mes INTO v_limite FROM planes_limites WHERE plan = v_plan;
  IF v_limite IS NULL THEN
    RETURN jsonb_build_object('skip', true, 'reason', 'plan "' || v_plan || '" es ilimitado — nada que bloquear');
  END IF;

  v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';

  SELECT count(*) INTO v_existentes FROM propuestas
   WHERE prestador_id = p_prestador_id AND creado >= v_inicio;

  v_faltante := GREATEST(0, v_limite - v_existentes);

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

  -- Los timestamps se espacían 2 horas dentro del mes actual para que el
  -- trigger de rate-limit (ventana corta) no dispare durante el test.
  FOR i IN 1..v_faltante LOOP
    INSERT INTO propuestas (prestador_id, pedido_id, precio, plazo, mensaje, estado, creado)
    VALUES (p_prestador_id, v_pedidos[i], 1, '1 dia', 'TEST_LIM_' || i, 'pendiente',
            date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires'
              + (i * interval '2 hours'));
  END LOOP;

  -- La propuesta número (v_limite + 1) DEBE ser bloqueada por el trigger.
  BEGIN
    INSERT INTO propuestas (prestador_id, pedido_id, precio, plazo, mensaje, estado)
    VALUES (p_prestador_id, v_pedidos[v_faltante + 1], 1, '1 dia', 'TEST_LIM_BLOCK', 'pendiente');
  EXCEPTION WHEN check_violation THEN
    v_bloqueada := true;
  END;

  DELETE FROM propuestas
   WHERE prestador_id = p_prestador_id AND mensaje LIKE 'TEST_LIM_%';

  RETURN jsonb_build_object(
    'pass',            v_bloqueada,
    'plan',            v_plan,
    'limite',          v_limite,
    'existentes_prev', v_existentes,
    'insertadas_test', v_faltante,
    'error',           CASE WHEN v_bloqueada THEN NULL
                            ELSE 'trigger NO bloqueó la propuesta ' || (v_existentes + v_faltante + 1)
                                 || ' (plan ' || v_plan || ', límite ' || v_limite || ')' END
  );
END;
$$;
