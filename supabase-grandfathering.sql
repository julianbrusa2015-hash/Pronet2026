-- ════════════════════════════════════════════════════════════════════════════
-- GF-1: Grandfathering de prestadores fundadores
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problema: al activar los pagos, todos los prestadores Base pasan de 10
-- propuestas/mes (límite de Plus en etapa fundadora) a 3 (límite Base real).
--
-- Solución: marcar a los prestadores que ya estaban antes de activar pagos
-- con `es_fundador = true`. Mientras sea fundador activo, el trigger les
-- aplica los límites de Plus aunque su plan sea Base.
--
-- `limites_fundador_hasta = NULL` → beneficio permanente
-- `limites_fundador_hasta = <fecha>` → beneficio hasta esa fecha
-- `es_fundador = false` → sin beneficio (prestadores que entran después)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Columnas en prestadores ───────────────────────────────────────────────

ALTER TABLE public.prestadores
  ADD COLUMN IF NOT EXISTS es_fundador          boolean    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limites_fundador_hasta timestamptz         DEFAULT NULL;

-- ── 2. Modificar plan_de_prestador() para respetar grandfathering ────────────
--
-- Cuando el plan resulta 'base', chequeamos si hay beneficio fundador activo.
-- Si sí, devolvemos 'plus' para que los triggers usen esos límites.

CREATE OR REPLACE FUNCTION public.plan_de_prestador(p_prestador_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id        uuid;
  v_plan              text;
  v_es_fundador       boolean;
  v_fundador_hasta    timestamptz;
BEGIN
  SELECT id INTO v_usuario_id
    FROM perfiles WHERE prestador_id = p_prestador_id LIMIT 1;
  IF v_usuario_id IS NULL THEN RETURN NULL; END IF;

  SELECT plan INTO v_plan
    FROM suscripciones
   WHERE usuario_id = v_usuario_id
     AND estado = 'activo'
     AND (vence_en IS NULL OR vence_en > now());

  v_plan := COALESCE(v_plan, 'base');

  -- Si el plan ya es pago, no hay nada que agregar
  IF v_plan <> 'base' THEN RETURN v_plan; END IF;

  -- Plan Base: verificar si hay grandfathering activo
  SELECT es_fundador, limites_fundador_hasta
    INTO v_es_fundador, v_fundador_hasta
    FROM prestadores WHERE id = p_prestador_id;

  IF v_es_fundador AND (v_fundador_hasta IS NULL OR v_fundador_hasta > now()) THEN
    RETURN 'plus';  -- límites de Plus para el fundador
  END IF;

  RETURN 'base';
END;
$$;

-- ── 3. Marcar todos los prestadores activos actuales como fundadores ──────────
--
-- Se corre UNA SOLA VEZ antes de activar pagos. Los prestadores que se
-- registren después de este punto entran con es_fundador = false (el default).

UPDATE public.prestadores
   SET es_fundador = true,
       limites_fundador_hasta = NULL   -- NULL = beneficio permanente
 WHERE activo = true
   AND es_fundador = false;

-- ── Verificación ──────────────────────────────────────────────────────────────
-- SELECT id, nombre, es_fundador, limites_fundador_hasta
-- FROM public.prestadores
-- WHERE activo = true
-- ORDER BY nombre;
--
-- Todos los activos deben mostrar es_fundador = true.
-- plan_de_prestador(<id>) debe devolver 'plus' para prestadores Base fundadores.
