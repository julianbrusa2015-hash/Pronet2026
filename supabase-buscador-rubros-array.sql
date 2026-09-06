-- ═══ PRONET · el buscador de Servicios no miraba rubros[] ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Reportado 2026-08-30: "los agrupadores por rubro andan, pero el buscador no
-- trajo". Las dos condiciones de buscar_prestadores() no leían lo mismo:
--
--   -- el chip de rubro SÍ mira el array completo:
--   and (p_rubro is null or p_rubro = any(p.rubros) or p.rubro = p_rubro)
--
--   -- pero el texto sólo leía el rubro PRINCIPAL:
--   lower(sin_acentos(nombre || ' ' || rubro || ' ' || subrubro))
--
-- Así que un prestador multirubro era encontrable por chip y no por texto.
-- Verificado en producción: "Prestador Araucarias" tiene Plomería en rubros[]
-- (su rubro principal es Jardinería) y buscar "plomeria" NO lo traía.
-- Afectaba a 3 prestadores activos: Acacias (Gasista), Araucarias (Plomería) y
-- servicios_001 (Plomería, Vidriería).
--
-- ⚠ Se respeta la firma EXACTA — mismos nombres, orden, tipos y defaults.
-- Un `create or replace` con otra firma NO reemplaza: crea una sobrecarga, y
-- entonces PostgREST no puede elegir cuál llamar y devuelve PGRST203. Ya pasó
-- con el ranking bayesiano.

create or replace function public.buscar_prestadores(
  p_zona    text    default null,
  p_rubro   text    default null,
  p_premium boolean default null,
  p_texto   text    default null,
  p_limite  integer default 100
)
returns setof prestadores
language sql
stable
security definer
as $function$
  select p.*
    from public.prestadores p
   where p.activo = true
     and (p_zona    is null or p.zona    = p_zona)
     and (p_premium is null or p.premium = p_premium)
     and (p_rubro is null or p_rubro = any(p.rubros) or p.rubro = p_rubro)
     and (
       p_texto is null or btrim(p_texto) = ''
       or lower(public.sin_acentos(
            coalesce(p.nombre,'')   || ' ' ||
            coalesce(p.rubro,'')    || ' ' ||
            coalesce(p.subrubro,'') || ' ' ||
            -- Lo que faltaba: los rubros secundarios. array_to_string devuelve
            -- null si el array es null, de ahí el coalesce de afuera — sin él,
            -- concatenar null anula TODA la cadena y el prestador se vuelve
            -- invisible al buscador en vez de sólo perder sus rubros extra.
            coalesce(array_to_string(p.rubros, ' '), '')
          )) like '%' || lower(public.sin_acentos(btrim(p_texto))) || '%'
     )
   order by
     (coalesce(p.rating,0) * coalesce(p.resenas,0) + 15.0 + case when p.verificado then 2.0 else 0 end)
       / (coalesce(p.resenas,0) + 5) desc
   limit greatest(1, least(coalesce(p_limite, 100), 200));
$function$;

-- Verificación: tiene que haber UNA sola firma (si aparecen dos, PostgREST
-- devuelve PGRST203 y el buscador deja de responder).
select p.oid::regprocedure as firma
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'buscar_prestadores';
