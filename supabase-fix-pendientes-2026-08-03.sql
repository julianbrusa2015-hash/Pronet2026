-- Resuelve los 2 pendientes de baja prioridad de la auditoría 2026-08-03.

-- ── 1. Spam de vistas/contactos por visitantes sin sesión ───────────────
-- fn_registrar_vista/fn_registrar_contacto ya no aceptan datos forjados
-- (validan que el prestador exista y usan auth.uid(), no lo que mande el
-- cliente), pero para anon no hay dedup ni rate-limit: se puede inflar el
-- contador de "vistas/contactos" de cualquier prestador repitiendo la
-- llamada desde la consola sin login. Como el dedup (un registro por
-- usuario y día) ya dependía de tener un auth.uid() estable, la métrica de
-- visitantes anónimos era inservible igual — se corta de raíz exigiendo
-- sesión. El browsing sin login sigue funcionando igual (las llamadas son
-- best-effort con .catch(() => {}) en el cliente), simplemente esas visitas
-- dejan de contarse.
-- El EXECUTE estaba otorgado a PUBLIC (pseudo-rol que incluye a anon
-- aunque no aparezca como grant explícito) — revocar solo "from anon" no
-- alcanza cuando el grant real es a PUBLIC. Hay que revocar de PUBLIC y
-- authenticated ya tiene su propio grant explícito que sobrevive.
revoke execute on function public.fn_registrar_vista(uuid, text) from public;
revoke execute on function public.fn_registrar_contacto(uuid, text, text) from public;

-- ── 2. plan_de_usuario / plan_de_prestador sin chequeo de auth ──────────
-- Cualquiera podía consultar el plan (base/plus/premium) de cualquier
-- cuenta pasando su UUID. No es PII sensible, pero es info de
-- reconocimiento comercial sin motivo para ser pública. Se restringe a
-- dueño o admin, mismo patrón que obtener_analitica_prestador.
create or replace function public.plan_de_usuario(p_usuario_id uuid)
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when es_admin() or p_usuario_id = auth.uid() then
      coalesce(
        (select plan from public.suscripciones
          where usuario_id = p_usuario_id
            and estado = 'activo'
            and (vence_en is null or vence_en > now())),
        'base'
      )
    else null
  end;
$function$;

create or replace function public.plan_de_prestador(p_prestador_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id uuid;
  v_plan text;
  v_es_fundador boolean;
  v_fundador_hasta timestamptz;
begin
  select id into v_usuario_id from perfiles where prestador_id = p_prestador_id limit 1;
  if v_usuario_id is null then return null; end if;

  -- coalesce(..., false) a propósito: sin sesión "v_usuario_id = auth.uid()"
  -- da NULL, no false, y "IF NOT (NULL)" en plpgsql no entra a la rama de
  -- bloqueo (se comporta como si fuera true) — misma trampa ya encontrada
  -- hoy en obtener_analitica_prestador.
  if not coalesce(es_admin() or v_usuario_id = auth.uid(), false) then
    return null;
  end if;

  select plan into v_plan from suscripciones
   where usuario_id = v_usuario_id and estado = 'activo'
     and (vence_en is null or vence_en > now());
  v_plan := coalesce(v_plan, 'base');
  if v_plan <> 'base' then return v_plan; end if;

  select es_fundador, limites_fundador_hasta into v_es_fundador, v_fundador_hasta
    from prestadores where id = p_prestador_id;
  if v_es_fundador and (v_fundador_hasta is null or v_fundador_hasta > now()) then
    return 'plus';
  end if;
  return 'base';
end;
$function$;

notify pgrst, 'reload schema';
