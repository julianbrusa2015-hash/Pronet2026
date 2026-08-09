-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Sacar las reseñas inventadas de las fichas de demo
--
-- Siete fichas sembradas mostraban 112, 74, 67, 56, 43, 38 y 31 reseñas con
-- ratings de 4.7 a 4.9, sin una sola reseña real detrás. Eso es prueba
-- social inventada mostrada a vecinos de verdad: alguien elige a quién
-- dejar entrar a su casa mirando ese número.
--
-- Los dos prestadores con reseñas REALES (Prestador Puertos 5/4.40 y
-- servicios_001 1/5.00) ya tenían sus columnas exactas, así que el
-- mecanismo que las mantiene funciona: no hay nada que arreglar ahí, y esta
-- corrección no los toca.
--
-- El criterio es objetivo y no una lista de nombres: cualquier ficha que
-- muestre reseñas sin tener filas en `resenas`. Así también limpia las que
-- se hayan sembrado después.
--
-- `rating = default` en vez de un número a mano: deja las fichas igual que
-- cualquier prestador nuevo sin reseñas, que es exactamente lo que son.
-- ═══════════════════════════════════════════════════════════════════════

begin;

update public.prestadores p
   set resenas = 0,
       rating  = default
 where p.resenas > 0
   and not exists (select 1 from public.resenas r where r.prestador_id = p.id);

commit;

-- Verificación: ninguna ficha debería mostrar reseñas que no existen, y las
-- reales tienen que haber quedado intactas.
select p.nombre, p.rating, p.resenas,
       (select count(*) from public.resenas r where r.prestador_id = p.id) as reales
  from public.prestadores p
 where p.resenas > 0
    or exists (select 1 from public.resenas r where r.prestador_id = p.id)
 order by p.resenas desc;
