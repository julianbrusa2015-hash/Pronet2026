-- ═══ PRONET · La reseña tiene que avisarle al prestador ═══
--
-- El bug: 7 reseñas en la base, 0 notificaciones. La campanita era un paso
-- suelto del CLIENTE, después de llamar al RPC y adentro de un
-- `if (prestadorActual)`. Si esa variable no estaba, la reseña se guardaba
-- igual y el aviso se perdía sin dejar rastro. Nada fallaba.
--
-- Por qué este test mira el CÓDIGO y no el comportamiento: ejercitar
-- `dejar_resena` de verdad exige un chat terminado, y deja atrás una reseña,
-- una notificación y el rating del prestador movido. En una base de
-- producción eso es peor que el test. La regresión que importa es
-- estructural —"alguien vuelve a sacar el aviso del RPC"— y eso sí se ve
-- en la definición de la función.
--
-- El segundo chequeo es el que evita el problema de fondo: convivían dos
-- versiones de `dejar_resena` (3 y 4 parámetros) con la lógica duplicada,
-- el mismo patrón del `handle_new_user` huérfano. La de 3 ahora delega en
-- la de 4. Si alguien vuelve a copiar el cuerpo, este test lo marca.
--
-- No escribe nada: sólo lee pg_proc. Idempotente por definición.
create or replace function public.fn_test_aviso_resena()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with defs as (
    select p.oid::regprocedure::text as firma,
           p.pronargs                as nargs,
           pg_get_functiondef(p.oid) as cuerpo
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'dejar_resena'
  ), v as (
    select
      (select count(*) from defs)                                       as versiones,
      (select bool_or(cuerpo ilike '%insert into public.notificaciones%')
         from defs where nargs = 4)                                     as avisa_en_rpc,
      -- La de 3 no debe tener su propia copia: tiene que llamar a la de 4.
      (select bool_and(cuerpo not ilike '%insert into public.notificaciones%')
         from defs where nargs = 3)                                     as corta_sin_copia,
      (select bool_or(cuerpo ilike '%dejar_resena(%')
         from defs where nargs = 3)                                     as corta_delega
  )
  select jsonb_build_object(
    'pass',  coalesce(avisa_en_rpc, false)
             and coalesce(corta_sin_copia, true)
             and coalesce(corta_delega, true),
    'versiones',       versiones,
    'avisa_en_rpc',    avisa_en_rpc,
    'corta_sin_copia', corta_sin_copia,
    'corta_delega',    corta_delega,
    'error', case
      when versiones = 0 then 'no existe public.dejar_resena'
      when not coalesce(avisa_en_rpc, false)
        then 'dejar_resena/4 ya no inserta en notificaciones: el aviso volvió a depender del cliente'
      when not coalesce(corta_sin_copia, true)
        then 'dejar_resena/3 tiene su propia copia del insert: las dos versiones pueden divergir'
      when not coalesce(corta_delega, true)
        then 'dejar_resena/3 dejó de delegar en dejar_resena/4'
      else null
    end
  ) from v;
$$;

notify pgrst, 'reload schema';

select public.fn_test_aviso_resena();
