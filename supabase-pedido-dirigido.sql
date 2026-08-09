-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Recontratación: un pedido dirigido a una sola persona
--
-- Caso: contraté a Juan para podar el cerco, quedó bien, y ahora quiero
-- que me cambie el cantero. Es OTRO trabajo con la MISMA persona.
--
-- No es un pedido al feed: no hay nada que matchear, ya elegí. Publicarlo
-- abierto haría que aparezcan cinco desconocidos a competirle a alguien
-- que ya me resolvió un problema — exactamente lo contrario de lo que
-- quiero.
--
-- ── Por qué un pedido y no "reabrir el chat" ───────────────────────────
-- Podría parecer más simple seguir hablando en el chat existente. No lo
-- es: `resenas` tiene UNIQUE (chat_id) — verificado — así que dos trabajos
-- en un mismo chat significan que el segundo NUNCA se puede calificar. Y
-- el estado del chat es uno solo: no puede estar `calificado` por el cerco
-- y `activo` por el cantero al mismo tiempo.
--
-- El chat es la unidad del TRABAJO. La continuidad de la relación se
-- resuelve mostrando las conversaciones agrupadas por persona, no metiendo
-- dos trabajos en la misma fila.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pedidos
  add column if not exists dirigido_a uuid references public.prestadores(id) on delete set null;

-- Índice parcial: la enorme mayoría de los pedidos son abiertos, no tiene
-- sentido indexar los null.
create index if not exists idx_pedidos_dirigido_a
  on public.pedidos (dirigido_a) where dirigido_a is not null;

comment on column public.pedidos.dirigido_a is
  'Si está seteado, el pedido sólo lo ve ese prestador. Recontratación: el vecino ya eligió y no quiere competencia.';

notify pgrst, 'reload schema';

select count(*) filter (where dirigido_a is not null) as dirigidos,
       count(*)                                       as total
  from public.pedidos;
