-- ═══ PRONET · config_app — Parámetros de la app editables sin redeploy ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente (safe to re-run).
--
-- Qué hace este archivo:
--   1. Crea la tabla config_app (key/valor para parámetros operativos)
--   2. Inserta los valores por defecto del rate limit de pedidos
--   3. Reescribe el trigger RATE_LIMIT_CREAR_PEDIDO para leer de config_app
--      en vez de tener los valores hardcodeados en el código del trigger
--
-- Para cambiar el rate limit sin redeploy:
--   update config_app set valor = '5' where clave = 'rate_limit_pedidos_max';
--   update config_app set valor = '30' where clave = 'rate_limit_pedidos_ventana_min';


-- ── 1. Tabla config_app ──────────────────────────────────────────────────────
create table if not exists public.config_app (
  clave       text primary key,
  valor       text not null,
  descripcion text,
  actualizado timestamptz not null default now()
);

-- Solo admins pueden leer/escribir
alter table public.config_app enable row level security;

drop policy if exists "Admin lee config_app" on public.config_app;
create policy "Admin lee config_app" on public.config_app
  for select to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
        and 'admin' = any(perfiles.roles)
    )
  );

drop policy if exists "Admin escribe config_app" on public.config_app;
create policy "Admin escribe config_app" on public.config_app
  for all to authenticated
  using (
    exists (
      select 1 from public.perfiles
      where perfiles.id = auth.uid()
        and 'admin' = any(perfiles.roles)
    )
  );


-- ── 2. Valores por defecto del rate limit ───────────────────────────────────
insert into public.config_app (clave, valor, descripcion) values
  ('rate_limit_pedidos_max',
   '5',
   'Máximo de pedidos que un vecino puede crear en la ventana de tiempo'),
  ('rate_limit_pedidos_ventana_min',
   '60',
   'Ventana de tiempo en minutos para el rate limit de pedidos')
on conflict (clave) do nothing;


-- ── 3. Función del trigger — lee de config_app ──────────────────────────────
create or replace function public.fn_rate_limit_crear_pedido()
returns trigger language plpgsql security definer as $$
declare
  v_max      int;
  v_ventana  int;
  v_count    int;
begin
  -- Leer parámetros desde config_app (con fallback si la tabla aún no existe
  -- o la fila fue borrada accidentalmente)
  select coalesce((select valor::int from public.config_app
                   where clave = 'rate_limit_pedidos_max'), 5)
    into v_max;

  select coalesce((select valor::int from public.config_app
                   where clave = 'rate_limit_pedidos_ventana_min'), 60)
    into v_ventana;

  -- Contar pedidos recientes del mismo usuario
  select count(*) into v_count
  from public.pedidos
  where usuario_id = new.usuario_id
    and creado >= now() - (v_ventana || ' minutes')::interval;

  if v_count >= v_max then
    raise exception
      'Rate limit: máximo % pedidos por % minutos. Intentá más tarde.',
      v_max, v_ventana
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Reemplazar el trigger existente (drop + create para garantizar idempotencia)
drop trigger if exists trg_rate_limit_crear_pedido on public.pedidos;
create trigger trg_rate_limit_crear_pedido
  before insert on public.pedidos
  for each row execute function public.fn_rate_limit_crear_pedido();


-- ── 4. Verificación ─────────────────────────────────────────────────────────
select clave, valor, descripcion from public.config_app order by clave;

select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_table = 'pedidos'
  and trigger_name = 'trg_rate_limit_crear_pedido';
