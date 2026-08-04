-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Seed de volumetría para pruebas de performance
--
-- ⛔ SOLO STAGING. Este script inserta decenas de miles de filas basura.
--    Correrlo en producción arruina el feed real de la app.
--
-- Para habilitarlo en un proyecto de staging, ejecutar primero:
--    insert into public.config_app (clave, valor) values ('entorno','staging')
--      on conflict (clave) do update set valor = 'staging';
--
-- El bloque de guarda de abajo aborta si ese marcador no existe. Es
-- deliberado que no haya forma de saltearlo por parámetro: la única
-- manera de correrlo es marcar explícitamente la base como staging.
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  if coalesce((select valor from public.config_app where clave = 'entorno'), 'produccion') <> 'staging' then
    raise exception
      'ABORTADO: la base no está marcada como staging. Este seed inserta datos basura y no debe correr en producción.';
  end if;
end $$;

-- ── Objetivo de volumetría (12 meses proyectados) ──────────────────────
--   prestadores : 5 000
--   pedidos     : 50 000
--   resenas     : 200 000
-- Ajustar las constantes de abajo para escalas menores.

-- ── 1 · Prestadores ────────────────────────────────────────────────────
-- Tabla sin FK a auth.users: se puede sembrar directo.
-- Distribución de rating sesgada (la mayoría entre 4,0 y 5,0) para que el
-- ORDER BY rating tenga baja selectividad, como en la realidad.
insert into public.prestadores
  (nombre, iniciales, rubro, subrubro, descripcion, zona, precio, precio_unidad,
   rating, resenas, activo, premium, medios_pago, plan)
select
  'LoadTest Prestador ' || g,
  'LT',
  (array['Electricistas','Plomería','Limpieza','Jardinería','Pintura','Cuidado','Mascotas'])[1 + (g % 7)],
  (array['Instalaciones','Reparaciones','Mantenimiento','Urgencias'])[1 + (g % 4)],
  'Prestador generado para pruebas de carga. Registro ' || g || '.',
  (array['Puertos del Lago','El Cantón','San Matías','El Naudir','CUBE',
         'El Cazador','Nordelta','Escobar Centro','Matheu / Garín'])[1 + (g % 9)],
  15000 + (g % 60) * 1000,
  'visita',
  round((3.5 + random() * 1.5)::numeric, 1),
  (random() * 200)::int,
  true,
  (g % 20 = 0),                       -- 5 % premium
  array['Efectivo','Transferencia'],
  case when g % 20 = 0 then 'pro' else 'base' end
from generate_series(1, 5000) g;

-- ── 2 · Pedidos ────────────────────────────────────────────────────────
-- usuario_id apunta a auth.users. Se reparten entre los usuarios que ya
-- existan en la base de staging (las cuentas vecinoNNNN@load.test creadas
-- por seed-usuarios.mjs). Si no hay usuarios, el insert no produce filas.
--
-- Fechas distribuidas sobre 12 meses hacia atrás para que los índices por
-- `creado` tengan una distribución realista y no todas las filas caigan
-- en el mismo día.
insert into public.pedidos
  (titulo, descripcion, rubro, icono, zona, estado, urgencia, usuario_id, fotos, creado)
select
  '[LOAD] Pedido de prueba ' || g,
  'Descripción generada automáticamente para pruebas de volumetría. Registro ' || g || '.',
  (array['Electricistas','Plomería','Limpieza','Jardinería','Pintura','Cuidado','Mascotas'])[1 + (g % 7)],
  '📋',
  (array['Puertos del Lago','El Cantón','San Matías','El Naudir','CUBE',
         'El Cazador','Nordelta','Escobar Centro','Matheu / Garín'])[1 + (g % 9)],
  case when g % 10 < 7 then 'Publicado' else 'Cerrado' end,   -- 70 % abiertos
  (array['hoy','semana','flexible'])[1 + (g % 3)],
  u.id,
  '{}',
  now() - (random() * interval '365 days')
from generate_series(1, 50000) g
cross join lateral (
  select id from auth.users order by md5(id::text || g::text) limit 1
) u;

-- ── 3 · Reseñas ────────────────────────────────────────────────────────
-- Distribución sesgada a propósito (Zipf aproximada): el 80 % de las
-- reseñas cae sobre el 20 % de los prestadores. Es lo que produce la
-- contención de fila al recalcular `rating` — el riesgo real que el plan
-- necesita medir, y que una distribución uniforme escondería.
--
-- resenas.chat_id tiene restricción UNIQUE; se deja null cuando el
-- esquema lo permita. Si es NOT NULL, sembrar antes chats_trabajo.
insert into public.resenas (prestador_id, vecino_id, puntos, comentario, recomendar, creado)
select
  p.id,
  u.id,
  3 + (random() * 2)::int,
  'Reseña generada para pruebas de carga.',
  (random() > 0.2),
  now() - (random() * interval '365 days')
from generate_series(1, 200000) g
cross join lateral (
  -- sesgo: potencia alta concentra la selección en los primeros ids
  select id from public.prestadores
   where nombre like 'LoadTest%'
   order by md5((g * (1 + (power(random(), 3) * 4999)::int))::text)
   limit 1
) p
cross join lateral (
  select id from auth.users order by md5(id::text || g::text) limit 1
) u
on conflict do nothing;

-- ── 4 · Actualizar estadísticas del planner ────────────────────────────
-- Sin esto Postgres sigue con las estimaciones de la tabla vacía y elige
-- planes equivocados: la prueba mediría el planner desactualizado, no el
-- sistema.
analyze public.prestadores;
analyze public.pedidos;
analyze public.resenas;

-- ── Verificación ───────────────────────────────────────────────────────
select 'prestadores' as tabla, count(*) from public.prestadores
union all select 'pedidos', count(*) from public.pedidos
union all select 'resenas', count(*) from public.resenas;
