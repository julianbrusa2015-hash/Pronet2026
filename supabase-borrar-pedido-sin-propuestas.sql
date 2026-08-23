-- ═══════════════════════════════════════════════════════════════════════
-- Un pedido que alguien respondió ya no es sólo del vecino
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- ── El agujero ─────────────────────────────────────────────────────────
-- Las tablas de la conversación están bien cerradas. Medido en la base:
--
--   tabla            RLS   policies que permiten DELETE
--   propuestas        ✅    0
--   chats_trabajo     ✅    0
--   mensajes_chat     ✅    0
--   pedidos           ✅    1   ← acá
--
-- Nadie puede borrar una propuesta ni un chat. Y retirar tampoco sirve para
-- escaparse: propuestas_update_autor sólo deja tocar la propuesta mientras
-- está en 'pendiente' o 'retirada', así que apenas pasa a 'elegida' —que es
-- cuando nace el chat— el prestador ya no puede moverla.
--
-- Pero la policy de pedidos era `auth.uid() = usuario_id` y nada más, sin
-- condición de estado. Y la cascada arrastra todo:
--
--   pedidos ─CASCADE→ propuestas
--           ─CASCADE→ chats_trabajo ─CASCADE→ mensajes_chat
--
-- O sea que el vecino no podía borrar una propuesta, pero sí borrar el
-- pedido y llevarse las propuestas, el chat y los mensajes de un trabajo ya
-- hecho. Toda la protección de arriba se salteaba por el padre.
--
-- ── Los frenos que ya había, y por qué no alcanzaban ───────────────────
-- `trabajo_fotos.chat_id` y `denuncias.pedido_id` están en NO ACTION, así
-- que un pedido con fotos de trabajo o con una denuncia ya fallaba al
-- borrarse. Es protección real pero accidental: cubre justo los casos con
-- evidencia y deja pasar todo el resto, y el vecino veía un error crudo de
-- Postgres en vez de un motivo.
--
-- ── La regla ───────────────────────────────────────────────────────────
-- Se borra lo que es de uno; lo que involucró a otro, se archiva. Es la
-- misma regla que ya aplicamos al borrar la cuenta, donde las reseñas y las
-- denuncias se conservan anonimizadas.
--
-- Concretamente: el pedido se puede borrar mientras NADIE lo haya
-- respondido. Una propuesta retirada no cuenta — el prestador se fue solo,
-- no dejó nada del otro lado.
--
-- Lo que NO hace este archivo: darle al vecino una forma de sacarse el
-- pedido de encima una vez que tiene propuestas. Eso es archivar, necesita
-- UI y columna, y va aparte. Hoy no existe botón de borrar en la app —
-- esta policy cierra la puerta de la consola, no le saca una función a
-- nadie.

drop policy if exists "pedidos_borrar_dueno" on public.pedidos;

create policy "pedidos_borrar_dueno" on public.pedidos
  for delete
  using (
    auth.uid() = usuario_id
    and not exists (
      select 1 from public.propuestas pr
       where pr.pedido_id = pedidos.id
         and pr.estado is distinct from 'retirada'
    )
  );

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Que quede una sola policy de borrado y con la condición nueva.
--    Ojo: las permisivas se combinan con OR, así que si apareciera otra
--    con cmd DELETE o ALL, ésta no serviría de nada.
select policyname, cmd, permissive, qual::text
  from pg_policies
 where schemaname = 'public' and tablename = 'pedidos'
   and cmd in ('DELETE', 'ALL');

-- 2. Cuántos pedidos quedan protegidos por el cambio: los que tienen al
--    menos una propuesta viva. Antes eran todos borrables.
select count(*) filter (where tiene_propuestas) as ahora_protegidos,
       count(*) filter (where not tiene_propuestas) as siguen_borrables
  from (
    select pe.id,
           exists (select 1 from public.propuestas pr
                    where pr.pedido_id = pe.id
                      and pr.estado is distinct from 'retirada') as tiene_propuestas
      from public.pedidos pe
  ) x;
