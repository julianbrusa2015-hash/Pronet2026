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

revoke select on public.perfiles from authenticated;
grant select (id, creado, nombre, tipo, zona, prestador_id, roles, es_pro_marketplace, pro_marketplace_hasta, promarket_creditos)
  on public.perfiles to authenticated;

notify pgrst, 'reload schema';
