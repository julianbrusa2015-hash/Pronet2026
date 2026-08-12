-- ═══════════════════════════════════════════════════════════════════════
-- Resumen de búsqueda por barrio: cuántos VECINOS, no cuántas publicaciones
-- ═══════════════════════════════════════════════════════════════════════
--
-- El feed te da una lista; no te dice cuántos hay ni dónde están. La
-- pregunta real del vecino es "busco pizza: ¿cuántos la hacen y en qué
-- barrios?".
--
-- `contar_publicaciones_por_barrio` ya contaba publicaciones por lugar, que
-- es lo que necesita el mapa. Para el resumen hace falta además el número de
-- PERSONAS: decir "3 vecinos" cuando son 3 publicaciones de la misma persona
-- sería inflar el mercado, que es justo la impresión que no queremos dar en
-- un marketplace que arranca.
--
-- ── Por qué un DROP y no un CREATE OR REPLACE ──
-- Cambia el tipo de retorno (se agrega una columna), y eso `create or
-- replace` no lo permite. Se dropea la firma EXACTA de cuatro parámetros y
-- se recrea con la misma: si se creara con otra firma quedarían dos
-- funciones conviviendo y PostgREST no podría elegir — el error "Could not
-- choose the best candidate function" que ya dejó a los prestadores sin feed
-- una vez (ver supabase-chequeo-overloads.sql).

begin;

drop function if exists public.contar_publicaciones_por_barrio(text, text, text[], text);

create or replace function public.contar_publicaciones_por_barrio(
  p_categoria text     default null,
  p_busqueda  text     default null,
  p_barrios   text[]   default null,
  p_zona      text     default null
)
returns table(lugar text, cantidad bigint, vecinos bigint)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(p.barrio, p.zona)              as lugar,
         count(*)::bigint                        as cantidad,
         count(distinct p.autor_id)::bigint    as vecinos
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
     and (p_zona is null or p.zona = p_zona)
   group by coalesce(p.barrio, p.zona);
$$;

grant execute on function public.contar_publicaciones_por_barrio(text, text, text[], text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificación: una sola función con ese nombre, y que devuelva las 3 columnas.
select (select count(*) from pg_proc where proname = 'contar_publicaciones_por_barrio') as cuantas_funciones;
select * from public.contar_publicaciones_por_barrio(null, null, null, null);
