-- CRÍTICO (auditoría 2026-08-03): la RLS de `perfiles` en UPDATE solo valida
-- que la fila sea propia (id = auth.uid()), pero no restringe columnas. El
-- primer intento de este fix hizo un REVOKE UPDATE por columna, pero no tuvo
-- efecto: `authenticated` tiene GRANT de tabla completo (arwdDxtm en
-- pg_class.relacl), y un GRANT de tabla siempre gana sobre un REVOKE de
-- columna más específico — hay que revocar a nivel de tabla primero y volver
-- a otorgar solo las columnas seguras.
--
-- Sin este fix, con `window._sb` expuesto en el navegador para debug,
-- cualquier usuario logueado podía correr en la consola:
--   window._sb.from('perfiles').update({roles:['admin']}).eq('id', miId)
-- y auto-promoverse a admin. Mismo vector para regalarse promarket_creditos,
-- activarse es_pro_marketplace, o robar el prestador_id de otro prestador.

revoke update on public.perfiles from authenticated;

grant update (nombre, telefono, zona, tyc_aceptado_en)
  on public.perfiles to authenticated;

-- El único caso legítimo que escribía es_pro_marketplace desde el cliente
-- era la auto-expiración lazy en usuarioActual() (datos.js) cuando venció
-- el plan. Se reemplaza por un RPC que hace esa misma validación
-- server-side, ya que la columna deja de ser escribible directo.
create or replace function public.expirar_mi_pro_marketplace()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.perfiles
     set es_pro_marketplace = false
   where id = auth.uid()
     and es_pro_marketplace = true
     and pro_marketplace_hasta is not null
     and pro_marketplace_hasta < now();
$function$;

grant execute on function public.expirar_mi_pro_marketplace() to authenticated;

notify pgrst, 'reload schema';
