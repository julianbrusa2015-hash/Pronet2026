-- ═══ PRONET · Notificar al admin cuando hay un aviso de prestador para revisar ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Hasta ahora sólo se notificaba al PRESTADOR (aprobado/rechazado, ver
-- resolver_pub_prestador en supabase-publicaciones-prestador.sql). El admin
-- no tenía ningún aviso de que algo esperaba en el Panel de Moderación —
-- tenía que entrar a revisar a ciegas, sin saber si había algo nuevo.

create or replace function public.notificar_admin_pub_prestador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  -- Sólo cuando ENTRA en 'pendiente': un insert directo en pendiente, o un
  -- update que la mueve a pendiente desde otro estado (reenvío tras
  -- rechazo). No dispara en cada edición de un borrador ni al aprobar/
  -- rechazar (esos ya tienen su propia notificación, al prestador).
  if new.estado is distinct from 'pendiente' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'pendiente' then
    return new;
  end if;

  v_titulo := coalesce(new.titulo, 'Aviso de prestador');

  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  select p.id, 'mod_pub_prestador',
         '🛠️ Nuevo aviso para revisar',
         '"' || v_titulo || '" está esperando tu aprobación en el Panel de Moderación.',
         '/#s-moderacion'
    from public.perfiles p
   where 'admin' = any(p.roles);

  return new;
end;
$$;

drop trigger if exists trg_notificar_admin_pub_prestador on public.publicaciones_prestador;
create trigger trg_notificar_admin_pub_prestador
  after insert or update of estado on public.publicaciones_prestador
  for each row execute function public.notificar_admin_pub_prestador();

-- ── Verificación ────────────────────────────────────────────────────────
select tgname from pg_trigger where tgname = 'trg_notificar_admin_pub_prestador';
