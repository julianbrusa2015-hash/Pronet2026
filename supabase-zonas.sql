-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Zonas y barrios pasan a la base
--
-- Hoy viven en DOS objetos separados de app.js, los dos indexados por
-- NOMBRE de barrio, que es exactamente el patrón que ya produjo bugs con
-- los rubros:
--   · `ZONA_DB` (app.js ~3684) — barrio → zona madre
--   · `MKT_ZONA_COORD` (app.js ~3274) — barrio → lat/lng
-- más las 9 opciones escritas a mano en el modal de zona del HTML.
--
-- Agregar un barrio exigía tocar los tres lugares; olvidarse de uno lo
-- dejaba sin coordenada (no aparece en el mapa) o sin zona madre (no
-- matchea en los filtros), sin que nada falle.
--
-- ── Baja lógica, igual que rubros ──────────────────────────────────────
-- `pedidos.zona`, `prestadores.zona` y `perfiles.zona` guardan el nombre
-- como TEXTO, sin foreign key. Borrar dejaría a esos registros con una
-- zona inexistente: fuera de todos los filtros y sin coordenada.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.zonas (
  nombre     text primary key,           -- el barrio, tal como se guarda en pedidos.zona
  madre      text not null,              -- zona madre con la que se agrupa al filtrar
  lat        numeric(9,6),
  lng        numeric(9,6),
  orden      integer not null default 100,
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);

alter table public.zonas enable row level security;

-- Lectura pública: el selector de zona aparece antes de iniciar sesión.
drop policy if exists "zonas_lectura" on public.zonas;
create policy "zonas_lectura" on public.zonas for select using (true);

drop policy if exists "zonas_admin_escribe" on public.zonas;
create policy "zonas_admin_escribe" on public.zonas
  for all using (public.es_admin()) with check (public.es_admin());

-- ── Semilla: los 11 barrios actuales, con sus coordenadas ───────────────
insert into public.zonas (nombre, madre, lat, lng, orden) values
  ('Escobar',          'Escobar', -34.348600, -58.810000, 10),
  ('Escobar Centro',   'Escobar', -34.349400, -58.793800, 20),
  ('Puertos del Lago', 'Escobar', -34.296000, -58.746000, 30),
  ('El Cantón',        'Escobar', -34.335000, -58.758000, 40),
  ('San Matías',       'Escobar', -34.264000, -58.788000, 50),
  ('El Naudir',        'Escobar', -34.305000, -58.805000, 60),
  ('CUBE',             'Escobar', -34.318000, -58.772000, 70),
  ('El Cazador',       'Escobar', -34.390000, -58.823000, 80),
  -- Nordelta es de Tigre, no de Escobar; la coordenada es la real del
  -- centro de Nordelta y se agrupa bajo Escobar sólo para el filtro.
  ('Nordelta',         'Escobar', -34.400000, -58.650000, 90),
  ('Garín',            'Garín',   -34.428000, -58.730000, 100),
  ('Matheu / Garín',   'Garín',   -34.442000, -58.705000, 110)
on conflict (nombre) do nothing;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
-- Toda zona en uso tiene que existir en el catálogo, o esos registros
-- quedan fuera de los filtros y sin coordenada en el mapa.
select z.zona as zona_en_uso, z.origen, z.n,
       case when exists (select 1 from public.zonas x where x.nombre = z.zona)
            then 'OK' else '⚠️ FALTA EN EL CATÁLOGO' end as estado
  from (
    select zona, 'pedidos' as origen, count(*) as n from public.pedidos group by zona
    union all
    select zona, 'prestadores', count(*) from public.prestadores group by zona
  ) z
 order by z.origen, z.n desc;
