-- ═══ FIX · El denunciado podía leer la denuncia y ver quién lo denunció ═══
--
-- Detectado 2026-08-22 por el test A4 (tests/admin-c8-c10.spec.js).
-- APLICADO y verificado el mismo día: A4 pasa con todo en cero.
--
-- ── El agujero ─────────────────────────────────────────────────────────
-- Desde la sesión de un prestador denunciado, medido ANTES del fix:
--
--     porDetalle: 2   contraMi: 2   tablaEntera: 2   denunciantesVisibles: 1
--
-- Podía leer las denuncias en su contra, y venían con `denunciante_id`. Ese id
-- se cruza con `perfiles` y sale el nombre de quien lo reportó.
--
-- La causa era una sola cláusula en la policy `denuncia_leer`:
--
--     (denunciante_id = auth.uid()) OR (denunciado_id = auth.uid()) OR es_admin()
--                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^
--
-- Lo que SÍ estaba bien: el RLS acotaba por usuario, así que no podía leer
-- denuncias de terceros. El error era puntual.
--
-- ── Por qué importa acá más que en otra app ────────────────────────────
-- El vecino que denuncia ya le dio a ese prestador su nombre, su teléfono y su
-- DIRECCIÓN para contratarlo. Que pudiera averiguar quién lo reportó no era un
-- riesgo abstracto de privacidad: sabe dónde vive. Y el efecto de segundo
-- orden es peor que el caso individual — si se corre la voz de que denunciar
-- te expone, nadie denuncia y la moderación se queda sin insumo.
--
-- La UI nunca mostró nada de esto. El agujero sólo aparecía consultando la
-- tabla desde la consola del navegador, que es exactamente por qué este paso
-- se automatizó en vez de probarse a mano.
--
-- ── Por qué había que LISTAR las policies antes de tocar ───────────────
-- En PostgreSQL las policies permisivas se COMBINAN CON OR: basta que una
-- deje pasar. `denuncias` tenía TRES de SELECT — `denuncia_leer`, más dos
-- duplicados viejos (`Leer propias denuncias` y `Admin lee todas`) que
-- repetían condiciones ya cubiertas y apuntaban al rol `public`. Escribir la
-- policy nueva sin borrar las viejas habría dejado el agujero abierto con el
-- test en verde.
--
-- Se verificó también que no hubiera ninguna policy `ALL`, que también otorga
-- SELECT y no aparece si uno mira sólo las de cmd='SELECT'.
--
-- ── Fue seguro cerrarlo ────────────────────────────────────────────────
-- Las únicas lecturas de `denuncias` en el cliente son las dos del panel admin
-- (renderModeracion en app.js, contarDenunciasPendientes en datos.js). Ninguna
-- pantalla le muestra a un usuario sus propias denuncias.

drop policy if exists "Leer propias denuncias" on public.denuncias;
drop policy if exists "Admin lee todas"        on public.denuncias;
drop policy if exists "denuncia_leer"          on public.denuncias;

-- Una sola policy de lectura: el denunciante ve lo suyo, el admin ve todo, el
-- denunciado no ve nada. Menos condiciones OR conviviendo es menos superficie
-- para este tipo de error.
create policy "denuncia_leer" on public.denuncias
  for select to authenticated
  using (denunciante_id = auth.uid() or public.es_admin());

-- ── Verificación 1 ─────────────────────────────────────────────────────
-- Debe devolver UNA fila, y su `qual` no debe mencionar denunciado_id.
select policyname, roles, qual
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'denuncias'
   and cmd in ('ALL', 'SELECT');

-- ── Verificación 2 ─────────────────────────────────────────────────────
--     npx playwright test admin-c8-c10.spec.js -g "C10" --project=msedge
--
-- El C10 completo, no sólo A4: además de confirmar que el agujero cerró, hay
-- que confirmar que el ADMIN sigue viendo la cola. Un fix de más acá deja la
-- moderación ciega.
--
-- Resultado tras aplicarlo: 7 pasan.
--   [A4] porDetalle:0 contraMi:0 tablaEntera:0 denunciantesVisibles:0
--
-- ── Nota al margen ─────────────────────────────────────────────────────
-- El comentario de datos.js:2915 ("solo admin ve todas por RLS") era optimista
-- con la policy vieja: un prestador denunciado contaba también las suyas.
-- Quedó cierto con este fix.
