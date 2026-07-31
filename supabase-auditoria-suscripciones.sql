-- ═══ PRONET · Auditoría D3: suscripciones que pudieron romperse en silencio ═══
-- Solo lectura. Ejecutar en Supabase → SQL Editor.
--
-- Contexto: antes del 2026-07-31, la tabla `suscripciones` tenía
-- CHECK (periodo IN ('mensual','anual')) pero confirmarPago() siempre mandaba
-- periodo='mes'. El insert/upsert fallaba con check_violation y el error se
-- tragaba en un .then(({error}) => console.warn(...)) que nunca bloqueaba la
-- UI — el usuario veía "¡Plan activado!" aunque la fila nunca se escribió.
-- Como en esa ventana confirmarPago() activaba gratis (sin MP), no hay plata
-- de por medio; el riesgo es solo un tester que cree tener un plan que la DB
-- no tiene.

-- 1. ¿Quedan filas con periodo inválido? (no deberían, la constraint ya
--    se corrigió y la fila legacy se normalizó, pero confirmar no cuesta nada)
select id, usuario_id, plan, periodo, estado, activado_en
  from public.suscripciones
 where periodo not in ('mes', 'anual');

-- 2. Prestadores en plan 'base' en `prestadores.plan` (que es lo que se ve en
--    búsqueda/badge) pero con AL MENOS una fila en `suscripciones` que sugiere
--    que en algún momento activaron algo pago. Señal indirecta: si esta
--    consulta no devuelve nada, no hay indicio de plan pago perdido.
select p.id as prestador_id, p.plan as plan_prestador, s.plan as plan_en_suscripciones,
       s.estado, s.periodo, s.activado_en, s.vence_en
  from public.prestadores p
  join public.perfiles pf on pf.prestador_id = p.id
  join public.suscripciones s on s.usuario_id = pf.id
 where p.plan = 'base' and s.plan <> 'base';

-- 3. Prestadores SIN ninguna fila en `suscripciones` — señal de un
--    confirmarPago() que jamás llegó a escribir nada (ni éxito ni error
--    visible), el caso más silencioso.
select p.id as prestador_id, p.plan as plan_prestador, pf.id as usuario_id
  from public.prestadores p
  join public.perfiles pf on pf.prestador_id = p.id
  left join public.suscripciones s on s.usuario_id = pf.id
 where s.usuario_id is null;
