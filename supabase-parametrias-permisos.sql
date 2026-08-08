-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Permisos para el panel de parametrías
--
-- Dos cosas que faltaban y que hacían imposible el panel:
--
-- 1. `planes_limites` sólo tenía policy de SELECT (`limites_lectura`).
--    Un admin no podía escribirla desde el cliente: la pantalla se vería
--    bien y el guardado fallaría en silencio por RLS.
--
-- 2. La lectura pública de `config_app` es una LISTA BLANCA de claves —
--    correcto, porque la tabla también guarda `admin_pin` en texto plano.
--    Cualquier clave nueva que el cliente necesite leer hay que agregarla
--    ahí explícitamente, o el usuario común no la ve y la app cae al
--    default sin avisar.
--
-- Se agrega `features_off`: UNA clave con la lista de funcionalidades
-- apagadas, separadas por coma. Se eligió una sola clave y no una por flag
-- para no tener que sumar 18 entradas a la lista blanca cada vez —
-- y porque el estado normal es "todo prendido", así que la fila queda
-- vacía la mayor parte del tiempo.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. El admin puede editar los planes ─────────────────────────────────
drop policy if exists "limites_admin_escribe" on public.planes_limites;
create policy "limites_admin_escribe" on public.planes_limites
  for all
  using (public.es_admin())
  with check (public.es_admin());

-- ── 2. Flags de funcionalidades ─────────────────────────────────────────
insert into public.config_app (clave, valor) values ('features_off', '')
on conflict (clave) do nothing;

-- La lista blanca de lectura pública, ampliada con lo que el cliente
-- necesita hoy. `admin_pin` sigue afuera a propósito.
drop policy if exists "config_lectura_publica" on public.config_app;
create policy "config_lectura_publica" on public.config_app
  for select
  using (clave = any (array[
    'planes_pagos_activos',
    'mp_checkout_activo',
    'propuesta_expiracion_hs',   -- alias histórico; lo leen las PWA viejas
    'pedido_vencimiento_hs',     -- nombre nuevo
    'inactividad_cierre_dias',
    'pedido_fotos_max',
    'adjunto_max_mb',
    'promarket_activo',
    'features_off'
  ]));

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and policyname in ('limites_admin_escribe', 'config_lectura_publica')
 order by tablename;
