-- ═══════════════════════════════════════════════════════════════════════
-- Cupo por lo que está AL AIRE + la renovación pasa a ser paga
-- ═══════════════════════════════════════════════════════════════════════
--
-- Dos cambios que vienen juntos porque se sostienen entre sí.
--
-- ── 1 · El cupo cuenta lo vivo, no el archivo ──
-- El límite contaba todas las filas del prestador, sin mirar el estado. Con
-- Base (1 aviso) un aviso VENCIDO seguía ocupando el lugar: el panel decía
-- "usaste todos los avisos, eliminá uno" y para publicar algo nuevo había
-- que BORRAR el anterior — o sea perder sus métricas y su historial.
-- Lo que el plan limita es cuántos podés tener PUBLICADOS a la vez, que es
-- lo que ocupa lugar en el feed. Un borrador, un rechazado o uno vencido no
-- le sacan espacio a nadie: quedan en el panel, en gris.
--
-- ── 2 · Renovar se paga ──
-- Decisión del usuario (2026-08-12). El plan incluye N avisos publicados por
-- X días; estirar más allá de eso es una compra suelta, igual que el
-- impulso. Por eso la renovación deja de ser un RPC que el cliente llama
-- directo y pasa a activarse desde el webhook de MercadoPago.
--
-- Y por eso se REVOCA el `renovar_pub_prestador` anterior: si quedara
-- ejecutable por `authenticated`, cualquiera renovaría gratis llamándolo
-- desde la consola. La puerta de atrás del cobro.
--
--   impulsar  = más VISIBILIDAD (aparece primero), no cambia el vencimiento
--   renovar   = más TIEMPO (vuelve al aire), no cambia el orden
--
-- Las dos validan lugar libre: revivir un vencido con el cupo lleno dejaría
-- al prestador por encima de su plan.

begin;

-- ── 1 · El trigger cuenta sólo los vivos ─────────────────────────────
create or replace function public.chequear_limite_pub_prestador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   text;
  v_limite integer;
  v_vivos  integer;
begin
  v_plan := plan_de_prestador(new.prestador_id);
  if v_plan is null then v_plan := 'base'; end if;

  select pl.pub_slots into v_limite
    from planes_limites pl where pl.plan = plan_para_limites(v_plan);
  if v_limite is null then return new; end if;

  -- 'vencida' lo pone el cron, pero entre que la vigencia pasa y el job
  -- corre hay hasta una hora en que la fila sigue diciendo 'activa': por eso
  -- se mira TAMBIÉN la fecha y no sólo el estado.
  select count(*) into v_vivos
    from publicaciones_prestador p
   where p.prestador_id = new.prestador_id
     and p.estado = 'activa'
     and p.vigencia_hasta > now();

  if v_vivos >= v_limite then
    raise exception 'limite_publicaciones: tu plan permite % publicados a la vez', v_limite
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── 2 · Precio de la renovación ──────────────────────────────────────
-- Vive en planes_limites como el impulso y el banner: de ahí saca el monto
-- crear-preferencia. No es un plan de prestador — el test de sincronía lo
-- excluye por nombre.
-- OJO: el valor es un PLACEHOLDER. Se ajusta desde la base cuando esté
-- definido el precio real.
insert into public.planes_limites (plan, nombre, precio_mes, precio_anual)
values ('renovacion', 'Renovación de aviso', 1500, 1500)
on conflict (plan) do nothing;

-- ── 3 · Hay lugar para poner uno más al aire? ────────────────────────
-- Se usa desde el cliente (para habilitar el botón), desde crear-preferencia
-- (para no cobrar algo que no se va a poder activar) y desde la activación.
-- Una sola definición para los tres: si estuviera escrita tres veces,
-- alguna se desincroniza.
create or replace function public.hay_lugar_pub_prestador(p_pid uuid, p_excluir uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pl.pub_slots
       from planes_limites pl
      where pl.plan = plan_para_limites(coalesce(plan_de_prestador(p_pid), 'base'))
    ) is null
    or (select count(*)
          from publicaciones_prestador p
         where p.prestador_id = p_pid
           and (p_excluir is null or p.id <> p_excluir)
           and p.estado = 'activa'
           and p.vigencia_hasta > now())
       < (select pl.pub_slots
            from planes_limites pl
           where pl.plan = plan_para_limites(coalesce(plan_de_prestador(p_pid), 'base'))),
    true);
$$;

grant execute on function public.hay_lugar_pub_prestador(uuid, uuid) to authenticated;

-- ── 4 · La renovación gratis deja de existir ─────────────────────────
-- Dejarla ejecutable sería la puerta de atrás del cobro.
revoke execute on function public.renovar_pub_prestador(uuid) from authenticated, anon, public;
drop function if exists public.renovar_pub_prestador(uuid);

-- ── 5 · Activación pagada (la llama el webhook con service_role) ─────
-- Vuelve a validar dueño, estado y lugar aunque crear-preferencia ya lo
-- hizo: esto corre con service_role y es la última puerta antes de darle al
-- prestador algo que pagó. Misma decisión que activar_banner_pagado.
create or replace function public.activar_renovacion_pagada(
  p_pub_id uuid, p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid   uuid;
  v_dias  integer;
  v_filas integer;
begin
  select p.prestador_id into v_pid
    from publicaciones_prestador p
    join perfiles pf on pf.prestador_id = p.prestador_id
   where p.id = p_pub_id and pf.id = p_usuario_id;
  if v_pid is null then
    return jsonb_build_object('ok', false, 'error', 'El aviso no es de quien pagó');
  end if;

  if not public.hay_lugar_pub_prestador(v_pid, p_pub_id) then
    return jsonb_build_object('ok', false, 'error', 'Sin lugar en el plan');
  end if;

  select pl.pub_duracion_dias into v_dias
    from planes_limites pl
   where pl.plan = plan_para_limites(coalesce(plan_de_prestador(v_pid), 'base'));

  update publicaciones_prestador p
     set estado = 'activa',
         publicada_desde = now(),
         vigencia_hasta  = now() + make_interval(days => coalesce(v_dias, 7)),
         aviso_vencimiento_en = null,
         renovaciones = p.renovaciones + 1
   where p.id = p_pub_id
     and p.estado in ('activa','vencida')
     and p.moderado_en is not null;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false, 'error', 'Sólo se renueva un aviso ya publicado');
  end if;
  return jsonb_build_object('ok', true, 'dias', coalesce(v_dias, 7));
end;
$$;

revoke execute on function public.activar_renovacion_pagada(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.activar_renovacion_pagada(uuid, uuid) to service_role;

-- ── 6 · El aviso de vencimiento pasa a ser un momento de venta ───────
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
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select c.usuario_id, null, 'pub_por_vencer',
         'Tu aviso vence en 2 días',
         '«' || left(c.titulo, 60) || '» sale de Servicios. Podés renovarlo para que siga al aire.',
         '#s-pubs-prestador'
    from candidatos c;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.avisar_pubs_por_vencer() from public, anon, authenticated;
grant  execute on function public.avisar_pubs_por_vencer() to service_role;

commit;

notify pgrst, 'reload schema';
