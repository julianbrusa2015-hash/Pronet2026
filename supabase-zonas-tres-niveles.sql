-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Zonas de tres niveles
--
-- Hasta ahora `zonas` era plano con dos niveles: la ciudad (Escobar, Garín)
-- y todo lo demás colgando de ella. Eso alcanzaba mientras "Puertos del
-- Lago" fuera un punto en el mapa, pero no cuando adentro hay 14 barrios y
-- la pregunta es "¿en cuál de ellos hay empanadas?".
--
-- Los tres niveles, y qué hace cada uno:
--
--   1 · Zona       Escobar          Alcance de los PRESTADORES — el plomero
--                                   viaja, su límite es la ciudad.
--   2 · Comunidad  Puertos del Lago LÍMITE DEL MERCADO de Entre Vecinos —
--                                   con quién comprás y vendés.
--   3 · Barrio     Araucarias       UBICACIÓN adentro — el pin del mapa,
--                                   "¿me queda cerca?".
--
-- Cada nivel tiene un trabajo distinto y no se pisan.
--
-- ── Por qué una vista y no una columna `nivel` ─────────────────────────
-- El nivel ya está implícito en `madre`: una columna aparte podría
-- contradecirla y habría que mantenerla sincronizada a mano. La vista lo
-- calcula, así que no puede quedar desfasado.
--
-- El nivel 1 se reconoce porque es madre de sí mismo (Escobar/Escobar), que
-- es como venía modelado desde el principio.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.zonas_arbol as
with recursive arbol as (
  -- Raíces: las que son madre de sí mismas.
  select z.nombre, z.madre, z.orden, z.activo, z.lat, z.lng,
         1                as nivel,
         z.nombre         as zona,
         null::text       as comunidad
    from public.zonas z
   where z.nombre = z.madre

  union all

  select z.nombre, z.madre, z.orden, z.activo, z.lat, z.lng,
         a.nivel + 1,
         a.zona,
         -- La comunidad es el ancestro de nivel 2: para un barrio es su
         -- madre; para la comunidad misma, ella.
         case when a.nivel = 1 then z.nombre else a.comunidad end
    from public.zonas z
    join arbol a on a.nombre = z.madre
   where z.nombre <> z.madre
)
select * from arbol;

comment on view public.zonas_arbol is
  'Zonas con su nivel calculado (1 zona, 2 comunidad, 3 barrio) y sus ancestros. El nivel sale de `madre`, no de una columna que se pueda desincronizar.';

grant select on public.zonas_arbol to anon, authenticated;

-- ── Descendientes de una zona ──────────────────────────────────────────
-- El filtro "mi zona" del prestador tiene que incluir TODO lo que cuelga,
-- sin importar cuántos niveles haya. Antes se resolvía en el cliente
-- mirando un solo salto: al cargar barrios bajo una comunidad, el prestador
-- de "Puertos del Lago" dejaría de ver los pedidos de Araucarias.
create or replace function public.zonas_descendientes(p_zona text)
returns setof text
language sql
stable
set search_path = public
as $$
  with recursive baja as (
    select nombre from zonas where nombre = p_zona
    union all
    select z.nombre from zonas z join baja b on z.madre = b.nombre
     where z.nombre <> z.madre
  )
  select nombre from baja;
$$;

comment on function public.zonas_descendientes(text) is
  'La zona y todo lo que cuelga de ella, a cualquier profundidad. Para filtrar sin perder los niveles de abajo.';

grant execute on function public.zonas_descendientes(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verificación: cómo queda el árbol hoy, antes de cargar los barrios.
select nivel, count(*) as cuantas,
       string_agg(nombre, ', ' order by orden) as nombres
  from public.zonas_arbol
 group by nivel order by nivel;
