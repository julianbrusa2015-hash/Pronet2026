-- Sistema de suspensiones de prestadores
-- Ejecutar en Supabase → SQL Editor

-- 1. Columnas en prestadores
ALTER TABLE prestadores ADD COLUMN IF NOT EXISTS suspendido boolean DEFAULT false;
ALTER TABLE prestadores ADD COLUMN IF NOT EXISTS denuncias_confirmadas integer DEFAULT 0;

-- 2. RPC para confirmar baja: incrementa contador y auto-suspende si llega a 3
CREATE OR REPLACE FUNCTION confirmar_baja_prestador(p_denuncia_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_denunciado_id UUID;
  v_prestador_id  UUID;
  v_count         INTEGER;
  v_suspendido    BOOLEAN := false;
BEGIN
  -- Marcar denuncia como resuelta
  UPDATE denuncias SET estado = 'resuelta' WHERE id = p_denuncia_id
  RETURNING denunciado_id INTO v_denunciado_id;

  IF v_denunciado_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Denuncia no encontrada');
  END IF;

  -- Obtener prestador_id del usuario denunciado
  SELECT prestador_id INTO v_prestador_id FROM perfiles WHERE id = v_denunciado_id;

  IF v_prestador_id IS NULL THEN
    RETURN json_build_object('ok', true, 'suspendido', false, 'denuncias', 0);
  END IF;

  -- Incrementar contador y auto-suspender si >= 3
  UPDATE prestadores
  SET denuncias_confirmadas = denuncias_confirmadas + 1,
      suspendido = CASE WHEN (denuncias_confirmadas + 1) >= 3 THEN true ELSE suspendido END
  WHERE id = v_prestador_id
  RETURNING denuncias_confirmadas, suspendido INTO v_count, v_suspendido;

  RETURN json_build_object('ok', true, 'suspendido', v_suspendido, 'denuncias', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION confirmar_baja_prestador(UUID) TO authenticated;

-- 3. RPC para override manual del admin (activar o suspender manualmente)
CREATE OR REPLACE FUNCTION admin_toggle_suspension(p_prestador_id UUID, p_suspendido BOOLEAN)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo admins pueden ejecutar esto (verificar por email o rol)
  IF NOT EXISTS (
    SELECT 1 FROM perfiles WHERE id = auth.uid() AND tipo = 'admin'
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'Solo admins');
  END IF;

  UPDATE prestadores SET suspendido = p_suspendido WHERE id = p_prestador_id;
  RETURN json_build_object('ok', true, 'suspendido', p_suspendido);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_toggle_suspension(UUID, BOOLEAN) TO authenticated;
