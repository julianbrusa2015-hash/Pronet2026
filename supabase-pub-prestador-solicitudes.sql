-- ═══════════════════════════════════════════════════════════════════════
-- Publicaciones de prestadores · Fase 7: solicitudes y conversión
-- ═══════════════════════════════════════════════════════════════════════
--
-- Las métricas del panel ya muestran vistas, likes y clics. Falta la que
-- más importa: cuántos de esos clics terminaron en un pedido de verdad.
--
-- El clic se registra al TOCAR "Contactar", pero el vecino todavía puede
-- abandonar el alta del pedido. Sin distinguir las dos cosas, el número que
-- se le muestra al prestador —el que le justifica pagar— estaría inflado.
--
-- Por eso el pedido guarda de qué aviso salió: `pedidos.origen_pub_id`. Con
-- eso la solicitud es un hecho contable, no una inferencia por cercanía de
-- fechas entre un clic y un pedido cualquiera.

begin;

-- ── 1 · De qué aviso salió el pedido ─────────────────────────────────
-- `on delete set null` y no cascade: si el prestador borra el aviso, el
-- PEDIDO tiene que sobrevivir — es del vecino, no suyo. Se pierde la
-- atribución, que es lo correcto: el pedido sigue existiendo.
alter table public.pedidos
  add column if not exists origen_pub_id uuid
    references public.publicaciones_prestador(id) on delete set null;

create index if not exists idx_pedidos_origen_pub
  on public.pedidos (origen_pub_id) where origen_pub_id is not null;

comment on column public.pedidos.origen_pub_id is
  'Aviso de Servicios desde el que el vecino tocó Contactar. Sirve para '
  'contar solicitudes reales por publicación (Fase 7).';

-- El cliente escribe esta columna al crear el pedido, así que necesita el
-- grant. No es sensible: dice de qué aviso salió, nada del vecino.
grant insert (origen_pub_id) on public.pedidos to authenticated;

-- ── 2 · Métricas por publicación, en una sola consulta ───────────────
-- Devuelve las cuatro cifras ya calculadas para los avisos del prestador
-- logueado. Se hace server-side y no sumando en el cliente porque las
-- solicitudes viven en `pedidos`, que el prestador NO puede leer entero:
-- sólo ve los abiertos de su rubro y los dirigidos a él. Contarlas desde
-- el cliente daría de menos sin que nada falle.
create or replace function public.metricas_pubs_prestador()
returns table (
  publicacion_id uuid,
  vistas         bigint,
  clics          bigint,
  likes          bigint,
  solicitudes    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         count(distinct e.id) filter (where e.tipo = 'vista')         as vistas,
         count(distinct e.id) filter (where e.tipo = 'clic_contacto') as clics,
         count(distinct l.usuario_id)                                 as likes,
         count(distinct ped.id)                                       as solicitudes
    from publicaciones_prestador p
    join perfiles pf on pf.prestador_id = p.prestador_id and pf.id = auth.uid()
    left join pub_prestador_eventos e on e.publicacion_id = p.id
    left join likes_pub_prestador   l on l.publicacion_id = p.id
    left join pedidos             ped on ped.origen_pub_id = p.id
   group by p.id;
$$;

grant execute on function public.metricas_pubs_prestador() to authenticated;

commit;

notify pgrst, 'reload schema';
