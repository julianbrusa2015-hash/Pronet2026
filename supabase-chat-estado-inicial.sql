-- ═══ PRONET · Un chat nuevo nacía "activo" ═════════════════════════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── Qué pasaba ─────────────────────────────────────────────────────────
-- `chats_trabajo.estado` tenía DEFAULT 'activo', y `abrir_chat_propuesta`
-- inserta sin nombrar la columna. O sea que cualquier chat abierto desde una
-- propuesta nacía en 'activo' — el estado que significa "el vecino me eligió
-- y el trabajo está en curso".
--
-- Encontrado corriendo el circuito completo: un prestador que sólo había
-- ofertado abría el chat y quedaba, para la base, contratado.
--
-- ── Qué rompía ─────────────────────────────────────────────────────────
-- 1. El teléfono del vecino. La regla que separa "consultando" de "elegido"
--    mira justamente `estado in ('activo', ...)`. Con el chat naciendo en
--    'activo', cualquier prestador que ofertaba y abría el chat se llevaba
--    el teléfono sin que nadie lo eligiera. Medido: Pablo Rueda, sin ningún
--    trabajo previo, obtuvo el teléfono de vecino_test.
--
-- 2. El tablero del prestador. "Trabajo en curso" cuenta los chats en
--    'activo': mostraba un trabajo ganado que no existía.
--
-- 3. El chat mismo, que ofrecía "Marcar terminado" sobre algo no contratado.
--
-- ── El arreglo ─────────────────────────────────────────────────────────
-- El estado se dice explícitamente al crear, según la propuesta:
--   propuesta elegida  → 'activo'          (viene de elegir_propuesta)
--   cualquier otra     → 'propuesta_enviada'
--
-- Y el DEFAULT de la columna pasa a 'consulta'. Un default tiene que fallar
-- del lado seguro: si mañana otro camino olvida nombrar la columna, que
-- conceda de menos y no de más.

alter table public.chats_trabajo alter column estado set default 'consulta';

create or replace function public.abrir_chat_propuesta(p_propuesta_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_prop    record;
  v_chat_id uuid;
  v_estado  text;
begin
  select pr.*, pe.usuario_id as vecino_id
  into v_prop
  from public.propuestas pr
  join public.pedidos pe on pe.id = pr.pedido_id
  where pr.id = p_propuesta_id;

  if not found then
    raise exception 'PROPUESTA_NO_ENCONTRADA';
  end if;

  -- Quien llama tiene que ser el vecino dueño del pedido o el prestador autor.
  if v_prop.vecino_id != auth.uid() and
     v_prop.prestador_id != (select prestador_id from public.perfiles where id = auth.uid()) then
    raise exception 'SIN_PERMISO';
  end if;

  -- El estado sale de la propuesta, no del default de la columna. Abrir un
  -- chat no contrata a nadie: sólo elegir_propuesta pone 'activo'. Si la
  -- propuesta YA está elegida, el chat nace activo porque el trabajo empezó.
  v_estado := case when v_prop.estado in ('elegida', 'activo')
                   then 'activo' else 'propuesta_enviada' end;

  insert into public.chats_trabajo (
    propuesta_id, pedido_id, vecino_id, prestador_id, estado
  ) values (
    p_propuesta_id, v_prop.pedido_id, v_prop.vecino_id, v_prop.prestador_id, v_estado
  )
  on conflict (propuesta_id) do nothing
  returning id into v_chat_id;

  if v_chat_id is null then
    select id into v_chat_id
    from public.chats_trabajo
    where propuesta_id = p_propuesta_id;
  end if;

  return v_chat_id;
end;
$fn$;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- El default, y los chats que hoy dicen 'activo' sin una propuesta elegida
-- detrás (deberían ser cero después de limpiar los de prueba).
select (select column_default from information_schema.columns
         where table_schema='public' and table_name='chats_trabajo' and column_name='estado') as default_nuevo,
       (select count(*) from chats_trabajo c
          left join propuestas pr on pr.id = c.propuesta_id
         where c.estado = 'activo'
           and (pr.id is null or pr.estado not in ('elegida','activo'))) as activos_sin_respaldo;
