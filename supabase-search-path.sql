-- Fijar search_path en todas las funciones SECURITY DEFINER del esquema public.
-- Cierra el punto 2 de AUDITORIA-2026-08-12.md.
--
-- Por qué importa: una función SECURITY DEFINER corre con los permisos de su
-- dueño (postgres). Si resuelve un nombre sin calificar y alguien logra que ese
-- nombre apunte a otro objeto, ejecuta código ajeno como superusuario. En
-- PRONET esto NO era explotable —anon/authenticated no tienen CREATE en public
-- y PostgREST no ejecuta SQL arbitrario— pero es endurecimiento barato y las
-- dos funciones más sensibles (es_admin, fn_verificar_pin_admin) estaban en la
-- lista.
--
-- Por qué 'public, pg_temp' y no sólo 'public':
-- si pg_temp no se nombra, Postgres lo busca ANTES que pg_catalog para resolver
-- nombres de tabla. Y crear tablas temporales sí está permitido para
-- authenticated (el privilegio TEMP es de PUBLIC por defecto). Nombrarlo último
-- lo deja de último. Para nombres de función pg_temp nunca se usa, así que el
-- riesgo era sólo de tablas — pero es el mismo costo cerrarlo bien.
--
-- Se verificó una por una que ninguna dependa del esquema 'extensions':
-- pgcrypto y uuid-ossp viven ahí, pero ninguna de estas funciones los usa
-- (pg_trgm y unaccent, que sí se usan, viven en public). El PIN de admin
-- compara texto plano, no usa crypt().

-- NO se toca rls_auto_enable: está en 'pg_catalog' a propósito (es un event
-- trigger de DDL que sólo usa catálogo). Meterle 'public' sería ampliarle el
-- camino, o sea lo contrario de lo que busca este script.

do $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       -- las 23 sin nada, y las 67 que tienen 'public' pero les falta pg_temp
       and (p.proconfig is null
            or exists (
              select 1 from unnest(p.proconfig) c
               where c = 'search_path=public'
            ))
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.firma);
    n := n + 1;
  end loop;
  raise notice 'search_path fijado en % funciones', n;
end $$;
