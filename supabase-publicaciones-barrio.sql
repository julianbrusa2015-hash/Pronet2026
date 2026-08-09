-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Zona y barrio en las publicaciones de Entre Vecinos
--
-- `publicaciones.zona` venía guardando los DOS niveles mezclados: 6 filas
-- decían "Escobar" (la zona) y 3 decían un barrio ("Nordelta", "San
-- Matías"). Con un solo campo no hay forma de saber cuál es cuál, y filtrar
-- por "Escobar" devolvía sólo las que casualmente habían elegido ese valor,
-- no las de sus barrios.
--
-- En un marketplace de barrio el dato que importa es el barrio: define si
-- vale la pena ir a buscar unas empanadas o no. La zona sola no alcanza.
--
-- Se separa: `zona` pasa a ser SIEMPRE la zona madre (Escobar, Garín) y
-- `barrio` el lugar concreto. La migración usa el catálogo `zonas` para
-- decidir qué era cada valor viejo, no una lista escrita a mano.
--
-- Las 6 que decían "Escobar" quedan con barrio en null: quien las publicó
-- nunca eligió un barrio, y adivinarle uno sería inventar un dato que
-- después alguien usa para decidir dónde ir.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.publicaciones
  add column if not exists barrio text;

alter table public.publicaciones
  add column if not exists lote text;

comment on column public.publicaciones.barrio is
  'Barrio concreto (nombre en `zonas`). `zona` guarda la zona madre. Null = se publicó antes de que el campo existiera.';

-- El lote es la DIRECCIÓN DE LA CASA de quien publica. Se guarda para que
-- el comprador sepa a dónde ir, pero NO se muestra en la tarjeta del feed:
-- ahí sale sólo el barrio. Aparece recién en el chat, cuando ya hay un
-- pedido y un contacto — que es cuando hace falta.
--
-- Publicarlo abierto sería dejar la dirección de un vecino a la vista de
-- cualquiera con una cuenta, que es lo mismo que cerramos con los pedidos.
comment on column public.publicaciones.lote is
  'Lote o número. Dato de contacto, NO se muestra en el feed — sólo al coordinar la entrega en el chat.';

-- ── Migración ──────────────────────────────────────────────────────────
-- Si el valor viejo de `zona` era en realidad un barrio, se mueve a
-- `barrio` y `zona` pasa a ser su madre.
update public.publicaciones p
   set barrio = p.zona,
       zona   = z.madre
  from public.zonas z
 where z.nombre = p.zona
   and z.nombre <> z.madre
   and p.barrio is null;

-- Índice para el filtro del feed, que pasa a buscar por barrio.
create index if not exists idx_publicaciones_barrio
  on public.publicaciones (barrio) where activa;

notify pgrst, 'reload schema';

select coalesce(barrio, '(sin barrio)') as barrio, zona, count(*) as publicaciones
  from public.publicaciones
 group by barrio, zona
 order by publicaciones desc;
