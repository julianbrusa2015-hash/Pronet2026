-- ═══════════════════════════════════════════════════════════════════════
-- Archivar: sacarse algo de la vista sin destruirlo para el otro
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23.
--
-- ── Por qué ────────────────────────────────────────────────────────────
-- El vecino podía borrar un pedido y llevarse por cascada las propuestas,
-- el chat y los mensajes de un trabajo ya hecho (ver
-- supabase-borrar-pedido-sin-propuestas.sql, que cierra esa puerta). Pero
-- cerrarla sin dar una alternativa deja al vecino sin forma de limpiar su
-- lista, que era una necesidad real.
--
-- Archivar es esa alternativa, y la regla que la ordena es:
--
--     borrás lo que es tuyo; lo que involucró a otro, se archiva.
--
-- La misma que ya aplicamos al borrar la cuenta, donde las reseñas y las
-- denuncias se conservan anonimizadas.
--
-- ── La decisión de diseño que manda sobre todo lo demás ────────────────
-- Archivar esconde de la lista de QUIEN ARCHIVA, no de la del otro. Por eso
-- es una tabla con `usuario_id` y no una columna `archivado` en `pedidos`:
-- una bandera en el pedido sería global, y el día que el prestador quiera
-- archivar una propuesta de ese mismo pedido, los dos estarían escribiendo
-- sobre el mismo booleano y se pisarían. Archivar tiene que ser una opinión
-- por persona, no un estado de la cosa.
--
-- Genérica (`tipo` + `ref_id`) porque el mismo gesto va a hacer falta para
-- chats y publicaciones, y agregarlo después sería otra tabla igual.
--
-- ── Qué NO se puede archivar ───────────────────────────────────────────
-- Nada que esté en curso. Sin esa regla, archivar sirve para esconderse de
-- un trabajo que todavía se debe —plata, una visita, algo sin terminar— y
-- después decir que "no aparecía". Hoy hay 3 chats en estado 'activo'.
--
--   pedido    → no si está 'Publicado' (todavía recibe propuestas)
--               no si tiene algún chat en 'activo' (trabajo en curso)
--   propuesta → sólo 'rechazada' o 'retirada'. Una 'pendiente' sigue en
--               juego, y una 'elegida' es un trabajo: esconderlo de su
--               propio historial no le sirve ni al prestador.

begin;

-- ── 1 · La tabla ───────────────────────────────────────────────────────
create table if not exists public.archivados (
  usuario_id uuid        not null references auth.users(id) on delete cascade,
  tipo       text        not null check (tipo in ('pedido', 'propuesta')),
  ref_id     uuid        not null,
  creado     timestamptz not null default now(),
  primary key (usuario_id, tipo, ref_id)
);

comment on table public.archivados is
  'Qué archivó cada usuario. Es una opinión por persona: archivar esconde de la lista propia y nunca de la del otro.';

-- Índice para la consulta que hace el cliente en cada listado: "qué archivé
-- yo de este tipo".
create index if not exists idx_archivados_usuario_tipo
  on public.archivados (usuario_id, tipo);

alter table public.archivados enable row level security;

-- Cada uno ve y escribe SÓLO lo suyo. Sin esto, alguien podría archivarle
-- cosas a otro — que es justo lo que archivar no tiene que poder hacer.
drop policy if exists "archivados_propios" on public.archivados;
create policy "archivados_propios" on public.archivados
  for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

revoke all on public.archivados from anon;
grant select, insert, delete on public.archivados to authenticated;

-- ── 2 · Archivar y desarchivar ─────────────────────────────────────────
-- Pasa por una función y no por un insert directo porque las reglas de "qué
-- se puede archivar" necesitan mirar filas que el usuario no siempre puede
-- leer (los chats de su pedido, el estado de la propuesta). La policy de
-- arriba queda igual como segunda barrera: si alguien inserta a mano, no
-- puede hacerlo a nombre de otro.
create or replace function public.archivar(
  p_tipo     text,
  p_ref_id   uuid,
  p_archivar boolean default true
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if p_tipo not in ('pedido', 'propuesta') then
    raise exception 'Tipo inválido: %', p_tipo;
  end if;

  -- Desarchivar no necesita validar nada: sacarse algo de archivados sólo
  -- lo devuelve a la vista.
  if not p_archivar then
    delete from public.archivados
     where usuario_id = v_uid and tipo = p_tipo and ref_id = p_ref_id;
    return;
  end if;

  if p_tipo = 'pedido' then
    if not exists (select 1 from public.pedidos pe
                    where pe.id = p_ref_id and pe.usuario_id = v_uid) then
      raise exception 'Ese pedido no es tuyo';
    end if;
    if exists (select 1 from public.pedidos pe
                where pe.id = p_ref_id and pe.estado = 'Publicado') then
      raise exception 'No podés archivar un pedido que sigue publicado. Cerralo primero.';
    end if;
    if exists (select 1 from public.chats_trabajo ct
                where ct.pedido_id = p_ref_id and ct.estado = 'activo') then
      raise exception 'Ese pedido tiene un trabajo en curso. Cerralo antes de archivarlo.';
    end if;

  else  -- propuesta
    if not exists (
      select 1 from public.propuestas pr
        join public.perfiles pf on pf.prestador_id = pr.prestador_id
       where pr.id = p_ref_id and pf.id = v_uid
    ) then
      raise exception 'Esa propuesta no es tuya';
    end if;
    if not exists (select 1 from public.propuestas pr
                    where pr.id = p_ref_id
                      and pr.estado in ('rechazada', 'retirada')) then
      raise exception 'Sólo podés archivar propuestas que ya no están en juego';
    end if;
  end if;

  insert into public.archivados (usuario_id, tipo, ref_id)
  values (v_uid, p_tipo, p_ref_id)
  on conflict (usuario_id, tipo, ref_id) do nothing;
end;
$function$;

revoke all on function public.archivar(text, uuid, boolean) from public, anon;
grant execute on function public.archivar(text, uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La tabla, su RLS y su policy:
select c.relname, c.relrowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'archivados') as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'archivados';
-- archivados · rls = true · 1 policy

-- 2. Que anon no tenga nada y authenticated sólo lo justo (sin UPDATE:
--    archivar es poner o sacar, nunca modificar):
select grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public' and table_name = 'archivados'
   and grantee in ('anon', 'authenticated')
 order by grantee, privilege_type;
-- authenticated → DELETE, INSERT, SELECT. anon → sin filas.

-- 3. Cuántos pedidos serían archivables hoy, para dimensionar:
select count(*) filter (where estado <> 'Publicado') as archivables,
       count(*) filter (where estado =  'Publicado') as bloqueados_por_publicado
  from public.pedidos;
