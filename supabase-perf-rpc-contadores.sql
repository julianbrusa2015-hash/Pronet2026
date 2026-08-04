-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · RPC de contadores por zona para el mapa de ProMarket
-- Fecha: 2026-08-03
--
-- PROBLEMA: contarPublicacionesPorZona() en datos.js no agrupaba en el
-- servidor. Hacía select('zona') sin límite y contaba en JavaScript:
--
--     const { data } = await q;                      // ← trae TODAS las filas
--     data.forEach(p => { counts[p.zona] = ... });   // ← agrupa en el cliente
--
-- A 50 000 publicaciones eso transfiere 50 000 filas al navegador para
-- construir un contador de 11 números. El costo no es de consulta sino de
-- transferencia y parseo en el dispositivo del usuario — y crece lineal
-- con la tabla.
--
-- SOLUCIÓN: mover el GROUP BY a Postgres. La respuesta pasa a ser de
-- tamaño constante (una fila por zona) sin importar el volumen.
--
-- SECURITY INVOKER (comportamiento por defecto, explícito acá para que
-- quede documentado): la función NO es SECURITY DEFINER a propósito. Con
-- definer saltearía la RLS de publicaciones y contaría también las
-- inactivas y las de otros autores, filtrando volumen que el usuario no
-- debería ver. Con invoker se aplica `publicaciones_ver_activas` igual
-- que en la consulta directa.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contar_publicaciones_por_zona(
  p_categoria text default null,
  p_busqueda  text default null
)
returns table (zona text, cantidad bigint)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select p.zona, count(*)::bigint as cantidad
    from public.publicaciones p
   where p.activa = true
     and p.zona is not null
     and (p_categoria is null or p_categoria = 'todos' or p.categoria = p_categoria)
     and (
       p_busqueda is null or btrim(p_busqueda) = ''
       or p.titulo      ilike '%' || btrim(p_busqueda) || '%'
       or p.descripcion ilike '%' || btrim(p_busqueda) || '%'
     )
   group by p.zona;
$function$;

grant execute on function public.contar_publicaciones_por_zona(text, text) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
select * from public.contar_publicaciones_por_zona(null, null);
