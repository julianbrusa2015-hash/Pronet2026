-- ═══════════════════════════════════════════════════════════════════════
-- Mapa de Entre Vecinos · pines por barrio
-- ═══════════════════════════════════════════════════════════════════════
--
-- El mapa mostraba un pin por ZONA, o sea uno solo para todo Escobar: no
-- contesta "¿dónde hay empanadas?", que es la pregunta que lo originó. Ahora
-- agrupa por barrio, que es la unidad con la que el vecino piensa.
--
-- Estuvo bloqueado hasta el 2026-08-10 porque los 13 barrios de Puertos no
-- tenían lat/lng. Ya están cargadas las 16 (13 de Puertos + 3 de El Cantón),
-- así que el pin cae donde tiene que caer.
--
-- `lugar` = barrio si lo tiene, si no la zona. Las publicaciones viejas no
-- tienen barrio (el campo pasó a ser obligatorio después) y perderlas del
-- mapa sería peor que agruparlas en el pin de su zona.
--
-- `p_barrios` acota igual que el feed: si el vecino está viendo el mercado de
-- su comunidad, el mapa no puede mostrarle pines de otra. Con null muestra
-- todo, que es lo que corresponde cuando amplió a toda la zona.

begin;

create or replace function public.contar_publicaciones_por_barrio(
  p_categoria text     default null,
  p_busqueda  text     default null,
  p_barrios   text[]   default null
)
returns table(lugar text, cantidad bigint)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(p.barrio, p.zona) as lugar, count(*)::bigint as cantidad
    from public.publicaciones p
   where p.activa = true
     and coalesce(p.barrio, p.zona) is not null
     and (p_categoria is null or p_categoria = 'todos' or p.categoria = p_categoria)
     and (
       p_busqueda is null or btrim(p_busqueda) = ''
       or p.titulo      ilike '%' || btrim(p_busqueda) || '%'
       or p.descripcion ilike '%' || btrim(p_busqueda) || '%'
     )
     -- Mismo criterio que listarPublicaciones: las que no declaran barrio
     -- entran en cualquier comunidad, porque son anteriores al campo.
     and (p_barrios is null or p.barrio is null or p.barrio = any(p_barrios))
   group by coalesce(p.barrio, p.zona);
$$;

grant execute on function public.contar_publicaciones_por_barrio(text, text, text[]) to anon, authenticated;

commit;
