-- ═══ PRONET · Sincronizar prestadores.plan con suscripciones ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- PROBLEMA: prestadores.plan y suscripciones.plan eran dos fuentes de verdad
-- independientes. prestadores.plan quedó con 'basico' (id del esquema viejo de
-- 3 planes) para todos, mientras la suscripción real vive en suscripciones.
-- El cliente lee prestadores.plan para el badge de búsqueda y el boost de
-- ranking, así que ambos estaban muertos.
--
-- SOLUCIÓN: prestadores.plan queda como copia denormalizada (el cliente ya la
-- lee en el mismo query, sin joins) y un trigger la mantiene al día.

-- ── 1. Migrar valores del esquema viejo ─────────────────────────────────
alter table public.prestadores drop constraint if exists prestadores_plan_check;

update public.prestadores set plan = 'base'  where plan = 'basico';
update public.prestadores set plan = 'elite' where plan = 'empresa';
update public.prestadores set plan = 'base'  where plan is null;

alter table public.prestadores add constraint prestadores_plan_check
  check (plan = any (array['base'::text, 'plus'::text, 'pro'::text, 'elite'::text]));

-- El DEFAULT también apuntaba al esquema viejo ('basico'). Sin esto, cualquier
-- INSERT que no especifique `plan` nace con un valor que el CHECK de arriba
-- rechaza — y el error aparece recién al crear una ficha nueva, mucho después.
alter table public.prestadores alter column plan set default 'base';

-- ── 2. Backfill desde las suscripciones activas ─────────────────────────
update public.prestadores pr
   set plan = s.plan
  from public.perfiles pf
  join public.suscripciones s on s.usuario_id = pf.id
 where pf.prestador_id = pr.id
   and s.estado = 'activo'
   and (s.vence_en is null or s.vence_en > now());

-- ── 3. Trigger: mantener prestadores.plan en sync ───────────────────────
create or replace function public.sync_plan_prestador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prestador_id uuid;
  v_plan         text;
begin
  select prestador_id into v_prestador_id
    from perfiles where id = new.usuario_id;
  if v_prestador_id is null then return new; end if;

  -- Una suscripción cancelada o vencida degrada a base.
  if new.estado = 'activo' and (new.vence_en is null or new.vence_en > now()) then
    v_plan := new.plan;
  else
    v_plan := 'base';
  end if;

  update prestadores set plan = v_plan where id = v_prestador_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_plan_prestador on public.suscripciones;
create trigger trg_sync_plan_prestador
  after insert or update on public.suscripciones
  for each row execute function public.sync_plan_prestador();

-- ── Verificación ────────────────────────────────────────────────────────
select pr.nombre, pr.plan as plan_prestador, s.plan as plan_suscripcion, s.estado
  from public.prestadores pr
  left join public.perfiles pf on pf.prestador_id = pr.id
  left join public.suscripciones s on s.usuario_id = pf.id
 order by pr.nombre;
