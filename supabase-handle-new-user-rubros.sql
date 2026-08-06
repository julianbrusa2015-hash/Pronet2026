-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El alta guarda el array de rubros, no sólo el principal
--
-- handle_new_user() leía `raw_user_meta_data->>'rubro'` y caía en
-- 'General' si no venía. Ese defecto dejaba la cuenta INVISIBLE: no
-- entraba en el broadcast de notificar_rubro ni aparecía cuando el vecino
-- filtraba por categoría. Cuatro de los once prestadores quedaron así.
--
-- El registro ahora exige elegir al menos un rubro y los manda en el
-- metadata como `rubros` (array) + `rubro` (el primero).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
  nuevo_prestador_id uuid;
  tipo_usuario text;
  zona_usuario text;
  nombre_usuario text;
  rubros_usuario text[];
  rubro_principal text;
BEGIN
  tipo_usuario   := COALESCE(new.raw_user_meta_data->>'tipo',   'cliente');
  zona_usuario   := COALESCE(new.raw_user_meta_data->>'zona',   'Escobar');
  nombre_usuario := COALESCE(new.raw_user_meta_data->>'nombre', 'Usuario');

  INSERT INTO public.perfiles (id, nombre, tipo, zona)
  VALUES (new.id, nombre_usuario, tipo_usuario, zona_usuario);

  IF tipo_usuario = 'prestador' THEN
    -- Array del metadata; si no viene, se arma con el rubro suelto.
    -- 'General' se descarta a propósito: es peor que vacío, porque
    -- aparenta ser un rubro y no matchea con ningún pedido.
    BEGIN
      rubros_usuario := ARRAY(
        SELECT jsonb_array_elements_text(new.raw_user_meta_data->'rubros')
      );
    EXCEPTION WHEN others THEN
      rubros_usuario := '{}';
    END;

    IF rubros_usuario IS NULL OR array_length(rubros_usuario, 1) IS NULL THEN
      rubro_principal := new.raw_user_meta_data->>'rubro';
      IF rubro_principal IS NOT NULL AND rubro_principal !~* '^general$' THEN
        rubros_usuario := ARRAY[rubro_principal];
      ELSE
        rubros_usuario := '{}';
      END IF;
    END IF;

    rubro_principal := COALESCE(rubros_usuario[1], 'General');

    INSERT INTO public.prestadores (
      nombre, zona, activo, rating, resenas,
      rubro, rubros, precio, precio_unidad, medios_pago
    )
    VALUES (
      nombre_usuario, zona_usuario, true, 0, 0,
      rubro_principal, rubros_usuario, 0, 'visita', ARRAY['Efectivo']
    )
    RETURNING id INTO nuevo_prestador_id;

    UPDATE public.perfiles
       SET prestador_id = nuevo_prestador_id, tipo = 'prestador'
     WHERE id = new.id;

    INSERT INTO public.loyalty (usuario_id, puntos, nivel)
    VALUES (new.id, 0, 'Bronce')
    ON CONFLICT (usuario_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

-- ── Verificación ────────────────────────────────────────────────────────
select rubro, rubros from public.prestadores order by creado desc limit 5;
