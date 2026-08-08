-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Borra las cuentas de prueba creadas el 2026-08-08 y los [DEMO]
--
-- ALCANCE ELEGIDO POR EL USUARIO: sólo lo creado durante esta sesión.
-- NO toca ninguna cuenta suya, ni las de la suite de Playwright
-- (vecino_test / prestador_test), ni las cuentas de prueba anteriores.
--
-- ── Dos reglas de borrado que condicionan el orden ─────────────────────
--
-- `users <- pedidos` es **SET NULL**, no CASCADE: borrar un usuario NO
-- borra sus pedidos, los deja huérfanos y visibles sin dueño. Las 5
-- cuentas de acá no tienen ninguno (verificado), pero si algún día se
-- borra una cuenta con pedidos hay que decidir antes qué pasa con ellos.
--
-- `users <- loyalty` y `perfiles <- loyalty_historial` son **NO ACTION**:
-- bloquean el DELETE si hay filas. Por eso se limpian primero.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Las 5 cuentas, por patrón exacto. Cualquier otra cosa queda afuera.
create temporary table _borrar on commit drop as
select pf.id as uid, pf.prestador_id
  from public.perfiles pf
  join auth.users u on u.id = pf.id
 where u.email ~ '^(tyc|presto|final)[0-9]+@pronet\.test$';

-- Guarda de seguridad: si el patrón agarrara algo inesperado, cortar.
do $$
declare n int;
begin
  select count(*) into n from _borrar;
  if n <> 5 then
    raise exception 'Se esperaban 5 cuentas y el patrón encontró %. Abortado.', n;
  end if;
end $$;

-- 1. Dependencias que bloquean (NO ACTION)
delete from public.loyalty_historial where usuario_id in (select uid from _borrar);
delete from public.loyalty            where usuario_id in (select uid from _borrar);

-- 2. Las cuentas. perfiles cae por CASCADE desde auth.users.
delete from auth.users where id in (select uid from _borrar);

-- 3. Las fichas de prestador quedan huérfanas (perfiles las soltaba con
--    SET NULL), así que se borran aparte.
delete from public.prestadores
 where id in (select prestador_id from _borrar where prestador_id is not null);

-- 4. Datos etiquetados [DEMO]
delete from public.mensajes_chat
 where chat_id in (select id from public.chats_trabajo where ultimo_mensaje like '[DEMO]%')
    or texto like '[DEMO]%';
delete from public.chats_trabajo where ultimo_mensaje like '[DEMO]%';
delete from public.propuestas
 where pedido_id in (select id from public.pedidos where titulo like '[DEMO]%');
delete from public.pedidos where titulo like '[DEMO]%';

commit;

-- ── Verificación ────────────────────────────────────────────────────────
select 'cuentas de la sesión' as que,
       (select count(*) from auth.users where email ~ '^(tyc|presto|final)[0-9]+@pronet\.test$')::text as quedan
union all select 'pedidos [DEMO]',   (select count(*) from public.pedidos       where titulo like '[DEMO]%')::text
union all select 'chats [DEMO]',     (select count(*) from public.chats_trabajo where ultimo_mensaje like '[DEMO]%')::text
union all select 'mensajes [DEMO]',  (select count(*) from public.mensajes_chat where texto like '[DEMO]%')::text
union all select 'pedidos sin dueño', (select count(*) from public.pedidos where usuario_id is null)::text
union all select 'perfiles totales', (select count(*) from public.perfiles)::text;
