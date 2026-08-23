-- ═══════════════════════════════════════════════════════════════════════
-- Garín cuelga de Escobar, no es una raíz aparte
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- ── El bug ─────────────────────────────────────────────────────────────
-- La semilla de supabase-zonas.sql dejó a Garín como madre de sí misma:
--
--   ('Garín', 'Garín', ...)     ← igual que ('Escobar', 'Escobar', ...)
--
-- Y en zonas_arbol la raíz se define justamente así: `where z.nombre =
-- z.madre`. O sea que Garín quedó como una SEGUNDA raíz, hermana de
-- Escobar, con "Matheu / Garín" colgando abajo.
--
-- Consecuencia concreta, medida en la base:
--
--   zonas_ancestros('Garín') → {'Garín'}        (no incluye 'Escobar')
--
-- y buscar_prestadores matchea con `p.zonas && zonas_ancestros(p_zona)`.
-- Entonces los 17 prestadores que hoy tienen zonas = {'Escobar'} —los que
-- eligieron "Todo Escobar · todas las zonas", que es el default heredado—
-- NO aparecen cuando un vecino filtra por Garín ni por Matheu.
--
-- Es una promesa falsa: la opción dice "todas las zonas" y hay dos que no
-- cubre. El prestador no tiene forma de enterarse.
--
-- ── El arreglo ─────────────────────────────────────────────────────────
-- Una sola fila. `nivel` no es una columna, se calcula en la vista desde
-- `madre`, así que cambiar la madre reacomoda el árbol entero solo:
--
--   Garín          nivel 1 → 2   (pasa a ser comunidad, como las demás)
--   Matheu / Garín nivel 2 → 3   (pasa a ser barrio de Garín)
--
-- No se toca ningún dato de prestadores ni de pedidos: `zona` y `zonas`
-- guardan el NOMBRE, y el nombre no cambia.

update public.zonas set madre = 'Escobar' where nombre = 'Garín';

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Una sola raíz, y Garín en el nivel 2:
select nivel, nombre, madre from public.zonas_arbol
 where nombre in ('Escobar', 'Garín', 'Matheu / Garín') order by nivel;
-- Escobar → 1 · Garín → 2 · Matheu / Garín → 3

-- 2. Que Escobar sea ancestro de Garín (esto es lo que arregla la búsqueda):
select public.zonas_ancestros('Garín');
-- {Garín,Escobar}   ← antes devolvía sólo {Garín}

-- 3. Que ninguna otra zona haya quedado como raíz suelta:
select nombre from public.zonas where nombre = madre;
-- sólo 'Escobar'
