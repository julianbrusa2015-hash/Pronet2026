-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El límite de fotos de portfolio no limita si no resuelve el plan
--
-- `chequear_limite_portfolio` arranca así:
--
--     v_plan := plan_de_prestador(new.prestador_id);
--     if v_plan is null then return new; end if;
--
-- Y `plan_de_prestador` devuelve NULL cuando quien pregunta no es admin ni
-- el dueño de la ficha — por ejemplo un insert hecho con service role desde
-- un script. En ese caso el trigger deja pasar la foto SIN límite. No
-- falla, no avisa: simplemente no limita.
--
-- Es la misma trampa que ya se corrigió en el trigger de publicaciones
-- (supabase-fix-cupo-etapa-fundadora.sql), donde el NULL de
-- `plan_de_usuario` se cubrió con `coalesce(..., 'base')`. Acá quedó
-- pendiente.
--
-- Se aplica el mismo criterio: si el plan no se puede resolver, se asume el
-- más restrictivo. Un límite que ante la duda no limita no es un límite.
--
-- Alcance real: el prestador que sube su propia foto SIEMPRE resuelve su
-- plan, así que el uso normal de la app no cambia en nada. Lo que cambia es
-- el camino que hoy pasa de largo.
--
-- El otro `return new` —el de v_limite null— se deja como está a propósito:
-- ahí el plan sí se resolvió y la fila de `planes_limites` no define tope,
-- que es la forma de decir "ilimitado" en esa tabla.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.chequear_limite_portfolio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan   text;
  v_limite int;
  v_usadas int;
begin
  -- LA CORRECCIÓN: sin plan resuelto se asume 'base', no "sin límite".
  v_plan := coalesce(plan_de_prestador(new.prestador_id), 'base');

  select fotos_portfolio into v_limite
    from planes_limites where plan = plan_para_limites(v_plan);
  if v_limite is null then return new; end if;  -- la tabla dice ilimitado

  select count(*) into v_usadas
    from portfolio_fotos where prestador_id = new.prestador_id;

  if v_usadas >= v_limite then
    raise exception 'limite_portfolio: el plan % permite % fotos de portfolio', v_plan, v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

-- Verificación: el trigger sigue enganchado y activo sobre portfolio_fotos.
select c.relname as tabla, t.tgname as trigger, t.tgenabled as habilitado
  from pg_trigger t
  join pg_proc  p on p.oid = t.tgfoid
  join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and p.proname = 'chequear_limite_portfolio';
