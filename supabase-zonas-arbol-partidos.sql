-- ═══════════════════════════════════════════════════════════════════════
-- El árbol de zonas por partido real: Garín entra, Nordelta sale
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23. Reemplaza a supabase-zonas-garin-bajo-escobar.sql, que hacía
-- sólo la mitad.
--
-- Los dos cambios son la misma idea aplicada en direcciones opuestas: que
-- la raíz de cada zona sea el partido al que pertenece de verdad. Hoy la
-- semilla se equivocó en las dos puntas.
--
-- ── 1 · Garín estaba afuera y tenía que estar adentro ──────────────────
-- La semilla la dejó como madre de sí misma —('Garín','Garín')—, y así es
-- exactamente como zonas_arbol define una raíz. Quedó como hermana de
-- Escobar en vez de hija.
--
--   zonas_ancestros('Garín') → {Garín}      ← sin 'Escobar'
--
-- buscar_prestadores matchea con `p.zonas && zonas_ancestros(p_zona)`, así
-- que los 17 prestadores con zonas = {'Escobar'} —los que eligieron "Todo
-- Escobar · todas las zonas"— no aparecían cuando un vecino filtraba por
-- Garín ni por Matheu. La opción prometía el partido entero y dejaba dos
-- zonas afuera, sin forma de que el prestador se enterara.
--
-- ── 2 · Nordelta estaba adentro y tenía que estar afuera ───────────────
-- Nordelta es de Tigre. La semilla la colgó de Escobar «sólo para el
-- filtro», pero el filtro es justamente lo que define la cobertura: quien
-- marca "Todo Escobar" queda ofreciéndose en otro partido, a 15 km, sin
-- haberlo pedido.
--
-- Se le da la raíz que le corresponde en vez de borrarla: hay vecinos de
-- Nordelta que usan servicios de Escobar, y el prestador que quiera
-- cubrirla puede seguir marcándola A MANO en la lista de comunidades
-- —sigue siendo nivel 2, así que aparece igual—. Lo que deja de pasar es
-- que le entre sin querer por la puerta de "todas las zonas".
--
-- ── Por qué es barato ──────────────────────────────────────────────────
-- `nivel` no es una columna: zonas_arbol lo calcula recursivamente desde
-- `madre`. Cambiar la madre reacomoda el árbol solo. Y `prestadores.zona`,
-- `zonas`, `pedidos.zona` y `publicaciones.zona` guardan el NOMBRE, que no
-- cambia — no se toca un solo registro de datos.
--
-- Medido antes de escribir esto: Nordelta tiene 0 pedidos, 0 publicaciones
-- y 0 prestadores. No hay nadie a quien mover.

begin;

-- 1 · Garín pasa a ser una comunidad de Escobar.
--     Matheu / Garín baja con ella, de nivel 2 a nivel 3.
update public.zonas set madre = 'Escobar' where nombre = 'Garín';

-- 2 · Tigre, la raíz que faltaba. Coordenada del centro de Nordelta como
--     referencia del partido: es el único punto nuestro que hay ahí, y una
--     coordenada aproximada sirve más que un null para el atajo por km.
insert into public.zonas (nombre, madre, lat, lng, orden, activo) values
  ('Tigre', 'Tigre', -34.400000, -58.650000, 500, true)
on conflict (nombre) do update set madre = 'Tigre';

-- 3 · Nordelta cuelga de Tigre.
update public.zonas set madre = 'Tigre' where nombre = 'Nordelta';

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Las raíces son exactamente dos, y las dos son partidos:
select nombre from public.zonas where nombre = madre order by nombre;
-- Escobar, Tigre

-- 2. El árbol nuevo donde cambió:
select nivel, nombre, madre from public.zonas_arbol
 where nombre in ('Escobar','Garín','Matheu / Garín','Tigre','Nordelta')
 order by nivel, nombre;
-- 1 Escobar/Escobar · 1 Tigre/Tigre
-- 2 Garín/Escobar   · 2 Nordelta/Tigre
-- 3 Matheu / Garín/Garín

-- 3. Lo que arregla la búsqueda — Escobar ahora es ancestro de Garín,
--    y NO lo es de Nordelta:
select public.zonas_ancestros('Garín')    as garin,      -- {Garín,Escobar}
       public.zonas_ancestros('Nordelta') as nordelta;   -- {Nordelta,Tigre}

-- 4. Nordelta sigue siendo nivel 2, así que no desaparece del selector de
--    comunidades (listarComunidades filtra por nivel = 2):
select count(*) from public.zonas_arbol where nivel = 2;
-- 10 (las 9 de Escobar + Nordelta bajo Tigre)
