-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Un prestador puede tener varios rubros
--
-- Hasta ahora prestadores.rubro era un text único. Un electricista que
-- además hace plomería sólo podía declarar uno, así que:
--   · sólo recibía el push de un rubro (notificar_rubro),
--   · sólo aparecía cuando el vecino filtraba por ese rubro,
--   · figuraba en un solo ranking.
--
-- IMPORTANTE — el rubro nunca limitó lo que el prestador VE: el feed
-- muestra todos los pedidos de su zona y "Mi rubro" es un chip opcional.
-- El rubro define cómo lo ENCUENTRAN. Eso no cambia acá.
--
-- COMPATIBILIDAD: se agrega `rubros text[]` y se conserva `rubro` como el
-- principal. Todo el código que hoy lee `rubro` (ficha, badge, ranking)
-- sigue funcionando sin tocarse; lo que pasa a mirar el array es el
-- MATCHING (notificaciones y búsqueda). Un trigger mantiene
-- rubro = rubros[1] para que no puedan divergir.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.prestadores
  add column if not exists rubros text[] not null default '{}';

-- Backfill. 'General' es el defecto de handle_new_user y no matchea ningún
-- pedido real: se deja el array VACÍO para poder distinguir "todavía no
-- eligió" de "eligió General", y pedirle que complete.
update public.prestadores
   set rubros = case
     when rubro is null or btrim(rubro) = '' or rubro ~* '^general$' then '{}'::text[]
     else array[rubro]
   end
 where rubros = '{}';

-- Búsqueda por rubro sobre array: GIN, que es el índice de contención.
create index if not exists idx_prestadores_rubros on public.prestadores using gin (rubros);

-- ── Sincronía rubro ⇄ rubros ────────────────────────────────────────────
-- El principal es siempre el primero del array. Sin esto, editar los
-- rubros dejaría `rubro` viejo y la ficha mostraría un dato distinto al
-- que usa el matching.
create or replace function public.sync_rubro_principal()
returns trigger
language plpgsql
as $function$
begin
  if new.rubros is not null and array_length(new.rubros, 1) > 0 then
    new.rubro := new.rubros[1];
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_rubro_principal on public.prestadores;
create trigger trg_sync_rubro_principal
  before insert or update of rubros on public.prestadores
  for each row execute function public.sync_rubro_principal();

-- ── notificar_rubro: pasa a mirar el array ──────────────────────────────
-- Antes: pr.rubro = p_rubro  → un prestador multirubro perdía los avisos
-- de todos sus rubros salvo el principal.
create or replace function public.notificar_rubro(
  p_rubro text, p_tipo text, p_titulo text,
  p_cuerpo text default null, p_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  if not exists (
    select 1 from pedidos
     where usuario_id = v_uid and rubro = p_rubro
       and creado > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin pedido reciente en ese rubro');
  end if;

  with destinatarios as (
    select pf.id
      from perfiles pf
      join prestadores pr on pr.id = pf.prestador_id
     where pr.activo = true
       and pf.id <> v_uid
       -- Coincide por cualquiera de sus rubros. Se conserva el match
       -- contra `rubro` para los que todavía no tengan el array cargado.
       and (p_rubro = any(pr.rubros) or pr.rubro = p_rubro)
  )
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select d.id, v_uid, coalesce(p_tipo, 'general'),
         left(p_titulo, 120), left(p_cuerpo, 300), p_url
    from destinatarios d;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'enviadas', v_n);
end;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select rubro, rubros, array_length(rubros,1) as n
  from public.prestadores order by rubro limit 12;
