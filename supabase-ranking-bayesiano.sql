-- ═══════════════════════════════════════════════════════════════════════
-- Ranking bayesiano en la búsqueda de prestadores
-- ═══════════════════════════════════════════════════════════════════════
--
-- `prestadores.rating` tiene 5.0 por defecto, así que ordenar por esa columna
-- ponía a un prestador recién dado de alta y sin ninguna reseña por encima de
-- uno con 4.4 y cinco reseñas reales. Perjudica justo al que se ganó la
-- reputación trabajando.
--
-- La fórmula es un promedio bayesiano: (rating*reseñas + M*C) / (reseñas + C)
-- con M = 3.0 (la media a la que tiende un perfil sin historia) y C = 5 (el
-- peso de esa media, en reseñas). Un perfil sin reseñas vale 3.0 y va subiendo
-- hacia su rating real a medida que las junta. Los mismos números están en el
-- cliente (app.js: _bayScore, renderRanking y sugeridos del pedido).
--
-- ─────────────────────────────────────────────────────────────────────────
-- CUIDADO — esto ya rompió producción una vez (2026-08-10)
-- ─────────────────────────────────────────────────────────────────────────
-- La versión original de esta función tenía los parámetros en el orden
--   (p_texto, p_rubro, p_zona, p_premium, p_limite)
-- y el fix se aplicó con
--   (p_zona, p_rubro, p_premium, p_texto, p_limite)
--
-- Un `create or replace` con una firma distinta NO reemplaza: crea una
-- segunda función. Con las dos vivas y los mismos nombres de parámetro,
-- PostgREST no puede elegir y devuelve
--   "Could not choose the best candidate function between: ..."
-- o sea que `listarPrestadores()` devolvía [] y la app mostraba
-- "No hay prestadores en esta categoría aún" en el inicio y en el buscador.
--
-- Por eso el drop explícito de abajo. Al tocar cualquier RPC, si cambia la
-- firma hay que descartar la vieja a mano — el `or replace` no alcanza.

begin;

-- La firma vieja, por tipos: (p_texto, p_rubro, p_zona, p_premium, p_limite)
drop function if exists public.buscar_prestadores(text, text, text, boolean, integer);

create or replace function public.buscar_prestadores(
  p_zona     text    default null,
  p_rubro    text    default null,
  p_premium  boolean default null,
  p_texto    text    default null,
  p_limite   int     default 100
) returns setof public.prestadores
language sql
stable
security definer
as $$
  select p.*
    from public.prestadores p
   where p.activo = true
     and (p_zona    is null or p.zona    = p_zona)
     and (p_premium is null or p.premium = p_premium)
     and (p_rubro is null or p_rubro = any(p.rubros) or p.rubro = p_rubro)
     and (
       p_texto is null or btrim(p_texto) = ''
       -- sin_acentos() + el índice GIN trigram: "maria" tiene que encontrar
       -- a "María" (ver supabase-busqueda-unaccent.sql).
       or lower(public.sin_acentos(
            coalesce(p.nombre,'') || ' ' || coalesce(p.rubro,'') || ' ' || coalesce(p.subrubro,'')
          )) like '%' || lower(public.sin_acentos(btrim(p_texto))) || '%'
     )
   order by
     (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0) / (coalesce(p.resenas,0) + 5) desc
   limit greatest(1, least(coalesce(p_limite, 100), 200));
$$;

commit;
