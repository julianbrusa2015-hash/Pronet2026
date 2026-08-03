-- CRÍTICO: authenticated no tenía SELECT a nivel de tabla en perfiles.
-- Encontrado en auditoría de seguridad 2026-08-02. Confirmado que rompía
-- en producción CUALQUIER guardado de perfil (actualizar() hace
-- .select().single() como RETURNING tras el UPDATE, que requiere SELECT).
--
-- Historial: un REVOKE SELECT + GRANT SELECT (columnas específicas) se
-- aplicó para proteger 'telefono' de lectura masiva. Un GRANT SELECT ON
-- perfiles TO authenticated posterior (para arreglar el guardado) debería
-- haber restaurado todo — pero el guardado volvió a romperse en algún
-- punto posterior de la sesión (posible reset de ACL no identificado).
-- Dado que ya rompió el guardado DOS veces, se abandona la protección de
-- columna para 'telefono': mismo criterio que prestadores/resenas en este
-- proyecto (lectura pública para cualquier autenticado). La protección real
-- contra cosecha masiva sigue siendo obtener_telefono_contacto() como único
-- camino recomendado en el cliente, pero ya no es la única forma de leerlo.
grant select on public.perfiles to authenticated;

notify pgrst, 'reload schema';
