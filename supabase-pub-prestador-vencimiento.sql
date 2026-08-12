-- ═══════════════════════════════════════════════════════════════════════
-- Publicaciones de prestadores · Fase 5: vencimiento y renovación
-- ═══════════════════════════════════════════════════════════════════════
--
-- El vencimiento ya funcionaba a medias: el RLS del vecino exige
-- `vigencia_hasta > now()`, así que un aviso vencido desaparece del feed
-- solo. Faltaba lo que convierte eso en negocio.
--
-- Tres piezas, calcadas de supabase-aviso-vencimiento.sql (pedidos), que ya
-- resolvió este mismo problema:
--   1. materializar el estado 'vencida' — hoy es sólo lógico, y por eso no
--      se puede consultar "cuántas vencieron sin renovar"
--   2. avisar ANTES (2 días) y al vencer — sin esto la renovación depende de
--      que el prestador entre a mirar de casualidad, y ahí es donde se pierden
--   3. renovar en un toque
--
-- ── La regla de la renovación ──
-- Renovar contenido YA APROBADO no vuelve a moderación: el admin ya dijo
-- que sí sobre esa foto y ese texto, revisarlo de nuevo es hacerle perder
-- el tiempo a los dos. Pero EDITAR sí obliga a revisar, y eso ya está
-- garantizado por el RLS de la Fase 1: el `with check` sólo permite dejar
-- una publicación en borrador o pendiente, así que cualquier edición la
-- saca del aire. Las dos reglas se sostienen solas, sin comparar hashes.

begin;

-- ── 1 · Marca del aviso (para no repetirlo cada hora) ────────────────
alter table public.publicaciones_prestador
  add column if not exists aviso_vencimiento_en timestamptz,
  -- Cuántas veces se renovó. Es la métrica del negocio: una publicación
  -- que se renueva sola es la que justifica el plan.
  add column if not exists renovaciones integer not null default 0;

create index if not exists pub_prestador_vencimiento_idx
  on public.publicaciones_prestador (estado, vigencia_hasta)
  where estado = 'activa';

-- ── 2 · Vencer: pasar 'activa' con vigencia pasada a 'vencida' ───────
create or replace function public.vencer_pubs_prestador()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update publicaciones_prestador p
     set estado = 'vencida'
   where p.estado = 'activa'
     and p.vigencia_hasta < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.vencer_pubs_prestador() from public, anon, authenticated;
grant  execute on function public.vencer_pubs_prestador() to service_role;

-- ── 3 · Aviso 2 días antes, y al vencer ──────────────────────────────
-- Dos días y no uno como en los pedidos: renovar un aviso puede implicar
-- sacar una foto nueva, que no se hace en el momento.
create or replace function public.avisar_pubs_por_vencer()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  with candidatos as (
    select p.id, p.titulo, pf.id as usuario_id
      from publicaciones_prestador p
      join perfiles pf on pf.prestador_id = p.prestador_id
     where p.estado = 'activa'
       and p.aviso_vencimiento_en is null
       and p.vigencia_hasta between now() and now() + interval '2 days'
  ), avisados as (
    update publicaciones_prestador
       set aviso_vencimiento_en = now()
     where id in (select c.id from candidatos c)
    returning id, titulo
  )
  -- Inserción directa y no notificar_usuario(): ese RPC exige una relación
  -- con auth.uid(), y el cron corre sin sesión (misma nota que en pedidos).
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select c.usuario_id, null, 'pub_por_vencer',
         'Tu aviso vence en 2 días',
         '«' || left(c.titulo, 60) || '» sale de Servicios. Renovalo en un toque y sigue al aire.',
         '#s-pubs-prestador'
    from candidatos c;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.avisar_pubs_por_vencer() from public, anon, authenticated;
grant  execute on function public.avisar_pubs_por_vencer() to service_role;

-- ── 4 · Renovar (la llama el prestador desde su panel) ───────────────
create or replace function public.renovar_pub_prestador(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias  integer;
  v_plan  text;
  v_pid   uuid;
  v_filas int;
begin
  -- El dueño y sólo el dueño. Sin este chequeo el uuid alcanzaría para
  -- revivir el aviso de cualquiera.
  select p.prestador_id into v_pid
    from publicaciones_prestador p
    join perfiles pf on pf.prestador_id = p.prestador_id
   where p.id = p_id and pf.id = auth.uid();
  if v_pid is null then
    return jsonb_build_object('ok', false, 'error', 'Ese aviso no es tuyo.');
  end if;

  select pl.pub_duracion_dias into v_dias
    from planes_limites pl
   where pl.plan = plan_para_limites(coalesce(plan_de_prestador(v_pid), 'base'));

  -- Sólo se renueva lo que YA pasó por moderación. Un borrador o un
  -- rechazado no se "renuevan": se envían.
  update publicaciones_prestador p
     set estado = 'activa',
         publicada_desde = now(),
         vigencia_hasta  = now() + make_interval(days => coalesce(v_dias, 7)),
         aviso_vencimiento_en = null,
         renovaciones = p.renovaciones + 1
   where p.id = p_id
     and p.estado in ('activa','vencida')
     and p.moderado_en is not null;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'Sólo se puede renovar un aviso que ya se publicó una vez.');
  end if;
  return jsonb_build_object('ok', true, 'dias', coalesce(v_dias, 7));
end;
$$;

grant execute on function public.renovar_pub_prestador(uuid) to authenticated;

-- ── 5 · Programación ─────────────────────────────────────────────────
-- Se elige un horario que no choque con los jobs de pedidos, que corren en
-- el minuto 07 (vencer) y 17 (avisar).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vencer-pubs-prestador') then
    perform cron.unschedule('vencer-pubs-prestador');
  end if;
  if exists (select 1 from cron.job where jobname = 'avisar-pubs-por-vencer') then
    perform cron.unschedule('avisar-pubs-por-vencer');
  end if;
end $$;

select cron.schedule('vencer-pubs-prestador', '27 * * * *',
  $$select public.vencer_pubs_prestador();$$);
select cron.schedule('avisar-pubs-por-vencer', '37 * * * *',
  $$select public.avisar_pubs_por_vencer();$$);

commit;

notify pgrst, 'reload schema';
