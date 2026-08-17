-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Boost chico y gratis por identidad verificada en el ranking
--
-- Decisión 2026-08-17: la verificación mide algo distinto de las reseñas
-- (quién es, no qué tan bien labura) — así que el premio va aparte de la
-- reputación, no reemplazándola. Aditivo, no multiplicativo, y sobre el
-- NUMERADOR bayesiano: mismo orden de magnitud que M×C=15 de la fórmula
-- (rating*reseñas + 15) / (reseñas + 5), para que se note sin poder
-- ganarle nunca a un prestador con buenas reseñas reales. Un prestador
-- verificado con 0 reseñas sigue debajo de uno con reseñas de verdad.
--
-- No es multiplicativo como el boost de plan Pro (×1.4, ver
-- supabase-loyalty-boost.sql / app.js _boostDePlan): ese es pago y
-- escala con el score; éste es gratis y fijo, para que verificarse no
-- compita con pagar el plan ni se sienta "pay to win".
--
-- Se aplica en 3 lugares con LA MISMA fórmula (mismo patrón que ya
-- documenta supabase-ranking-bayesiano.sql): acá (búsqueda), y en el
-- cliente (renderRanking para Ranking Zonal, y el feed de Inicio).
-- Firma sin cambios a propósito — un create or replace con otra firma
-- crea una función nueva en vez de reemplazar (ver el aviso en
-- supabase-ranking-bayesiano.sql, ya rompió producción una vez).
-- ═══════════════════════════════════════════════════════════════════════

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
       or lower(public.sin_acentos(
            coalesce(p.nombre,'') || ' ' || coalesce(p.rubro,'') || ' ' || coalesce(p.subrubro,'')
          )) like '%' || lower(public.sin_acentos(btrim(p_texto))) || '%'
     )
   order by
     (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0 + case when p.verificado then 2.0 else 0 end)
       / (coalesce(p.resenas,0) + 5) desc
   limit greatest(1, least(coalesce(p_limite, 100), 200));
$$;
