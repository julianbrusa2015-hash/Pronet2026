-- ═══ Blocklist de teléfonos: que borrar la cuenta no limpie los antecedentes ═══
--
-- 2026-08-22.
--
-- ── El agujero ─────────────────────────────────────────────────────────
-- `eliminar-cuenta` borra las denuncias RECIBIDAS por el usuario, y el borrado
-- de `auth.users` cascadea `perfiles` — que es donde vive la unicidad del
-- teléfono (`idx_perfiles_telefono_unico`).
--
-- Resultado: un prestador denunciado o suspendido borra su cuenta, se van sus
-- antecedentes, se libera su número, y se reinscribe con el MISMO teléfono,
-- limpio. El botón de borrar cuenta anula el antifraude de
-- "un teléfono, una cuenta".
--
-- ── Qué hace esto ──────────────────────────────────────────────────────
-- Guarda un HASH del teléfono cuando la cuenta que se borra tenía denuncias
-- confirmadas o estaba suspendida, y bloquea el alta con ese número.
--
-- Se guarda el hash y no el número para no dejar una lista de teléfonos de
-- personas en la base.
--
-- ── Honestidad sobre el hash ───────────────────────────────────────────
-- Hashear un teléfono NO es protección criptográfica seria: son 10 dígitos,
-- o sea 10^10 combinaciones, que cualquiera con la tabla revierte por fuerza
-- bruta en minutos. El valor real es otro: la tabla deja de ser una lista de
-- teléfonos legible y cosechable de un vistazo. Es higiene de datos, no
-- secreto. Decirlo de otro modo sería vender una garantía que no existe.
--
-- ── Lo que esto NO resuelve ────────────────────────────────────────────
-- Quien quiera evadir consigue otro número. Esto sube el costo de la evasión
-- —de "apretar un botón" a "conseguir otra línea"—, no la vuelve imposible.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.telefonos_vetados (
  hash       text primary key,
  motivo     text not null,
  vetado_en  timestamptz not null default now()
);

comment on table public.telefonos_vetados is
  'Hashes de teléfonos que no pueden volver a registrarse. Se alimenta al borrar una cuenta con antecedentes. Sin policies: sólo service_role.';

-- RLS activo y ninguna policy: nadie desde el cliente lee ni escribe. Mismo
-- criterio que `pagos_procesados`.
alter table public.telefonos_vetados enable row level security;
revoke all on public.telefonos_vetados from anon, authenticated;

-- ── Normalización: la MISMA que la unicidad ──────────────────────────
-- idx_perfiles_telefono_unico compara right(regexp_replace(tel,'\D','','g'),10).
-- Si acá se normalizara distinto, el veto no coincidiría con lo que se
-- registra y la blocklist no serviría para nada.
create or replace function public.hash_telefono(p_tel text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when btrim(coalesce(p_tel, '')) = '' then null
    else encode(digest(right(regexp_replace(p_tel, '\D', '', 'g'), 10), 'sha256'), 'hex')
  end;
$$;

revoke all on function public.hash_telefono(text) from public, anon, authenticated;

-- ── El bloqueo, en un trigger ────────────────────────────────────────
-- Va en un trigger y no en la app a propósito: cubre TODOS los caminos que
-- escriban un teléfono —registro, gate de teléfono, edición de perfil, y
-- cualquiera que se agregue después— sin que nadie tenga que acordarse.
create or replace function public.chequear_telefono_vetado()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if btrim(coalesce(new.telefono, '')) = '' then
    return new;
  end if;
  -- Sólo cuando el teléfono cambia: si no, editar cualquier otro campo de un
  -- perfil ya existente fallaría.
  if tg_op = 'UPDATE' and coalesce(old.telefono, '') = coalesce(new.telefono, '') then
    return new;
  end if;

  v_hash := public.hash_telefono(new.telefono);
  if v_hash is not null and exists (
       select 1 from public.telefonos_vetados where hash = v_hash) then
    raise exception 'TELEFONO_VETADO';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_telefono_vetado on public.perfiles;
create trigger trg_telefono_vetado
  before insert or update of telefono on public.perfiles
  for each row execute function public.chequear_telefono_vetado();

-- ── Vetar al borrar: lo llama eliminar-cuenta ────────────────────────
-- Decide sola si corresponde vetar, para que la Edge Function no tenga que
-- replicar el criterio. Devuelve true si veto.
create or replace function public.vetar_telefono_si_corresponde(p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel        text;
  v_pid        uuid;
  v_motivo     text;
  v_denuncias  int := 0;
  v_suspendido boolean := false;
begin
  select telefono, prestador_id into v_tel, v_pid
    from public.perfiles where id = p_usuario_id;
  if btrim(coalesce(v_tel, '')) = '' then
    return false;
  end if;

  -- Antecedente 1: denuncias confirmadas contra esta persona.
  select count(*) into v_denuncias
    from public.denuncias
   where denunciado_id = p_usuario_id
     and resolucion = 'falta_confirmada';

  -- Antecedente 2: la ficha de prestador estaba suspendida.
  if v_pid is not null then
    select coalesce(suspendido, false) into v_suspendido
      from public.prestadores where id = v_pid;
  end if;

  if v_denuncias = 0 and not v_suspendido then
    return false;   -- se va sin antecedentes: no se veta nada
  end if;

  v_motivo := case
    when v_suspendido and v_denuncias > 0 then 'suspendido y ' || v_denuncias || ' denuncia(s) confirmada(s)'
    when v_suspendido then 'cuenta suspendida'
    else v_denuncias || ' denuncia(s) confirmada(s)'
  end;

  insert into public.telefonos_vetados (hash, motivo)
  values (public.hash_telefono(v_tel), v_motivo)
  on conflict (hash) do nothing;

  return true;
end;
$$;

revoke all on function public.vetar_telefono_si_corresponde(uuid) from public, anon, authenticated;
grant execute on function public.vetar_telefono_si_corresponde(uuid) to service_role;

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. La tabla existe y está vacía:
--      select count(*) from public.telefonos_vetados;
--
-- 2. El trigger está puesto:
--      select tgname from pg_trigger where tgrelid = 'public.perfiles'::regclass
--       and not tgisinternal;
--
-- 3. Probar el bloqueo SIN borrar ninguna cuenta — vetar un número inventado
--    y confirmar que no se puede usar:
--      insert into public.telefonos_vetados (hash, motivo)
--      values (public.hash_telefono('1122009900'), 'prueba, borrar');
--      -- intentar poner ese telefono en un perfil de prueba → TELEFONO_VETADO
--      delete from public.telefonos_vetados where motivo = 'prueba, borrar';
--
-- ── Para desvetar a alguien ────────────────────────────────────────────
-- No hay UI. Si hubo un error y una persona quedó bloqueada injustamente:
--      delete from public.telefonos_vetados
--       where hash = public.hash_telefono('EL-NUMERO');
