-- ═══ PRONET · Fixes de seguridad — Etapa 8 ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Nota: al auditar 'denuncias' encontramos que ya tenía RLS configurada
-- directo en el dashboard (políticas "Crear denuncia", "Leer propias
-- denuncias", "Admin lee todas", "Admin actualiza denuncias"), solo que
-- nunca se versionó acá. Se verificó que son igual de restrictivas que
-- lo que se iba a agregar, así que este archivo ya NO las duplica —
-- solo documenta que existen, para que quede registro en el repo.
--
-- El único fix real de este archivo es el trigger de mensajes_chat (#2):
-- la policy 'mensaje_marcar_leido' tiene WITH CHECK (true), lo que en
-- teoría permitía modificar cualquier columna del mensaje al "marcar
-- leído" (no solo el campo 'leido'). Eso sí era nuevo y no estaba cubierto.

-- ── 1. RLS de denuncias — YA EXISTE EN PRODUCCIÓN, solo documentado ──
-- create policy "Crear denuncia" on public.denuncias for insert
--   to authenticated with check (auth.uid() = denunciante_id);
-- create policy "Leer propias denuncias" on public.denuncias for select
--   to authenticated using (auth.uid() = denunciante_id);
-- create policy "Admin lee todas" on public.denuncias for select
--   to authenticated using (exists (select 1 from perfiles
--     where perfiles.id = auth.uid() and 'admin' = any(perfiles.roles)));
-- create policy "Admin actualiza denuncias" on public.denuncias for update
--   to authenticated using (exists (select 1 from perfiles
--     where perfiles.id = auth.uid() and 'admin' = any(perfiles.roles)));

-- ── 2. Proteger columnas de mensajes_chat en el update de "leído" ──
-- La policy mensaje_marcar_leido ya restringe QUIÉN puede hacer el update
-- (participantes del chat); este trigger restringe QUÉ puede cambiar,
-- para que no se pueda alterar texto/autor/chat de un mensaje ajeno.
create or replace function public.proteger_campos_mensaje()
returns trigger language plpgsql as $$
begin
  if new.texto is distinct from old.texto
     or new.autor_id is distinct from old.autor_id
     or new.chat_id is distinct from old.chat_id
     or new.creado is distinct from old.creado then
    raise exception 'Solo se puede modificar el campo leido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_campos_mensaje on public.mensajes_chat;
create trigger trg_proteger_campos_mensaje
  before update on public.mensajes_chat
  for each row execute function public.proteger_campos_mensaje();

-- ── 3. Verificación ────────────────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where tablename in ('denuncias', 'mensajes_chat')
order by tablename, cmd;
