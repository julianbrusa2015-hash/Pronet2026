-- ═══════════════════════════════════════════════════════════════════════
-- El ranking de propuestas, que hasta hoy no existía
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- ── Qué había ──────────────────────────────────────────────────────────
-- La pantalla del prestador mostraba "🥇 Top 1 por algoritmo" como TEXTO
-- FIJO en el HTML: el id `ep-posicion` no lo escribía nadie, así que todos
-- los prestadores veían Top 1 siempre.
--
-- Y el algoritmo tampoco existía. El orden real en que el vecino veía las
-- propuestas era, en el cliente:
--
--     estado, y después precio ascendente
--
-- Nada de reputación, ni reseñas, ni velocidad de respuesta, ni el sello de
-- verificado. El onboarding le prometía al prestador que "responder rápido
-- y con buen precio te posiciona más arriba" — la mitad del precio era
-- cierta y la de la velocidad no.
--
-- ── Qué hace este archivo ──────────────────────────────────────────────
-- Pone el ranking donde tiene que estar: en el servidor y en un solo lugar.
-- El vecino y el prestador leen la MISMA función, así que es imposible que
-- el puesto que ve uno no sea el que decide lo que ve el otro — que es
-- exactamente el bug que tenía posicion_prestador contra buscar_prestadores.
--
-- ── La fórmula ─────────────────────────────────────────────────────────
--   45%  precio        el más barato del pedido = 1, el más caro = 0
--   35%  reputación    el bayesiano de la búsqueda, llevado a 0..1
--   20%  velocidad     1 hasta los 30 min, 0 a las 24 h
--
-- El precio se normaliza DENTRO del pedido y no contra una escala fija: un
-- destape de cañería y una obra de pintura no comparten rango de precios, y
-- lo único que importa es qué tan caro es cada uno respecto de sus rivales.
--
-- El precio pesa más que la reputación a propósito: es un marketplace de
-- barrio donde la mayoría todavía no tiene reseñas, y si la reputación
-- pesara más, los 20 prestadores sin historial quedarían permanentemente
-- abajo de los 2 que sí tienen. La reputación tiene que poder inclinar la
-- balanza, no decidirla sola.
--
-- "A convenir" (precio null) vale 0.5, el punto medio. No se le puede dar 1
-- —sería premiar al que no se compromete, que es el bug que este archivo
-- viene a arreglar: en JS `null - 8000` da -8000 y esas propuestas salían
-- PRIMERAS— ni 0, porque es una modalidad legítima que la app ofrece.
--
-- La reputación reusa el numerador bayesiano de buscar_prestadores, con el
-- +2.0 de verificado incluido. Es la cuarta copia de esa expresión y hay que
-- mantenerla igual que las otras tres (ver supabase-boost-verificado-
-- ranking.sql, que lleva la cuenta).

-- ── 1 · El ranking completo de un pedido ───────────────────────────────
-- SECURITY DEFINER porque tiene que ver TODAS las propuestas del pedido, y
-- un prestador sólo puede leer la suya. Devuelve puesto y puntaje: nunca el
-- precio ni el nombre de los rivales.
create or replace function public.ranking_propuestas(p_pedido_id uuid)
returns table (propuesta_id uuid, pos int, total int, puntaje numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  -- Sin este guard, cualquiera con un id de pedido podría sacar el ranking
  -- de un pedido ajeno. Lo ven el dueño del pedido, los que propusieron ahí
  -- y el admin — el mismo criterio de visibilidad que ya tienen los pedidos.
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if not (
    exists (select 1 from public.pedidos pe
             where pe.id = p_pedido_id and pe.usuario_id = v_uid)
    or exists (select 1 from public.propuestas pr
                 join public.perfiles pf on pf.prestador_id = pr.prestador_id
                where pr.pedido_id = p_pedido_id and pf.id = v_uid)
    or public.es_admin()
  ) then
    raise exception 'No tenés acceso a las propuestas de este pedido';
  end if;

  return query
  with base as (
    select pr.id, pr.estado, pr.precio, pr.creado, pr.prestador_id,
           pe.creado as pedido_creado
      from public.propuestas pr
      join public.pedidos pe on pe.id = pr.pedido_id
     where pr.pedido_id = p_pedido_id
       and pr.estado is distinct from 'retirada'
  ),
  rango as (
    select min(precio) as pmin, max(precio) as pmax
      from base where precio is not null
  ),
  puntuadas as (
    select b.id, b.estado,
           -- Precio: 1 el más barato del pedido, 0 el más caro.
           case when b.precio is null                       then 0.5
                when r.pmax is null or r.pmax = r.pmin      then 1.0
                else 1.0 - (b.precio - r.pmin) / (r.pmax - r.pmin)
           end as n_precio,
           -- Reputación: el bayesiano llevado al tramo útil. 3.0 es el piso
           -- (cero reseñas) y 5.0 el techo, así que (x-3)/2 lo lleva a 0..1.
           greatest(0, least(1,
             ((coalesce(p.rating, 0) * coalesce(p.resenas, 0) + 15.0
               + case when p.verificado then 2.0 else 0 end)
              / (coalesce(p.resenas, 0) + 5) - 3.0) / 2.0
           )) as n_reputacion,
           -- Velocidad: 1 hasta los 30 min, cae lineal hasta 0 a las 24 h.
           greatest(0, least(1,
             1.0 - (greatest(0, extract(epoch from (b.creado - b.pedido_creado)) / 60.0) - 30.0)
                   / (1440.0 - 30.0)
           )) as n_velocidad
      from base b
      left join public.prestadores p on p.id = b.prestador_id
      cross join rango r
  )
  select q.id,
         rank() over (
           order by case q.estado when 'elegida' then 0
                                  when 'pendiente' then 1
                                  else 2 end,
                    (0.45 * q.n_precio + 0.35 * q.n_reputacion + 0.20 * q.n_velocidad) desc
         )::int,
         count(*) over ()::int,
         round((0.45 * q.n_precio + 0.35 * q.n_reputacion + 0.20 * q.n_velocidad)::numeric, 4)
    from puntuadas q;
end;
$function$;

revoke all on function public.ranking_propuestas(uuid) from public, anon;
grant execute on function public.ranking_propuestas(uuid) to authenticated;

-- ── 2 · Sólo mi puesto ─────────────────────────────────────────────────
-- Lo que necesita la pantalla del prestador. Pasa por la misma función, así
-- que no hay forma de que diverjan.
create or replace function public.posicion_propuesta(p_propuesta_id uuid)
returns table (pos int, total int)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_pedido uuid;
  v_duena  boolean;
begin
  select pr.pedido_id,
         exists (select 1 from public.perfiles pf
                  where pf.id = v_uid and pf.prestador_id = pr.prestador_id)
    into v_pedido, v_duena
    from public.propuestas pr
   where pr.id = p_propuesta_id;

  if v_pedido is null then
    raise exception 'La propuesta no existe';
  end if;
  -- Sólo el dueño de la propuesta ve su propio puesto. El admin también,
  -- para poder responder un reclamo de "por qué salgo último".
  if not (coalesce(v_duena, false) or public.es_admin()) then
    raise exception 'Esa propuesta no es tuya';
  end if;

  return query
  select r.pos, r.total
    from public.ranking_propuestas(v_pedido) r
   where r.propuesta_id = p_propuesta_id;
end;
$function$;

revoke all on function public.posicion_propuesta(uuid) from public, anon;
grant execute on function public.posicion_propuesta(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Que no hayan quedado sobrecargas (una fila por función):
select p.oid::regprocedure as firma
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('ranking_propuestas', 'posicion_propuesta')
 order by 1;

-- 2. El ranking de un pedido que tenga varias propuestas, con los datos que
--    lo explican. Correr como owner desde acá alcanza: es_admin() no aplica
--    porque el guard sólo corre con auth.uid(), que en el SQL Editor es null
--    — por eso este bloque va contra las tablas y no contra la función.
with base as (
  select pr.id, pr.pedido_id, pr.estado, pr.precio, pr.creado,
         pe.creado as pedido_creado, p.rating, p.resenas, p.verificado,
         extract(epoch from (pr.creado - pe.creado)) / 60.0 as mins
    from public.propuestas pr
    join public.pedidos pe on pe.id = pr.pedido_id
    left join public.prestadores p on p.id = pr.prestador_id
   where pr.pedido_id = (
     select pedido_id from public.propuestas
      where estado is distinct from 'retirada'
      group by pedido_id order by count(*) desc limit 1
   )
)
select id, estado, precio, round(mins) as respondio_en_min, rating, resenas, verificado
  from base order by precio nulls last;
-- Con esto a la vista se puede comprobar a mano que el orden que devuelve
-- ranking_propuestas() es el que corresponde.
