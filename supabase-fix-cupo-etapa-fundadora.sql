-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El trigger de cupo ignoraba la etapa fundadora
--
-- SÍNTOMA: un vecino con 3 publicaciones no puede publicar más. La app lo
-- deja llenar el formulario y recién al guardar la base lo rechaza pidiendo
-- comprar créditos.
--
-- CAUSA: cliente y servidor aplicaban reglas distintas.
--
--   · El cliente (puedePublicarMercado → planParaLimites) aplica la etapa
--     fundadora: con `planes_pagos_activos` en false, Base recibe los
--     límites de Plus — 10 publicaciones por MES.
--   · Este trigger usaba `plan_de_usuario()` crudo, sin pasar por
--     `plan_para_limites()`, así que para un Base aplicaba 3 gratis por AÑO.
--
-- La app decía que sí y la base decía que no. Le pasa a cualquier vecino
-- que llegue a 3 publicaciones, no a una cuenta puntual.
--
-- Se corrige donde estaba mal: el trigger pasa a usar la misma regla que ya
-- usan el cliente y el trigger de propuestas. `plan_para_limites` existe
-- desde antes justamente para esto — sólo faltaba llamarla acá.
--
-- El coalesce a 'base' cubre un caso aparte: `plan_de_usuario` devuelve NULL
-- si quien pregunta no es el dueño ni admin (un insert hecho por un script
-- con service role, por ejemplo). Sin el coalesce, ese NULL no matchea
-- ninguna rama y cae en la más restrictiva sin que nadie lo note.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.chequear_cupo_publicacion_mercado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan     text;
  v_inicio   timestamptz;
  v_usadas   int;
  v_creditos int;
  v_legacy_hasta timestamptz;
  v_legacy_activo boolean;
begin
  -- Grandfathering: suscriptores de la vieja ProMarket ($10.000/mes) siguen
  -- ilimitados hasta que venza naturalmente su período ya pagado.
  select es_pro_marketplace, pro_marketplace_hasta
    into v_legacy_activo, v_legacy_hasta
    from perfiles where id = new.autor_id;
  if v_legacy_activo and (v_legacy_hasta is null or v_legacy_hasta > now()) then
    return new;
  end if;

  -- LA CORRECCIÓN: misma regla que el cliente. Con los pagos desactivados,
  -- Base recibe los límites de Plus.
  v_plan := plan_para_limites(coalesce(plan_de_usuario(new.autor_id), 'base'));

  if v_plan = 'pro' then
    return new; -- ilimitado
  end if;

  if v_plan = 'plus' then
    -- Mes calendario en hora de Buenos Aires, igual criterio que propuestas_mes.
    v_inicio := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
                at time zone 'America/Argentina/Buenos_Aires';
    select count(*) into v_usadas
      from publicaciones
     where autor_id = new.autor_id
       and creado >= v_inicio;
    if v_usadas >= 10 then
      raise exception 'limite_publicaciones_mes: el plan plus permite 10 publicaciones por mes'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Base / vecino ocasional: 3 gratis por año calendario.
  v_inicio := date_trunc('year', now() at time zone 'America/Argentina/Buenos_Aires')
              at time zone 'America/Argentina/Buenos_Aires';
  select count(*) into v_usadas
    from publicaciones
   where autor_id = new.autor_id
     and creado >= v_inicio;

  if v_usadas < 3 then
    return new; -- todavía tiene gratis este año
  end if;

  -- Agotó las 3 gratis: consumir un crédito comprado ($5.000 c/u).
  select promarket_creditos into v_creditos from perfiles where id = new.autor_id;
  if coalesce(v_creditos, 0) <= 0 then
    raise exception 'sin_creditos_publicacion: comprá una publicación extra para seguir publicando'
      using errcode = 'check_violation';
  end if;

  update perfiles set promarket_creditos = promarket_creditos - 1 where id = new.autor_id;
  return new;
end;
$function$;

notify pgrst, 'reload schema';

-- Verificación: con los pagos apagados, un Base tiene que resolver a 'plus'.
select (select valor from config_app where clave = 'planes_pagos_activos') as pagos_activos,
       public.plan_para_limites('base')                                    as base_resuelve_a,
       public.plan_para_limites('pro')                                     as pro_resuelve_a;
