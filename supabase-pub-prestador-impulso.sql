-- ═══════════════════════════════════════════════════════════════════════
-- Publicaciones de prestadores · Fase 6: Impulsar (compra suelta)
-- ═══════════════════════════════════════════════════════════════════════
--
-- El impulso sube el aviso en el orden del feed por unos días. NO es un
-- plan ni una suscripción: es una compra de una sola vez que el prestador
-- dispara desde su propio aviso, sin cambiar de plan. Mismo modelo que el
-- banner, y por eso reusa su circuito completo (crear-preferencia con `ref`
-- + webhook-mp).
--
-- La columna `impulso_hasta` ya existe desde la Fase 1 y el feed YA ordena
-- por ella (los impulsados primero). O sea que lo único que falta es el
-- cobro y quién puede escribir esa fecha.
--
-- ── Dos interruptores, no uno ──
-- `publicaciones_prestador` prende la feature entera; `impulsos_activos`
-- prende sólo la venta. Se puede tener los avisos sin vender impulsos, que
-- es exactamente como arranca. Mismo criterio que banners.

begin;

-- ── 1 · Interruptor de la venta ──────────────────────────────────────
insert into public.config_app (clave, valor)
values ('impulsos_activos', 'false')
on conflict (clave) do nothing;

drop policy if exists config_lectura_publica on public.config_app;
create policy config_lectura_publica on public.config_app
  for select using (clave = any (array[
    'planes_pagos_activos', 'mp_checkout_activo', 'propuesta_expiracion_hs',
    'pedido_vencimiento_hs', 'inactividad_cierre_dias', 'pedido_fotos_max',
    'adjunto_max_mb', 'promarket_activo', 'features_off',
    'banners_pagos_activos', 'publicaciones_prestador',
    'impulsos_activos'
  ]));

-- ── 2 · Precio y duración del impulso ────────────────────────────────
-- Vive en planes_limites como el banner y el crédito de ProMarket: es de
-- donde crear-preferencia saca el monto real del cobro. No es un plan de
-- prestador — el test de sincronía lo excluye por nombre.
insert into public.planes_limites (plan, nombre, precio_mes, precio_anual)
values ('impulso', 'Impulso de aviso', 1500, 1500)
on conflict (plan) do nothing;

-- Cuántos días dura. Parametría, no constante en el código.
insert into public.config_app (clave, valor)
values ('impulso_dias', '7')
on conflict (clave) do nothing;

-- ── 3 · Activación (la llama el webhook con service_role) ────────────
-- Vuelve a validar dueño y estado aunque crear-preferencia ya lo hizo:
-- esto corre con service_role y es la última puerta antes de darle al
-- prestador algo que pagó. Misma decisión que activar_banner_pagado.
create or replace function public.activar_impulso_pagado(
  p_pub_id uuid, p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias  integer;
  v_filas integer;
begin
  select coalesce(nullif(valor, '')::int, 7) into v_dias
    from config_app where clave = 'impulso_dias';
  v_dias := coalesce(v_dias, 7);

  -- El impulso se ACUMULA sobre uno vigente en vez de pisarlo: si alguien
  -- paga dos veces seguidas, la segunda compra tiene que sumar días, no
  -- reemplazar los que le quedaban. Pisar sería quedarse con la plata.
  update publicaciones_prestador p
     set impulso_hasta = greatest(coalesce(p.impulso_hasta, now()), now())
                         + make_interval(days => v_dias)
   where p.id = p_pub_id
     and p.estado = 'activa'
     and p.vigencia_hasta > now()
     and exists (
       select 1 from perfiles pf
       where pf.id = p_usuario_id and pf.prestador_id = p.prestador_id
     );

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'El aviso no es de quien pagó, o ya no está publicado');
  end if;
  return jsonb_build_object('ok', true, 'dias', v_dias);
end;
$$;

revoke execute on function public.activar_impulso_pagado(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.activar_impulso_pagado(uuid, uuid) to service_role;

commit;

notify pgrst, 'reload schema';
