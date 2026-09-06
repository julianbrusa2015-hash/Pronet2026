-- ═══ Reset de datos · 2026-09-06 ═══
-- Respaldo previo: C:\Users\julia\Desktop\respaldo-pronet-2026-09-06.json
-- (38 tablas, 2.006 filas)
--
-- Borra TODO lo transaccional para arrancar de cero.
--
-- SE CONSERVA sólo:
--   · Usuarios — auth.users, perfiles, prestadores
--   · Configuración — zonas, rubros, config_app, planes_limites,
--     mkt_categorias, loyalty_niveles, loyalty_reglas, catalogo_servicios,
--     catalogo_precios, telefonos_vetados (lista anti-fraude)
--
-- SIN begin/commit: el editor SQL de Supabase ya envuelve el script en su
-- propia transacción, y anidar otra la deja abierta y se revierte al salir.
-- Eso fue lo que paso en el primer intento — dijo "Success" y no borro nada.
--
-- El orden va de hijos a padres. Varias FK son ON DELETE CASCADE, pero
-- confiar en eso obliga a saber cuáles: borrar explícito en orden es más
-- lento de escribir y más difícil de romper.

-- ── Trabajo ──────────────────────────────────────────────────────────────
delete from mensajes_chat;
delete from trabajo_fotos;
delete from resenas;
delete from chats_trabajo;
delete from pedidos_descartados;
delete from propuestas;
delete from servicios_fijos;
delete from pedidos;

-- ── Entre Vecinos ────────────────────────────────────────────────────────
delete from mensajes_mercado;
delete from chats_mercado;
delete from comentarios_publicaciones;
delete from likes_publicaciones;
delete from publicaciones;

-- ── Avisos del prestador en Servicios ────────────────────────────────────
delete from likes_pub_prestador;
delete from pub_prestador_eventos;
delete from publicaciones_prestador;

-- ── Loyalty ──────────────────────────────────────────────────────────────
delete from loyalty_solicitudes;
delete from loyalty_canjes;
delete from loyalty_historial;
delete from loyalty;

-- ── Rastros, moderación y alertas ────────────────────────────────────────
delete from denuncias;
delete from perfil_vistas;
delete from perfil_contactos;
delete from busquedas_mercado;
delete from alertas_busqueda;
delete from alertas_servicio;
delete from archivados;
delete from notificaciones;
delete from rate_limits;
delete from resenas_app;
delete from prealtas_prestador;
delete from codigos_referido;

-- ── Perfil cargado por la cuenta ─────────────────────────────────────────
-- Los archivos siguen en los buckets de Storage: esto borra las filas que los
-- referencian, no los blobs. Quedan huérfanos, ocupando espacio pero sin
-- aparecer en ningún lado.
delete from prestadores_verificacion;
delete from portfolio_fotos;
delete from push_suscripciones;

-- ── Pagos ────────────────────────────────────────────────────────────────
delete from suscripciones;
delete from banners;
-- Vaciar pagos_procesados quita el candado de idempotencia: si MercadoPago
-- reenviara un webhook viejo, el producto se activaría de nuevo. Con pagos de
-- prueba y arrancando limpio es aceptable, pero conviene saberlo.
delete from pagos_procesados;

-- El trigger que sincroniza prestadores.plan corre en INSERT/UPDATE, no en
-- DELETE: sin esto los prestadores quedarían marcados como pro/plus con la
-- suscripción ya borrada, y el límite de propuestas seguiría siendo el del
-- plan pago.
update prestadores set plan = 'base' where plan is distinct from 'base';

-- ── Verificación ─────────────────────────────────────────────────────────
select 'BORRADO' as grupo, 'pedidos' as tabla, count(*) as filas from pedidos
union all select 'BORRADO','propuestas',count(*) from propuestas
union all select 'BORRADO','chats_trabajo',count(*) from chats_trabajo
union all select 'BORRADO','mensajes_chat',count(*) from mensajes_chat
union all select 'BORRADO','notificaciones',count(*) from notificaciones
union all select 'BORRADO','resenas',count(*) from resenas
union all select 'BORRADO','publicaciones',count(*) from publicaciones
union all select 'BORRADO','loyalty',count(*) from loyalty
union all select 'BORRADO','denuncias',count(*) from denuncias
union all select 'BORRADO','suscripciones',count(*) from suscripciones
union all select 'BORRADO','banners',count(*) from banners
union all select 'BORRADO','pagos_procesados',count(*) from pagos_procesados
union all select 'BORRADO','publicaciones_prestador',count(*) from publicaciones_prestador
union all select 'CONSERVADO','perfiles',count(*) from perfiles
union all select 'CONSERVADO','prestadores',count(*) from prestadores
union all select 'CONSERVADO','zonas',count(*) from zonas
union all select 'CONSERVADO','rubros',count(*) from rubros
union all select 'CONSERVADO','config_app',count(*) from config_app
union all select 'CONSERVADO','planes_limites',count(*) from planes_limites
union all select 'CONSERVADO','catalogo_servicios',count(*) from catalogo_servicios
order by grupo desc, tabla;
