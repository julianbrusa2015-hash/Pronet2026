-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Disponibilidad de una publicación de Mercado
--
-- Va junto con el carrito. Hoy nada impide que tres vecinas sumen la misma
-- cartera única y le escriban las tres al vendedor: es la forma más rápida
-- de quedar mal con un comprador desde el día uno.
--
-- ── Por qué `disponible` y no reusar `activa` ──────────────────────────
-- Son dos cosas distintas y conviene poder distinguirlas:
--   · activa      = la publicación se muestra. Apagarla es "la bajé".
--   · disponible  = hay unidades. En false sigue visible pero no se puede
--                   sumar al carrito, y dice "Sin stock".
--
-- Un vendedor que se queda sin stock no quiere borrar la publicación: la
-- quiere de vuelta la semana que viene con las fotos y los comentarios que
-- ya juntó.
--
-- Es un booleano y no una cantidad, a propósito. Llevar unidades exige
-- descontarlas al vender, y en este circuito la venta se cierra por chat:
-- el número quedaría siempre desactualizado y mintiendo. Un "hay / no hay"
-- que el vendedor toca a mano es un dato que sí puede sostener.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.publicaciones
  add column if not exists disponible boolean not null default true;

comment on column public.publicaciones.disponible is
  'Hay stock. En false la publicación sigue visible pero no se puede sumar al carrito. Distinto de `activa`, que es si se muestra.';

-- El feed pide activas; el carrito, además, disponibles.
create index if not exists idx_publicaciones_disponible
  on public.publicaciones (disponible) where activa;

notify pgrst, 'reload schema';

select count(*) filter (where disponible) as disponibles,
       count(*)                           as total
  from public.publicaciones;
