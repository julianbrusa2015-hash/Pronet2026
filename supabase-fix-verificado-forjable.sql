-- ═══ FIX · El badge "verificado" era forjable por el propio prestador ═══
--
-- Detectado 2026-08-22 por el test C14 (tests/verificacion-dni.spec.js).
--
-- ── El agujero ─────────────────────────────────────────────────────────
-- La policy `prestador_edita_su_fila` (supabase-perfil-v3.sql) deja al
-- prestador editar SU fila de `prestadores`. RLS filtra FILAS, no COLUMNAS:
-- una vez que la fila pasa el filtro, se puede escribir cualquier columna.
--
-- Resultado: desde la consola del navegador, con la sesión propia,
--
--     await _sb.from('prestadores')
--       .update({ verificado: true })
--       .eq('id', (await _sb.rpc('mi_prestador_id')).data);
--
-- encendía el sello que el vecino lee como "PRONET revisó el DNI de esta
-- persona". El circuito de `prestadores_verificacion` estaba bien cerrado
-- (el `with check` impide autoaprobarse la solicitud) — pero se lo salteaba
-- por el costado, escribiendo la bandera pública directamente.
--
-- Es la misma trampa del lote: GRANT de tabla vs REVOKE de columna.
--
-- ── El fix ─────────────────────────────────────────────────────────────
-- Postgres soporta permisos a nivel columna. Se le quita a `authenticated`
-- el UPDATE sobre las dos columnas del sello, sin tocar la policy: el
-- prestador sigue editando descripción, rubros, cobertura y todo lo demás.
--
-- `resolver_verificacion()` es SECURITY DEFINER, así que sigue pudiendo
-- escribirlas — el admin no se ve afectado.

revoke update (verificado, verificado_en) on public.prestadores from authenticated;
revoke update (verificado, verificado_en) on public.prestadores from anon;

-- ── Verificación ───────────────────────────────────────────────────────
-- Debe devolver CERO filas. Si devuelve alguna, el revoke no se aplicó.
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'prestadores'
   and column_name in ('verificado', 'verificado_en')
   and privilege_type = 'UPDATE'
   and grantee in ('authenticated', 'anon');

-- ── Después de aplicar ─────────────────────────────────────────────────
-- Correr el test que lo detectó, que ahora tiene que pasar entero:
--
--     npx playwright test verificacion-dni.spec.js --project=msedge
--
-- ── Pendiente aparte ───────────────────────────────────────────────────
-- Este revoke cierra las dos columnas del sello. NO audita el resto de la
-- tabla: cualquier otra columna de `prestadores` que sólo deba escribir el
-- servidor (plan, destacado, puntajes de ranking, contadores) tiene el mismo
-- agujero abierto. Para listar candidatos:
--
--     select column_name from information_schema.columns
--      where table_schema='public' and table_name='prestadores'
--      order by ordinal_position;
