-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Aviso de un pedido dirigido a un prestador puntual
--
-- Complemento de supabase-pedido-dirigido.sql. Un pedido de recontratación
-- no sale al feed, así que el broadcast por rubro (`notificar_rubro`) no
-- sirve: avisaría a diez personas de un trabajo que sólo una puede ver.
--
-- El destinatario se resuelve acá adentro: `prestadores` no tiene el id de
-- usuario — la relación vive en `perfiles.prestador_id`, y desde la sesión
-- del vecino esa fila no se puede leer.
--
-- Igual que `notificar_rubro`, se exige que el emisor tenga efectivamente
-- un pedido reciente dirigido a ese prestador, para que no quede un canal
-- de mensajes abierto contra cualquier ficha.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.notificar_prestador(
  p_prestador_id uuid,
  p_tipo         text,
  p_titulo       text,
  p_cuerpo       text default null,
  p_url          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_destino uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'falta título');
  end if;

  if not exists (
    select 1 from pedidos
     where usuario_id  = v_uid
       and dirigido_a  = p_prestador_id
       and creado      > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin pedido dirigido reciente');
  end if;

  select pf.id into v_destino
    from perfiles pf
   where pf.prestador_id = p_prestador_id
   limit 1;

  if v_destino is null then
    return jsonb_build_object('ok', false, 'error', 'la ficha no tiene cuenta asociada');
  end if;

  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  values (v_destino, v_uid, coalesce(p_tipo, 'general'),
          left(p_titulo, 120), left(p_cuerpo, 300), p_url);

  return jsonb_build_object('ok', true, 'enviadas', 1);
end;
$$;

notify pgrst, 'reload schema';

select routine_name from information_schema.routines
 where routine_schema = 'public' and routine_name = 'notificar_prestador';
