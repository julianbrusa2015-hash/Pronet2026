-- ═══ PRONET · Parte 4: notificaciones por RPC ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- REEMPLAZA a supabase-notificaciones-rls.sql, que creaba el problema.
--
-- PROBLEMA: `notificaciones` acepta INSERT de cualquier `authenticated` con
-- WITH CHECK (true), sin validar el destinatario. Desde la consola:
--
--   await window._sb.from('notificaciones').insert({
--     usuario_id: '<victima>', titulo: '⚠️ Problema con tu cobro',
--     url: 'https://sitio-del-atacante.com' })
--
-- La víctima lo ve en la campanita, con el mismo aspecto que un aviso real
-- del sistema. Y apuntar es trivial: `perfiles_publicos` da todos los ids.
--
-- Los 8 flujos legítimos de la app se reducen a cuatro relaciones:
--   A. el emisor es admin
--   B. emisor y destinatario comparten un chat de trabajo
--   C. el emisor ofertó en un pedido del destinatario
--   D. broadcast a prestadores de un rubro, al publicar un pedido de ese rubro
--
-- APLICACIÓN EN DOS ETAPAS, a propósito. Este archivo solo AGREGA los RPC y
-- deja el INSERT directo funcionando. Recién cuando se verifique que las
-- notificaciones siguen llegando se corre el bloque final que borra las tres
-- policies permisivas. Así no se repite el estado roto que dejó el revoke de
-- la Parte 3.

-- ── Atribución ──────────────────────────────────────────────────────────
-- Hoy la tabla no guarda quién envió, así que una notificación falsa es
-- indetectable incluso después de descubrirla.
alter table public.notificaciones
  add column if not exists emisor_id uuid references auth.users(id);

-- ── Helpers de relación ─────────────────────────────────────────────────
create or replace function public.comparte_chat_con(p_otro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chats_trabajo c
     where (c.vecino_id = auth.uid()
            and c.prestador_id = (select prestador_id from perfiles where id = p_otro))
        or (c.vecino_id = p_otro
            and c.prestador_id = (select prestador_id from perfiles where id = auth.uid()))
  );
$$;

create or replace function public.oferto_en_pedido_de(p_otro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from propuestas pr
      join pedidos pe on pe.id = pr.pedido_id
     where pe.usuario_id = p_otro
       and pr.prestador_id = (select prestador_id from perfiles where id = auth.uid())
  );
$$;

-- ── RPC 1: notificar a un usuario ───────────────────────────────────────
create or replace function public.notificar_usuario(
  p_usuario_id uuid,
  p_tipo       text,
  p_titulo     text,
  p_cuerpo     text default null,
  p_url        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'falta título');
  end if;

  -- Relación legítima: admin, chat compartido, oferta en su pedido, o uno mismo.
  if not (
       es_admin()
    or p_usuario_id = v_uid
    or comparte_chat_con(p_usuario_id)
    or oferto_en_pedido_de(p_usuario_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin relación con el destinatario');
  end if;

  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  values (p_usuario_id, v_uid, coalesce(p_tipo, 'general'),
          left(p_titulo, 120), left(p_cuerpo, 300), p_url);

  return jsonb_build_object('ok', true, 'enviadas', 1);
end;
$$;

-- ── RPC 2: broadcast a prestadores de un rubro ──────────────────────────
-- Único caso masivo legítimo: al publicar un pedido se avisa a los prestadores
-- del rubro. Se exige que el emisor tenga efectivamente un pedido reciente
-- publicado en ese rubro, para que no sea un canal de spam abierto.
create or replace function public.notificar_rubro(
  p_rubro  text,
  p_tipo   text,
  p_titulo text,
  p_cuerpo text default null,
  p_url    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  if not exists (
    select 1 from pedidos
     where usuario_id = v_uid
       and rubro = p_rubro
       and creado > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', false, 'error', 'sin pedido reciente en ese rubro');
  end if;

  with destinatarios as (
    select pf.id
      from perfiles pf
      join prestadores pr on pr.id = pf.prestador_id
     where pr.rubro = p_rubro
       and pr.activo = true
       and pf.id <> v_uid            -- no notificarse a sí mismo
  )
  insert into notificaciones (usuario_id, emisor_id, tipo, titulo, cuerpo, url)
  select d.id, v_uid, coalesce(p_tipo, 'general'),
         left(p_titulo, 120), left(p_cuerpo, 300), p_url
    from destinatarios d;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'enviadas', v_n);
end;
$$;

-- ── Verificación ────────────────────────────────────────────────────────
select routine_name from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('notificar_usuario', 'notificar_rubro',
                        'comparte_chat_con', 'oferto_en_pedido_de');

-- ═══════════════════════════════════════════════════════════════════════
-- ETAPA 2 — CORRER SOLO DESPUÉS DE VERIFICAR QUE LAS NOTIFICACIONES LLEGAN
-- ═══════════════════════════════════════════════════════════════════════
-- Probar antes: mensaje nuevo en un chat, propuesta enviada, trabajo
-- terminado, publicar un pedido (broadcast) y aprobar un canje como admin.
-- Si todo llega, descomentar y correr:
--
--   -- Las policies se combinan con OR: hay que borrar LAS TRES.
--   drop policy if exists "autenticados_pueden_insertar_notificaciones" on public.notificaciones;
--   drop policy if exists "Usuarios pueden insertar notificaciones"     on public.notificaciones;
--   drop policy if exists "notis_insert_autenticado"                    on public.notificaciones;
--
--   revoke insert on public.notificaciones from authenticated;
--
-- Los RPC son SECURITY DEFINER, así que siguen funcionando.
