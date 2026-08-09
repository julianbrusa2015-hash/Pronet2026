-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · ProMarket se divide en Servicios del Barrio y Mercado del Barrio
--
-- Se compran distinto: un producto se elige por la foto y el precio, un
-- servicio por la persona. Mezclados, la tarjeta y los filtros tenían que
-- servir a los dos y servían mal a ambos. El síntoma estaba en los datos:
-- "Masajes" —un servicio— estaba cargado en "Anuncios", el cajón de sastre,
-- porque no había dónde ponerlo.
--
-- ── El límite con los prestadores ──────────────────────────────────────
-- PRONET ya es un marketplace de servicios (prestadores, pedidos,
-- propuestas, planes). El "Servicios" de ProMarket es OTRA cosa, y la
-- diferencia no es la categoría sino la MECÁNICA:
--
--   · Prestador  → oficio que se contrata con presupuesto. El vecino no
--     sabe a quién llamar: publica un pedido y compara propuestas.
--   · Servicios del Barrio → lo que un vecino ofrece por su cuenta y se
--     contrata directo, sin competencia ni presupuesto.
--
-- Las categorías van en tabla y no en código porque son 15 y se van a
-- mover: mismo criterio que Rubros y Zonas.
--
-- NO se agrega columna `tipo` a `publicaciones`: el tipo sale de la
-- categoría, y duplicarlo sería un dato que se puede desincronizar. El feed
-- filtra con `categoria in (…)`.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.mkt_categorias (
  slug   text primary key,
  nombre text not null,
  emoji  text not null default '📦',
  tipo   text not null check (tipo in ('servicio', 'producto')),
  orden  int  not null default 100,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

comment on table public.mkt_categorias is
  'Categorías de ProMarket. `tipo` decide en qué sección aparece: Servicios del Barrio o Mercado del Barrio.';

alter table public.mkt_categorias enable row level security;

drop policy if exists "mkt_cat_leer" on public.mkt_categorias;
create policy "mkt_cat_leer" on public.mkt_categorias
  for select to anon, authenticated using (true);

drop policy if exists "mkt_cat_admin" on public.mkt_categorias;
create policy "mkt_cat_admin" on public.mkt_categorias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

insert into public.mkt_categorias (slug, nombre, emoji, tipo, orden) values
  -- Servicios del Barrio
  ('belleza',          'Belleza',            '💇', 'servicio',  10),
  ('eventos',          'Eventos',            '🎉', 'servicio',  20),
  ('exterior',         'Exterior',           '🌳', 'servicio',  30),
  ('fotografia',       'Fotografía',         '📷', 'servicio',  40),
  ('hogar',            'Hogar',              '🏠', 'servicio',  50),
  ('mascotas',         'Mascotas',           '🐾', 'servicio',  60),
  ('salud-bienestar',  'Salud y bienestar',  '💆', 'servicio',  70),
  ('profesionales',    'Profesionales',      '💼', 'servicio',  80),
  ('talleres-clases',  'Talleres y clases',  '🎓', 'servicio',  90),
  ('vehiculos',        'Vehículos',          '🚗', 'servicio', 100),
  ('otros-servicios',  'Otros servicios',    '✨', 'servicio', 110),
  -- Mercado del Barrio.
  -- "Comidas y bebidas" NO estaba en la lista original: se agregó porque 5
  -- de las 7 publicaciones existentes son comida y en un mercado de barrio
  -- la comida casera suele ser lo más grande. Sin esta categoría, lo
  -- principal caía en "Otros productos".
  ('comidas-bebidas',  'Comidas y bebidas',  '🍕', 'producto',  10),
  ('cocina-bazar',     'Cocina y bazar',     '🍳', 'producto',  20),
  ('decoracion',       'Decoración',         '🖼️', 'producto',  30),
  ('indumentaria',     'Indumentaria',       '👕', 'producto',  40),
  ('otros-productos',  'Otros productos',    '📦', 'producto',  50)
on conflict (slug) do nothing;

-- ── El CHECK viejo tiene que salir ─────────────────────────────────────
-- `publicaciones.categoria` tenía un CHECK con las 4 categorías viejas
-- escritas a mano. Con eso puesto, agregar una categoría desde el panel
-- creaba una que nadie podía usar: la fila entraba en el catálogo y el
-- INSERT de la publicación explotaba con un error de Postgres.
--
-- Se reemplaza por una FK al catálogo, que dice lo mismo pero se mantiene
-- sola. ON UPDATE CASCADE para que renombrar un slug arrastre las
-- publicaciones; sin ON DELETE, así borrar una categoría con publicaciones
-- queda bloqueado en vez de dejarlas huérfanas.
alter table public.publicaciones drop constraint if exists publicaciones_categoria_check;

-- ── Migración de las publicaciones existentes ──────────────────────────
-- Acotada a las 4 categorías viejas. Cada fila tiene que caer en una nueva
-- o quedaría invisible: el feed filtra por categorías del catálogo.
update public.publicaciones set categoria = 'comidas-bebidas' where categoria = 'gastronomia';
update public.publicaciones set categoria = 'otros-productos' where categoria in ('productos', 'comercios');
-- 'anuncios' era el cajón de sastre. Lo único que hay ahí es "Masajes", que
-- es el caso testigo de esta división: un vecino ofreciéndole un servicio a
-- otro, contratado directo — nada que ver con el circuito de pedidos y
-- propuestas de un prestador. Va a su categoría real, no a otro cajón.
update public.publicaciones set categoria = 'salud-bienestar'
 where categoria = 'anuncios' and titulo ilike '%masaje%';
update public.publicaciones set categoria = 'otros-servicios' where categoria = 'anuncios';

-- La FK va DESPUÉS de migrar: con las categorías viejas todavía puestas,
-- crearla fallaría por las filas que no matchean.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'publicaciones_categoria_fk') then
    alter table public.publicaciones
      add constraint publicaciones_categoria_fk
      foreign key (categoria) references public.mkt_categorias(slug)
      on update cascade;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Verificación: ninguna publicación puede quedar fuera del catálogo.
select p.categoria, count(*) as cuantas,
       max(c.tipo) as tipo,
       bool_and(c.slug is not null) as esta_en_catalogo
  from public.publicaciones p
  left join public.mkt_categorias c on c.slug = p.categoria
 group by p.categoria
 order by cuantas desc;
