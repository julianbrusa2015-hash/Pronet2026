-- ═══════════════════════════════════════════════════════════════════════
-- Resumen por barrio: cuántos VECINOS, y acotado a la sección activa
-- ═══════════════════════════════════════════════════════════════════════
--
-- Dos cosas, y la segunda apareció recién al verificar en vivo.
--
-- ── 1 · Vecinos, no publicaciones ──
-- El feed te da una lista; no dice cuántos hay ni dónde. La pregunta real es
-- "busco pizza: ¿cuántos la hacen y en qué barrios?". Y tiene que contar
-- PERSONAS: decir "2 vecinos" cuando son 2 avisos de la misma persona infla
-- el mercado, que es justo la impresión que no queremos dar arrancando.
-- Medido en la base: Araucarias tiene 2 publicaciones y 1 solo vecino.
--
-- ── 2 · La sección importa ──
-- La función no distinguía servicios de productos, pero el feed sí: el tab
-- Servicios pide `categorias = slugsDeTipo('servicio')`. Resultado, visto en
-- vivo: el resumen prometía "Araucarias (2)", se tocaba, y el feed mostraba
-- CERO — esas dos eran productos. El mapa ya tenía el mismo desfasaje desde
-- antes; los pines contaban de más y nadie lo había notado porque el número
-- no era tocable.
--
-- ── Por qué DROP y no CREATE OR REPLACE ──
-- Cambian el tipo de retorno y la firma. Se dropea la anterior EXACTA y se
-- crea la nueva: dos versiones conviviendo rompen PostgREST con "Could not
-- choose the best candidate function", que ya dejó a los prestadores sin
-- feed una vez (ver supabase-chequeo-overloads.sql).

begin;

drop function if exists public.contar_publicaciones_por_barrio(text, text, text[], text);
drop function if exists public.contar_publicaciones_por_barrio(text, text, text[], text, text[]);

create function public.contar_publicaciones_por_barrio(
  p_categoria  text     default null,
  p_busqueda   text     default null,
  p_barrios    text[]   default null,
  p_zona       text     default null,
  p_categorias text[]   default null
)
returns table(lugar text, cantidad bigint, vecinos bigint)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(p.barrio, p.zona)           as lugar,
         count(*)::bigint                     as cantidad,
         count(distinct p.autor_id)::bigint   as vecinos
    from public.publicaciones p
   where p.activa = true
     and coalesce(p.barrio, p.zona) is not null
     and (p_categoria is null or p_categoria = 'todos' or p.categoria = p_categoria)
     -- Acota a la sección activa (servicios o productos). Sin esto el conteo
     -- no coincide con lo que el feed va a mostrar.
     and (p_categorias is null or p.categoria = any(p_categorias))
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

grant execute on function public.contar_publicaciones_por_barrio(text, text, text[], text, text[]) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificación: UNA sola función, y el conteo por sección distinto del total.
select (select count(*) from pg_proc where proname = 'contar_publicaciones_por_barrio') as cuantas_funciones,
       (select coalesce(sum(cantidad),0) from public.contar_publicaciones_por_barrio(null,null,null,null,null)) as todas,
       (select coalesce(sum(cantidad),0) from public.contar_publicaciones_por_barrio(null,null,null,null,
          array['belleza','eventos','exterior','fotografia','hogar','mascotas','salud-bienestar','profesionales','talleres-clases','vehiculos','otros-servicios','cerrajeria'])) as solo_servicios;
