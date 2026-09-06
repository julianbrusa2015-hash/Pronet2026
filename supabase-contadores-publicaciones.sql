-- ═══ PRONET · Los contadores de likes y comentarios no subían ══════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── El síntoma ─────────────────────────────────────────────────────────
-- El comentario se ve al entrar a la publicación, pero la tarjeta muestra 0.
-- Lo mismo con los likes.
--
-- ── La causa ───────────────────────────────────────────────────────────
-- Los dos triggers eran `language plpgsql` a secas, SIN security definer.
-- Un trigger sin security definer corre con los permisos de quien disparó
-- la operación, así que el
--
--     update public.publicaciones set comentarios_count = ... where id = ...
--
-- pasa por RLS. Y la policy de UPDATE de publicaciones es
-- `publicaciones_editar_propia (autor_id = auth.uid())`: sólo el dueño puede
-- tocar su publicación.
--
-- Resultado: el UPDATE afectaba CERO filas y no fallaba. Un UPDATE que no
-- matchea nada es un éxito para Postgres, así que el trigger devolvía bien y
-- el contador se quedaba donde estaba.
--
-- Lo que lo hacía difícil de ver es que funcionaba justo en el caso que uno
-- prueba primero — darle like a lo propio:
--
--   "Excelente campera"           autor vecino_test, like de vecino_test    → 1  ✓
--   "Trabajo de Carteles de lote" autor vecino_test, like de julianbrusa    → 0  ✗
--
-- O sea que andaba sólo cuando el contador no importa, y fallaba siempre que
-- el que interactúa es otro — que es el 100% de los casos reales.
--
-- ── El arreglo ─────────────────────────────────────────────────────────
-- security definer, para que el contador se actualice al margen de RLS.
--
-- Es seguro: lo único que escriben es un +1/-1 sobre la fila que la FK ya
-- identifica (NEW.publicacion_id). No reciben parámetros del cliente ni
-- eligen la fila con datos arbitrarios. Quién puede comentar o dar like lo
-- sigue decidiendo la RLS de esas tablas, que no se toca.
--
-- Se les agrega también `set search_path`, que tampoco tenían.

create or replace function public.fn_sync_comentarios_count()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if TG_OP = 'INSERT' then
    update public.publicaciones
       set comentarios_count = comentarios_count + 1
     where id = NEW.publicacion_id;
  elsif TG_OP = 'DELETE' then
    update public.publicaciones
       set comentarios_count = greatest(comentarios_count - 1, 0)
     where id = OLD.publicacion_id;
  end if;
  return null;
end;
$fn$;

create or replace function public.fn_sync_likes_count()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if TG_OP = 'INSERT' then
    update public.publicaciones
       set likes_count = likes_count + 1
     where id = NEW.publicacion_id;
  elsif TG_OP = 'DELETE' then
    update public.publicaciones
       set likes_count = greatest(likes_count - 1, 0)
     where id = OLD.publicacion_id;
  end if;
  return null;
end;
$fn$;

-- ── Recalcular lo que quedó mal ────────────────────────────────────────
-- Todo lo acumulado hasta ahora está desfasado. Se recalcula contra la
-- verdad en vez de intentar corregir por diferencia.
update public.publicaciones p
   set comentarios_count = (select count(*) from public.comentarios_publicaciones c
                             where c.publicacion_id = p.id),
       likes_count       = (select count(*) from public.likes_publicaciones l
                             where l.publicacion_id = p.id);

-- ── Verificación: el contador contra la realidad ───────────────────────
select p.titulo,
       p.likes_count,
       (select count(*) from public.likes_publicaciones l where l.publicacion_id = p.id) as likes_reales,
       p.comentarios_count,
       (select count(*) from public.comentarios_publicaciones c where c.publicacion_id = p.id) as comentarios_reales
  from public.publicaciones p
 order by p.creado;
