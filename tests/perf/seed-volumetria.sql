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
-- Mismo criterio que en Reseñas más abajo: array precalculado e indexado
-- en vez de `ORDER BY md5(...) LIMIT 1` por fila (ese patrón sí llegó a
-- terminar acá con sólo 260 usuarios, pero es el mismo O(n) por fila que
-- agotó el timeout con 5 000 prestadores — se corrige en las dos partes
-- para no dejar la trampa a mitad de camino).
with uids as (
  select array_agg(id) as ids from auth.users
)
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
  uids.ids[1 + floor(random() * array_length(uids.ids, 1))::int],
  '{}',
  now() - (random() * interval '365 days')
from generate_series(1, 50000) g, uids;

-- ── 3 · Reseñas ────────────────────────────────────────────────────────
-- Distribución sesgada a propósito (Zipf aproximada): el 80 % de las
-- reseñas cae sobre el 20 % de los prestadores. Es lo que produce la
-- contención de fila al recalcular `rating` — el riesgo real que el plan
-- necesita medir, y que una distribución uniforme escondería.
--
-- resenas.chat_id es NOT NULL en el esquema real (confirmado corriendo
-- este script: la versión anterior asumía que se podía dejar null "si el
-- esquema lo permite" — no lo permite, y el insert entero se revertía).
-- Se genera un chats_trabajo por reseña, ya 'calificado', y se usa su id
-- — mismo par vecino/prestador, misma fecha, en un solo INSERT con CTE
-- para no repetir la selección aleatoria dos veces.
--
-- El sesgo YA NO se arma con `ORDER BY md5(...) LIMIT 1` por fila: eso
-- ordena las 5 000 filas de prestadores en cada una de las 200 000
-- iteraciones (hasta mil millones de comparaciones) y agota el timeout de
-- la conexión. Se precalculan los ids en un array una sola vez (`pids`,
-- `uids`) y se indexa directo — mismo sesgo (potencia alta concentra el
-- índice hacia el principio del array), costo O(1) por fila.
with pids as (
  select array_agg(id) as ids from public.prestadores where nombre like 'LoadTest%'
),
uids as (
  select array_agg(id) as ids from auth.users
),
nuevos_chats as (
  insert into public.chats_trabajo (vecino_id, prestador_id, estado, creado)
  select
    uids.ids[1 + floor(random() * array_length(uids.ids, 1))::int],
    pids.ids[1 + floor(power(random(), 3) * (array_length(pids.ids, 1) - 1))::int],
    'calificado',
    now() - (random() * interval '365 days')
  from generate_series(1, 200000) g, pids, uids
  returning id, vecino_id, prestador_id, creado
)
insert into public.resenas (chat_id, prestador_id, vecino_id, puntos, comentario, recomendar, creado)
select
  id, prestador_id, vecino_id,
  3 + (random() * 2)::int,
  'Reseña generada para pruebas de carga.',
  (random() > 0.2),
  creado
from nuevos_chats
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
