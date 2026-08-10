-- Cierra el hueco encontrado por el test PM-6: desde el fix de "no se podía
-- guardar el teléfono" (supabase-fix-perfiles-columnas.sql), la tabla perfiles
-- quedó con GRANT SELECT completo para authenticated, incluyendo teléfono —
-- cualquier usuario logueado podía leer el de cualquier otro con un select
-- directo, no solo mediante el chat compartido.
--
-- La solución esta vez SÍ separa los dos casos que antes se pisaban:
--   - Lectura ajena (comentarios, feed, "mis consultas"): sólo columnas
--     públicas, teléfono afuera.
--   - Lectura propia completa (para prellenar el form de edición): sigue
--     yendo por mi_perfil() (security definer, ya existía, no se tocó).
--   - Guardar el propio teléfono: el problema original era que el UPDATE
--     de datos.js pedía la fila de vuelta con RETURNING/.select(), y el
--     RETURNING está sujeto al mismo grant de columna que un SELECT. La
--     solución ahora es no pedir la fila de vuelta en esa escritura
--     puntual (ver actualizarMiPerfilBasico en datos.js) — no hace falta
--     abrir la columna para que el dueño pueda escribir la suya.

-- ── Corrección 2026-08-09, antes de aplicarlo por primera vez ──────────
-- Este archivo quedó commiteado el 2026-08-02 pero NUNCA se corrió en la
-- base: el grant seguía siendo de tabla completa. Al revisarlo aparecieron
-- dos cosas para ajustar.
--
-- 1) Faltaba `tyc_aceptado_en` en la lista. `registrarAceptacionTyc`
--    (datos.js) lo lee para no pisar la fecha de la PRIMERA aceptación. Sin
--    el grant ese select falla, el guard nunca corta y la fecha se
--    reescribiría en cada aceptación. No es un dato sensible: es el
--    timestamp propio de haber aceptado los términos.
--
-- 2) `anon` también tenía el grant de tabla completa, teléfono incluido.
--    Hoy no es explotable porque no hay ninguna policy de SELECT para anon
--    y RLS le devuelve cero filas — pero el grant no debería estar. Si
--    mañana alguien agrega una policy para invitados, el teléfono se iría
--    con ella sin que nadie lo note. Se cierra ahora.
revoke select on public.perfiles from authenticated, anon;

grant select (id, creado, nombre, tipo, zona, prestador_id, roles,
              es_pro_marketplace, pro_marketplace_hasta, promarket_creditos,
              tyc_aceptado_en)
  on public.perfiles to authenticated;

-- anon queda con las mínimas: RLS igual le devuelve cero filas, esto es la
-- segunda cerradura por si esa policy cambia.
grant select (id, nombre) on public.perfiles to anon;

notify pgrst, 'reload schema';

-- Verificación: `telefono` no puede aparecer en esta lista.
select grantee, string_agg(column_name, ', ' order by column_name) as columnas
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'perfiles'
   and privilege_type = 'SELECT' and grantee in ('authenticated', 'anon')
 group by grantee;
