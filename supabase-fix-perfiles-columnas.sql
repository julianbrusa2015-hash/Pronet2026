-- Revierte el REVOKE/GRANT por columna de supabase-fix-perfiles-lectura.sql.
--
-- Esa restricción (excluir 'telefono' del grant genérico) rompió el guardado
-- del propio teléfono: el UPDATE ... RETURNING de actualizar('perfiles', ...)
-- usa el mismo permiso de columna que un SELECT normal, así que ni el dueño
-- podía leer de vuelta su propio teléfono recién guardado (403).
--
-- La restricción por columna no puede distinguir "el dueño lee su propio
-- teléfono" de "cualquiera lee el teléfono de otro" — GRANT/REVOKE es por
-- rol, no por fila. Se vuelve al mismo criterio ya usado en este proyecto
-- para prestadores/resenas: lectura pública de perfiles para cualquier
-- autenticado. La función obtener_telefono_contacto() sigue existiendo y
-- es la que usa el botón de contacto del chat, pero ya no hace falta que
-- sea la ÚNICA vía — es solo el camino que ya está cableado en el cliente.

grant select on public.perfiles to authenticated;

notify pgrst, 'reload schema';
