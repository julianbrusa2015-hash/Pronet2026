-- ═══════════════════════════════════════════════════════════════════════
-- La posición que ve el prestador tiene que ser la posición que tiene
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23. Detectado dando de alta un prestador nuevo: el tablero le
-- decía "#2 en tu rubro" sin haber hecho un solo trabajo.
--
-- ── El problema ────────────────────────────────────────────────────────
-- Había DOS ranking distintos conviviendo:
--
--   buscar_prestadores    → (rating*reseñas + 15 + boost) / (reseñas + 5)
--   posicion_prestador    → rating desc, reseñas desc
--
-- El primero es el bayesiano, el que decide de verdad en qué orden aparece
-- la gente en la búsqueda. El segundo era el que se le mostraba al
-- prestador en su propio tablero. O sea que el número no describía nada
-- real: podía decirte #2 mientras la búsqueda te ponía último.
--
-- Y el rating arranca en 5.0 por default. Con eso, el orden crudo empataba
-- a 20 de los 22 prestadores en el puesto más alto —todos "perfectos", con
-- cero reseñas— y el desempate por cantidad de reseñas decidía todo. Un
-- prestador recién creado entraba directo al podio.
--
-- Con la fórmula bayesiana eso no pasa: las 15 unidades del numerador son
-- reseñas imaginarias de 3 estrellas, así que quien no tiene ninguna vale
-- 15/5 = 3.0 y no 5.0. El rating alto sólo empuja cuando hay reseñas que lo
-- sostengan, que es exactamente para lo que existe la fórmula.
--
-- ── Lo que se copia y por qué literal ──────────────────────────────────
-- El numerador de verificado (+2.0) también se copia: si la búsqueda lo
-- aplica y el tablero no, vuelven a ser dos rankings. La regla es que esta
-- expresión existe en tres lugares y los tres tienen que decir lo mismo
-- (búsqueda, cobertura y acá) — está anotado en
-- supabase-boost-verificado-ranking.sql.
--
-- MISMA firma y mismas columnas de retorno a propósito: un create or
-- replace con otra firma no reemplaza, crea una sobrecarga, y PostgREST
-- deja de poder elegir entre las dos. Ya rompió producción una vez.

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
  en_rubro as (
    select p.id,
           rank() over (
             order by (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0
                       + case when p.verificado then 2.0 else 0 end)
                      / (coalesce(p.resenas,0) + 5) desc
           ) as pos,
           count(*) over () as total
      from public.prestadores p, yo
     where p.activo = true
       and (yo.rubro = any(p.rubros) or p.rubro = yo.rubro)
  ),
  en_zona as (
    select p.id,
           rank() over (
             order by (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0
                       + case when p.verificado then 2.0 else 0 end)
                      / (coalesce(p.resenas,0) + 5) desc
           ) as pos,
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

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Que no haya quedado una sobrecarga: tiene que devolver UNA fila.
select p.oid::regprocedure as firma
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'posicion_prestador';

-- 2. Que el tablero y la búsqueda ordenen igual. Las dos columnas de
--    posición tienen que coincidir para todos:
with ranking_busqueda as (
  select id, nombre, rating, resenas,
         rank() over (
           order by (coalesce(rating,0) * coalesce(resenas,0) + 15.0
                     + case when verificado then 2.0 else 0 end)
                    / (coalesce(resenas,0) + 5) desc
         ) as pos_real
    from public.prestadores
   where activo = true and coalesce(zona,'Escobar') = 'Escobar'
)
select rb.nombre, rb.rating, rb.resenas, rb.pos_real,
       (public.posicion_prestador(rb.id)).pos_zona as pos_tablero
  from ranking_busqueda rb
 order by rb.pos_real;
-- pos_real = pos_tablero en todas las filas.
-- Y los que tienen 0 reseñas quedan ABAJO de los que tienen reseñas
-- buenas, en vez de empatados en el puesto 1 con rating 5.0.
