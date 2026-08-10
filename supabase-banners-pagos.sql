-- ═══════════════════════════════════════════════════════════════════════
-- Banners pagos · el vecino compra un espacio del carrusel
-- ═══════════════════════════════════════════════════════════════════════
--
-- Tercer producto que PRONET le vende a un usuario, después de las
-- suscripciones y los créditos de publicación. Sigue siendo "PRONET le cobra
-- a alguien": NO es plata entre vecinos. Esa distinción es a propósito —
-- intermediar pagos entre dos usuarios cambia la figura impositiva y trae los
-- conflictos de cada transacción, y Entre Vecinos está definido como contacto
-- directo.
--
-- ── El orden: primero se modera, después se cobra ──
-- Cobrar y después moderar obliga a devolver la plata cuando se rechaza una
-- imagen, y eso es una operación (reembolsos, disputas) que no queremos.
-- Acá el vecino sube su banner, el admin lo aprueba o lo rechaza sin costo, y
-- recién con el "aprobado" aparece el botón de pagar. Nadie paga por algo que
-- después se le rechaza.
--
--   borrador → pendiente → aprobado → (paga) → activo
--                       ↘ rechazado (con motivo, sin cargo)
--
-- ── El interruptor ──
-- `banners_pagos_activos` en config_app, igual que planes_pagos_activos y
-- promarket_activo. Apagado, el carrusel es puramente editorial: sólo el
-- admin carga banners, que es exactamente como funciona hoy.

begin;

-- ── 1 · Interruptor del circuito ─────────────────────────────────────
insert into public.config_app (clave, valor)
values ('banners_pagos_activos', 'false')
on conflict (clave) do nothing;

-- El cliente tiene que poder LEER el flag para saber si ofrecer la compra.
-- `config_app` no es de lectura pública abierta: hay una lista blanca desde
-- que se descubrió que exponía `admin_pin` en texto plano (ver
-- seguridad_rls_2026-07-29). Agregar la clave sin sumarla acá deja el flag
-- invisible y el circuito apagado para siempre, sin dar ningún error.
drop policy if exists config_lectura_publica on public.config_app;
create policy config_lectura_publica on public.config_app
  for select using (clave = any (array[
    'planes_pagos_activos', 'mp_checkout_activo', 'propuesta_expiracion_hs',
    'pedido_vencimiento_hs', 'inactividad_cierre_dias', 'pedido_fotos_max',
    'adjunto_max_mb', 'promarket_activo', 'features_off',
    'banners_pagos_activos'
  ]));

-- ── 2 · Dueño, estado y vigencia ─────────────────────────────────────
alter table public.banners
  add column if not exists usuario_id     uuid references public.perfiles(id) on delete set null,
  add column if not exists estado         text not null default 'aprobado',
  add column if not exists motivo_rechazo text,
  add column if not exists dias           integer,
  add column if not exists pagado_en      timestamptz,
  add column if not exists revisado_por   uuid references public.perfiles(id) on delete set null,
  add column if not exists revisado_en    timestamptz,
  -- A dónde lleva el banner al tocarlo. NO se permite una URL libre: sería
  -- una puerta a phishing y a linkear a otra app. Sólo dos destinos, y los
  -- dos se quedan en el mundo del vecino:
  --   'whatsapp' → enlace guarda el número; el click abre el chat
  --   'imagen'   → enlace guarda una imagen (un flyer) que se abre ampliada
  -- Los banners editoriales del admin quedan con null y siguen usando
  -- `enlace` como URL, que es el comportamiento de hoy.
  add column if not exists destino_tipo   text;

alter table public.banners drop constraint if exists banners_destino_check;
alter table public.banners add constraint banners_destino_check
  check (destino_tipo is null or destino_tipo in ('whatsapp','imagen'));

-- Cuántos banners pueden estar publicados a la vez. El carrusel rota entre
-- ellos; vender más de los que entran es prometer algo que no se controla.
insert into public.config_app (clave, valor)
values ('banners_activos_max', '6')
on conflict (clave) do nothing;

-- Los banners que ya existen son editoriales del admin: `usuario_id` null y
-- estado 'aprobado'. Por eso ese default — así los 5 actuales siguen
-- funcionando sin tocarlos.
alter table public.banners drop constraint if exists banners_estado_check;
alter table public.banners add constraint banners_estado_check
  check (estado in ('borrador','pendiente','aprobado','rechazado','activo'));

comment on column public.banners.usuario_id is
  'Dueño del banner. NULL = editorial, cargado por el admin.';
comment on column public.banners.estado is
  'borrador → pendiente → aprobado → activo. Se modera ANTES de cobrar para no tener que devolver plata.';

create index if not exists idx_banners_usuario on public.banners (usuario_id, creado desc);
create index if not exists idx_banners_estado  on public.banners (estado) where estado <> 'activo';

-- ── 3 · Qué banner ve el vecino ──────────────────────────────────────
-- Se agrega el filtro de estado y vigencia a la lectura pública: un banner
-- pago que venció o que todavía no arrancó no se muestra, aunque `activo`
-- siga en true.
drop policy if exists banners_lectura on public.banners;
create policy banners_lectura on public.banners
  for select using (
    (activo = true
      and estado in ('aprobado','activo')
      and (desde is null or desde <= now())
      and (hasta is null or hasta >= now()))
    or usuario_id = auth.uid()     -- el dueño ve el suyo en cualquier estado
    or public.es_admin()
  );

-- `banners_leer` tenía `using (true)` y las policies se combinan con OR, así
-- que dejaba ver borradores y rechazados ajenos y anulaba por completo el
-- filtro de arriba. Misma trampa que las tres policies de notificaciones
-- (seguridad_rls_2026-07-29): al endurecer una lectura hay que borrar las
-- permisivas, no sólo agregar la buena.
drop policy if exists banners_leer on public.banners;
-- `banners_admin` (ALL, es_admin) queda: es la que sostiene el ABM del panel.

-- ── 4 · Precio ───────────────────────────────────────────────────────
-- Va en `planes_limites` como una fila más, igual que `promarket_credito`:
-- así `crear-preferencia` lo lee sin cambios (ya resuelve el precio
-- server-side desde esa tabla) y el panel de planes lo puede editar.
insert into public.planes_limites (plan, nombre, precio_mes)
values ('banner', 'Banner en el carrusel', 12000)
on conflict (plan) do nothing;

-- ── 5 · Alta del banner por el vecino ────────────────────────────────
/** Cuántos espacios quedan libres.
 *
 *  Cuenta 'aprobado' además de 'activo': un banner aprobado y todavía impago
 *  ya tiene el lugar reservado. Si no, dos personas pagarían por el último
 *  espacio y a una habría que devolverle la plata — justo lo que este diseño
 *  evita moderando antes de cobrar. */
create or replace function public.banners_espacios_libres()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select valor from public.config_app where clave='banners_activos_max'),'6')::int
    - (select count(*) from public.banners where estado in ('aprobado','activo'))
  );
$$;

grant execute on function public.banners_espacios_libres() to anon, authenticated;

create or replace function public.crear_banner(
  p_nombre     text,
  p_imagen_url text,
  p_enlace     text default null,
  p_dias       integer default 30,
  p_destino    text default 'whatsapp'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_abiertos int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;
  if coalesce((select valor from public.config_app where clave='banners_pagos_activos'),'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'Los espacios publicitarios no están disponibles por ahora');
  end if;
  if btrim(coalesce(p_nombre,'')) = '' or btrim(coalesce(p_imagen_url,'')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre o la imagen');
  end if;
  if p_destino not in ('whatsapp','imagen') then
    return jsonb_build_object('ok', false, 'error', 'Destino inválido');
  end if;
  if btrim(coalesce(p_enlace,'')) = '' then
    return jsonb_build_object('ok', false, 'error',
      case when p_destino = 'whatsapp' then 'Falta el WhatsApp de contacto'
           else 'Falta la imagen que se abre al tocarlo' end);
  end if;

  -- Se avisa acá, antes de que cargue nada, y no al aprobar: enterarse de que
  -- no hay lugar después de preparar la pieza es la peor versión de esto.
  if public.banners_espacios_libres() <= 0 then
    return jsonb_build_object('ok', false, 'error',
      'Por ahora no quedan espacios libres. Se liberan cuando vence alguno.', 'codigo', 'sin_espacio');
  end if;

  -- Tope de piezas sin resolver por usuario: sin esto, alguien puede llenar
  -- la cola de moderación sin haber pagado nunca.
  select count(*) into v_abiertos from public.banners
   where usuario_id = v_uid and estado in ('borrador','pendiente','aprobado');
  if v_abiertos >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Ya tenés 3 banners sin publicar. Resolvé esos primero.');
  end if;

  insert into public.banners (nombre, imagen_url, enlace, destino_tipo, usuario_id, estado, dias, activo, orden)
  values (btrim(p_nombre), btrim(p_imagen_url), btrim(p_enlace), p_destino,
          v_uid, 'pendiente', greatest(1, coalesce(p_dias, 30)), false, 999)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.crear_banner(text,text,text,integer,text) from public, anon;
grant execute on function public.crear_banner(text,text,text,integer,text) to authenticated;
-- La firma vieja de 4 parámetros: un create or replace con otra firma la
-- dejaría conviviendo y PostgREST no podría elegir. Ya nos pasó con
-- buscar_prestadores (ver supabase-ranking-bayesiano.sql).
drop function if exists public.crear_banner(text, text, text, integer);

-- ── 6 · Moderación ───────────────────────────────────────────────────
create or replace function public.resolver_banner(
  p_banner_id uuid,
  p_aprobar   boolean,
  p_motivo    text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  select estado into v_estado from public.banners where id = p_banner_id for update;
  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'No existe');
  end if;
  if v_estado <> 'pendiente' then
    -- Exigir la transición desde 'pendiente' evita que dos clicks seguidos
    -- resuelvan dos veces, igual que en resolver_canje.
    return jsonb_build_object('ok', false, 'error', 'Ese banner ya fue resuelto');
  end if;
  -- Se revisa de nuevo al aprobar: entre el alta y la moderación pueden
  -- haberse ocupado los últimos lugares. Aprobar sin espacio dejaría a alguien
  -- pagando por un lugar que no existe.
  if p_aprobar and public.banners_espacios_libres() <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No quedan espacios libres: no se puede aprobar todavía');
  end if;

  update public.banners
     set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
         motivo_rechazo = case when p_aprobar then null else nullif(btrim(coalesce(p_motivo,'')),'') end,
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_banner_id;

  return jsonb_build_object('ok', true, 'estado', case when p_aprobar then 'aprobado' else 'rechazado' end);
end;
$$;

revoke all on function public.resolver_banner(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_banner(uuid, boolean, text) to authenticated;

-- ── 7 · Activación tras el pago ──────────────────────────────────────
-- La llama el webhook con service_role. No chequea auth.uid() porque no hay
-- sesión de usuario ahí; el candado es el grant, que sólo alcanza a
-- service_role.
create or replace function public.activar_banner_pagado(
  p_banner_id uuid,
  p_usuario_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dias int;
begin
  select coalesce(dias, 30) into v_dias
    from public.banners
   where id = p_banner_id and usuario_id = p_usuario_id and estado = 'aprobado'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Banner inexistente, ajeno o no aprobado');
  end if;

  update public.banners
     set estado = 'activo', activo = true, pagado_en = now(),
         desde = now(), hasta = now() + (v_dias || ' days')::interval
   where id = p_banner_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.activar_banner_pagado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activar_banner_pagado(uuid, uuid) to service_role;

-- ── 8 · Contador de clicks: YA FUNCIONABA ────────────────────────────
-- Nota para el próximo que mire: se creyó que el contador estaba roto porque
-- buscando "clicks" en app.js sólo aparece la línea que lo MUESTRA. El
-- incremento existe y anda — va por `PronetDB.clickBanner()` (app.js:3491) →
-- RPC `click_banner`, que ya estaba creada. Los banners están en 0 porque
-- nadie los tocó, no porque no se cuente. `clicks` es NOT NULL default 0, así
-- que el `clicks + 1` de esa función tampoco tiene el problema del null.
-- No hace falta ninguna función nueva.
drop function if exists public.registrar_click_banner(uuid);

-- ── 9 · Subida de la imagen por el anunciante ────────────────────────
-- El bucket `banners` sólo lo podía escribir el admin (`banners_img_admin`),
-- que era correcto cuando el carrusel era puramente editorial. Ahora el
-- anunciante sube su propia pieza, así que necesita poder escribir — pero
-- SÓLO en su carpeta, para que nadie pise ni borre la imagen de otro.
-- Mismo criterio que el bucket `avatares`.
drop policy if exists banners_img_usuario_sube on storage.objects;
create policy banners_img_usuario_sube on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists banners_img_usuario_borra on storage.objects;
create policy banners_img_usuario_borra on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
