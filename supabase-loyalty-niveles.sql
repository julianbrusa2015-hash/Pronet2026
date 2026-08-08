-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Los niveles de loyalty dejan de estar escritos en tres lugares
--
-- Los mismos umbrales vivían en:
--   1. `config.js` → LOYALTY_NIVELES (lo que la pantalla MUESTRA)
--   2. `acreditar_puntos()` en esta base (lo que realmente ASIGNA)
--   3. un ternario en app.js para el emoji
--
-- Cambiar uno solo hacía que la barra de progreso dijera una cosa y el
-- nivel guardado fuera otro, sin que nada fallara. Y el ternario del
-- emoji ni siquiera contemplaba Élite: el nivel más alto se mostraba con
-- la medalla de bronce.
--
-- Ahora hay una tabla y `acreditar_puntos()` la lee. El máximo de cada
-- nivel es el mínimo del siguiente: guardarlo aparte es justamente lo que
-- permite que se desincronicen.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.loyalty_niveles (
  nombre     text primary key,
  emoji      text not null default '🏅',
  min_puntos integer not null,
  orden      integer not null,
  creado     timestamptz not null default now()
);

alter table public.loyalty_niveles enable row level security;

drop policy if exists "niveles_lectura" on public.loyalty_niveles;
create policy "niveles_lectura" on public.loyalty_niveles for select using (true);

drop policy if exists "niveles_admin_escribe" on public.loyalty_niveles;
create policy "niveles_admin_escribe" on public.loyalty_niveles
  for all using (public.es_admin()) with check (public.es_admin());

insert into public.loyalty_niveles (nombre, emoji, min_puntos, orden) values
  ('Bronce', '🥉', 0,     1),
  ('Plata',  '🥈', 1000,  2),
  ('Oro',    '🥇', 5000,  3),
  ('Élite',  '💎', 10000, 4)
on conflict (nombre) do nothing;

-- ── El nivel que corresponde a un saldo ─────────────────────────────────
-- Una sola función: la usan la acreditación y cualquier recálculo futuro.
create or replace function public.nivel_para_puntos(p_puntos integer)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select nombre from public.loyalty_niveles
      where min_puntos <= greatest(coalesce(p_puntos, 0), 0)
      order by min_puntos desc limit 1),
    'Bronce');
$function$;

-- ── acreditar_puntos pasa a usarla ──────────────────────────────────────
-- Se conserva TODO lo del boost por plan (ver supabase-loyalty-boost.sql):
-- sólo cambia de dónde sale el nivel.
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

  -- Sólo suma: un canje descuenta en negativo y multiplicarlo encarecería
  -- el canje al que pagó el plan.
  if p_puntos > 0 then
    v_boost := public.loyalty_boost_de(p_usuario_id);
    v_final := round(p_puntos * v_boost)::int;
    if v_boost > 1 then
      v_desc := coalesce(p_descripcion,'') || ' (×' || trim(to_char(v_boost,'FM9.99')) || ' plan)';
    end if;
  else
    v_final := p_puntos;
  end if;

  insert into loyalty_historial (usuario_id, prestador_id, puntos, tipo, descripcion)
  values (p_usuario_id, p_prestador_id, v_final, p_tipo, v_desc);

  select puntos into v_actual from loyalty where usuario_id = p_usuario_id;
  v_nuevo := coalesce(v_actual, 0) + v_final;
  if v_nuevo < 0 then v_nuevo := 0; end if;

  -- Los umbrales ya no están escritos acá: salen de loyalty_niveles.
  v_nivel := public.nivel_para_puntos(v_nuevo);

  insert into loyalty (usuario_id, puntos, nivel)
  values (p_usuario_id, v_nuevo, v_nivel)
  on conflict (usuario_id) do update set puntos = v_nuevo, nivel = v_nivel;

  return v_nuevo;
end;
$function$;

-- ── Realinear los niveles ya guardados ──────────────────────────────────
-- Si alguno quedó desfasado por el drift entre las tres copias, se corrige.
update public.loyalty
   set nivel = public.nivel_para_puntos(puntos)
 where nivel is distinct from public.nivel_para_puntos(puntos);

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select l.nivel, count(*) as usuarios, min(l.puntos) as pts_min, max(l.puntos) as pts_max
  from public.loyalty l group by l.nivel order by 3;
