-- ═══════════════════════════════════════════════════════════════════════
-- resolver_banner() avisaba en la base, no al dueño del banner
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- Encontrado con el caso de Jorge Vidrioni: el admin aprobó su banner y
-- Jorge no tuvo forma de enterarse salvo entrando a Promocionarme por su
-- cuenta o que alguien le avisara a mano. resolver_banner() sólo tocaba la
-- fila de `banners` — ni una notificación, ni un push. Comparado contra el
-- resto de los flujos de moderación del proyecto (denuncias, verificación
-- de DNI), es el único que no avisa.
--
-- Se agrega el insert en `notificaciones` adentro de la MISMA función y
-- transacción que ya resuelve el banner — mismo patrón que
-- supabase-notificar-prestador.sql. Dos mensajes, según el resultado:
-- aprobado invita a pagar (que es justo el paso que se estaba perdiendo);
-- rechazado explica el motivo, si lo hay.

create or replace function public.resolver_banner(
  p_banner_id uuid,
  p_aprobar   boolean,
  p_motivo    text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_estado text;
  v_dueno  uuid;
  v_nombre text;
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  select estado, usuario_id, nombre into v_estado, v_dueno, v_nombre
    from public.banners where id = p_banner_id for update;
  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'No existe');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Ese banner ya fue resuelto');
  end if;
  if p_aprobar and public.banners_espacios_libres() <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No quedan espacios libres: no se puede aprobar todavía');
  end if;

  update public.banners
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
         motivo_rechazo = case when p_aprobar then null else nullif(btrim(coalesce(p_motivo,'')),'') end,
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_banner_id;

  -- El dueño puede no tener cuenta activa (no debería pasar, pero
  -- notificaciones.usuario_id no tiene FK a perfiles) — no bloquear la
  -- resolución del banner por eso.
  if v_dueno is not null then
    insert into public.notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
    values (
      v_dueno, auth.uid(), 'banner',
      case when p_aprobar then '✅ Tu banner fue aprobado'
                          else '❌ Tu banner no fue aprobado' end,
      case when p_aprobar
             then 'Ya podés pagarlo y publicarlo: "' || coalesce(v_nombre, 'tu aviso') || '".'
           when p_motivo is not null and btrim(p_motivo) <> ''
             then p_motivo
           else 'No se aprobó "' || coalesce(v_nombre, 'tu aviso') || '".' end,
      '#s-promocionar'
    );
  end if;

  return jsonb_build_object('ok', true, 'estado', case when p_aprobar then 'aprobado' else 'rechazado' end);
end;
$$;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Que la función siga con una sola firma:
select p.oid::regprocedure from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'resolver_banner';

-- 2. Simulación de punta a punta: crea un banner de prueba en 'pendiente',
--    lo aprueba, y confirma que quedó la notificación.
do $$
declare v_id uuid; v_uid uuid;
begin
  select id into v_uid from auth.users limit 1;
  insert into public.banners (nombre, imagen_url, usuario_id, estado, activo)
  values ('[TEST-NOTIF] prueba', 'https://x.com/x.jpg', v_uid, 'pendiente', false)
  returning id into v_id;

  perform public.resolver_banner(v_id, true, null);

  raise notice 'notificación creada: %', (
    select count(*) from public.notificaciones
     where usuario_id = v_uid and tipo = 'banner' and cuerpo ilike '%TEST-NOTIF%'
  );

  delete from public.notificaciones where usuario_id = v_uid and cuerpo ilike '%TEST-NOTIF%';
  delete from public.banners where id = v_id;
end $$;
