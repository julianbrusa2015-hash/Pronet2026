-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El loyalty boost de los planes pagos pasa a existir
--
-- `config.js` declaraba loyalty_boost 1.0 / 1.25 / 1.5 y la app se lo
-- promete al usuario en tres lugares —la pantalla de PRONET Points, el
-- checkout antes de pagar, y la confirmación posterior con el texto "Tu
-- loyalty boost ×1.5 ya está activo"— pero NINGUNA de las cuatro funciones
-- que acreditan puntos miraba el plan. Un Pro y un Base recibían lo mismo.
-- Era un beneficio cobrado y no entregado.
--
-- ── Dos trampas que condicionan el diseño ──────────────────────────────
--
-- 1. NO se puede usar `plan_de_usuario()` acá. Devuelve NULL salvo que el
--    consultante sea admin o el dueño del plan, y `acreditar_puntos` corre
--    desde triggers donde quien actúa NO es quien recibe: en una reseña, el
--    vecino la escribe y el prestador cobra los puntos. El boost habría
--    quedado en NULL siempre, sin fallar nada. Como esta función ya es
--    SECURITY DEFINER, se consulta `suscripciones` directo.
--
-- 2. El boost se aplica SÓLO a puntos positivos. `canjear_puntos` acredita
--    en negativo para descontar el canje; multiplicar eso por 1.5 le
--    cobraría al usuario Pro un 50% MÁS caro cada canje. El beneficio se
--    habría convertido en un castigo.
--
-- El factor vive en `planes_limites`, junto al resto de los límites del
-- plan, para que sea editable sin deploy — mismo criterio que precio_mes.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.planes_limites
  add column if not exists loyalty_boost numeric(4,2) not null default 1.00;

update public.planes_limites set loyalty_boost = 1.00 where plan = 'base';
update public.planes_limites set loyalty_boost = 1.25 where plan = 'plus';
update public.planes_limites set loyalty_boost = 1.50 where plan = 'pro';

-- ── El factor efectivo de un usuario ────────────────────────────────────
-- Sin suscripción activa, 1.00. Se resuelve sin pasar por
-- plan_de_usuario() por el motivo (1) de arriba.
create or replace function public.loyalty_boost_de(p_usuario_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select pl.loyalty_boost
       from public.suscripciones s
       join public.planes_limites pl on pl.plan = s.plan
      where s.usuario_id = p_usuario_id
        and s.estado = 'activo'
        and (s.vence_en is null or s.vence_en > now())
      order by pl.loyalty_boost desc
      limit 1),
    1.00);
$function$;

revoke all on function public.loyalty_boost_de(uuid) from public, anon;
grant execute on function public.loyalty_boost_de(uuid) to authenticated;

-- ── La acreditación aplica el factor ────────────────────────────────────
create or replace function public.acreditar_puntos(
  p_usuario_id uuid,
  p_puntos integer,
  p_tipo text,
  p_descripcion text,
  p_prestador_id uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actual int;
  v_nuevo  int;
  v_nivel  text;
  v_boost  numeric := 1.00;
  v_final  int;
  v_desc   text := p_descripcion;
begin
  if p_usuario_id is null or p_puntos = 0 then return null; end if;

  -- Sólo suma. Ver trampa (2) en el encabezado: un canje descuenta en
  -- negativo y multiplicarlo encarecería el canje al que pagó.
  if p_puntos > 0 then
    v_boost := public.loyalty_boost_de(p_usuario_id);
    v_final := round(p_puntos * v_boost)::int;
    if v_boost > 1 then
      -- Queda en el historial para que el usuario vea de dónde salió la
      -- diferencia, en vez de un número que no cierra con la regla.
      v_desc := coalesce(p_descripcion,'') || ' (×' || trim(to_char(v_boost,'FM9.99')) || ' plan)';
    end if;
  else
    v_final := p_puntos;
  end if;

  insert into loyalty_historial (usuario_id, prestador_id, puntos, tipo, descripcion)
  values (p_usuario_id, p_prestador_id, v_final, p_tipo, v_desc);

  select puntos into v_actual from loyalty where usuario_id = p_usuario_id;
  v_nuevo := coalesce(v_actual, 0) + v_final;
  if v_nuevo < 0 then v_nuevo := 0; end if;   -- nunca saldo negativo

  -- Mismos umbrales que usaba el cliente (datos.js): 1k Plata, 5k Oro, 10k Élite
  v_nivel := case when v_nuevo >= 10000 then 'Élite'
                  when v_nuevo >= 5000  then 'Oro'
                  when v_nuevo >= 1000  then 'Plata'
                  else 'Bronce' end;

  insert into loyalty (usuario_id, puntos, nivel)
  values (p_usuario_id, v_nuevo, v_nivel)
  on conflict (usuario_id) do update set puntos = v_nuevo, nivel = v_nivel;

  return v_nuevo;
end;
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select plan, nombre, loyalty_boost from public.planes_limites
 where plan in ('base','plus','pro') order by loyalty_boost;
