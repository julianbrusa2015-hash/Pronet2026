-- ═══ PRONET · pedidos.frecuencia_periodo sin validar ═══════════════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── Qué encontré ───────────────────────────────────────────────────────
-- `servicios_fijos.frecuencia_periodo` tiene CHECK ('semana','mes').
-- `pedidos.frecuencia_periodo` no tiene ninguno.
--
-- El formulario sólo ofrece esos dos valores, así que hoy la app no puede
-- generar otra cosa y el problema no se ve. Pero las dos tablas no están de
-- acuerdo sobre qué es válido, y el desacuerdo estalla en el peor momento:
--
--   pedido con frecuencia_periodo = 'quincena'  → se publica sin problema
--   el vecino elige una propuesta                → elegir_propuesta inserta
--                                                  en servicios_fijos
--   el CHECK rechaza                             → LA TRANSACCIÓN ENTERA
--                                                  se revierte
--
-- O sea: la propuesta no queda elegida, las otras no se rechazan, el pedido
-- no se cierra y el chat no se activa. El vecino no puede contratar a nadie
-- y ve un error crudo de Postgres. Lo comprobé con un pedido armado a mano:
-- "new row for relation servicios_fijos violates check constraint".
--
-- ── Por qué vale arreglarlo igual ──────────────────────────────────────
-- Que hoy sólo lo evite el <select> del formulario es una protección de una
-- sola capa, y del lado del cliente. Cualquier camino que no pase por ese
-- formulario —un import, un fix manual, una versión futura con más
-- frecuencias— deja pedidos que parecen sanos y son imposibles de contratar.
--
-- La restricción va donde el dato entra, para que falle al publicar (donde
-- se entiende y se corrige) y no al contratar (donde ya hay dos personas
-- esperando).

-- Normalizar lo que haya fuera del conjunto antes de restringir. Hoy es sólo
-- la fila de prueba de la corrida, pero el update va igual para que este
-- archivo se pueda correr en cualquier momento.
update pedidos
   set frecuencia_periodo = 'mes'
 where frecuencia_periodo is not null
   and frecuencia_periodo not in ('semana', 'mes');

alter table public.pedidos drop constraint if exists pedidos_frecuencia_periodo_check;
alter table public.pedidos add constraint pedidos_frecuencia_periodo_check
  check (frecuencia_periodo is null or frecuencia_periodo in ('semana', 'mes'));

-- ── Verificación: las dos tablas dicen lo mismo ────────────────────────
select t.relname as tabla, pg_get_constraintdef(c.oid) as regla
  from pg_constraint c join pg_class t on t.oid = c.conrelid
 where t.relname in ('pedidos', 'servicios_fijos')
   and c.contype = 'c'
   and pg_get_constraintdef(c.oid) ilike '%periodo%'
 order by t.relname;
