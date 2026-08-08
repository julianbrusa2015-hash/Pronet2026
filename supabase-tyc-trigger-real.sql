-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El consentimiento se escribe en el trigger QUE REALMENTE CORRE
--
-- ── El error ────────────────────────────────────────────────────────────
-- Hay DOS funciones de alta y sólo una está conectada:
--
--   · `fn_handle_new_user`  ← la que dispara `on_auth_user_created`
--   · `handle_new_user`     ← huérfana, sin ningún trigger
--
-- Todo lo que se escribió en la segunda nunca se ejecutó. Eso incluye el
-- fix de multirubro en el alta hecho el 2026-08-08: la función tenía el
-- código correcto y no corría. Se verificó la DEFINICIÓN de la función en
-- vez de verificar que un trigger la disparara.
--
-- Lección para la próxima: `pg_get_functiondef` dice qué HARÍA una función,
-- no si alguien la llama. Para eso hay que mirar `pg_trigger`.
--
-- ── Qué hace este archivo ───────────────────────────────────────────────
-- 1. Agrega `tyc_aceptado_en` a la función viva. Es un cambio ADITIVO: no
--    toca nada de lo que ya hacía.
-- 2. Borra la huérfana, para que nadie vuelva a editarla creyendo que es la
--    buena.
--
-- La creación de la ficha de prestador NO se mueve acá: ya existe el RPC
-- idempotente `asegurar_ficha_prestador()`, que es el único lugar que
-- inserta en `prestadores`. Duplicar esa lógica en el trigger abriría la
-- puerta a filas dobles. El cliente lo llama después del alta.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
declare
  tyc_en timestamptz;
begin
  -- Timestamp del clic en el checkbox de registro. Si viene ausente o mal
  -- formado queda null: un consentimiento fabricado es peor que uno
  -- ausente, porque miente sobre algo que puede ser reclamado.
  begin
    tyc_en := (new.raw_user_meta_data->>'tyc_aceptado_en')::timestamptz;
  exception when others then
    tyc_en := null;
  end;

  INSERT INTO public.perfiles (id, nombre, tipo, zona, tyc_aceptado_en)
  VALUES (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'tipo', 'cliente'),
    coalesce(new.raw_user_meta_data->>'zona', 'Escobar'),
    tyc_en
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
end;
$function$;

-- La huérfana se va. Tenía lógica de rubros y de prestador que nunca se
-- ejecutó; conservarla sólo garantiza que alguien la vuelva a editar
-- pensando que es la que corre.
drop function if exists public.handle_new_user();

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select t.tgname as trigger_name, p.proname as funcion,
       case when pg_get_functiondef(p.oid) like '%tyc_aceptado_en%'
            then 'SÍ escribe el consentimiento' else 'NO lo escribe' end as estado
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc  p on p.oid = t.tgfoid
 where not t.tgisinternal and c.relname = 'users';
