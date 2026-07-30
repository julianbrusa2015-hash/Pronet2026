-- ═══ PRONET · Ordenar las cuentas de prueba ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente. NO borra ninguna cuenta.
--
-- Objetivo: que cada cuenta pueda "ponerse el gorro" de su rol sin trabas.
-- Inventario y para qué sirve cada una: tests/PLAN-CIRCUITOS.md
--
-- Qué arregla:
--   1. Las 4 cuentas tipo='prestador' sin ficha en `prestadores`. Sin ficha no
--      pueden ofertar: el CTA del detalle del pedido exige prestador_id.
--   2. El rubro 'General', que no matchea ninguna categoría del feed.
--   3. Los campos de la ficha que la UI necesita (precio, descripción, medios
--      de pago, iniciales, coordenadas) y que hoy están vacíos.
--   4. `roles` desincronizado de `tipo`.
--
-- Solo completa lo que está en NULL: no pisa datos ya cargados.

-- ── 1. Crear las fichas que faltan ──────────────────────────────────────
do $$
declare
  r       record;
  v_nuevo uuid;
  v_total int := 0;
begin
  for r in
    select id, nombre, zona from perfiles
     where tipo = 'prestador' and prestador_id is null
  loop
    insert into prestadores (nombre, zona, rubro, activo)
         values (coalesce(r.nombre, 'Prestador'),
                 coalesce(r.zona, 'Escobar'),
                 'General', true)
      returning id into v_nuevo;
    update perfiles set prestador_id = v_nuevo where id = r.id;
    v_total := v_total + 1;
  end loop;
  raise notice 'Fichas creadas: %', v_total;
end $$;

-- ── 2. Rubros reales ────────────────────────────────────────────────────
-- Los dos prestadores del plan van al MISMO rubro: es la única forma de probar
-- la pantalla de comparar propuestas, que necesita dos ofertas en un pedido.
update prestadores set rubro = 'Electricistas'
 where id in (
   select p.prestador_id from perfiles p join auth.users u on u.id = p.id
    where u.email in ('prestador_test@pronet.test', 'prestador@gmail.com')
      and p.prestador_id is not null
 );

-- Carla en otro rubro, para cubrir más de una categoría.
update prestadores set rubro = 'Plomería'
 where id in (
   select p.prestador_id from perfiles p join auth.users u on u.id = p.id
    where u.email = 'carla.test@test.com' and p.prestador_id is not null
 );

-- Nadie queda en 'General': no matchea ninguna categoría del feed, así que el
-- prestador no ve pedidos pre-filtrados de su rubro.
update prestadores set rubro = 'Electricistas'
 where rubro = 'General' or rubro is null or trim(rubro) = '';

-- ── 3. Completar la ficha (solo donde falte) ────────────────────────────
update prestadores set
  activo        = coalesce(activo, true),
  suspendido    = coalesce(suspendido, false),
  -- La card muestra "$0 / visita" si no hay precio.
  precio        = coalesce(precio, 25000),
  precio_unidad = coalesce(precio_unidad, 'visita'),
  precio_min    = coalesce(precio_min, 15000),
  precio_max    = coalesce(precio_max, 60000),
  -- El checklist de bienvenida pide descripción para marcar el perfil completo.
  descripcion   = coalesce(descripcion,
                    'Servicio de ' || rubro || ' en ' || coalesce(zona,'Escobar') ||
                    '. Presupuesto sin cargo.'),
  -- Iniciales para el avatar cuando no hay foto.
  iniciales     = coalesce(iniciales,
                    upper(left(split_part(nombre,' ',1),1)) ||
                    coalesce(upper(left(nullif(split_part(nombre,' ',2),''),1)), '')),
  zona          = coalesce(zona, 'Escobar'),
  medios_pago   = coalesce(medios_pago, array['Efectivo','Transferencia']),
  rating        = coalesce(rating, 5.0),
  resenas       = coalesce(resenas, 0),
  color_bg      = coalesce(color_bg, '#EEF2FF'),
  color_text    = coalesce(color_text, '#2B5BFF'),
  plan          = coalesce(plan, 'base'),
  -- Sin coordenadas no aparecen en el mapa ni tienen distancia real.
  -- Centro de Escobar, con un desplazamiento chico por ficha para que no se
  -- apilen en el mismo pin.
  lat           = coalesce(lat, -34.3487 + (random() - 0.5) * 0.02),
  lng           = coalesce(lng, -58.7930 + (random() - 0.5) * 0.02)
where id in (select prestador_id from perfiles where prestador_id is not null);

-- ── 4. Sincronizar roles con el estado efectivo ─────────────────────────
-- Se excluyen las cuentas admin: es_admin() lee esta columna y pisarla dejaría
-- al admin sin acceso a los paneles.
update perfiles set roles = array['cliente','prestador']
 where prestador_id is not null and tipo <> 'prestador'
   and not ('admin' = any(coalesce(roles, array[]::text[])));

update perfiles set roles = array['prestador']
 where tipo = 'prestador'
   and not ('admin' = any(coalesce(roles, array[]::text[])));

update perfiles set roles = array['cliente']
 where tipo in ('cliente','vecino') and prestador_id is null
   and not ('admin' = any(coalesce(roles, array[]::text[])));

-- ── 5. Zona en los perfiles (filtro del feed) ───────────────────────────
update perfiles set zona = 'Escobar' where zona is null or trim(zona) = '';

-- ── Verificación ────────────────────────────────────────────────────────
select
  p.nombre, u.email, p.tipo, p.roles,
  pr.rubro, pr.activo, pr.precio,
  (pr.descripcion is not null) as tiene_desc,
  (pr.lat is not null)         as en_mapa,
  case
    when 'admin' = any(coalesce(p.roles, array[]::text[]))   then 'ADMIN'
    when p.tipo = 'prestador' and p.prestador_id is not null then 'Prestador'
    when p.tipo = 'prestador'                                then 'ROTO: sin ficha'
    when p.prestador_id is not null                          then 'Doble perfil'
    else 'Vecino'
  end as puede_actuar_como
from perfiles p
left join auth.users  u  on u.id = p.id
left join prestadores pr on pr.id = p.prestador_id
order by puede_actuar_como, p.nombre;

-- Al terminar:
--   · Ningún 'ROTO: sin ficha'
--   · Ningún rubro 'General'
--   · El admin conserva roles=['admin']
--   · Todos los prestadores con precio, descripción y coordenadas
--
-- PENDIENTE aparte: `tipo` usa 'cliente' y 'vecino' como sinónimos. No se
-- normaliza acá porque merece decidirse aparte (elegir uno, migrar el otro,
-- agregar un CHECK). Hoy no rompe porque todos los chequeos del código son
-- `tipo = 'prestador'` o su negación, así que ambos caen del mismo lado.
