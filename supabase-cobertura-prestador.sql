-- ═══════════════════════════════════════════════════════════════════════
-- Cobertura del prestador · varias zonas, no una
-- ═══════════════════════════════════════════════════════════════════════
--
-- El campo "Zona de cobertura" de Editar perfil no guardaba nada:
--   1. El texto era fijo en el HTML ("Escobar · Radio 8 km"), nunca se
--      rellenaba con el valor real.
--   2. El botón "Cambiar" abría el modal del FILTRO DE NAVEGACIÓN, que
--      escribe en localStorage.
--   3. El guardado del perfil no incluía `zona` ni `radio_cobertura`.
-- Por eso `radio_cobertura` estaba en null en los 20 prestadores.
--
-- Y había un problema de fondo más grande: el feed de pedidos del prestador
-- se armaba con `zonaActual` —la zona que está MIRANDO, del dispositivo— y no
-- con una cobertura suya. O sea que la cobertura no existía como concepto.
--
-- Ahora el prestador declara EN QUÉ ZONAS TRABAJA y eso decide qué pedidos ve
-- y dónde lo encuentran. Mismo patrón que `rubros`: un array con un trigger
-- que mantiene sincronizada la columna singular.

begin;

-- ── 1 · La cobertura ─────────────────────────────────────────────────
alter table public.prestadores
  add column if not exists zonas text[] not null default '{}';

comment on column public.prestadores.zonas is
  'Zonas donde trabaja. `zona` queda como la principal, sincronizada por trigger.';

-- Los que ya existen cubren la zona que tenían.
update public.prestadores
   set zonas = array[zona]
 where coalesce(array_length(zonas, 1), 0) = 0
   and zona is not null and btrim(zona) <> '';

-- ── 2 · Sincronía entre `zonas` y `zona` ─────────────────────────────
-- Bidireccional a propósito, y ahí se diferencia de sync_rubro_principal:
-- `asegurar_ficha_prestador()` inserta con `zona` y sin `zonas`, así que sin
-- la segunda rama toda ficha nueva nacería con la cobertura vacía y su dueño
-- no vería ningún pedido.
create or replace function public.sync_zona_principal()
returns trigger language plpgsql as $$
begin
  if new.zonas is not null and array_length(new.zonas, 1) > 0 then
    new.zona := new.zonas[1];
  elsif new.zona is not null and btrim(new.zona) <> '' then
    new.zonas := array[new.zona];
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_zona_principal on public.prestadores;
create trigger trg_sync_zona_principal
  before insert or update on public.prestadores
  for each row execute function public.sync_zona_principal();

-- ── 3 · Los ancestros de una zona ────────────────────────────────────
-- Un prestador que cubre "Puertos del Lago" tiene que aparecer cuando el
-- vecino filtra por "Araucarias", que es un barrio de esa comunidad. La vista
-- `zonas_arbol` ya trae resueltos los dos ancestros de cada zona, así que no
-- hace falta recursión: para Araucarias devuelve
-- {Araucarias, Puertos del Lago, Escobar}.
create or replace function public.zonas_ancestros(p_zona text)
returns text[] language sql stable as $$
  select array_remove(array[z.nombre, z.comunidad, z.zona], null)
    from public.zonas_arbol z
   where z.nombre = p_zona
   limit 1;
$$;

grant execute on function public.zonas_ancestros(text) to anon, authenticated;

-- ── 4 · La búsqueda respeta la cobertura ─────────────────────────────
-- Misma firma que la versión anterior: si cambiara, quedarían dos funciones
-- conviviendo y PostgREST no podría elegir — ver
-- supabase-chequeo-overloads.sql.
create or replace function public.buscar_prestadores(
  p_zona     text    default null,
  p_rubro    text    default null,
  p_premium  boolean default null,
  p_texto    text    default null,
  p_limite   int     default 100
) returns setof public.prestadores
language sql
stable
security definer
as $$
  select p.*
    from public.prestadores p
   where p.activo = true
     and (
       p_zona is null
       -- Cubre la zona buscada o cualquiera de sus ancestros: quien trabaja
       -- en toda la comunidad aparece al filtrar por uno de sus barrios.
       or p.zonas && coalesce(public.zonas_ancestros(p_zona), array[p_zona])
       -- Respaldo para fichas sin cobertura cargada.
       or (coalesce(array_length(p.zonas, 1), 0) = 0 and p.zona = p_zona)
     )
     and (p_premium is null or p.premium = p_premium)
     and (p_rubro is null or p_rubro = any(p.rubros) or p.rubro = p_rubro)
     and (
       p_texto is null or btrim(p_texto) = ''
       or lower(public.sin_acentos(
            coalesce(p.nombre,'') || ' ' || coalesce(p.rubro,'') || ' ' || coalesce(p.subrubro,'')
          )) like '%' || lower(public.sin_acentos(btrim(p_texto))) || '%'
     )
   order by
     (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0) / (coalesce(p.resenas,0) + 5) desc
   limit greatest(1, least(coalesce(p_limite, 100), 200));
$$;

-- ── 5 · Los pedidos que le corresponden ──────────────────────────────
-- Las zonas concretas cuyos pedidos entran en la cobertura: cada zona
-- cubierta más TODAS sus descendientes. Quien cubre "Puertos del Lago" recibe
-- los pedidos de Araucarias, Acacias y los demás barrios.
--
-- Es el espejo de zonas_ancestros: allá se sube (para que lo encuentren),
-- acá se baja (para que le lleguen).
create or replace function public.zonas_cubiertas(p_zonas text[])
returns text[] language sql stable as $$
  select coalesce(array_agg(distinct z.nombre), '{}')
    from public.zonas_arbol z
   where p_zonas && array_remove(array[z.nombre, z.comunidad, z.zona], null);
$$;

grant execute on function public.zonas_cubiertas(text[]) to anon, authenticated;

/** La cobertura efectiva del prestador que llama, ya expandida.
 *
 *  Se resuelve en el servidor y no en el cliente para que el feed y el push
 *  usen exactamente el mismo criterio. Antes el feed salía de `zonaActual`
 *  (la zona que el prestador estaba MIRANDO, guardada en el dispositivo), así
 *  que cambiar el filtro de navegación le cambiaba los pedidos que recibía. */
create or replace function public.mi_cobertura()
returns text[] language sql stable security definer set search_path = public as $$
  select public.zonas_cubiertas(
    coalesce(
      nullif(pr.zonas, '{}'),
      array_remove(array[pr.zona], null)
    )
  )
    from public.perfiles pf
    join public.prestadores pr on pr.id = pf.prestador_id
   where pf.id = auth.uid();
$$;

revoke all on function public.mi_cobertura() from public, anon;
grant execute on function public.mi_cobertura() to authenticated;

-- ── 6 · El push también respeta la cobertura ─────────────────────────
-- Antes avisaba a TODOS los prestadores del rubro, estuvieran donde
-- estuvieran: un plomero de Garín recibía el pedido de Puertos. Ahora se
-- acota a quienes lo cubren.
--
-- La zona sale del propio pedido y no de un parámetro: el que llama ya tuvo
-- que probar que publicó ese pedido, así que agregar un parámetro sería darle
-- una perilla para elegir a quién notificar.
create or replace function public.notificar_rubro(
  p_rubro text, p_tipo text, p_titulo text,
  p_cuerpo text default null, p_url text default null
) returns jsonb
language plpgsql security definer set search_path = 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_zona text;
  v_n    int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  select zona into v_zona
    from pedidos
   where usuario_id = v_uid and rubro = p_rubro
     and creado > now() - interval '1 hour'
   order by creado desc
   limit 1;

  if not found then
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
       -- Y por cobertura. Si el pedido no dice zona no se filtra: perder un
       -- aviso es peor que mandar uno de más.
       and (
         v_zona is null
         or pr.zonas && coalesce(public.zonas_ancestros(v_zona), array[v_zona])
         or (coalesce(array_length(pr.zonas, 1), 0) = 0 and pr.zona = v_zona)
       )
  )
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select d.id, v_uid, coalesce(p_tipo, 'general'),
         left(p_titulo, 120), left(p_cuerpo, 300), p_url
    from destinatarios d;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'enviadas', v_n);
end;
$$;

commit;
