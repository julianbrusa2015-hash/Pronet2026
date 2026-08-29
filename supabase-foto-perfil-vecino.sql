-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El vecino puede tener foto de perfil
--
-- Sólo `prestadores` tenía `foto_url`. `perfiles` no, así que un vecino no
-- tenía dónde guardarla.
--
-- ── El síntoma era peor que "no guarda la foto" ─────────────────────────
-- `actualizarMiPerfilBasico()` manda nombre, teléfono, lote, zona y foto
-- en un ÚNICO update. Con una columna inexistente, PostgREST rechaza la
-- sentencia entera (PGRST204, "Could not find the 'foto_url' column"), así
-- que elegir una foto le rompía al vecino el guardado COMPLETO del perfil:
-- tampoco se guardaba el nombre ni el teléfono.
--
-- Y engañaba: la foto sí se sube al Storage (el bucket `avatares` tiene sus
-- policies y funciona), así que la pantalla decía "✓ Foto lista — tocá
-- Guardar para confirmar" y recién al guardar aparecía un "No se pudo
-- guardar. Probá de nuevo." que sugiere un fallo pasajero. Reintentar no
-- servía nunca.
--
-- ── Por qué hacen falta los GRANT ──────────────────────────────────────
-- `perfiles` tiene permisos POR COLUMNA, no por tabla: hoy `authenticated`
-- sólo puede escribir lat, lng, lote, nombre, telefono, tyc_aceptado_en y
-- zona (ver supabase-fix-perfiles-columnas-sensibles.sql y
-- supabase-fix-telefono-cosechable.sql). Una columna nueva NO queda
-- incluida sola: sin el grant explícito el update seguiría fallando, sólo
-- que con "permission denied" en vez de PGRST204.
--
-- No se le da nada a `anon`: la foto la escribe y la lee su dueño.
-- `mi_perfil()` es `returns setof perfiles` con `select *`, así que la
-- columna nueva le llega al cliente sin tocar el RPC.
--
-- ── Qué NO hace este archivo ───────────────────────────────────────────
-- NO agrega la foto a la vista `perfiles_publicos` (hoy expone id, nombre,
-- tipo, zona, prestador_id). Es decir: el vecino ve su propia foto, pero
-- los demás lo siguen viendo con iniciales. Mostrar la cara de un vecino
-- en el feed de Entre Vecinos, en los chats y en los servicios fijos es una
-- decisión de producto y de privacidad aparte — el prestador expone la suya
-- porque ofrece un servicio público, el vecino no necesariamente.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.perfiles
  add column if not exists foto_url text;

grant select (foto_url), update (foto_url) on public.perfiles to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='perfiles' and column_name='foto_url') as columna_existe,
  (select string_agg(privilege_type, '+' order by privilege_type)
     from information_schema.column_privileges
    where table_name='perfiles' and column_name='foto_url' and grantee='authenticated') as permisos_usuario,
  (select count(*) from information_schema.column_privileges
    where table_name='perfiles' and column_name='foto_url' and grantee='anon') as permisos_anon;
