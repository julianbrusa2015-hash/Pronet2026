-- Auditoría de funciones SECURITY DEFINER (2026-08-03): dos funciones sin
-- chequeo de autorización interno, expuestas a anon/authenticated cuando no
-- debían estarlo.

-- ── 1. incrementar_creditos_promarket ───────────────────────────────────
-- CRÍTICO: no valida auth.uid() en absoluto, y estaba grantada a
-- anon/authenticated (el script original solo la otorgaba a service_role;
-- en algún momento quedó expuesta, probablemente por un GRANT amplio
-- posterior). Solo se llama desde las Edge Functions webhook-mp y
-- verificar-pago-mp con la service role key — nunca desde el cliente.
-- Cualquier usuario podía llamarla directo por RPC para darse créditos
-- infinitos o vaciarle los créditos a otro usuario.
revoke execute on function public.incrementar_creditos_promarket(uuid, integer) from public;
revoke execute on function public.incrementar_creditos_promarket(uuid, integer) from anon;
revoke execute on function public.incrementar_creditos_promarket(uuid, integer) from authenticated;
grant execute on function public.incrementar_creditos_promarket(uuid, integer) to service_role;

-- ── 2. obtener_analitica_prestador ──────────────────────────────────────
-- El cliente (datos.js: obtenerAnalitica()) solo la llama con el
-- prestador_id propio del usuario logueado, pero la función no lo exigía:
-- cualquier usuario autenticado podía pedir la analítica privada (vistas,
-- contactos, zonas) de CUALQUIER prestador pasando su id directo.
create or replace function public.obtener_analitica_prestador(p_prestador_id uuid, p_meses integer default 1)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  fecha_inicio date := date_trunc('month', CURRENT_DATE)::date;
  fecha_inicio_anterior date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  result json;
BEGIN
  -- EXISTS en vez de comparar contra un subselect escalar: sin sesión el
  -- subselect da NULL (no false), y "IF NOT (NULL)" en plpgsql no entra a
  -- la rama de error (se comporta como false) — el guard quedaba bypaseado.
  IF NOT (
    es_admin()
    OR EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND prestador_id = p_prestador_id
    )
  ) THEN
    RETURN json_build_object('error', 'sin permiso');
  END IF;

  SELECT json_build_object(
    'vistas_mes',     (SELECT COUNT(*) FROM perfil_vistas   WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio),
    'contactos_mes',  (SELECT COUNT(*) FROM perfil_contactos WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio),
    'vistas_anterior',    (SELECT COUNT(*) FROM perfil_vistas   WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio_anterior AND fecha < fecha_inicio),
    'contactos_anterior', (SELECT COUNT(*) FROM perfil_contactos WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio_anterior AND fecha < fecha_inicio),
    'trabajos_completados', (SELECT COUNT(*) FROM chats_trabajo WHERE prestador_id = p_prestador_id AND estado = 'calificado' AND DATE(ultimo_evento_at) >= fecha_inicio),
    'vistas_diarias', (
      SELECT json_agg(json_build_object('fecha', fecha::text, 'count', cnt) ORDER BY fecha)
      FROM (
        SELECT fecha, COUNT(*) as cnt
        FROM perfil_vistas
        WHERE prestador_id = p_prestador_id AND fecha >= CURRENT_DATE - 29
        GROUP BY fecha
      ) d
    ),
    'por_zona', (
      SELECT json_agg(json_build_object('zona', zona, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(zona, 'Sin zona') as zona, COUNT(*) as cnt
        FROM perfil_vistas
        WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio
        GROUP BY zona
      ) z
    ),
    'por_origen', (
      SELECT json_agg(json_build_object('origen', origen, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT origen, COUNT(*) as cnt
        FROM perfil_vistas
        WHERE prestador_id = p_prestador_id AND fecha >= fecha_inicio
        GROUP BY origen
      ) o
    )
  ) INTO result;
  RETURN result;
END;
$function$;

notify pgrst, 'reload schema';
