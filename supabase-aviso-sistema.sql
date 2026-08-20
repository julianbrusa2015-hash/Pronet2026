-- ═══ PRONET · Aviso del sistema (banner institucional del admin) ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- Requiere que exista supabase-config-app.sql (tabla config_app).
--
-- Distinto de los banners pagos (supabase-banners-pagos.sql): esto es un
-- aviso gratis que escribe el admin para comunicar novedades ("Nueva
-- funcionalidad!", "Canjes disponibles"), no un espacio que alguien compró.
-- Por eso NO usa la cola de moderación ni el carrusel de banners pagos —
-- es dos claves sueltas en config_app, on/off + texto, igual que los demás
-- ajustes de Parametrías.

insert into public.config_app (clave, valor, descripcion) values
  ('aviso_sistema_activo',   'false', 'Muestra el aviso institucional arriba del feed de Inicio'),
  ('aviso_sistema_mensaje',  '',      'Texto del aviso institucional (ej: "🎉 Nueva funcionalidad: Canjes!")'),
  ('aviso_sistema_color',    'blue',  'Color del aviso: blue | green | gold | purple | orange')
on conflict (clave) do nothing;

-- Lectura pública: lo tiene que ver cualquier usuario logueado en Inicio.
drop policy if exists "config_lectura_publica" on public.config_app;
create policy "config_lectura_publica"
  on public.config_app for select
  to anon, authenticated
  using (clave in ('planes_pagos_activos', 'aviso_sistema_activo', 'aviso_sistema_mensaje', 'aviso_sistema_color'));

-- ── Verificación ────────────────────────────────────────────────────────
select clave, valor, descripcion from public.config_app
 where clave in ('aviso_sistema_activo', 'aviso_sistema_mensaje', 'aviso_sistema_color');
select roles, cmd from pg_policies
 where tablename = 'config_app' and policyname = 'config_lectura_publica';
