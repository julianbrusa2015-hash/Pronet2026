-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Los barrios de Puertos del Lago
--
-- Tercer nivel de la jerarquía: Escobar → Puertos del Lago → Araucarias.
-- Con esto se puede contestar "¿en qué barrio hay empanadas?", que era el
-- caso que motivó todo esto.
--
-- Los nombres van SIN el prefijo "Puertos-" que traía la lista original: la
-- jerarquía ya dice de dónde cuelgan, y repetirlo en cada nombre lo haría
-- ilegible en un desplegable de doce ("Puertos-Acacias, Puertos-Amarras,
-- Puertos-Araucarias…").
--
-- Alfabético a propósito: en una lista de doce, el orden por nombre es el
-- único con el que alguien encuentra el suyo sin leerla entera.
--
-- SIN lat/lng todavía. Son necesarias para el mapa por barrio, pero
-- inventarlas sería peor que no tenerlas: un pin en el lugar equivocado
-- manda a un vecino a buscar empanadas a dos kilómetros de donde están.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.zonas (nombre, madre, orden, activo) values
  ('Acacias',    'Puertos del Lago', 310, true),
  ('Amarras',    'Puertos del Lago', 320, true),
  ('Araucarias', 'Puertos del Lago', 330, true),
  ('Bahía',      'Puertos del Lago', 340, true),
  ('Ceibos',     'Puertos del Lago', 350, true),
  ('Costas',     'Puertos del Lago', 360, true),
  ('Marinas',    'Puertos del Lago', 370, true),
  ('Muelles',    'Puertos del Lago', 380, true),
  ('Nativas',    'Puertos del Lago', 390, true),
  ('Orillas',    'Puertos del Lago', 400, true),
  ('Riberas',    'Puertos del Lago', 410, true),
  ('Vistas',     'Puertos del Lago', 420, true)
on conflict (nombre) do nothing;

notify pgrst, 'reload schema';

select nivel, count(*) as cuantas,
       string_agg(nombre, ', ' order by orden) as nombres
  from public.zonas_arbol
 group by nivel order by nivel;
