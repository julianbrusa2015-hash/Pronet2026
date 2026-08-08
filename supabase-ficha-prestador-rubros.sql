-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · La ficha de prestador nace con los rubros elegidos en el alta
--
-- `asegurar_ficha_prestador()` creaba siempre la fila con rubro 'General',
-- y el cliente intentaba corregirla con un UPDATE inmediatamente después.
-- Ese UPDATE no llegaba: medido en tres altas de prueba seguidas, la ficha
-- se creaba bien y los rubros quedaban en 'General' / '{}'. Un prestador
-- así es INVISIBLE — no entra en el broadcast de notificar_rubro ni
-- aparece cuando el vecino filtra por categoría, y nada falla.
--
-- La solución no es insistir con el UPDATE sino sacarle el trabajo al
-- cliente: los rubros YA viajan en el metadata del signup (los manda
-- `registrar()` para el trigger de alta). Esta función corre con
-- SECURITY DEFINER y conoce `auth.uid()`, así que puede leerlos de
-- `auth.users` y crear la fila ya correcta, en una sola operación.
--
-- 'General' se conserva sólo como último recurso, para el caso de quien
-- activa el doble perfil desde Mi Perfil (ahí no hay metadata de rubros
-- porque no pasó por el formulario de registro).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.asegurar_ficha_prestador()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_perfil record;
  v_nuevo  uuid;
  v_meta   jsonb;
  v_rubros text[];
  v_rubro  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  select id, nombre, zona, tipo, prestador_id into v_perfil
    from perfiles where id = v_uid;
  if v_perfil.id is null then
    return jsonb_build_object('ok', false, 'error', 'sin perfil');
  end if;

  -- Idempotente: si ya tiene ficha, devolverla sin crear otra.
  if v_perfil.prestador_id is not null then
    return jsonb_build_object('ok', true, 'prestador_id', v_perfil.prestador_id, 'creada', false);
  end if;

  -- Rubros elegidos en el registro. Si no hay (doble perfil activado desde
  -- Mi Perfil), queda 'General' y la app le pide que complete.
  select raw_user_meta_data into v_meta from auth.users where id = v_uid;
  begin
    v_rubros := ARRAY(select jsonb_array_elements_text(v_meta->'rubros'));
  exception when others then
    v_rubros := '{}';
  end;
  if v_rubros is null or array_length(v_rubros, 1) is null then
    v_rubro := v_meta->>'rubro';
    -- 'General' del metadata se descarta: aparenta ser un rubro real y no
    -- matchea con ningún pedido.
    if v_rubro is not null and v_rubro !~* '^general$' then
      v_rubros := ARRAY[v_rubro];
    else
      v_rubros := '{}';
    end if;
  end if;

  -- NO se exige tipo='prestador': ofrecer servicios es una acción
  -- self-service del producto, y esta función es la que la ejecuta.
  -- Tampoco se toca `tipo`, para no destruir el perfil de vecino.
  insert into prestadores (nombre, zona, rubro, rubros, activo, plan)
  values (
    coalesce(v_perfil.nombre, 'Prestador'),
    coalesce(v_perfil.zona, 'Escobar'),
    coalesce(v_rubros[1], 'General'),
    coalesce(v_rubros, '{}'),
    true, 'base'
  )
  returning id into v_nuevo;

  update perfiles set prestador_id = v_nuevo where id = v_uid;

  return jsonb_build_object('ok', true, 'prestador_id', v_nuevo, 'creada', true,
                            'rubros', to_jsonb(v_rubros));
end;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select p.nombre, p.rubro, p.rubros::text
  from public.prestadores p order by p.creado desc limit 3;
