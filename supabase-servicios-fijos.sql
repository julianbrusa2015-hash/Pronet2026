-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Servicios fijos
--
-- Un pedido puede ser PUNTUAL (podame el cerco) o RECURRENTE (mantenimiento
-- del jardín, 2 veces por semana). Cuando el vecino elige una propuesta
-- sobre un pedido recurrente, además del trabajo nace un SERVICIO FIJO: el
-- registro del acuerdo permanente entre esas dos personas.
--
-- ── Por qué "servicio fijo" y no "contrato" ────────────────────────────
-- Contratar de forma recurrente a alguien para tareas del hogar tiene
-- implicancias legales reales en Argentina (registro, aportes, ART), y la
-- mayoría de estas relaciones son informales. Llamarlo "contrato" asusta al
-- vecino y promete un respaldo que la app no da: acá se guarda un acuerdo
-- de palabra, no un instrumento legal. "Servicio fijo" es como se dice de
-- verdad —"¿tenés jardinero fijo?"— y no arrastra ese peso.
--
-- ── Qué NO es ──────────────────────────────────────────────────────────
-- No administra fechas, visitas ni calendario. Es un REGISTRO del acuerdo:
-- con quién, cada cuánto y a qué precio. La ejecución sigue pasando por el
-- chat y por la vida real. Meter visitas acá sería construir un calendario
-- para averiguar algo que este registro ya responde: si la recurrencia
-- existe en el barrio.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. El pedido declara su modalidad ───────────────────────────────────
-- Importa desde el alta y no después: en un puntual el prestador cotiza el
-- trabajo entero, en un recurrente cotiza POR VISITA. Sin declararlo, las
-- propuestas no son comparables.
alter table public.pedidos
  add column if not exists modalidad text not null default 'puntual',
  add column if not exists frecuencia_veces int,
  add column if not exists frecuencia_periodo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_modalidad_check') then
    alter table public.pedidos
      add constraint pedidos_modalidad_check check (modalidad in ('puntual','recurrente'));
  end if;
end $$;

-- ── 2. El registro del acuerdo ──────────────────────────────────────────
create table if not exists public.servicios_fijos (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid references public.pedidos(id) on delete set null,
  propuesta_id       uuid references public.propuestas(id) on delete set null,
  vecino_id          uuid not null references auth.users(id) on delete cascade,
  prestador_id       uuid not null references public.prestadores(id) on delete cascade,
  rubro              text,
  frecuencia_veces   int  not null default 1,
  frecuencia_periodo text not null default 'semana',
  precio             integer,
  -- El piletero se cobra POR MES y el jardinero POR VISITA. Con un solo
  -- criterio, la mitad de los servicios quedan mal cargados.
  precio_unidad      text not null default 'visita',
  estado             text not null default 'activo',
  creado             timestamptz not null default now(),
  terminado_en       timestamptz,
  constraint servicios_fijos_periodo_check check (frecuencia_periodo in ('semana','mes')),
  constraint servicios_fijos_unidad_check  check (precio_unidad in ('visita','mes')),
  constraint servicios_fijos_estado_check  check (estado in ('activo','terminado'))
);

create index if not exists idx_servicios_fijos_vecino     on public.servicios_fijos (vecino_id)     where estado = 'activo';
create index if not exists idx_servicios_fijos_prestador  on public.servicios_fijos (prestador_id)  where estado = 'activo';

alter table public.servicios_fijos enable row level security;

-- Cada parte ve los suyos, y sólo los suyos.
drop policy if exists "servicios_fijos_ver_propios" on public.servicios_fijos;
create policy "servicios_fijos_ver_propios" on public.servicios_fijos
  for select using (
    vecino_id = auth.uid()
    or prestador_id = (select prestador_id from public.perfiles where id = auth.uid())
  );

-- Cualquiera de los dos puede darlo de baja: un acuerdo se termina de
-- cualquier lado. No hay INSERT desde el cliente — los crea el RPC.
drop policy if exists "servicios_fijos_terminar" on public.servicios_fijos;
create policy "servicios_fijos_terminar" on public.servicios_fijos
  for update using (
    vecino_id = auth.uid()
    or prestador_id = (select prestador_id from public.perfiles where id = auth.uid())
  ) with check (
    vecino_id = auth.uid()
    or prestador_id = (select prestador_id from public.perfiles where id = auth.uid())
  );

-- ── 3. Elegir una propuesta sobre un pedido recurrente crea el servicio ─
-- Nace solo. No hay pantalla de "crear servicio fijo": sería pedirle al
-- usuario que cargue dos veces lo que ya cargó.
create or replace function public.elegir_propuesta(p_propuesta_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pedido_id     uuid;
  v_prestador_id  uuid;
  v_pedido        record;
  v_precio        integer;
  v_servicio_id   uuid;
begin
  select pr.pedido_id, pr.prestador_id, pr.precio
    into v_pedido_id, v_prestador_id, v_precio
  from public.propuestas pr
  join public.pedidos pe on pe.id = pr.pedido_id
  where pr.id = p_propuesta_id
    and pr.estado = 'pendiente'
    and pe.usuario_id = auth.uid()
    and pe.estado = 'Publicado'
  for update of pr, pe;

  if not found then
    raise exception 'PROPUESTA_NO_ELEGIBLE'
      using hint = 'No existe, no está pendiente, el pedido no es tuyo o ya está cerrado.';
  end if;

  update public.propuestas set estado = 'elegida'   where id = p_propuesta_id;
  update public.propuestas set estado = 'rechazada'
   where pedido_id = v_pedido_id and id <> p_propuesta_id and estado = 'pendiente';
  update public.pedidos    set estado = 'Cerrado'   where id = v_pedido_id;

  -- Si el pedido era recurrente, queda el acuerdo registrado.
  select modalidad, frecuencia_veces, frecuencia_periodo, rubro, usuario_id
    into v_pedido
    from public.pedidos where id = v_pedido_id;

  if v_pedido.modalidad = 'recurrente' then
    insert into public.servicios_fijos (
      pedido_id, propuesta_id, vecino_id, prestador_id, rubro,
      frecuencia_veces, frecuencia_periodo, precio, precio_unidad
    ) values (
      v_pedido_id, p_propuesta_id, v_pedido.usuario_id, v_prestador_id, v_pedido.rubro,
      coalesce(v_pedido.frecuencia_veces, 1),
      coalesce(v_pedido.frecuencia_periodo, 'semana'),
      v_precio, 'visita'
    )
    returning id into v_servicio_id;
  end if;

  return json_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'prestador_id', v_prestador_id,
    'servicio_fijo_id', v_servicio_id
  );
end;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select (select count(*) from public.servicios_fijos)                              as servicios,
       (select count(*) from public.pedidos where modalidad = 'recurrente')       as pedidos_recurrentes,
       (select count(*) from public.pedidos where modalidad = 'puntual')          as pedidos_puntuales;
