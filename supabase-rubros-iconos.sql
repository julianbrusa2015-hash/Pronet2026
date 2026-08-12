-- ═══════════════════════════════════════════════════════════════════════
-- Íconos de los rubros de obra (herrería, albañilería, gasista)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Los tres existían en el catálogo pero desactivados y con el ícono
-- genérico (📋 y el azul por defecto), mientras que los ocho activos tienen
-- emoji propio, color e ícono vectorial. Un rubro con el ícono genérico se
-- nota al lado de los otros: parece a medio cargar.
--
-- NO se activan acá. Qué oficios existen es una decisión de producto y se
-- toma desde Parametrías → Rubros; esto sólo deja los tres listos para que
-- activarlos sea un toque.
--
-- Los `svg` son paths con el mismo trazo que los existentes (24×24, sin
-- relleno, stroke heredado). Colores elegidos para no repetir ninguno de
-- los ocho que ya están:
--   herrería   → acero  (#475569 sobre #F1F5F9)
--   albañilería→ ladrillo(#92400E sobre #FAF0E6)
--   gasista    → llama azul (#0284C7 sobre #F0F9FF) — el naranja de la
--                llama chocaría con pintura (#EA580C) y limpieza (#C67D00)

begin;

update public.rubros set
  emoji = '🔨',
  bg    = '#F1F5F9',
  color = '#475569',
  svg   = '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>'
       || '<path d="m18 15 4-4"/>'
       || '<path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>'
where slug = 'herreria';

update public.rubros set
  emoji = '🧱',
  bg    = '#FAF0E6',
  color = '#92400E',
  svg   = '<rect width="18" height="18" x="3" y="3" rx="2"/>'
       || '<path d="M3 9h18"/><path d="M3 15h18"/>'
       || '<path d="M8 3v6"/><path d="M16 3v6"/>'
       || '<path d="M12 9v6"/><path d="M8 15v6"/><path d="M16 15v6"/>'
where slug = 'albanileria';

update public.rubros set
  emoji = '🔥',
  bg    = '#F0F9FF',
  color = '#0284C7',
  svg   = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'
where slug = 'gasista';

-- Los dos siguientes se cargaron unos minutos después que los tres de
-- arriba, así que entraron con el ícono genérico igual que ellos.
--   carpintería   → madera oscura (#7C2D12 sobre #FBF1EA), con una regla de
--                   carpintero: la sierra a este tamaño se lee como una
--                   mancha dentada
--   refrigeración → frío (#0E7490 sobre #ECFEFF); más oscuro que el celeste
--                   del gasista para que no se confundan de un vistazo
update public.rubros set
  emoji = '🪚',
  bg    = '#FBF1EA',
  color = '#7C2D12',
  svg   = '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/>'
       || '<path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/>'
       || '<path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>'
where slug = 'carpinteria';

update public.rubros set
  emoji = '❄️',
  bg    = '#ECFEFF',
  color = '#0E7490',
  svg   = '<line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/>'
       || '<path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/>'
       || '<path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>'
where slug = 'refrigeracion';

commit;

select slug, nombre, emoji, bg, color, activo,
       length(svg) as largo_svg
  from public.rubros
 where slug in ('herreria','albanileria','gasista','carpinteria','refrigeracion')
 order by slug;
