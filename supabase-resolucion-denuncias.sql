-- ═══════════════════════════════════════════════════════════════════════
-- Moderación · qué se decidió, quién y cuándo
-- ═══════════════════════════════════════════════════════════════════════
--
-- "Confirmar baja" y "Desestimar" escribían los dos `estado = 'resuelta'`, así
-- que después eran indistinguibles: un día más tarde el admin no sabía si le
-- había dado la razón al denunciante o no. La tabla no tenía dónde guardar la
-- decisión, ni quién la tomó, ni cuándo.
--
-- Tampoco había forma de revertir: una vez resuelta, resuelta.
--
-- Nota sobre el nombre "baja": NO da de baja a nadie. Suma +1 al contador del
-- prestador y lo auto-suspende recién a las 3. Y si el denunciado no es
-- prestador —un vecino— no hace absolutamente nada. Por eso acá se llama
-- `falta_confirmada`, que es lo que realmente representa.

begin;

-- ── 1 · Qué se decidió ───────────────────────────────────────────────
alter table public.denuncias
  add column if not exists resolucion   text,
  add column if not exists resuelto_por uuid references public.perfiles(id) on delete set null,
  add column if not exists resuelto_en  timestamptz;

alter table public.denuncias drop constraint if exists denuncias_resolucion_check;
alter table public.denuncias add constraint denuncias_resolucion_check
  check (resolucion is null or resolucion in ('falta_confirmada','desestimada'));

comment on column public.denuncias.resolucion is
  'falta_confirmada = se le dio la razón al denunciante. desestimada = no. NULL = sin resolver.';

-- Las que ya estaban resueltas quedan sin resolución: no hay forma de saber
-- cuál fue, y adivinarla sería peor que dejarla vacía.

-- ── 2 · Resolver ─────────────────────────────────────────────────────
create or replace function public.resolver_denuncia(
  p_denuncia_id uuid,
  p_resolucion  text     -- 'falta_confirmada' | 'desestimada' | 'contacto'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_denunciado uuid;
  v_prestador  uuid;
  v_estado     text;
  v_count      int := 0;
  v_susp       boolean := false;
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;
  if p_resolucion not in ('falta_confirmada','desestimada','contacto') then
    return jsonb_build_object('ok', false, 'error', 'Resolución inválida');
  end if;

  select estado, denunciado_id into v_estado, v_denunciado
    from public.denuncias where id = p_denuncia_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Denuncia no encontrada');
  end if;

  -- "Contactar partes" no es una resolución: deja la denuncia abierta.
  if p_resolucion = 'contacto' then
    update public.denuncias set estado = 'en_revision' where id = p_denuncia_id;
    return jsonb_build_object('ok', true, 'estado', 'en_revision');
  end if;

  -- Exigir que no esté resuelta evita que dos clicks sumen dos veces al
  -- contador del prestador. Mismo criterio que resolver_canje.
  if v_estado = 'resuelta' then
    return jsonb_build_object('ok', false, 'error', 'Esa denuncia ya fue resuelta. Reabrila si querés cambiar la decisión.');
  end if;

  update public.denuncias
     set estado = 'resuelta', resolucion = p_resolucion,
         resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_denuncia_id;

  if p_resolucion = 'falta_confirmada' then
    select prestador_id into v_prestador from public.perfiles where id = v_denunciado;
    if v_prestador is not null then
      update public.prestadores
         set denuncias_confirmadas = coalesce(denuncias_confirmadas, 0) + 1,
             suspendido = case when coalesce(denuncias_confirmadas, 0) + 1 >= 3 then true else suspendido end
       where id = v_prestador
      returning denuncias_confirmadas, suspendido into v_count, v_susp;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'resolucion', p_resolucion,
                            'denuncias', v_count, 'suspendido', v_susp,
                            -- Para poder avisarle al admin que su decisión no
                            -- tuvo efecto: al vecino denunciado no le pasa nada.
                            'aplica_a_prestador', v_prestador is not null);
end;
$$;

revoke all on function public.resolver_denuncia(uuid, text) from public, anon;
grant execute on function public.resolver_denuncia(uuid, text) to authenticated;

-- ── 3 · Revertir ─────────────────────────────────────────────────────
-- Si la resolución había sumado al contador del prestador, se lo resta. La
-- suspensión NO se levanta sola: pudo haberla puesto el admin a mano por otro
-- motivo, y adivinar sería peor. Para eso está el botón de reactivar.
create or replace function public.reabrir_denuncia(p_denuncia_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_res        text;
  v_denunciado uuid;
  v_prestador  uuid;
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'Solo admin');
  end if;

  select resolucion, denunciado_id into v_res, v_denunciado
    from public.denuncias where id = p_denuncia_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Denuncia no encontrada');
  end if;

  if v_res = 'falta_confirmada' then
    select prestador_id into v_prestador from public.perfiles where id = v_denunciado;
    if v_prestador is not null then
      update public.prestadores
         set denuncias_confirmadas = greatest(0, coalesce(denuncias_confirmadas, 0) - 1)
       where id = v_prestador;
    end if;
  end if;

  update public.denuncias
     set estado = 'pendiente', resolucion = null,
         resuelto_por = null, resuelto_en = null
   where id = p_denuncia_id;

  return jsonb_build_object('ok', true, 'descontado', v_res = 'falta_confirmada' and v_prestador is not null);
end;
$$;

revoke all on function public.reabrir_denuncia(uuid) from public, anon;
grant execute on function public.reabrir_denuncia(uuid) to authenticated;

-- ── 4 · La vieja queda sin uso ───────────────────────────────────────
-- `confirmar_baja_prestador` no registraba la decisión y sólo la llamaba el
-- panel, que ahora usa resolver_denuncia. Se descarta para no dejar dos
-- caminos que hacen casi lo mismo con distinto resultado.
drop function if exists public.confirmar_baja_prestador(uuid);

commit;
