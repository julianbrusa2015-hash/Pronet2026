-- Registro de búsquedas en ProMarket para detectar demanda sin oferta
-- ("X vecinos buscaron Y y no hay resultados"). Solo se guarda el término,
-- la zona, si hubo resultados y opcionalmente quién buscó — se usa
-- exclusivamente para mostrar tendencias agregadas a los publicadores,
-- nunca para identificar quién buscó qué de forma individual.

create table if not exists public.busquedas_mercado (
  id               uuid primary key default gen_random_uuid(),
  termino          text not null,
  zona             text,
  categoria        text,
  resultados_count int not null default 0,
  usuario_id       uuid references auth.users(id) on delete set null,
  creado           timestamptz not null default now()
);

create index if not exists idx_busquedas_mercado_termino_zona
  on public.busquedas_mercado (zona, termino, creado);

alter table public.busquedas_mercado enable row level security;

-- Solo usuarios logueados pueden insertar su propia búsqueda (evita el
-- patrón "anon + with_check(true)" ya detectado como forjable en otras
-- tablas de analítica de este proyecto).
drop policy if exists "busquedas_mercado_insertar" on public.busquedas_mercado;
create policy "busquedas_mercado_insertar"
  on public.busquedas_mercado for insert
  to authenticated
  with check (usuario_id = auth.uid() or usuario_id is null);

-- Sin policy de SELECT: la tabla no es legible por nadie directamente.
-- El único acceso de lectura es la función de abajo, que solo devuelve
-- términos agregados (nunca filas individuales ni usuario_id).

create or replace function public.tendencias_busqueda_zona(p_zona text, p_dias int default 7)
returns table(termino text, cantidad bigint)
language sql security definer stable
set search_path = public
as $$
  select b.termino, count(*) as cantidad
  from public.busquedas_mercado b
  where b.zona = p_zona
    and b.resultados_count = 0
    and b.creado > now() - (p_dias || ' days')::interval
  group by b.termino
  having count(*) >= 3
  order by cantidad desc
  limit 5;
$$;
grant execute on function public.tendencias_busqueda_zona(text, int) to authenticated;

notify pgrst, 'reload schema';
