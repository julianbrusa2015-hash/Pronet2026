-- ═══════════════════════════════════════════════════════════════════════
-- Publicaciones de prestadores en Servicios · Fase 1 (base de datos)
-- ═══════════════════════════════════════════════════════════════════════
--
-- El prestador arma hasta N publicaciones con foto desde su panel y
-- aparecen en la solapa Servicios de Entre Vecinos, bajo el toggle
-- Vecinos/Prestadores. Plan completo en PLAN-PUBLICACIONES-PRESTADOR.md.
--
-- Decisiones que este esquema materializa:
-- · Tabla APARTE de `publicaciones` (la de vecinos): el ciclo de vida es
--   otro (borrador → pendiente → activa → vence) y el RLS de aquella ya se
--   depuró tres veces — no se le suma complejidad.
-- · Primero se modera, después se ve: nada llega al feed sin pasar por el
--   admin. Mismo orden que los banners, y por la misma razón.
-- · Sin comentarios ni estrellas abiertas. La reputación del prestador es
--   la real (reseñas post-cierre + ranking bayesiano); acá sólo hay 👍.
-- · Las métricas cuentan SOLO al vecino: ni el dueño ni otras cuentas
--   prestador suman (la competencia es el vector de inflado obvio, y el
--   rol es self-service — no hay barrera para crearse una cuenta).
-- · Los cupos por plan viven en `planes_limites` y el límite se garantiza
--   con trigger en la base: el cliente muestra, el servidor manda.

begin;

-- ── 1 · Interruptor del circuito ─────────────────────────────────────
insert into public.config_app (clave, valor)
values ('publicaciones_prestador', 'false')
on conflict (clave) do nothing;

-- La lista blanca de lectura: sin esto el flag queda invisible para el
-- cliente y el circuito apagado para siempre, sin error (ya pasó con los
-- banners). La lista replica la VIGENTE en la base al 2026-08-12 + la nueva.
drop policy if exists config_lectura_publica on public.config_app;
create policy config_lectura_publica on public.config_app
  for select using (clave = any (array[
    'planes_pagos_activos', 'mp_checkout_activo', 'propuesta_expiracion_hs',
    'pedido_vencimiento_hs', 'inactividad_cierre_dias', 'pedido_fotos_max',
    'adjunto_max_mb', 'promarket_activo', 'features_off',
    'banners_pagos_activos',
    'publicaciones_prestador'
  ]));

-- ── 2 · Cupos por plan ───────────────────────────────────────────────
-- pub_slots: publicaciones totales (borradores incluidos — son los cuadros
-- del panel). pub_duracion_dias: vigencia al aprobarse. pub_destacados_mes:
-- reservado para el "Impulsar" de la Fase 6, todavía sin uso.
alter table public.planes_limites
  add column if not exists pub_slots          integer,
  add column if not exists pub_duracion_dias  integer,
  add column if not exists pub_destacados_mes integer;

-- Los planes reales son base / plus / pro (verificado en la base — el
-- bosquejo decía Básico/Profesional/Destacado como ejemplo).
-- `banner` y `promarket_credito` son compras sueltas: quedan en null.
update public.planes_limites set pub_slots = 1, pub_duracion_dias = 7,  pub_destacados_mes = 0 where plan = 'base';
update public.planes_limites set pub_slots = 3, pub_duracion_dias = 15, pub_destacados_mes = 1 where plan = 'plus';
update public.planes_limites set pub_slots = 6, pub_duracion_dias = 30, pub_destacados_mes = 2 where plan = 'pro';

-- ── 3 · La tabla ─────────────────────────────────────────────────────
create table if not exists public.publicaciones_prestador (
  id             uuid primary key default gen_random_uuid(),
  prestador_id   uuid not null references public.prestadores(id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 3 and 80),
  descripcion    text check (descripcion is null or char_length(descripcion) <= 600),
  rubro          text not null,
  foto_url       text,
  -- 'vencida' existe en el check para la renovación futura, pero hoy nadie
  -- la setea: el vencimiento es lógico (vigencia_hasta < now()) y el RLS de
  -- lectura del vecino ya lo filtra. El panel del prestador la muestra como
  -- vencida calculándolo del lado del cliente.
  estado         text not null default 'borrador'
                 check (estado in ('borrador','pendiente','activa','rechazada','vencida')),
  creado         timestamptz not null default now(),
  publicada_desde timestamptz,
  vigencia_hasta timestamptz,
  impulso_hasta  timestamptz,   -- Fase 6; null = sin impulso
  moderado_por   uuid references public.perfiles(id) on delete set null,
  moderado_en    timestamptz,
  motivo_rechazo text
);

create index if not exists pub_prestador_feed_idx
  on public.publicaciones_prestador (rubro, vigencia_hasta)
  where estado = 'activa';
create index if not exists pub_prestador_dueno_idx
  on public.publicaciones_prestador (prestador_id);

alter table public.publicaciones_prestador enable row level security;

-- ── 4 · RLS ──────────────────────────────────────────────────────────
-- "Ser el dueño" = mi perfil apunta a ese prestador. Columnas SIEMPRE
-- calificadas: un nombre inexistente en el subquery se resuelve contra la
-- tabla externa sin error (la columna fantasma que dejó a los prestadores
-- sin feed).

drop policy if exists pub_prestador_leer on public.publicaciones_prestador;
create policy pub_prestador_leer on public.publicaciones_prestador
  for select using (
    -- el vecino: sólo activas y vigentes, de prestadores no suspendidos
    (
      publicaciones_prestador.estado = 'activa'
      and publicaciones_prestador.vigencia_hasta > now()
      and exists (
        select 1 from public.prestadores pr
        where pr.id = publicaciones_prestador.prestador_id
          and (pr.suspendido is null or not pr.suspendido)
      )
    )
    -- el dueño: todo lo suyo
    or exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and pf.prestador_id = publicaciones_prestador.prestador_id
    )
    -- el admin: todo
    or public.es_admin()
  );

drop policy if exists pub_prestador_insertar on public.publicaciones_prestador;
create policy pub_prestador_insertar on public.publicaciones_prestador
  for insert to authenticated
  with check (
    -- sólo el dueño, sólo como borrador o directo a revisión, y nunca
    -- trayendo puesta la vigencia o la moderación
    exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and pf.prestador_id = publicaciones_prestador.prestador_id
    )
    and publicaciones_prestador.estado in ('borrador','pendiente')
    and publicaciones_prestador.publicada_desde is null
    and publicaciones_prestador.vigencia_hasta is null
    and publicaciones_prestador.impulso_hasta is null
    and publicaciones_prestador.moderado_por is null
  );

-- El dueño edita contenido y puede mandar a revisión, pero NO puede
-- autoactivarse: 'activa' sólo la pone el RPC del admin. El USING deja
-- tocar lo no-activo (editar una activa al aire la sacaría de la moderación
-- que ya pasó) — CON UNA EXCEPCIÓN: una activa cuya vigencia ya venció.
-- Esa es la renovación: el prestador la retoca y la re-envía, y como el
-- WITH CHECK sólo permite dejarla en borrador/pendiente, renovarla implica
-- pasar por la moderación de nuevo. Nunca vuelve al aire por su cuenta.
drop policy if exists pub_prestador_editar on public.publicaciones_prestador;
create policy pub_prestador_editar on public.publicaciones_prestador
  for update to authenticated
  using (
    exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and pf.prestador_id = publicaciones_prestador.prestador_id
    )
    and (
      publicaciones_prestador.estado in ('borrador','pendiente','rechazada','vencida')
      or (publicaciones_prestador.estado = 'activa'
          and publicaciones_prestador.vigencia_hasta <= now())
    )
  )
  with check (publicaciones_prestador.estado in ('borrador','pendiente'));

drop policy if exists pub_prestador_borrar on public.publicaciones_prestador;
create policy pub_prestador_borrar on public.publicaciones_prestador
  for delete to authenticated
  using (
    exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and pf.prestador_id = publicaciones_prestador.prestador_id
    )
    or public.es_admin()
  );

-- La trampa del GRANT: el de tabla le gana al REVOKE de columna. Se revoca
-- a nivel tabla y se re-otorga sólo lo que el cliente tiene derecho a
-- escribir. Vigencia, impulso y moderación quedan fuera de su alcance:
-- sólo los tocan los RPCs security definer.
revoke insert, update on public.publicaciones_prestador from anon, authenticated;
grant select on public.publicaciones_prestador to anon, authenticated;
grant insert (prestador_id, titulo, descripcion, rubro, foto_url, estado)
  on public.publicaciones_prestador to authenticated;
grant update (titulo, descripcion, rubro, foto_url, estado)
  on public.publicaciones_prestador to authenticated;
grant delete on public.publicaciones_prestador to authenticated;

-- ── 5 · Límite de slots por plan (trigger, no promesa del cliente) ───
create or replace function public.chequear_limite_pub_prestador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite integer;
  v_usados integer;
begin
  v_plan := plan_de_prestador(new.prestador_id);
  if v_plan is null then v_plan := 'base'; end if;

  select pl.pub_slots into v_limite
    from planes_limites pl where pl.plan = plan_para_limites(v_plan);
  if v_limite is null then return new; end if;  -- sin límite definido

  select count(*) into v_usados
    from publicaciones_prestador p
    where p.prestador_id = new.prestador_id;

  if v_usados >= v_limite then
    raise exception 'limite_publicaciones: tu plan permite % publicaciones', v_limite
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limite_pub_prestador on public.publicaciones_prestador;
create trigger trg_limite_pub_prestador
  before insert on public.publicaciones_prestador
  for each row execute function public.chequear_limite_pub_prestador();

-- ── 6 · Moderación del admin (RPC, con registro y reversión) ─────────
-- La vigencia arranca al APROBAR, no al enviar: el prestador no paga con
-- días de publicación el tiempo que tarde la revisión.
create or replace function public.resolver_pub_prestador(
  p_id uuid, p_aprobar boolean, p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias integer;
  v_plan text;
begin
  if not public.es_admin() then
    raise exception 'solo_admin' using errcode = 'P0001';
  end if;

  if p_aprobar then
    select plan_de_prestador(p.prestador_id) into v_plan
      from publicaciones_prestador p where p.id = p_id;
    select pl.pub_duracion_dias into v_dias
      from planes_limites pl where pl.plan = plan_para_limites(coalesce(v_plan, 'base'));

    update publicaciones_prestador p
      set estado = 'activa',
          publicada_desde = now(),
          vigencia_hasta  = now() + make_interval(days => coalesce(v_dias, 7)),
          moderado_por = auth.uid(),
          moderado_en  = now(),
          motivo_rechazo = null
      where p.id = p_id and p.estado = 'pendiente';
  else
    update publicaciones_prestador p
      set estado = 'rechazada',
          moderado_por = auth.uid(),
          moderado_en  = now(),
          motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
      where p.id = p_id and p.estado = 'pendiente';
  end if;
end;
$$;

grant execute on function public.resolver_pub_prestador(uuid, boolean, text) to authenticated;

-- ── 7 · Likes (👍, lo único social público) ──────────────────────────
create table if not exists public.likes_pub_prestador (
  publicacion_id uuid not null references public.publicaciones_prestador(id) on delete cascade,
  usuario_id     uuid not null references public.perfiles(id) on delete cascade,
  creado         timestamptz not null default now(),
  primary key (publicacion_id, usuario_id)
);

alter table public.likes_pub_prestador enable row level security;

drop policy if exists likes_pp_leer on public.likes_pub_prestador;
create policy likes_pp_leer on public.likes_pub_prestador
  for select using (true);  -- sólo expone (pub, usuario, fecha) para contar

drop policy if exists likes_pp_dar on public.likes_pub_prestador;
create policy likes_pp_dar on public.likes_pub_prestador
  for insert to authenticated
  with check (likes_pub_prestador.usuario_id = auth.uid());

drop policy if exists likes_pp_sacar on public.likes_pub_prestador;
create policy likes_pp_sacar on public.likes_pub_prestador
  for delete to authenticated
  using (likes_pub_prestador.usuario_id = auth.uid());

grant select, insert, delete on public.likes_pub_prestador to authenticated;
grant select on public.likes_pub_prestador to anon;

-- ── 8 · Métricas: sólo el vecino cuenta ──────────────────────────────
-- Vistas y clics de contacto. Sin INSERT directo del cliente (patrón
-- fn_registrar_vista): el RPC valida, filtra y deduplica.
create table if not exists public.pub_prestador_eventos (
  id             bigint generated always as identity primary key,
  publicacion_id uuid not null references public.publicaciones_prestador(id) on delete cascade,
  usuario_id     uuid,               -- null = anónimo (cuenta, no deduplica)
  tipo           text not null check (tipo in ('vista','clic_contacto')),
  fecha          date not null default current_date,
  creado         timestamptz not null default now()
);

-- Un evento por usuario, publicación, tipo y día.
create unique index if not exists pub_prestador_eventos_dedup
  on public.pub_prestador_eventos (publicacion_id, usuario_id, tipo, fecha)
  where usuario_id is not null;
create index if not exists pub_prestador_eventos_pub_idx
  on public.pub_prestador_eventos (publicacion_id, tipo);

alter table public.pub_prestador_eventos enable row level security;

-- El dueño y el admin leen los eventos de sus publicaciones (para las
-- métricas del panel). Nadie más lee; nadie inserta directo.
drop policy if exists pub_eventos_leer on public.pub_prestador_eventos;
create policy pub_eventos_leer on public.pub_prestador_eventos
  for select using (
    exists (
      select 1
      from public.publicaciones_prestador p
      join public.perfiles pf on pf.prestador_id = p.prestador_id
      where p.id = pub_prestador_eventos.publicacion_id
        and pf.id = auth.uid()
    )
    or public.es_admin()
  );

grant select on public.pub_prestador_eventos to authenticated;
revoke insert, update, delete on public.pub_prestador_eventos from anon, authenticated;

create or replace function public.fn_pub_prestador_evento(
  p_pub_id uuid, p_tipo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_tipo not in ('vista','clic_contacto') then return; end if;

  -- La publicación tiene que estar realmente al aire.
  if not exists (
    select 1 from publicaciones_prestador p
    where p.id = p_pub_id and p.estado = 'activa' and p.vigencia_hasta > now()
  ) then return; end if;

  -- Sólo cuenta el vecino. Se excluye a CUALQUIER cuenta prestador, no
  -- sólo al dueño: la competencia es el vector de inflado obvio y el rol es
  -- self-service. Costo asumido: un perfil doble mirando como vecino
  -- tampoco suma — preferimos subcontar a mentirle al prestador con una
  -- conversión inflada, que es el argumento de renovación.
  if v_uid is not null and exists (
    select 1 from perfiles pf
    where pf.id = v_uid and pf.prestador_id is not null
  ) then return; end if;

  insert into pub_prestador_eventos (publicacion_id, usuario_id, tipo)
  values (p_pub_id, v_uid, p_tipo)
  on conflict (publicacion_id, usuario_id, tipo, fecha)
    where usuario_id is not null
  do nothing;
end;
$$;

grant execute on function public.fn_pub_prestador_evento(uuid, text) to anon, authenticated;

commit;
