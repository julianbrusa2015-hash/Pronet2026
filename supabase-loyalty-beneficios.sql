-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Los beneficios de cada nivel de loyalty dejan de estar
-- hardcodeados en index.html
-- ═══════════════════════════════════════════════════════════════════════
--
-- Mismo espíritu que supabase-loyalty-niveles.sql con los umbrales: la
-- lista de "· Acceso básico al programa / · Historial de puntos..." vivía
-- fija en el HTML de cada tarjeta (#nc-bronce, #nc-plata, #nc-oro,
-- #nc-elite), sin relación con la tabla loyalty_niveles que ya gobierna
-- los puntos de corte. Cambiarla exigía tocar código y desplegar.
--
-- Se agrega una columna `beneficios` (array de texto, un ítem por línea) y
-- se puebla con el texto actual, tal cual, para que el cambio sea
-- invisible en producción hasta que el admin edite algo.
--
-- ACTUALIZADO 2026-08-20: "Informe de competidores" y "Acceso anticipado a
-- Beta" se sacaron de Oro/Élite — no había ninguna mecánica real detrás,
-- puro texto. "Mes Pro gratis cada 6 meses" (Élite) queda por ahora, pero
-- tampoco tiene nada que lo dispare automáticamente: no hay cron ni RPC,
-- sólo el catálogo de canjes manual del admin (loyalty_canjes, "Regala 1
-- mes de plan"), que es redimible con puntos a demanda — otra mecánica
-- distinta de "cada 6 meses mientras estés en Élite".

alter table public.loyalty_niveles
  add column if not exists beneficios text[] not null default '{}';

update public.loyalty_niveles set beneficios = array[
  'Acceso básico al programa', 'Historial de puntos', 'Notificaciones de puntos ganados'
] where nombre = 'Bronce' and beneficios = '{}';

update public.loyalty_niveles set beneficios = array[
  'Todo lo de Bronce', 'Acceso a canjes básicos', 'Soporte por email prioritario', '+10% de puntos en reseñas'
] where nombre = 'Plata' and beneficios = '{}';

update public.loyalty_niveles set beneficios = array[
  'Todo lo de Plata', 'Boost ×1.6 canjeable', 'Badge "Prestador Élite"', '+20% de puntos en todas las acciones'
] where nombre = 'Oro' and beneficios = '{}';

update public.loyalty_niveles set beneficios = array[
  'Todo lo de Oro', 'Soporte prioritario 24/7', 'Reseñas pesan 1.5× en el ranking', 'Mes Pro gratis cada 6 meses', 'Badge permanente en el perfil'
] where nombre = 'Élite' and beneficios = '{}';

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select nombre, min_puntos, beneficios from public.loyalty_niveles order by orden;
