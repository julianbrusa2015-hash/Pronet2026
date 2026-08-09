-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Cuántos recomiendan cada publicación de ProMarket
--
-- Se muestra la CANTIDAD que recomienda, no un promedio. El motivo es el
-- volumen: una publicación de barrio va a tener 1, 2 o 3 puntajes durante
-- mucho tiempo, y un promedio con un voto no es un promedio — es un voto
-- disfrazado de estadística. Es lo mismo que se sacó de los prestadores el
-- 2026-08-09: el "5.0" que no significaba nada.
--
-- Y como puntuar es opcional, el que se toma el trabajo de puntuar la torta
-- de una vecina casi siempre está conforme: los promedios se apilan todos
-- entre 4.5 y 5. Un número donde todos sacan lo mismo no ayuda a elegir; la
-- cantidad sí (12 recomendaciones contra 1 se entiende de una).
--
-- El promedio se calcula igual, pero la UI lo muestra recién a partir de 5
-- puntajes. Antes de eso confunde más de lo que aporta.
--
-- `recomiendan` cuenta 4 y 5 estrellas. Es a propósito que no muestre lo
-- negativo: quien tuvo un problema lo escribe, y ese comentario se lee
-- igual en la lista, que es donde tiene contexto.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.publicaciones_recomendaciones as
select publicacion_id,
       count(*) filter (where puntaje >= 4)      as recomiendan,
       count(*)                                  as puntajes,
       round(avg(puntaje)::numeric, 1)           as promedio
  from public.comentarios_publicaciones
 where puntaje is not null
 group by publicacion_id;

comment on view public.publicaciones_recomendaciones is
  'Agregado de puntajes por publicación. La UI muestra `recomiendan` siempre y `promedio` sólo con 5+ puntajes.';

grant select on public.publicaciones_recomendaciones to anon, authenticated;

notify pgrst, 'reload schema';

select count(*) as publicaciones_con_puntaje from public.publicaciones_recomendaciones;
