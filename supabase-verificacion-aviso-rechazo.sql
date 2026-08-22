-- ═══ Avisar también cuando la verificación se RECHAZA ═══
--
-- 2026-08-22.
--
-- ── El hueco ───────────────────────────────────────────────────────────
-- `resolver_verificacion()` sólo notificaba `if p_aprobar`. Al rechazar no
-- avisaba nada — se detectó porque la función devolvía `avisado: false` al
-- rechazar, y al mirar por qué apareció que era intencional.
--
-- El resultado: el prestador cargó su DNI y su dirección, esperó, lo
-- rechazaron con un motivo… y no se entera. El motivo que el admin se tomó el
-- trabajo de escribir queda en una pantalla que el prestador no tiene ninguna
-- razón para volver a abrir.
--
-- Es el peor de los dos casos para no avisar: al aprobado no le urge saberlo
-- —el sello aparece solo—, pero el rechazado tiene algo que corregir y no
-- sabe que tiene que hacerlo.
--
-- ── El aviso lleva el motivo ───────────────────────────────────────────
-- Sin el motivo, "te rechazaron" sólo genera una consulta a soporte. Con el
-- motivo, el prestador puede resolverlo. El texto del admin va tal cual en el
-- cuerpo de la notificación.
--
-- ── Se mantiene la firma ───────────────────────────────────────────────
-- Mismo criterio de siempre: un create or replace con otra firma deja dos
-- funciones conviviendo y PostgREST no puede elegir.

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
  v_aviso      boolean := false;
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
  if v_usuario_id is not null then
    if p_aprobar then
      insert into public.notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
      values (v_usuario_id, auth.uid(), 'verificacion',
              '🪪 Tu identidad fue verificada',
              'Ya tenés el sello de verificado en tu perfil. Los vecinos lo ven al buscarte.',
              '#s-miperfil');
    else
      insert into public.notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
      values (v_usuario_id, auth.uid(), 'verificacion',
              '🪪 Revisamos tus datos de verificación',
              coalesce(nullif(btrim(p_motivo), ''),
                       'Los datos no pudieron validarse.')
                || ' Escribinos si querés corregirlos.',
              '#s-edit-perfil');
    end if;
    v_aviso := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'estado', case when p_aprobar then 'verificado' else 'rechazado' end,
    'avisado', v_aviso);
end;
$$;

revoke all on function public.resolver_verificacion(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_verificacion(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- El test C14 aprueba y rechaza de punta a punta:
--     npx playwright test verificacion-dni.spec.js --project=msedge
--
-- Para ver el aviso: rechazar una solicitud desde el panel y confirmar que al
-- prestador le llega una notificación con el motivo en el cuerpo.
