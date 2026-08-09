-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Avisarle al prestador cuando le aprueban la verificación
--
-- Hasta ahora sólo se enteraba si entraba a Editar perfil por su cuenta.
--
-- El insert va DIRECTO y no por notificar_usuario(): esta función ya es
-- SECURITY DEFINER y sólo llega acá después de pasar es_admin(), así que
-- volver a validar la relación emisor-destinatario no agrega nada. Igual se
-- guarda `emisor_id` — la trazabilidad de quién mandó cada notificación es
-- lo que hace detectable una falsa (ver supabase-notificaciones-rpc.sql).
--
-- El rechazo NO notifica, por decisión del 2026-08-09. El motivo queda
-- guardado y visible en Editar perfil.
--
-- El destinatario sale de `perfiles`, no de `prestadores`: esa tabla no
-- tiene columna de usuario, el vínculo va al revés por perfiles.prestador_id.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.resolver_verificacion(
  p_prestador_id uuid,
  p_aprobar      boolean,
  p_motivo       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'solo admin');
  end if;

  update public.prestadores_verificacion
     set estado         = case when p_aprobar then 'verificado' else 'rechazado' end,
         motivo_rechazo = case when p_aprobar then null else p_motivo end,
         revisado_por   = auth.uid(),
         revisado_en    = now(),
         actualizado    = now()
   where prestador_id = p_prestador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin solicitud para ese prestador');
  end if;

  update public.prestadores
     set verificado    = p_aprobar,
         verificado_en = case when p_aprobar then now() else null end
   where id = p_prestador_id;

  select id into v_usuario_id
    from public.perfiles
   where prestador_id = p_prestador_id;

  -- Sin dueño no hay a quién avisarle, pero la verificación ya se resolvió:
  -- no tiene sentido hacer fallar todo por el aviso.
  if p_aprobar and v_usuario_id is not null then
    insert into public.notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
    values (v_usuario_id, auth.uid(), 'verificacion',
            '🪪 Tu identidad fue verificada',
            'Ya tenés el sello de verificado en tu perfil. Los vecinos lo ven al buscarte.',
            '#s-miperfil');
  end if;

  return jsonb_build_object(
    'ok', true,
    'estado', case when p_aprobar then 'verificado' else 'rechazado' end,
    'avisado', (p_aprobar and v_usuario_id is not null));
end;
$$;

revoke all on function public.resolver_verificacion(uuid, boolean, text) from public;
grant execute on function public.resolver_verificacion(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';

select 'ok' as estado;
