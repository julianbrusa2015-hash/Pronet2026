-- ═══════════════════════════════════════════════════════════════════════
-- Pre-alta de prestadores · captar en la calle sin crear una cuenta
-- ═══════════════════════════════════════════════════════════════════════
--
-- El problema: el alta pide email + contraseña + confirmar el mail. Un
-- pintor parado en una cola no abre el mail para confirmar — ahí se pierde,
-- no en escribir el nombre. Esto separa capturar el dato (30 segundos, en la
-- calle) de crear la cuenta (después, tranquilo).
--
-- Tabla aparte y no una fila en `prestadores` con activo=false: `prestadores`
-- es de LECTURA PÚBLICA y acá hay teléfono y eventualmente DNI. Meterlo ahí
-- sería la misma clase de fuga que el lote (ver lote_seguridad_server_side).
--
-- La ficha NO se muestra en el feed hasta que la persona reclama su cuenta:
-- un prestador que aparece, alguien lo contacta y nunca contesta es peor que
-- no tenerlo.

begin;

-- ── 1 · Código de referido ───────────────────────────────────────────
-- Corto y tipeable a mano: el QR es el camino normal, pero si la cámara no
-- engancha tiene que poder dictarse por teléfono.
create table if not exists public.codigos_referido (
  codigo     text primary key,
  usuario_id uuid not null unique references public.perfiles(id) on delete cascade,
  creado     timestamptz not null default now()
);

alter table public.codigos_referido enable row level security;

-- Lectura pública del código: el formulario de pre-alta lo consulta sin
-- sesión para saber a quién atribuir. No expone nada — es un uuid y un
-- string aleatorio, y para escribir hay que pasar por el RPC.
drop policy if exists codigos_referido_lectura on public.codigos_referido;
create policy codigos_referido_lectura on public.codigos_referido
  for select using (true);

/** Devuelve el código del usuario actual, creándolo la primera vez. */
create or replace function public.mi_codigo_referido()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_codigo text;
  v_intento int := 0;
begin
  if v_uid is null then return null; end if;

  select codigo into v_codigo from public.codigos_referido where usuario_id = v_uid;
  if v_codigo is not null then return v_codigo; end if;

  -- Sin I, O, 0 ni 1: se confunden al dictarlos por teléfono.
  loop
    v_intento := v_intento + 1;
    v_codigo := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               (random() * 31)::int + 1, 1), '')
        from generate_series(1, 6)
    );
    begin
      insert into public.codigos_referido (codigo, usuario_id) values (v_codigo, v_uid);
      return v_codigo;
    exception when unique_violation then
      -- Puede chocar el código o la fila del usuario (dos pestañas a la vez).
      select codigo into v_codigo from public.codigos_referido where usuario_id = v_uid;
      if v_codigo is not null then return v_codigo; end if;
      if v_intento >= 10 then raise; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.mi_codigo_referido() from public, anon;
grant execute on function public.mi_codigo_referido() to authenticated;

-- ── 2 · Las pre-altas ────────────────────────────────────────────────
create table if not exists public.prealtas_prestador (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  telefono      text not null,
  rubros        text[] not null default '{}',
  zona          text,
  barrio        text,
  dni           text,
  referido_por  uuid references public.perfiles(id) on delete set null,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','reclamada','descartada')),
  prestador_id  uuid references public.prestadores(id) on delete set null,
  creado        timestamptz not null default now(),
  reclamado_en  timestamptz
);

-- Mismo criterio que perfiles.telefono: últimos 10 dígitos. Evita que dos
-- vecinos carguen al mismo pintor y queden dos leads del mismo tipo.
create unique index if not exists idx_prealta_telefono_pendiente
    on public.prealtas_prestador (right(regexp_replace(telefono, '\D', '', 'g'), 10))
 where estado = 'pendiente';

create index if not exists idx_prealta_referido on public.prealtas_prestador (referido_por, creado desc);

alter table public.prealtas_prestador enable row level security;

-- Nadie escribe directo: sólo el RPC (SECURITY DEFINER). Y se lee sólo lo
-- propio — un lead tiene teléfono, no puede ser de lectura pública.
drop policy if exists prealta_select_propias on public.prealtas_prestador;
create policy prealta_select_propias on public.prealtas_prestador
  for select using (referido_por = auth.uid() or public.es_admin());

-- ── 3 · Alta desde el formulario público ─────────────────────────────
-- Callable sin sesión: el que carga es el pintor con el QR del vecino, y no
-- tiene cuenta todavía. Por eso exige un código de referido válido — sin
-- eso sería un endpoint abierto para llenar la tabla de basura.
create or replace function public.crear_prealta(
  p_codigo   text,
  p_nombre   text,
  p_telefono text,
  p_rubros   text[] default '{}',
  p_zona     text default null,
  p_barrio   text default null,
  p_dni      text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_referido uuid;
  v_tel      text := right(regexp_replace(coalesce(p_telefono,''), '\D', '', 'g'), 10);
  v_id       uuid;
  v_recientes int;
begin
  if btrim(coalesce(p_nombre,'')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre');
  end if;
  if length(v_tel) < 8 then
    return jsonb_build_object('ok', false, 'error', 'El teléfono no parece válido');
  end if;

  select usuario_id into v_referido from public.codigos_referido
   where codigo = upper(btrim(coalesce(p_codigo,'')));
  if v_referido is null then
    return jsonb_build_object('ok', false, 'error', 'El código de invitación no es válido');
  end if;

  -- Tope por invitador: es un endpoint público, y sin esto un código filtrado
  -- alcanza para llenar la tabla.
  select count(*) into v_recientes from public.prealtas_prestador
   where referido_por = v_referido and creado > now() - interval '1 day';
  if v_recientes >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Ese código ya se usó muchas veces hoy. Probá mañana.');
  end if;

  -- Si ya hay una cuenta con ese teléfono, la pre-alta no tiene sentido.
  if exists (
    select 1 from public.perfiles
     where right(regexp_replace(coalesce(telefono,''), '\D', '', 'g'), 10) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese teléfono ya tiene una cuenta en PRONET', 'codigo', 'ya_tiene_cuenta');
  end if;

  insert into public.prealtas_prestador (nombre, telefono, rubros, zona, barrio, dni, referido_por)
  values (btrim(p_nombre), btrim(p_telefono), coalesce(p_rubros,'{}'), p_zona, p_barrio,
          nullif(btrim(coalesce(p_dni,'')), ''), v_referido)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'Ya hay una pre-alta pendiente con ese teléfono', 'codigo', 'ya_anotado');
end;
$$;

grant execute on function public.crear_prealta(text,text,text,text[],text,text,text) to anon, authenticated;

-- ── 4 · A quién invitó cada uno ──────────────────────────────────────
create or replace function public.mis_prealtas()
returns setof public.prealtas_prestador
language sql stable security definer set search_path = public as $$
  select * from public.prealtas_prestador
   where referido_por = auth.uid() or public.es_admin()
   order by creado desc;
$$;

revoke all on function public.mis_prealtas() from public, anon;
grant execute on function public.mis_prealtas() to authenticated;

commit;
