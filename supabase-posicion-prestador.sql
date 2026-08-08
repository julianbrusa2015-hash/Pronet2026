-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · La posición en el ranking se calcula en la base
--
-- La tarjeta "#N en tu rubro" de Mi Perfil se armaba trayendo TODOS los
-- prestadores del rubro y buscando el propio con findIndex(). Con la
-- búsqueda pasada a RPC eso queda con un límite, y un límite acá rompe en
-- silencio: quien quede fuera del corte obtiene findIndex() = -1, la
-- tarjeta no se dibuja y nadie se entera de que faltó.
--
-- rank() lo resuelve del lado del servidor sin traer una sola fila de más,
-- y de paso devuelve el total, que hasta ahora no se mostraba porque
-- calcularlo costaba otra pasada.
--
-- Multirubro: la posición se calcula contra cualquiera de sus rubros, no
-- sólo el principal — mismo criterio que `buscar_prestadores`.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.posicion_prestador(p_prestador_id uuid)
returns table (
  rubro       text,
  zona        text,
  pos_rubro   int,
  total_rubro int,
  pos_zona    int,
  total_zona  int
)
language sql
stable
set search_path to 'public'
as $function$
  with yo as (
    select id, coalesce(rubro,'') as rubro, coalesce(zona,'Escobar') as zona, rubros
      from public.prestadores where id = p_prestador_id
  ),
  -- Empatan por rating y se desempata por cantidad de reseñas: sin el
  -- segundo criterio, todos los que arrancan en 0 comparten el puesto 1 y
  -- el número deja de significar algo.
  en_rubro as (
    select p.id, rank() over (order by p.rating desc nulls last, p.resenas desc nulls last) as pos,
           count(*) over () as total
      from public.prestadores p, yo
     where p.activo = true
       and (yo.rubro = any(p.rubros) or p.rubro = yo.rubro)
  ),
  en_zona as (
    select p.id, rank() over (order by p.rating desc nulls last, p.resenas desc nulls last) as pos,
           count(*) over () as total
      from public.prestadores p, yo
     where p.activo = true and coalesce(p.zona,'Escobar') = yo.zona
  )
  select yo.rubro, yo.zona,
         er.pos::int, er.total::int,
         ez.pos::int, ez.total::int
    from yo
    left join en_rubro er on er.id = yo.id
    left join en_zona  ez on ez.id = yo.id;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select pf.nombre, pp.*
  from public.perfiles pf
  join auth.users u on u.id = pf.id
  cross join lateral public.posicion_prestador(pf.prestador_id) pp
 where u.email in ('prestador_test@pronet.test','julianbrusa2015@gmail.com');
