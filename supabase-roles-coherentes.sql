-- ═══ PRONET · `roles` coherente con `tipo` en el alta ══════════════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── El problema ────────────────────────────────────────────────────────
-- fn_handle_new_user escribía `tipo` desde la metadata del registro pero
-- nunca tocaba `roles`, que se quedaba con el default de la columna
-- ({cliente}). Resultado: todo prestador que se registraba solo quedaba con
-- roles mintiendo, y convivían cuatro combinaciones distintas:
--
--   tipo: prestador  roles: {cliente}            (los que se anotaron solos)
--   tipo: prestador  roles: {prestador}
--   tipo: prestador  roles: {prestador,cliente}
--   tipo: cliente    roles: {cliente}
--
-- ── Por qué la lista blanca NO es paranoia ─────────────────────────────
-- `tipo` sale de raw_user_meta_data, que la manda el CLIENTE en el signUp.
-- Hoy eso es inofensivo porque es_admin() mira `roles`, no `tipo`, y roles
-- nunca se escribía. O sea: el bug de coherencia estaba tapando un agujero.
--
-- Copiar `tipo` a `roles` sin filtrar lo destapa: alguien se registra con
-- {"tipo":"admin"} en la metadata, el trigger le escribe roles {admin}, y
-- es_admin() le dice que sí. Autopromoción a admin desde el formulario de
-- registro.
--
-- Por eso el rol se decide con un CASE cerrado y no copiando el valor:
-- 'prestador' es lo único que se acepta como distinto, y cualquier otra
-- cosa —incluido 'admin', un typo, o basura— cae en 'cliente'.
--
-- El rol admin se otorga a mano en la base. No hay camino desde el registro.

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  tyc_en timestamptz;
  v_tipo text;
begin
  -- Timestamp del clic en el checkbox de registro. Si viene ausente o mal
  -- formado queda null: un consentimiento fabricado es peor que uno
  -- ausente, porque miente sobre algo que puede ser reclamado.
  begin
    tyc_en := (new.raw_user_meta_data->>'tyc_aceptado_en')::timestamptz;
  exception when others then
    tyc_en := null;
  end;

  -- Lista blanca. Ver el comentario de arriba: esto es lo que impide que
  -- alguien se dé de alta como admin mandando 'admin' en la metadata.
  v_tipo := case
              when new.raw_user_meta_data->>'tipo' = 'prestador' then 'prestador'
              else 'cliente'
            end;

  insert into public.perfiles (id, nombre, tipo, roles, zona, tyc_aceptado_en)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    v_tipo,
    array[v_tipo],
    coalesce(new.raw_user_meta_data->>'zona', 'Escobar'),
    tyc_en
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

-- ── Verificación: nadie tiene admin salvo quien debe ───────────────────
select p.tipo, p.roles::text as roles, count(*)::text as cuentas
  from perfiles p
 group by p.tipo, p.roles::text
 order by p.tipo;
