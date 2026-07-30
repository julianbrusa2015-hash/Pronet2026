-- ════════════════════════════════════════════════════════════════════════════
-- Cierre S-5: analítica forjable en perfil_vistas y perfil_contactos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problema: INSERT con with_check(true) para anon+authenticated.
-- Cualquiera puede insertar cualquier prestador_id sin límite.
--
-- Fix: misma estrategia que notificaciones (Parte 4).
--   1. Índice único parcial → una fila por usuario por prestador por día.
--   2. Dos RPC SECURITY DEFINER que validan el prestador y bloquean vistas propias.
--   3. REVOKE INSERT directo; el cliente llama al RPC.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Índices únicos parciales (deduplicación por día) ──────────────────────
-- Solo para filas autenticadas (vecino_id IS NOT NULL).
-- Las anónimas siguen sin constraint: no hay forma de identificar al visitante.

CREATE UNIQUE INDEX IF NOT EXISTS perfil_vistas_dedup
  ON public.perfil_vistas (prestador_id, vecino_id, fecha)
  WHERE vecino_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS perfil_contactos_dedup
  ON public.perfil_contactos (prestador_id, vecino_id, fecha)
  WHERE vecino_id IS NOT NULL;

-- ── 2. RPC: registrar_vista_perfil ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_registrar_vista(
  p_prestador_id uuid,
  p_origen       text default 'busqueda'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- El prestador debe existir y no estar suspendido
  IF NOT EXISTS (
    SELECT 1 FROM prestadores
    WHERE id = p_prestador_id AND (suspendido IS NULL OR NOT suspendido)
  ) THEN RETURN; END IF;

  -- No contar vistas propias: el prestador que mira su propio perfil
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM perfiles WHERE id = v_uid AND prestador_id = p_prestador_id
  ) THEN RETURN; END IF;

  -- Insertar; ON CONFLICT ignora si el mismo usuario ya vio hoy este perfil
  INSERT INTO perfil_vistas (prestador_id, vecino_id, origen, fecha)
  VALUES (p_prestador_id, v_uid, p_origen, CURRENT_DATE)
  ON CONFLICT (prestador_id, vecino_id, fecha)
    WHERE vecino_id IS NOT NULL
  DO NOTHING;
END;
$$;

-- ── 3. RPC: registrar_contacto_perfil ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_registrar_contacto(
  p_prestador_id uuid,
  p_origen       text default 'busqueda',
  p_zona         text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- El prestador debe existir
  IF NOT EXISTS (
    SELECT 1 FROM prestadores
    WHERE id = p_prestador_id AND (suspendido IS NULL OR NOT suspendido)
  ) THEN RETURN; END IF;

  -- No contar contactos propios
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM perfiles WHERE id = v_uid AND prestador_id = p_prestador_id
  ) THEN RETURN; END IF;

  INSERT INTO perfil_contactos (prestador_id, vecino_id, origen, zona, fecha)
  VALUES (p_prestador_id, v_uid, p_origen, p_zona, CURRENT_DATE)
  ON CONFLICT (prestador_id, vecino_id, fecha)
    WHERE vecino_id IS NOT NULL
  DO NOTHING;
END;
$$;

-- ── 4. Permisos de ejecución ──────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.fn_registrar_vista(uuid, text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_contacto(uuid, text, text) TO anon, authenticated;

-- ── 5. Eliminar policies de INSERT directo ───────────────────────────────────

DROP POLICY IF EXISTS "vistas_sin_suplantacion"    ON public.perfil_vistas;
DROP POLICY IF EXISTS "contactos_sin_suplantacion" ON public.perfil_contactos;

-- ── 6. Revocar INSERT directo ─────────────────────────────────────────────────

REVOKE INSERT ON public.perfil_vistas    FROM anon, authenticated;
REVOKE INSERT ON public.perfil_contactos FROM anon, authenticated;

-- ── Verificación ──────────────────────────────────────────────────────────────
-- Después de correr este script:
--
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('perfil_vistas','perfil_contactos')
-- ORDER BY tablename, cmd;
--
-- Debe mostrar solo las policies de SELECT (prestador ve sus propios datos).
-- Las de INSERT deben haber desaparecido.
