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
-- ── Por qué la primera versión de este archivo NO funcionó ─────────────
-- Decía sólo:
--
--     revoke update (verificado, verificado_en) on public.prestadores
--       from authenticated;
--
-- y no cambió nada. En PostgreSQL un GRANT UPDATE a nivel TABLA implica
-- todas las columnas, presentes y futuras, y un REVOKE a nivel COLUMNA no
-- lo puede recortar: corre sin error y queda igual. Para acotar por columna
-- hay que quitar primero el permiso de tabla y volver a otorgarlo columna
-- por columna, salvo las que se quieren cerrar.
--
-- Es la misma trampa del lote (GRANT de tabla vs REVOKE de columna), esta
-- vez adentro del propio fix.
--
-- ── El fix ─────────────────────────────────────────────────────────────
-- El bloque arma la lista de columnas en tiempo de ejecución, así no hay
-- que enumerarlas a mano ni actualizar este archivo cuando se agregue una.
--
-- OJO con las columnas futuras: al quedar el permiso otorgado columna por
-- columna, una columna NUEVA no queda escribible por el prestador hasta que
-- se la agregue explícitamente. Es el lado seguro del trade-off, pero hay
-- que saberlo: si mañana el prestador no puede editar un campo nuevo, es
-- por esto y se arregla volviendo a correr este bloque.
--
-- `resolver_verificacion()` es SECURITY DEFINER, así que sigue pudiendo
-- escribir el sello — el admin no se ve afectado.

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'prestadores'
     and column_name not in ('verificado', 'verificado_en');

  -- Primero cae el permiso de tabla (el que hacía inútil al revoke por
  -- columna), después se devuelve acotado.
  execute 'revoke update on public.prestadores from authenticated';
  execute format('grant update (%s) on public.prestadores to authenticated', cols);

  -- anon no tiene por qué escribir nada de esta tabla.
  execute 'revoke update on public.prestadores from anon';
end $$;

-- ── Verificación 1 ─────────────────────────────────────────────────────
-- Debe devolver CERO filas.
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'prestadores'
   and column_name in ('verificado', 'verificado_en')
   and privilege_type = 'UPDATE'
   and grantee in ('authenticated', 'anon');

-- ── Verificación 2 ─────────────────────────────────────────────────────
-- El prestador TIENE que seguir pudiendo editar el resto. Esta debe
-- devolver varias filas (descripcion, foto_url, medios_pago, rubros…).
select column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'prestadores'
   and privilege_type = 'UPDATE'
   and grantee = 'authenticated'
 order by column_name;

-- ── Después de aplicar ─────────────────────────────────────────────────
--     npx playwright test verificacion-dni.spec.js --project=msedge
--
-- Tiene que pasar entero. Hoy falla en el tercer paso (SEGURIDAD).
--
-- ── Pendiente aparte ───────────────────────────────────────────────────
-- Esto cierra las dos columnas del sello. NO audita el resto: cualquier
-- otra columna de `prestadores` que sólo deba escribir el servidor (plan,
-- destacado, puntajes de ranking, contadores) sigue escribible por el
-- prestador. La Verificación 2 de arriba lista exactamente qué quedó
-- abierto — conviene leerla con ojo y decidir qué más sacar de la lista.
