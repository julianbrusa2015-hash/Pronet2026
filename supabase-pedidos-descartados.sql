-- ═══ PRONET · el prestador puede descartar un pedido ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Hasta ahora, abierto un pedido que no le servía, el prestador tenía dos
-- salidas: enviar propuesta o consultar. La tercera —irse— no existía: volvía
-- atrás y el pedido seguía en su feed hasta vencer a los 7 días. Con volumen,
-- el feed se llena de lo ya descartado y entierra lo bueno.
--
-- El descarte es PERSONAL: oculta el pedido para ese prestador y para nadie
-- más. El vecino no se entera — saber quién te descartó no le sirve para nada
-- y sólo lastima.

create table if not exists public.pedidos_descartados (
  prestador_id uuid not null references public.prestadores(id) on delete cascade,
  pedido_id    uuid not null references public.pedidos(id)     on delete cascade,
  motivo       text,
  creado       timestamptz not null default now(),
  -- La PK compuesta hace el descarte idempotente: tocar dos veces no duplica.
  primary key (prestador_id, pedido_id),
  -- Motivo OPCIONAL. Se pide, no se exige: un prestador apurado tiene que
  -- poder salir sin contestar nada. La lista cerrada es para poder agregarlos
  -- después — si el 70% descarta por 'precio', eso dice que los rangos del
  -- slider están mal calibrados, y eso sólo se ve si el dato es comparable.
  constraint pedidos_descartados_motivo_check
    check (motivo is null or motivo in ('zona', 'precio', 'rubro', 'otro'))
);

-- El feed pregunta "qué descarté yo", siempre filtrando por prestador.
create index if not exists idx_pedidos_descartados_prestador
  on public.pedidos_descartados (prestador_id);

alter table public.pedidos_descartados enable row level security;

-- Las tres policies atan la fila al prestador del que está logueado. Sin esto
-- cualquiera podría leer los descartes ajenos —que es información competitiva:
-- revela qué trabajos rechaza cada uno— o peor, escribir descartes en nombre
-- de otro y borrarle pedidos del feed.
drop policy if exists "descartes: ver los propios"     on public.pedidos_descartados;
drop policy if exists "descartes: crear los propios"   on public.pedidos_descartados;
drop policy if exists "descartes: borrar los propios"  on public.pedidos_descartados;

create policy "descartes: ver los propios"
  on public.pedidos_descartados for select to authenticated
  using (prestador_id = (select p.prestador_id from public.perfiles p where p.id = auth.uid()));

create policy "descartes: crear los propios"
  on public.pedidos_descartados for insert to authenticated
  with check (prestador_id = (select p.prestador_id from public.perfiles p where p.id = auth.uid()));

create policy "descartes: borrar los propios"
  on public.pedidos_descartados for delete to authenticated
  using (prestador_id = (select p.prestador_id from public.perfiles p where p.id = auth.uid()));

-- Sin UPDATE a propósito: cambiar el motivo de un descarte viejo no es un caso
-- real, y cada permiso que no se otorga es una superficie menos.
grant select, insert, delete on public.pedidos_descartados to authenticated;

-- Verificación
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'pedidos_descartados'
 order by cmd;
