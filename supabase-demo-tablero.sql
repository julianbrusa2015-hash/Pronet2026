-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Datos de DEMO para ver todos los indicadores del tablero
--
-- Enciende, con números, cada rama de "Te esperan" en renderInicioPrestador
-- (app.js ~1402) y el aviso de vencimiento + Renovar del vecino (~7200).
--
-- TODO lo que crea queda marcado:
--   · pedidos          → titulo LIKE '[DEMO]%'
--   · chats_trabajo    → ultimo_mensaje LIKE '[DEMO]%'
-- Para borrarlo: correr supabase-demo-tablero-limpiar.sql
--
-- Es idempotente: vuelve a correrse sin duplicar (limpia lo suyo primero).
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Limpieza de una corrida anterior ─────────────────────────────────
delete from public.chats_trabajo where ultimo_mensaje like '[DEMO]%';
delete from public.pedidos        where titulo         like '[DEMO]%';

-- ── 1. Actores ──────────────────────────────────────────────────────────
create temporary table _act on commit drop as
select
  (select id from auth.users where email = 'vecinopuertos@gmail.com')  as vecino_a,
  (select id from auth.users where email = 'vecino_test@pronet.test')  as vecino_b,
  (select pf.prestador_id from public.perfiles pf join auth.users u on u.id = pf.id
     where u.email = 'prestador_test@pronet.test')                     as presto_test,
  (select pf.prestador_id from public.perfiles pf join auth.users u on u.id = pf.id
     where u.email = 'julianbrusa2015@gmail.com')                      as presto_julian;

-- ── 2. Pedidos nuevos de Electricistas, con el reloj corriendo ──────────
-- Sirven a DOS indicadores a la vez:
--   ⏳ "vencen pronto sin tu propuesta"  → expira_en dentro de las 24hs
--   💼 "pedidos nuevos de tu rubro"      → creado > la marca de última visita
-- Son de un vecino, no del prestador: el feed excluye los propios.
insert into public.pedidos (titulo, descripcion, rubro, icono, zona, estado,
                            presupuesto_min, presupuesto_max, urgencia,
                            usuario_id, creado, expira_en)
select v.t, v.d, 'Electricistas', '⚡', 'Escobar', 'Publicado',
       v.pmin, v.pmax, v.urg, a.vecino_a, now() - (v.mins || ' minutes')::interval,
       now() + (v.hs || ' hours')::interval
  from _act a, (values
    -- urgencia sólo acepta 'hoy' | 'semana' | 'flexible' (urgMap en app.js
    -- ~2064). Cualquier otro valor cae silenciosamente al default 🟢 Flexible.
    ('[DEMO] Tablero eléctrico que salta',      'Salta la térmica cada vez que enciendo el termotanque.', 30000,  60000, 'hoy',      12,  4),
    ('[DEMO] Instalación de luces LED',         'Cambiar 8 plafones del living y la cocina.',             45000,  90000, 'semana',   40,  9),
    ('[DEMO] Toma corriente quemado',           'Se quemó el toma del aire, huele a plástico.',           15000,  35000, 'hoy',       6, 19)
  ) as v(t, d, pmin, pmax, urg, mins, hs);

-- ── 3. Pedidos del vecino_b para el aviso de vencimiento + Renovar ──────
-- Uno por vencer y uno ya vencido: son los dos estados que dibujan el botón.
insert into public.pedidos (titulo, descripcion, rubro, icono, zona, estado,
                            presupuesto_min, presupuesto_max, urgencia,
                            usuario_id, creado, expira_en)
select v.t, v.d, v.rub, v.ic, 'Escobar', v.est,
       v.pmin, v.pmax, 'semana', a.vecino_b,
       now() - (v.dias || ' days')::interval,
       now() + (v.hs || ' hours')::interval
  from _act a, (values
    ('[DEMO] Pintar el frente de casa', 'Dos manos de látex, 40m2 aprox.', 'Pintura',  '🎨', 'Publicado', 80000, 140000, 6.7, 4),
    ('[DEMO] Destapar cañería del patio','Rejilla tapada después de la lluvia.','Plomería','🚿', 'Vencido',  20000,  40000, -3.0, 8)
  ) as v(t, d, rub, ic, est, pmin, pmax, hs, dias);

-- ── 4. Chats que alimentan "Te esperan" ─────────────────────────────────
-- Se crean para AMBOS prestadores para que los dos vean lo mismo.
-- propuesta_id queda en null a propósito: el tablero cuenta por estado, no
-- necesita la propuesta, y así no se ensucia el cupo mensual del plan.
insert into public.chats_trabajo (pedido_id, vecino_id, prestador_id, estado,
                                  ultimo_mensaje, hora_ultimo, creado, ultimo_evento_at)
select (select id from public.pedidos where titulo = '[DEMO] Instalación de luces LED'),
       a.vecino_a, p.pid, c.estado, c.msg,
       now() - (c.mins || ' minutes')::interval,
       now() - (c.mins || ' minutes')::interval,
       now() - (c.mins || ' minutes')::interval
  from _act a
  cross join lateral (values (a.presto_test), (a.presto_julian)) as p(pid)
  cross join (values
    -- 🟢 ¡Te eligieron! 2 trabajos en curso
    ('activo',              '[DEMO] Dale, te espero el jueves a las 9.',        35),
    ('activo',              '[DEMO] Perfecto, quedamos así entonces.',          90),
    -- 🏁 1 trabajo para cerrar
    ('terminado_por_vecino','[DEMO] Ya está listo, muchas gracias!',           180),
    -- 🕐 3 propuestas esperando respuesta
    ('propuesta_enviada',   '[DEMO] Te paso el presupuesto por el trabajo.',   240),
    ('propuesta_enviada',   '[DEMO] Puedo pasar a ver el lunes si te sirve.',  300),
    ('propuesta_enviada',   '[DEMO] Incluye materiales y mano de obra.',       420),
    -- 💭 vecino consultando
    ('consulta',            '[DEMO] Hola! Hacés instalaciones desde cero?',      8)
  ) as c(estado, msg, mins)
 where p.pid is not null;

-- ── 5. Mensajes sin leer ────────────────────────────────────────────────
-- Encienden el indicador 💬 y, sobre todo, permiten probar que se APAGA:
-- abrir el chat llama a marcarLeidos(), que los pone en leido = true.
-- Los escribe el vecino (autor_id = vecino) porque contarNoLeidos() excluye
-- los propios: un mensaje que escribiste vos no puede estar "sin leer".
insert into public.mensajes_chat (chat_id, autor_id, texto, creado, leido)
select ct.id, ct.vecino_id, m.txt,
       now() - (m.mins || ' minutes')::interval, false
  from public.chats_trabajo ct
  cross join (values
    ('[DEMO] Hola, seguís disponible para el jueves?', 25),
    ('[DEMO] Te dejo la dirección cuando confirmes.',  20)
  ) as m(txt, mins)
 where ct.ultimo_mensaje like '[DEMO]%'
   and ct.estado = 'activo';

commit;

-- ── Verificación ────────────────────────────────────────────────────────
select pr.nombre, ct.estado, count(*) as n
  from public.chats_trabajo ct join public.prestadores pr on pr.id = ct.prestador_id
 where ct.ultimo_mensaje like '[DEMO]%'
 group by pr.nombre, ct.estado order by pr.nombre, ct.estado;

select titulo, estado, rubro,
       round(extract(epoch from (expira_en - now())) / 3600) as vence_en_hs
  from public.pedidos where titulo like '[DEMO]%' order by titulo;
