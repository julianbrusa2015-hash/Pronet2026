-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Los rubros pasan a la base
--
-- Hasta v142 había CUATRO listas de rubros escritas a mano en el HTML y
-- ninguna coincidía con las otras. Se unificaron en un catálogo en app.js;
-- esto completa el camino: pasan a ser datos editables sin deploy.
--
-- La tabla absorbe además dos cosas que hoy viven aparte y se
-- desincronizan con sólo agregar un rubro:
--   · `SLIDER_RANGOS` (config.js) — min/max de precio, indexado por NOMBRE
--   · `ESPECIALIDADES_POR_RUBRO` (app.js) — las sub-opciones del perfil
--
-- ── Baja lógica, NUNCA delete ──────────────────────────────────────────
-- `pedidos.rubro` y `prestadores.rubro` guardan el nombre como TEXTO, sin
-- foreign key. Borrar una fila de acá no rompería nada de inmediato: los
-- pedidos viejos quedarían con un rubro que ya no existe en el catálogo,
-- invisibles en los filtros y sin ícono, sin que nada falle. Por eso
-- `activo = false`: el rubro deja de ofrecerse pero lo ya publicado sigue
-- resolviendo su nombre, color e ícono.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.rubros (
  slug          text primary key,
  nombre        text not null,
  emoji         text not null default '📋',
  color         text not null default '#2B5BFF',
  bg            text not null default '#EEF2FF',
  svg           text,                       -- paths del ícono, sin el <svg> contenedor
  precio_min    integer not null default 30000,
  precio_max    integer not null default 500000,
  especialidades text[] not null default '{}',
  orden         integer not null default 100,
  activo        boolean not null default true,
  creado        timestamptz not null default now()
);

alter table public.rubros enable row level security;

-- Lectura pública: el catálogo se dibuja antes de que haya sesión (el
-- invitado ve los chips del home).
drop policy if exists "rubros_lectura" on public.rubros;
create policy "rubros_lectura" on public.rubros for select using (true);

drop policy if exists "rubros_admin_escribe" on public.rubros;
create policy "rubros_admin_escribe" on public.rubros
  for all using (public.es_admin()) with check (public.es_admin());

-- ── Semilla: los 8 rubros actuales ──────────────────────────────────────
-- Los SVG y colores salen del catálogo de app.js (v142); los rangos de
-- precio, de SLIDER_RANGOS; las especialidades, de ESPECIALIDADES_POR_RUBRO.
insert into public.rubros (slug, nombre, emoji, color, bg, precio_min, precio_max, especialidades, orden, svg) values
 ('limpieza','Limpieza','🧹','#C67D00','#FFF8EC',30000,150000,
  array['Limpieza','Planchado','Post-obra','Vidrios'],10,
  '<path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>'),
 ('cuidado','Cuidado','👶','#E11D48','#FFF1F2',30000,150000,
  array['Niñera','Adultos mayores','Acompañante'],20,
  '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
 ('mascotas','Mascotas','🐶','#2B5BFF','#EEF2FF',30000,150000,
  array['Paseador','Cuidador','Peluquería canina'],30,
  '<path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306"/>'),
 ('electricistas','Electricistas','⚡','#059669','#ECFDF5',30000,300000,
  array['Instalaciones','Reparaciones','Tableros','Urgencias 24h','Certificación ENRE','Eficiencia energética'],40,
  '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),
 ('jardineria','Jardinería','🌿','#16A34A','#F0FDF4',30000,250000,
  array['Poda','Mantenimiento','Diseño','Riego'],50,
  '<path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M12 3a4 4 0 0 1 0 8"/><path d="M12 3a4 4 0 0 0 0 8"/>'),
 ('plomeria','Plomería','🔧','#1D4ED8','#EFF6FF',30000,350000,
  array['Destapaciones','Instalaciones','Termotanques','Urgencias 24h'],60,
  '<path d="M12 2v6m0 0c-2 0-4 1-4 4v8h8v-8c0-3-2-4-4-4z"/><path d="M9 18h6"/><circle cx="12" cy="2" r="1"/>'),
 ('pintura','Pintura','🎨','#EA580C','#FFF7ED',30000,500000,
  array['Interior','Exterior','Impermeabilización','Trabajos en altura'],70,
  '<path d="M2 13.5V20h4l9.5-9.5-4-4L2 16"/><path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L16 7l-3-3 1.5-1.5z"/><path d="M20 19c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.5 2-4 2-4s2 2.5 2 4z"/>'),
 ('chef','Chef','🍳','#DC2626','#FEF2F2',30000,300000,
  array['Chef a domicilio','Catering','Eventos'],80,
  '<path d="M6 13h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6z"/><path d="M7 13a5 5 0 0 1 .6-8.9A3 3 0 0 1 12 3a3 3 0 0 1 4.4 1.1A5 5 0 0 1 17 13"/>')
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
-- Todo rubro usado por un pedido tiene que existir en el catálogo, o esos
-- pedidos quedarían sin ícono y fuera de los filtros.
select p.rubro as rubro_usado_en_pedidos,
       count(*) as pedidos,
       case when exists (select 1 from public.rubros r where r.nombre = p.rubro)
            then 'OK' else '⚠️ FALTA EN EL CATÁLOGO' end as estado
  from public.pedidos p group by p.rubro order by 2 desc;
