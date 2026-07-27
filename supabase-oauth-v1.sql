-- ═══ PRONET · OAuth Google/Apple — trigger de perfil automático ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Cuando un usuario se registra por primera vez via OAuth (Google / Apple),
-- Supabase crea la fila en auth.users pero NO en public.perfiles.
-- Este trigger la crea automáticamente.
-- También cubre el signup con email/password (ON CONFLICT DO NOTHING = idempotente).

-- ── 1. Función trigger ───────────────────────────────────────────────────────
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.perfiles (id, email, nombre, tipo, zona)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'nombre',       -- email signup (campo explícito)
      new.raw_user_meta_data->>'full_name',    -- Google OAuth
      new.raw_user_meta_data->>'name',         -- Apple OAuth
      split_part(new.email, '@', 1)            -- fallback: parte antes del @
    ),
    coalesce(new.raw_user_meta_data->>'tipo', 'cliente'),
    coalesce(new.raw_user_meta_data->>'zona', 'Escobar')
  )
  on conflict (id) do nothing;   -- idempotente: no sobreescribe perfiles existentes
  return new;
end;
$$;

-- ── 2. Trigger sobre auth.users ──────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.fn_handle_new_user();

-- ── 3. Verificación ─────────────────────────────────────────────────────────
select trigger_name, event_manipulation, event_object_schema, event_object_table
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
