-- ═══ PRONET · Baja de cuenta diferida 30 días ═══════════════════════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── Por qué ────────────────────────────────────────────────────────────
-- La baja era destructiva e instantánea: un confirm() del sistema, un toque
-- en "Aceptar", y la cuenta ya no existía. Se perdió una cuenta real así.
--
-- Google Play exige que la eliminación esté disponible dentro de la app,
-- pero no que sea inmediata: un período de gracia es una implementación
-- aceptada. Así que la baja ahora se PIDE, y el borrado real ocurre 30 días
-- después. Volver a entrar en ese lapso la cancela.
--
-- ── Por qué una tabla y no una columna en perfiles ─────────────────────
-- Hay que poder deshacer con exactitud. Al pedir la baja se apagan la ficha
-- de prestador y las publicaciones; al cancelar hay que volver a encender
-- SOLO las que estaban encendidas, no todas. Ese estado previo se guarda
-- acá, en `restaurar`.

-- ── Tabla de bajas pendientes ──────────────────────────────────────────
create table if not exists public.bajas_cuenta (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  pedida_en  timestamptz not null default now(),
  restaurar  jsonb       not null default '{}'::jsonb
);

alter table public.bajas_cuenta enable row level security;

-- Cada uno ve y cancela sólo la suya. El INSERT no se abre: se pide por RPC,
-- que además apaga la ficha y las publicaciones en la misma transacción.
drop policy if exists "ve su propia baja" on public.bajas_cuenta;
drop policy if exists "cancela su propia baja" on public.bajas_cuenta;
create policy "ve su propia baja" on public.bajas_cuenta
  for select using (auth.uid() = usuario_id);
create policy "cancela su propia baja" on public.bajas_cuenta
  for delete using (auth.uid() = usuario_id);

-- ── Pedir la baja ──────────────────────────────────────────────────────
create or replace function public.pedir_baja_cuenta()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_ficha  uuid;
  v_activa boolean := false;
  v_pubs   uuid[];
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select prestador_id into v_ficha from perfiles where id = v_uid;

  -- Se apaga la ficha para que nadie contacte a alguien que se está yendo.
  -- Se anota si estaba encendida: si ya estaba apagada, cancelar no debe
  -- encenderla.
  if v_ficha is not null then
    select activo into v_activa from prestadores where id = v_ficha;
    if v_activa then
      update prestadores set activo = false where id = v_ficha;
    end if;
  end if;

  -- Mismo criterio con las publicaciones: sólo se anotan las que se apagan.
  select coalesce(array_agg(id), '{}') into v_pubs
    from publicaciones where autor_id = v_uid and activa = true;
  if array_length(v_pubs, 1) > 0 then
    update publicaciones set activa = false where id = any(v_pubs);
  end if;

  -- do nothing y no do update: pedir la baja dos veces no reinicia el plazo.
  insert into bajas_cuenta (usuario_id, pedida_en, restaurar)
  values (v_uid, now(), jsonb_build_object(
            'prestador_activo', v_activa,
            'publicaciones', to_jsonb(v_pubs)))
  on conflict (usuario_id) do nothing;

  return (select jsonb_build_object(
                   'ok', true,
                   'pedida_en', pedida_en,
                   'purga_en', pedida_en + interval '30 days')
            from bajas_cuenta where usuario_id = v_uid);
end;
$fn$;

-- ── Cancelar la baja (volver a entrar) ─────────────────────────────────
create or replace function public.cancelar_baja_cuenta()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_fila  bajas_cuenta%rowtype;
  v_ficha uuid;
  v_pubs  uuid[];
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_fila from bajas_cuenta where usuario_id = v_uid;
  if not found then
    return jsonb_build_object('ok', true, 'nada_que_cancelar', true);
  end if;

  if coalesce((v_fila.restaurar->>'prestador_activo')::boolean, false) then
    select prestador_id into v_ficha from perfiles where id = v_uid;
    if v_ficha is not null then
      update prestadores set activo = true where id = v_ficha;
    end if;
  end if;

  select coalesce(array_agg((value #>> '{}')::uuid), '{}') into v_pubs
    from jsonb_array_elements(coalesce(v_fila.restaurar->'publicaciones', '[]'::jsonb));
  if array_length(v_pubs, 1) > 0 then
    update publicaciones set activa = true
     where id = any(v_pubs) and autor_id = v_uid;
  end if;

  delete from bajas_cuenta where usuario_id = v_uid;
  return jsonb_build_object('ok', true, 'reactivada', true);
end;
$fn$;

-- ── Purga: el borrado real, a los 30 días ──────────────────────────────
-- Replica el orden de la Edge Function `eliminar-cuenta`. Las tablas con FK
-- NO ACTION hay que vaciarlas o anonimizarlas antes, o el delete de
-- auth.users falla por violación de FK.
create or replace function public.purgar_cuentas_dadas_de_baja()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid;
  v_ficha uuid;
  v_n     int := 0;
begin
  for v_uid in
    select usuario_id from bajas_cuenta
     where pedida_en < now() - interval '30 days'
  loop
    select prestador_id into v_ficha from perfiles where id = v_uid;

    -- El veto va PRIMERO: decide mirando las denuncias confirmadas, que se
    -- anonimizan más abajo. Después no encontraría antecedentes y no vetaría
    -- nunca, y un suspendido se reinscribiría con el mismo teléfono limpio.
    begin
      perform vetar_telefono_si_corresponde(v_uid);
    exception when others then
      raise notice 'no se pudo evaluar el veto de %', v_uid;
    end;

    -- Rastro contable y de moderación: se anonimiza, no se borra.
    update pagos_procesados set usuario_id    = null where usuario_id    = v_uid;
    update notificaciones    set emisor_id    = null where emisor_id     = v_uid;
    update trabajo_fotos     set subido_por   = null where subido_por    = v_uid;
    update chats_trabajo     set cancelado_por = null where cancelado_por = v_uid;
    -- Dos updates y no uno con OR: si la misma persona fuera denunciante en
    -- una y denunciada en otra, un solo update pondría ambos ids en null en
    -- las dos filas y borraría la punta que no corresponde tocar.
    update denuncias set denunciante_id = null where denunciante_id = v_uid;
    update denuncias set denunciado_id  = null where denunciado_id  = v_uid;

    -- Solicitudes antes que loyalty: la FK va en ese sentido.
    delete from loyalty_solicitudes where usuario_id = v_uid;
    delete from loyalty             where usuario_id = v_uid;
    delete from loyalty_historial   where usuario_id = v_uid;

    -- La ficha de prestador NO cuelga de auth.users: si no se borra acá
    -- queda publicada sin dueño. Es el "prestador fantasma" que aparecía en
    -- la app después de cada borrado.
    if v_ficha is not null then
      delete from loyalty_solicitudes where prestador_id = v_ficha;
      delete from loyalty_historial   where prestador_id = v_ficha;
      delete from portfolio_fotos     where prestador_id = v_ficha;
      delete from prestadores         where id = v_ficha;
    end if;

    delete from suscripciones where usuario_id = v_uid;

    -- Los pedidos van explícitamente, ANTES del delete del usuario.
    --
    -- pedidos.usuario_id es ON DELETE SET NULL, así que borrar la cuenta no
    -- se los lleva: los deja publicados y sin autor. Un pedido sin autor no
    -- lo puede contestar nadie — no hay a quién mandarle la propuesta.
    --
    -- Y encima quedaban invisibles por accidente, no por decisión: el feed
    -- filtra con `usuario_id <> yo`, y en SQL eso da NULL (no false) cuando
    -- la columna es NULL, así que la fila no pasa el filtro. Basura que
    -- nadie ve y nadie puede limpiar desde la app.
    delete from pedidos where usuario_id = v_uid;

    delete from auth.users where id = v_uid;  -- cascadea perfiles y el resto
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

revoke all on function public.purgar_cuentas_dadas_de_baja() from public, anon, authenticated;

-- ── Programar: todos los días a las 03:30 UTC (00:30 de Buenos Aires) ──
do $sched$
begin
  if exists (select 1 from cron.job where jobname = 'purgar-cuentas-baja') then
    perform cron.unschedule('purgar-cuentas-baja');
  end if;
end $sched$;

select cron.schedule(
  'purgar-cuentas-baja',
  '30 3 * * *',
  'select public.purgar_cuentas_dadas_de_baja();'
);

select jobname, schedule, active from cron.job where jobname = 'purgar-cuentas-baja';
