-- ═══ PRONET · Ficha de prestador por RPC + backfill ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- PROBLEMA: usuarioActual() en datos.js intenta auto-crear la fila en
-- `prestadores` cuando un perfil tiene tipo='prestador' sin prestador_id, pero
-- no hay policy de INSERT en esa tabla: RLS lo rechaza con 403. Y el cliente
-- descartaba el `error` del insert, así que fallaba en silencio.
--
-- Resultado: 4 de las 5 cuentas marcadas como prestador quedaron sin ficha
-- (Carla Prestadora, Prestador Test, Servicios 1, Vecino 2). Sin ficha no
-- pueden ofertar: el CTA del detalle del pedido exige prestador_id.
--
-- NO se resuelve con una policy de INSERT abierta: eso permitiría a cualquier
-- usuario crear fichas falsas visibles en el directorio público. Va por RPC
-- SECURITY DEFINER que solo crea la ficha del que llama, y la vincula.

-- ── RPC: asegurar la ficha del prestador que llama ──────────────────────
create or replace function public.asegurar_ficha_prestador()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_perfil record;
  v_nuevo  uuid;
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

  -- Solo para quien tiene rol de prestador. Un vecino no obtiene ficha por
  -- llamar a esto: el alta de prestador pasa por el flujo de upgrade.
  if v_perfil.tipo <> 'prestador' then
    return jsonb_build_object('ok', false, 'error', 'el perfil no es de prestador');
  end if;

  insert into prestadores (nombre, zona, rubro, activo)
       values (coalesce(v_perfil.nombre, 'Prestador'),
               coalesce(v_perfil.zona, 'Escobar'),
               'General', true)
    returning id into v_nuevo;

  update perfiles set prestador_id = v_nuevo where id = v_uid;

  return jsonb_build_object('ok', true, 'prestador_id', v_nuevo, 'creada', true);
end;
$$;

-- ── Backfill: crear la ficha de los que quedaron sin ella ───────────────
-- Corre como postgres (salta RLS), así que arregla las cuentas existentes.
do $$
declare
  r        record;
  v_nuevo  uuid;
  v_total  int := 0;
begin
  for r in
    select id, nombre, zona from perfiles
     where tipo = 'prestador' and prestador_id is null
  loop
    insert into prestadores (nombre, zona, rubro, activo)
         values (coalesce(r.nombre, 'Prestador'),
                 coalesce(r.zona, 'Escobar'),
                 'General', true)
      returning id into v_nuevo;

    update perfiles set prestador_id = v_nuevo where id = r.id;
    v_total := v_total + 1;
  end loop;
  raise notice 'Fichas de prestador creadas: %', v_total;
end $$;

-- ── Verificación ────────────────────────────────────────────────────────
-- No debería quedar ningún prestador sin ficha:
select p.nombre, p.tipo, p.prestador_id, pr.rubro, pr.activo
  from perfiles p
  left join prestadores pr on pr.id = p.prestador_id
 where p.tipo = 'prestador'
 order by p.nombre;

-- Los backfilleados quedan con rubro 'General'. Cada uno debe completar su
-- rubro real desde Mi Perfil → Editar perfil; 'General' no matchea ninguna
-- categoría del feed, así que no van a ver pedidos pre-filtrados hasta que
-- lo hagan.
