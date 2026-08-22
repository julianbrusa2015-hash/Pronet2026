-- ═══════════════════════════════════════════════════════════════════════
-- Fix: sistema de puntos duplicado en resenas
-- ═══════════════════════════════════════════════════════════════════════
-- Hallazgo (sesión de pruebas de carga, 2026-08-21): resenas tenía DOS
-- triggers AFTER INSERT que acreditaban puntos por separado:
--
--   trg_acreditar_por_resena → acreditar_por_resena() → usa acreditar_puntos(),
--     el sistema correcto y vigente (mismo que usa el resto de la app,
--     respeta loyalty_niveles real). Éste queda.
--
--   trg_puntos_resena → otorgar_puntos_por_resena() → sistema viejo y
--     paralelo: busca en loyalty_reglas ('resena_<puntos>'), suma directo
--     a loyalty.puntos, y recalcula nivel con umbrales hardcodeados que ni
--     siquiera coinciden con loyalty_niveles real. Cada reseña quedaba
--     acreditada DOS veces. Activo e insertando filas huérfanas
--     (loyalty_historial.usuario_id = null) desde 2026-07-27 hasta hoy.
--
-- Impacto verificado: 42 filas huérfanas, 6.850 puntos de más repartidos
-- entre 5 cuentas — todas de prueba ("Prestador Test", "servicios_001
-- prueba", etc.), ninguna de un vecino/prestador real.
--
-- Este script: (1) corta el trigger viejo, (2) borra las filas huérfanas
-- que dejó (no representan un evento real bajo el sistema correcto),
-- (3) corrige loyalty.puntos/nivel de las 5 cuentas afectadas, con piso
-- en 0 (Acacias tenía menos puntos actuales que el excedente detectado,
-- probablemente por canjes ya hechos con puntos inflados).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- 1. Cortar el trigger duplicado y su función (ya sin uso).
drop trigger if exists trg_puntos_resena on public.resenas;
drop function if exists public.otorgar_puntos_por_resena();

-- 2. Corregir loyalty.puntos/nivel de las cuentas afectadas ANTES de
--    borrar el historial huérfano (la corrección se calcula a partir de él).
with excedente as (
  select p.id as usuario_id, sum(lh.puntos) as de_mas
  from public.loyalty_historial lh
  join public.perfiles p on p.prestador_id = lh.prestador_id
  where lh.usuario_id is null and lh.tipo = 'resena'
  group by p.id
),
corregido as (
  select l.usuario_id, greatest(0, l.puntos - e.de_mas) as puntos_nuevos
  from public.loyalty l
  join excedente e on e.usuario_id = l.usuario_id
)
update public.loyalty l
set puntos = c.puntos_nuevos,
    nivel = (
      select n.nombre from public.loyalty_niveles n
      where n.min_puntos <= c.puntos_nuevos
      order by n.min_puntos desc limit 1
    )
from corregido c
where l.usuario_id = c.usuario_id;

-- 3. Borrar las filas huérfanas que dejó el trigger viejo.
delete from public.loyalty_historial
where usuario_id is null and tipo = 'resena';

commit;

-- Verificación post-fix:
-- select tgname from pg_trigger where tgrelid='public.resenas'::regclass and not tgisinternal;
--   → sólo deben quedar on_resena_insert_update y trg_acreditar_por_resena
-- select count(*) from loyalty_historial where usuario_id is null and tipo='resena';
--   → 0
