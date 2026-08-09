-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Puntaje opcional en los comentarios de ProMarket
--
-- Comentar sigue siendo escribir; poner estrellas es opcional. Se eligen
-- desde el mismo campo donde se escribe, así no hay un segundo paso.
--
-- `null` significa "comentó sin puntuar", que NO es lo mismo que cero. Por
-- eso la columna admite null y el check sólo aplica cuando hay valor: si el
-- default fuera 0, un comentario elogioso sin estrellas hundiría cualquier
-- promedio que se calcule más adelante.
--
-- Ojo con ese promedio cuando se quiera mostrar: puntuar es opcional, así
-- que puntúa sobre todo quien está muy conforme o muy disconforme. El
-- promedio sale de una muestra sesgada y conviene mostrar al lado cuántos
-- puntuaron, no sólo el número.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.comentarios_publicaciones
  add column if not exists puntaje smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'comentarios_puntaje_rango'
  ) then
    alter table public.comentarios_publicaciones
      add constraint comentarios_puntaje_rango
      check (puntaje is null or puntaje between 1 and 5);
  end if;
end $$;

comment on column public.comentarios_publicaciones.puntaje is
  'Estrellas 1-5, opcional. null = comentó sin puntuar, que no es cero.';

notify pgrst, 'reload schema';

select count(*) as comentarios,
       count(puntaje) as con_puntaje
  from public.comentarios_publicaciones;
