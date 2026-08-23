-- ═══════════════════════════════════════════════════════════════════════
-- Desactivar un rubro tiene que sacarlo también de los prestadores
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23. Pedido del usuario: "cada vez que doy de alta o baja un rubro
-- se activa o se baja en el perfil también".
--
-- El alta ya funcionaba: cargarRubrosDeLaBase() trae el catálogo activo y
-- los chips de Editar perfil salen de ahí (con el fix de esta misma sesión
-- para la carrera del arranque). La baja NO — apagar un rubro en
-- Parametrías lo saca del catálogo que arma los chips, pero un prestador
-- que ya lo tenía elegido se quedaba con el nombre viejo en `rubros[]`
-- para siempre: invisible en su propio Editar perfil (el chip ya no
-- existe para desmarcarlo) pero sigue ahí, matcheando búsquedas de un
-- rubro que el admin apagó a propósito.
--
-- ── El trigger ─────────────────────────────────────────────────────────
-- Dispara SOLO en la transición activo true → false (no en cada UPDATE de
-- la fila, ni al reactivarlo — reactivar no tiene que devolverle el rubro
-- a nadie que ya lo perdió, eso el prestador lo vuelve a elegir si quiere).
--
-- Saca el nombre de `rubros[]` con array_remove. `sync_rubro_principal`
-- (supabase-multirubro.sql) ya escucha los cambios de esa columna y
-- recalcula `rubro` = rubros[1] — pero sólo cuando el array queda con algo
-- adentro. Si el rubro desactivado era el ÚNICO que tenía, `rubros` queda
-- en '{}' y esa función no tocaba `rubro`, que se quedaba apuntando a un
-- rubro que ya no está ni en el catálogo ni en el array. Se corrige ahí
-- mismo, no acá: es su responsabilidad mantener ese campo coherente.

create or replace function public.limpiar_rubro_desactivado()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.activo = true and new.activo = false then
    update public.prestadores
       set rubros = array_remove(rubros, new.nombre)
     where new.nombre = any(rubros);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_limpiar_rubro_desactivado on public.rubros;
create trigger trg_limpiar_rubro_desactivado
  after update of activo on public.rubros
  for each row execute function public.limpiar_rubro_desactivado();

-- El caso que sync_rubro_principal no cubría: array vacío por la limpieza
-- de arriba deja a alguien sin ningún rubro elegido.
create or replace function public.sync_rubro_principal()
returns trigger language plpgsql as $$
begin
  if new.rubros is not null and array_length(new.rubros, 1) > 0 then
    new.rubro := new.rubros[1];
  elsif new.rubros is not null then
    -- El array quedó vacío — no dejar `rubro` apuntando a un nombre que
    -- ya no está en `rubros[]`. 'General' es el mismo default que usa
    -- handle_new_user() para el alta sin rubro elegido.
    new.rubro := 'General';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- Simulación de punta a punta con datos descartables: un rubro y un
-- prestador de prueba, nunca se toca el catálogo real.
do $$
declare v_id uuid;
begin
  insert into public.rubros (slug, nombre, emoji, activo, precio_min, precio_max)
  values ('test-baja-rubro', 'Rubro De Prueba', '🧪', true, 1000, 2000)
  on conflict (slug) do update set activo = true;

  insert into public.prestadores (nombre, rubro, rubros, zona, activo)
  values ('[TEST] prestador baja rubro', 'Rubro De Prueba', array['Rubro De Prueba'], 'Escobar', true)
  returning id into v_id;

  -- Desactivar el rubro: acá dispara el trigger nuevo.
  update public.rubros set activo = false where slug = 'test-baja-rubro';

  raise notice 'rubros del prestador de prueba tras la baja: %',
    (select rubros from public.prestadores where id = v_id);
  raise notice 'rubro (singular) tras la baja: %',
    (select rubro from public.prestadores where id = v_id);

  delete from public.prestadores where id = v_id;
  delete from public.rubros where slug = 'test-baja-rubro';
end $$;
