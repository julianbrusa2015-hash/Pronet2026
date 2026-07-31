-- ══════════════════════════════════════════════════════════════════════
-- SEGURIDAD · suscripciones — cerrar autoactivación de planes
-- ══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (detectado en auditoría 2026-07-31):
--   La policy `usuario_activa_su_suscripcion` daba permiso ALL
--   (INSERT/UPDATE/DELETE) al usuario sobre su propia fila. Como
--   `window._sb` está expuesto en el cliente, cualquiera con una cuenta
--   podía hacer desde la consola del navegador:
--
--     await window._sb.from('suscripciones').upsert({
--       usuario_id: <su uid>, plan: 'elite', estado: 'activo',
--       periodo: 'anual', vence_en: '2099-01-01'
--     }, { onConflict: 'usuario_id' })
--
--   → plan Elite gratis, sin pasar por MercadoPago. Y como
--   `prestadores.plan` se sincroniza por trigger desde `suscripciones`,
--   también se llevaba el boost de ranking y el badge.
--
--   La policy tenía sentido en la etapa sin pagos, cuando confirmarPago()
--   activaba el plan desde el cliente. Con MercadoPago integrado el
--   webhook escribe con service_role (que bypassa RLS), así que el
--   cliente ya no necesita permiso de escritura.
--
-- SOLUCIÓN:
--   1. El usuario solo LEE su suscripción (el SELECT ya existía).
--   2. Las escrituras legítimas quedan en dos caminos server-side:
--      - webhook-mp (service_role, bypassa RLS) para pagos reales
--      - activar_plan_admin() para cortesías/pruebas/fundadores
--   3. Se corrige admin_gestiona_suscripciones, que filtraba por
--      `perfiles.tipo = 'admin'` mientras el resto del sistema usa
--      `'admin' = any(perfiles.roles)` — no coincidía con nadie.

-- ── 1. RPC para que un admin active un plan a mano ───────────────────
-- SECURITY DEFINER + chequeo de es_admin() adentro: mismo patrón que
-- resolver_canje() en supabase-canjes-rpc.sql.
create or replace function public.activar_plan_admin(
  p_usuario_id uuid,
  p_plan       text,
  p_periodo    text default 'mes',
  p_meses      int  default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses int;
  v_vence timestamptz;
begin
  if not es_admin() then
    return jsonb_build_object('ok', false, 'error', 'SOLO_ADMIN');
  end if;

  if p_plan is null or p_plan not in ('base','plus','pro','elite') then
    return jsonb_build_object('ok', false, 'error', 'PLAN_INVALIDO');
  end if;

  -- 'mes' (no 'mensual') es la convención real de la app: switchBilling()
  -- en app.js manda 'mes'. El CHECK de la tabla se alineó a eso el 2026-07-31.
  if p_periodo not in ('mes','anual') then
    return jsonb_build_object('ok', false, 'error', 'PERIODO_INVALIDO');
  end if;

  if not exists (select 1 from auth.users where id = p_usuario_id) then
    return jsonb_build_object('ok', false, 'error', 'USUARIO_INEXISTENTE');
  end if;

  -- Sin p_meses explícito, la duración sale del período elegido.
  v_meses := coalesce(p_meses, case when p_periodo = 'anual' then 12 else 1 end);
  if v_meses < 1 or v_meses > 120 then
    return jsonb_build_object('ok', false, 'error', 'MESES_FUERA_DE_RANGO');
  end if;

  v_vence := now() + (v_meses || ' months')::interval;

  insert into public.suscripciones
    (usuario_id, plan, estado, periodo, activado_en, vence_en)
  values
    (p_usuario_id, p_plan, 'activo', p_periodo, now(), v_vence)
  on conflict (usuario_id) do update
    set plan        = excluded.plan,
        estado      = excluded.estado,
        periodo     = excluded.periodo,
        activado_en = excluded.activado_en,
        vence_en    = excluded.vence_en;

  return jsonb_build_object('ok', true, 'plan', p_plan, 'vence_en', v_vence);
end;
$$;

grant execute on function public.activar_plan_admin(uuid, text, text, int) to authenticated;

-- ── 2. Quitar la escritura del cliente ───────────────────────────────
drop policy if exists "usuario_activa_su_suscripcion" on public.suscripciones;

-- El SELECT propio se mantiene (usuario_ve_su_suscripcion). Se recrea acá
-- de forma idempotente para dejarlo versionado junto al resto.
drop policy if exists "usuario_ve_su_suscripcion" on public.suscripciones;
create policy "usuario_ve_su_suscripcion"
  on public.suscripciones for select
  to authenticated
  using (auth.uid() = usuario_id);

-- ── 3. Corregir la policy de admin (tipo → roles[]) ──────────────────
drop policy if exists "admin_gestiona_suscripciones" on public.suscripciones;
create policy "admin_gestiona_suscripciones"
  on public.suscripciones for all
  to authenticated
  using (es_admin())
  with check (es_admin());

-- ── Verificación ─────────────────────────────────────────────────────
-- select policyname, cmd, qual, with_check
--   from pg_policies where tablename = 'suscripciones';
--
-- Esperado: usuario_ve_su_suscripcion (SELECT, propio)
--           admin_gestiona_suscripciones (ALL, es_admin())
