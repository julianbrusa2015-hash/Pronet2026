-- ═══ Borrar una cuenta no borra las reseñas ni las denuncias ═══
--
-- 2026-08-22. Decisión de negocio: conservar ambas, anonimizadas.
--
-- ── Por qué ────────────────────────────────────────────────────────────
-- Hoy, cuando un vecino borra su cuenta, se lleva las reseñas que escribió.
-- Un plomero con 20 reseñas puede ver cambiar su rating porque alguien que ya
-- no está decidió darse de baja. La reseña dice algo sobre EL PRESTADOR, no
-- sobre quien la escribió: es reputación de la comunidad, no dato personal del
-- autor.
--
-- Lo mismo con las denuncias: son registro de moderación.
--
-- Se conserva el HECHO y se borra el DATO PERSONAL. El autor queda en null.
--
-- ── La cadena que hay que cortar ───────────────────────────────────────
-- No alcanza con el autor. Borrar al vecino cascadea así:
--
--   auth.users → pedidos → propuestas → chats_trabajo → resenas
--
-- O sea que la reseña se iba por DOS caminos: por su vecino_id y por su
-- chat_id. Hay que soltar los dos.
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────
-- prestador_id sigue en cascada: si se borra la ficha del prestador, sus
-- reseñas se van con él. Correcto — sin prestador la reseña no significa nada.

begin;

-- ── 1 · Reseñas: sobrevivir al autor y al chat ───────────────────────
alter table public.resenas alter column vecino_id drop not null;
alter table public.resenas alter column chat_id   drop not null;

-- Los nombres de constraint se buscan en el catálogo en vez de asumirlos:
-- si alguna se creó con otro nombre, un drop a ciegas fallaría.
do $$
declare
  v_nombre text;
begin
  select conname into v_nombre from pg_constraint
   where conrelid = 'public.resenas'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.resenas'::regclass and attname = 'vecino_id')];
  if v_nombre is not null then
    execute format('alter table public.resenas drop constraint %I', v_nombre);
  end if;

  select conname into v_nombre from pg_constraint
   where conrelid = 'public.resenas'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.resenas'::regclass and attname = 'chat_id')];
  if v_nombre is not null then
    execute format('alter table public.resenas drop constraint %I', v_nombre);
  end if;
end $$;

alter table public.resenas
  add constraint resenas_vecino_id_fkey
  foreign key (vecino_id) references auth.users(id) on delete set null;

alter table public.resenas
  add constraint resenas_chat_id_fkey
  foreign key (chat_id) references public.chats_trabajo(id) on delete set null;

comment on column public.resenas.vecino_id is
  'Autor. Queda NULL si borra su cuenta: la reseña se conserva porque habla del prestador, no del autor.';

-- El unique(chat_id) sigue sirviendo: Postgres permite varios NULL en un
-- índice único, así que muchas reseñas huérfanas no chocan entre sí.

-- ── 2 · Denuncias: conservar el registro de moderación ───────────────
alter table public.denuncias alter column denunciante_id drop not null;
alter table public.denuncias alter column denunciado_id  drop not null;

comment on table public.denuncias is
  'Registro de moderación. Al borrar una cuenta se anonimizan los ids, no se borra la fila: el hecho es de la comunidad.';

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Las FK quedaron en SET NULL:
--      select conname, confdeltype from pg_constraint
--       where conrelid = 'public.resenas'::regclass and contype = 'f';
--      -- confdeltype 'n' = SET NULL, 'c' = CASCADE, 'a' = NO ACTION
--      -- vecino_id y chat_id tienen que decir 'n'; prestador_id sigue en 'c'
--
-- 2. Las columnas aceptan null:
--      select column_name, is_nullable from information_schema.columns
--       where table_name in ('resenas','denuncias')
--         and column_name in ('vecino_id','chat_id','denunciante_id','denunciado_id');
--
-- 3. Después de desplegar eliminar-cuenta, borrar una cuenta de prueba con
--    reseñas escritas y confirmar que siguen contando para el rating del
--    prestador reseñado.
