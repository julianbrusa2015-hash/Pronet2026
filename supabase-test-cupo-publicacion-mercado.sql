-- ═══ PRONET · Verificación real del cupo de publicaciones de ProMarket ═══
-- Mismo patrón que fn_test_limite_propuestas (supabase-test-limite-propuestas.sql):
-- llena el cupo real del plan vigente con filas de prueba, intenta pasarse por
-- una, y confirma que trg_cupo_publicacion_mercado la bloquea con el motivo
-- esperado. Cubre los tres caminos del trigger:
--   - Pro: ilimitado, nada que bloquear (skip)
--   - Plus: bloquea al pasar las 10/mes (limite_publicaciones_mes)
--   - Base/vecino: bloquea al pasar las 3/año sin créditos (sin_creditos_publicacion),
--     y confirma que 1 crédito comprado habilita exactamente 1 publicación más
--     y se descuenta solo.
--
-- Idempotente: limpia sus propios residuos (título 'TEST_CUPO_%') al empezar
-- y al terminar, y restaura promarket_creditos al valor que tenía antes.
CREATE OR REPLACE FUNCTION public.fn_test_cupo_publicacion_mercado(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan            text;
  v_legacy_activo   boolean;
  v_legacy_hasta    timestamptz;
  v_inicio          timestamptz;
  v_existentes      int;
  v_faltante        int;
  v_creditos_orig   int;
  v_bloqueada       boolean := false;
  v_motivo          text;
  v_con_credito_ok  boolean := false;
  v_creditos_post   int;
  i                 int;
BEGIN
  DELETE FROM publicaciones WHERE autor_id = p_usuario_id AND titulo LIKE 'TEST_CUPO_%';

  SELECT es_pro_marketplace, pro_marketplace_hasta
    INTO v_legacy_activo, v_legacy_hasta
    FROM perfiles WHERE id = p_usuario_id;
  IF v_legacy_activo AND (v_legacy_hasta IS NULL OR v_legacy_hasta > now()) THEN
    RETURN jsonb_build_object('skip', true, 'reason', 'suscriptor legacy de ProMarket — ilimitado por grandfathering');
  END IF;

  v_plan := plan_de_usuario(p_usuario_id);

  -- ── Plan Pro: ilimitado, nada que bloquear ──
  IF v_plan = 'pro' THEN
    RETURN jsonb_build_object('skip', true, 'reason', 'plan pro es ilimitado — nada que bloquear');
  END IF;

  -- ── Plan Plus: 10 por mes ──
  IF v_plan = 'plus' THEN
    v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
                at time zone 'America/Argentina/Buenos_Aires';
    SELECT count(*) INTO v_existentes FROM publicaciones
     WHERE autor_id = p_usuario_id AND creado >= v_inicio;
    v_faltante := GREATEST(0, 10 - v_existentes);

    FOR i IN 1..v_faltante LOOP
      INSERT INTO publicaciones (autor_id, categoria, titulo, zona, creado)
      VALUES (p_usuario_id, 'productos', 'TEST_CUPO_' || i, 'Escobar Centro',
              v_inicio + (i * interval '1 hour'));
    END LOOP;

    BEGIN
      INSERT INTO publicaciones (autor_id, categoria, titulo, zona)
      VALUES (p_usuario_id, 'productos', 'TEST_CUPO_BLOCK', 'Escobar Centro');
    EXCEPTION WHEN check_violation THEN
      v_bloqueada := true;
      GET STACKED DIAGNOSTICS v_motivo = MESSAGE_TEXT;
    END;

    DELETE FROM publicaciones WHERE autor_id = p_usuario_id AND titulo LIKE 'TEST_CUPO_%';

    RETURN jsonb_build_object(
      'pass',            v_bloqueada AND v_motivo LIKE 'limite_publicaciones_mes%',
      'plan',            v_plan,
      'limite',          10,
      'existentes_prev', v_existentes,
      'insertadas_test', v_faltante,
      'motivo',          v_motivo,
      'error',           CASE WHEN v_bloqueada AND v_motivo LIKE 'limite_publicaciones_mes%' THEN NULL
                              ELSE 'el trigger no bloqueó con limite_publicaciones_mes (motivo real: '
                                   || coalesce(v_motivo, 'ninguno, la publicación 11 se insertó') || ')' END
    );
  END IF;

  -- ── Base / vecino ocasional: 3 gratis por año, después créditos ──
  v_inicio := date_trunc('year', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';
  SELECT count(*) INTO v_existentes FROM publicaciones
   WHERE autor_id = p_usuario_id AND creado >= v_inicio;
  v_faltante := GREATEST(0, 3 - v_existentes);

  SELECT promarket_creditos INTO v_creditos_orig FROM perfiles WHERE id = p_usuario_id;

  FOR i IN 1..v_faltante LOOP
    INSERT INTO publicaciones (autor_id, categoria, titulo, zona, creado)
    VALUES (p_usuario_id, 'productos', 'TEST_CUPO_' || i, 'Escobar Centro',
            v_inicio + (i * interval '1 day'));
  END LOOP;

  -- Paso 1: sin créditos, la publicación que excede las 3 gratis debe bloquearse.
  UPDATE perfiles SET promarket_creditos = 0 WHERE id = p_usuario_id;
  BEGIN
    INSERT INTO publicaciones (autor_id, categoria, titulo, zona)
    VALUES (p_usuario_id, 'productos', 'TEST_CUPO_BLOCK', 'Escobar Centro');
  EXCEPTION WHEN check_violation THEN
    v_bloqueada := true;
    GET STACKED DIAGNOSTICS v_motivo = MESSAGE_TEXT;
  END;

  -- Paso 2: con 1 crédito, la misma publicación debe entrar y consumir ese crédito.
  UPDATE perfiles SET promarket_creditos = 1 WHERE id = p_usuario_id;
  BEGIN
    INSERT INTO publicaciones (autor_id, categoria, titulo, zona)
    VALUES (p_usuario_id, 'productos', 'TEST_CUPO_CREDITO', 'Escobar Centro');
    v_con_credito_ok := true;
  EXCEPTION WHEN check_violation THEN
    v_con_credito_ok := false;
  END;
  SELECT promarket_creditos INTO v_creditos_post FROM perfiles WHERE id = p_usuario_id;

  -- Limpieza: borrar filas de test y restaurar el saldo de créditos original.
  DELETE FROM publicaciones WHERE autor_id = p_usuario_id AND titulo LIKE 'TEST_CUPO_%';
  UPDATE perfiles SET promarket_creditos = v_creditos_orig WHERE id = p_usuario_id;

  RETURN jsonb_build_object(
    'pass', v_bloqueada AND v_motivo LIKE 'sin_creditos_publicacion%'
            AND v_con_credito_ok AND v_creditos_post = 0,
    'plan', v_plan,
    'limite', 3,
    'existentes_prev', v_existentes,
    'insertadas_test', v_faltante,
    'motivo_bloqueo', v_motivo,
    'publico_con_credito', v_con_credito_ok,
    'creditos_post_consumo', v_creditos_post,
    'error', CASE
      WHEN NOT v_bloqueada OR v_motivo NOT LIKE 'sin_creditos_publicacion%'
        THEN 'sin créditos: el trigger no bloqueó con sin_creditos_publicacion (motivo real: ' || coalesce(v_motivo, 'ninguno') || ')'
      WHEN NOT v_con_credito_ok
        THEN 'con 1 crédito: el trigger igual bloqueó la publicación'
      WHEN v_creditos_post <> 0
        THEN 'el crédito no se descontó (quedó en ' || v_creditos_post || ', esperado 0)'
      ELSE NULL
    END
  );
END;
$$;
