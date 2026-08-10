-- ═══════════════════════════════════════════════════════════════════════
-- Pre-alta · convertir el lead en cuenta real
-- ═══════════════════════════════════════════════════════════════════════
--
-- Segunda mitad de supabase-prealta-prestador.sql. Ahí se captura el dato en
-- la calle; acá la persona reclama su cuenta y la ficha nace con los rubros
-- y la zona que ya se habían cargado.
--
-- POR QUÉ UN LINK CON EL ID Y NO EL TELÉFONO:
-- lo natural sería vincular por teléfono al registrarse, pero **el registro
-- no pide teléfono** y agregárselo va en contra de mantener el alta liviana
-- (que es todo el punto de la pre-alta). El id de la pre-alta es un uuid, o
-- sea no adivinable, y viaja en el link de WhatsApp que le manda el que lo
-- anotó — que igual lo iba a contactar.
--
-- El teléfono se arrastra desde la pre-alta si el usuario no tiene uno: así
-- el prestador queda contactable sin tener que cargarlo de nuevo. Si ese
-- número ya está en otra cuenta se ignora en silencio: es un extra, no vale
-- trabar el alta por eso.

begin;

create or replace function public.reclamar_prealta(p_prealta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_pa    record;
  v_ficha jsonb;
  v_pid   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;

  select * into v_pa
    from public.prealtas_prestador
   where id = p_prealta_id and estado = 'pendiente'
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa invitación no existe o ya fue usada');
  end if;

  -- Único lugar del sistema que inserta en `prestadores`, y es idempotente.
  v_ficha := public.asegurar_ficha_prestador();
  if coalesce((v_ficha->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'No se pudo crear la ficha de prestador');
  end if;
  v_pid := (v_ficha->>'prestador_id')::uuid;

  -- Lo cargado en la pre-alta completa lo que la ficha no tenga. No pisa: si
  -- la persona ya eligió rubros al registrarse, esos mandan.
  update public.prestadores p
     set rubros = case
                    when coalesce(array_length(p.rubros, 1), 0) = 0
                     and coalesce(array_length(v_pa.rubros, 1), 0) > 0
                    then v_pa.rubros else p.rubros end,
         rubro  = case
                    when (p.rubro is null or p.rubro ~* '^general$')
                     and coalesce(array_length(v_pa.rubros, 1), 0) > 0
                    then v_pa.rubros[1] else p.rubro end,
         zona   = coalesce(nullif(btrim(p.zona), ''), v_pa.zona, p.zona)
   where p.id = v_pid;

  begin
    update public.perfiles
       set telefono = v_pa.telefono
     where id = v_uid
       and btrim(coalesce(telefono, '')) = '';
  exception when unique_violation then
    null;
  end;

  update public.prealtas_prestador
     set estado = 'reclamada', prestador_id = v_pid, reclamado_en = now()
   where id = p_prealta_id;

  return jsonb_build_object('ok', true, 'prestador_id', v_pid);
end;
$$;

revoke all on function public.reclamar_prealta(uuid) from public, anon;
grant execute on function public.reclamar_prealta(uuid) to authenticated;

/** Datos mínimos de una pre-alta para precargar el registro.
 *
 *  Callable por anon: la abre quien todavía no tiene cuenta. Devuelve sólo el
 *  nombre — NO el teléfono ni el DNI. Con el uuid en la mano alcanza para
 *  saludar a la persona por su nombre; el resto no hace falta para registrarse
 *  y no tiene por qué viajar. */
create or replace function public.prealta_publica(p_prealta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'nombre', nombre, 'rubros', rubros)
    from public.prealtas_prestador
   where id = p_prealta_id and estado = 'pendiente';
$$;

grant execute on function public.prealta_publica(uuid) to anon, authenticated;

commit;
