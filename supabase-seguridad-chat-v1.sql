-- ═══ PRONET · Parche de seguridad — mensajes_chat ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Problema corregido:
--   La política "mensaje_marcar_leido" tenía WITH CHECK(true), lo que
--   permitía a cualquier participante del chat modificar texto, autor_id
--   o creado además del campo leido.
--
-- Fix 1: reemplazar WITH CHECK(true) por la misma condición que USING.
-- Fix 2: trigger que bloquea a nivel DB cualquier cambio que no sea leido.

-- ── 1. Política corregida ────────────────────────────────────────
drop policy if exists "mensaje_marcar_leido" on public.mensajes_chat;
create policy "mensaje_marcar_leido"
  on public.mensajes_chat for update
  to authenticated
  using (
    exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id
        and (ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.chats_trabajo ct
      where ct.id = chat_id
        and (ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid()))
    )
  );

-- ── 2. Trigger: solo permite modificar el campo leido ────────────
create or replace function public.trg_mensajes_solo_leido_fn()
returns trigger language plpgsql as $$
begin
  if new.chat_id  is distinct from old.chat_id  or
     new.autor_id is distinct from old.autor_id or
     new.texto    is distinct from old.texto    or
     new.creado   is distinct from old.creado
  then
    raise exception 'CAMPO_PROTEGIDO: solo se permite modificar leido en mensajes_chat';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensajes_solo_leido on public.mensajes_chat;
create trigger trg_mensajes_solo_leido
  before update on public.mensajes_chat
  for each row execute function public.trg_mensajes_solo_leido_fn();

-- ── 3. Verificación ──────────────────────────────────────────────
select
  policyname,
  cmd,
  qual    as "USING",
  with_check as "WITH CHECK"
from pg_policies
where tablename = 'mensajes_chat'
order by policyname;
