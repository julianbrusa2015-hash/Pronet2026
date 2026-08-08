-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · La búsqueda deja de distinguir acentos y usa el índice
--
-- Dos problemas que venían juntos:
--
-- 1. ILIKE **no** ignora acentos. El comentario en datos.js decía "sin
--    tilde, case-insensitive" y sólo lo segundo era cierto: buscar "maria"
--    nunca encontró a "María", ni "plomeria" a "Plomería".
--
-- 2. El índice trigram `idx_prestadores_busqueda_trgm` existía pero estaba
--    MUERTO: se creó sobre el texto crudo, y en cuanto la consulta le
--    aplique unaccent() la expresión deja de coincidir. Un índice de
--    expresión sólo sirve si la consulta usa exactamente esa expresión.
--
-- 3. El filtro `.or()` de PostgREST se armaba concatenando el texto del
--    usuario. Una búsqueda con una coma partía la condición en dos y
--    rompía la consulta. Un RPC con parámetros no tiene ese problema.
--
-- Bonus: el filtro por rubro ahora mira también el array `rubros`, así que
-- un prestador multirubro aparece al filtrar por cualquiera de los suyos y
-- no sólo por el principal.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- unaccent() es STABLE, no IMMUTABLE: depende del diccionario, que podría
-- cambiar. Postgres por eso la rechaza dentro de un índice. El wrapper fija
-- el diccionario explícitamente y se declara IMMUTABLE — es el patrón
-- estándar para este caso, y la razón por la que no alcanza con llamar a
-- unaccent() directamente.
create or replace function public.sin_acentos(txt text)
returns text
language sql
immutable
parallel safe
strict
set search_path to 'public', 'pg_catalog'
as $function$
  select public.unaccent('public.unaccent', txt)
$function$;

-- El texto sobre el que se busca, en una sola expresión. Índice y consulta
-- TIENEN que usar la misma o el índice no se aplica.
create index if not exists idx_prestadores_busqueda_ua
  on public.prestadores
  using gin (
    lower(public.sin_acentos(
      coalesce(nombre,'') || ' ' || coalesce(rubro,'') || ' ' || coalesce(subrubro,'')
    )) gin_trgm_ops
  );

-- El viejo queda sin uso: ninguna consulta va a buscar ya sobre el texto
-- crudo, y un índice GIN que nadie lee sigue costando en cada escritura.
drop index if exists public.idx_prestadores_busqueda_trgm;

-- ── RPC de búsqueda ─────────────────────────────────────────────────────
-- SECURITY INVOKER (el default): la RLS de `prestadores` se sigue
-- aplicando. No se pone DEFINER porque no hace falta saltearla.
create or replace function public.buscar_prestadores(
  p_texto   text    default null,
  p_rubro   text    default null,
  p_zona    text    default null,
  p_premium boolean default null,
  p_limite  int     default 100
)
returns setof public.prestadores
language sql
stable
set search_path to 'public'
as $function$
  select p.*
    from public.prestadores p
   where p.activo = true
     and (p_zona    is null or p.zona    = p_zona)
     and (p_premium is null or p.premium = p_premium)
     -- Multirubro: coincide por cualquiera de sus rubros. Se conserva el
     -- match contra `rubro` para los que no tengan el array cargado.
     and (p_rubro is null or p_rubro = any(p.rubros) or p.rubro = p_rubro)
     and (
       p_texto is null or btrim(p_texto) = ''
       or lower(public.sin_acentos(
            coalesce(p.nombre,'') || ' ' || coalesce(p.rubro,'') || ' ' || coalesce(p.subrubro,'')
          )) like '%' || lower(public.sin_acentos(btrim(p_texto))) || '%'
     )
   order by p.rating desc nulls last, p.resenas desc nulls last
   limit greatest(1, least(coalesce(p_limite, 100), 200));
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
-- Sin acentos en la consulta tiene que encontrar lo mismo que con acentos.
select 'plomeria' as busqueda, count(*) from public.buscar_prestadores('plomeria')
union all
select 'Plomería',            count(*) from public.buscar_prestadores('Plomería')
union all
select 'ELECTRICISTA',        count(*) from public.buscar_prestadores('ELECTRICISTA')
union all
select '(sin texto)',         count(*) from public.buscar_prestadores();
