-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El consentimiento de T&C se guarda al crear la cuenta
--
-- Hasta ahora la aceptación vivía en `localStorage` con la clave
-- `pronet_tyc_aceptado`: era del NAVEGADOR, no de la persona. Volvía a
-- pedirse en cada dispositivo nuevo, y dos personas que compartieran un
-- teléfono compartían el consentimiento de la primera.
--
-- Existía `perfiles.tyc_aceptado_en` y una función que la escribía, pero
-- funcionaba al revés: al iniciar sesión copiaba la marca del localStorage.
-- Si el usuario había aceptado en otro dispositivo no había nada que
-- copiar. Resultado medido el 2026-08-08: **0 de 12 perfiles** tenían la
-- aceptación registrada.
--
-- Ahora los checkboxes están en el registro y el timestamp viaja en el
-- metadata del signup, así que se escribe en la MISMA transacción que crea
-- el perfil. Grabarlo después exigiría una sesión, y con confirmación de
-- email de por medio todavía no la hay: el consentimiento se perdería.
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
  tyc_en timestamptz;
BEGIN
  tipo_usuario   := COALESCE(new.raw_user_meta_data->>'tipo',   'cliente');
  zona_usuario   := COALESCE(new.raw_user_meta_data->>'zona',   'Escobar');
  nombre_usuario := COALESCE(new.raw_user_meta_data->>'nombre', 'Usuario');

  -- Timestamp del clic en el checkbox. Si viene mal formado no se inventa
  -- una fecha: queda null y el perfil aparece como "sin aceptación", que es
  -- la verdad. Un consentimiento fabricado es peor que uno ausente.
  BEGIN
    tyc_en := (new.raw_user_meta_data->>'tyc_aceptado_en')::timestamptz;
  EXCEPTION WHEN others THEN
    tyc_en := null;
  END;

  INSERT INTO public.perfiles (id, nombre, tipo, zona, tyc_aceptado_en)
  VALUES (new.id, nombre_usuario, tipo_usuario, zona_usuario, tyc_en);

  IF tipo_usuario = 'prestador' THEN
    -- Array del metadata; si no viene, se arma con el rubro suelto.
    -- 'General' se descarta a propósito: aparenta ser un rubro y no matchea
    -- con ningún pedido.
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

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
-- Las cuentas existentes quedan en null a propósito: no se les fabrica una
-- fecha de consentimiento que nunca dieron de forma verificable.
select count(*) filter (where tyc_aceptado_en is not null) as con_aceptacion,
       count(*) filter (where tyc_aceptado_en is null)     as sin_aceptacion
  from public.perfiles;
