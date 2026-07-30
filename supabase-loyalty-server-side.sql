-- ═══ PRONET · Parte 2: acreditación de puntos del lado del servidor ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- PROBLEMA: el cliente calculaba el saldo y lo escribía en `loyalty`. Con las
-- policies permisivas, cualquier usuario logueado podía hacer
--   upsert({ usuario_id: <propio>, puntos: 999999 })
-- y despues canjear eso por beneficios reales (mes de plan gratis).
--
-- RLS filtra FILAS, no valida VALORES: no hay policy que arregle esto. La
-- unica solucion es que el cliente no escriba el saldo nunca, y que la
-- acreditacion salga de eventos que el servidor puede verificar.
--
-- `resenas` es una base confiable: su policy de INSERT ya exige que sea el
-- vecino del chat, y tiene unique(chat_id) — una resena por trabajo. No se
-- puede forjar ni duplicar, asi que sirve como disparador.
--
-- ORDEN DE APLICACION: primero se despliega el codigo que deja de acreditar
-- desde el cliente, DESPUES se corre este SQL. Al reves los puntos se
-- acreditarian dos veces.

-- ── Helper central de acreditación ──────────────────────────────────────
-- Acepta p_puntos negativo para debitos (canjes, Parte 3).
create or replace function public.acreditar_puntos(
  p_usuario_id   uuid,
  p_puntos       int,
  p_tipo         text,
  p_descripcion  text,
  p_prestador_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual int;
  v_nuevo  int;
  v_nivel  text;
begin
  if p_usuario_id is null or p_puntos = 0 then return null; end if;

  insert into loyalty_historial (usuario_id, prestador_id, puntos, tipo, descripcion)
    values (p_usuario_id, p_prestador_id, p_puntos, p_tipo, p_descripcion);

  select puntos into v_actual from loyalty where usuario_id = p_usuario_id;
  v_nuevo := coalesce(v_actual, 0) + p_puntos;
  if v_nuevo < 0 then v_nuevo := 0; end if;  -- nunca saldo negativo

  -- Mismos umbrales que usaba el cliente (datos.js): 1k Plata, 5k Oro, 10k Élite
  v_nivel := case
    when v_nuevo >= 10000 then 'Élite'
    when v_nuevo >= 5000  then 'Oro'
    when v_nuevo >= 1000  then 'Plata'
    else 'Bronce'
  end;

  insert into loyalty (usuario_id, puntos, nivel)
       values (p_usuario_id, v_nuevo, v_nivel)
  on conflict (usuario_id) do update
     set puntos = v_nuevo, nivel = v_nivel;

  return v_nuevo;
end;
$$;

-- ── Trigger: acreditar al insertarse una reseña ─────────────────────────
-- Reemplaza las 3 llamadas que hacia el cliente:
--   prestador +100 'resena' · vecino +50 'resena' · prestador +400 'primer_trabajo'
create or replace function public.acreditar_por_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_prestador uuid;
  v_total_resenas     int;
begin
  select id into v_usuario_prestador
    from perfiles where prestador_id = new.prestador_id limit 1;

  -- Prestador: +100 por reseña recibida
  if v_usuario_prestador is not null then
    perform acreditar_puntos(v_usuario_prestador, 100, 'resena',
                             'Reseña recibida', new.prestador_id);

    -- Primer trabajo: se cuenta sobre resenas (el trigger es AFTER, asi que
    -- NEW ya esta incluida). Mas robusto que mirar chats_trabajo.calificado,
    -- que el cliente actualiza despues y podria no haber pasado todavia.
    select count(*) into v_total_resenas
      from resenas where prestador_id = new.prestador_id;
    if v_total_resenas = 1 then
      perform acreditar_puntos(v_usuario_prestador, 400, 'primer_trabajo',
                               'Primer trabajo cerrado', new.prestador_id);
    end if;
  end if;

  -- Vecino: +50 por dejar la reseña
  perform acreditar_puntos(new.vecino_id, 50, 'resena', 'Dejaste una reseña', null);

  return new;
end;
$$;

drop trigger if exists trg_acreditar_por_resena on public.resenas;
create trigger trg_acreditar_por_resena
  after insert on public.resenas
  for each row execute function public.acreditar_por_resena();

-- ── Contención de escritura directa ─────────────────────────────────────
-- NO se revoca todavia: los canjes (Parte 3) siguen escribiendo desde el
-- cliente. Al cerrar la Parte 3 hay que correr:
--
--   revoke insert, update on public.loyalty           from authenticated;
--   revoke insert, update on public.loyalty_historial from authenticated;
--
-- Con eso el saldo pasa a ser inescribible desde el navegador y la
-- auto-inflacion queda cerrada definitivamente.

-- ── Verificación ────────────────────────────────────────────────────────
select tgname, tgenabled from pg_trigger where tgname = 'trg_acreditar_por_resena';
