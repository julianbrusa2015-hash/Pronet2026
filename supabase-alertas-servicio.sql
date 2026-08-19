-- ═══ PRONET · Alertas de servicio ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Equivalente a alertas_busqueda (Entre Vecinos/Mercado) pero para Servicios:
-- el vecino busca un rubro en s-buscar y guarda "avisame cuando aparezca".
-- Como el alta de un prestador es un trigger de servidor (no un insert
-- directo del cliente), acá el matching también va por trigger de
-- servidor — no hace falta una Edge Function invocada desde el cliente
-- como en match-alertas.
--
-- `zona` es texto NOT NULL con default '' (no NULL): PostgREST necesita que
-- el índice único del upsert matchee columnas literales, y un índice sobre
-- coalesce(zona,'') no sirve como target de ON CONFLICT desde el cliente.
-- '' significa "cualquier zona".

create table if not exists public.alertas_servicio (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  termino text not null,      -- lo que buscó (nombre o rubro), en minúsculas
  zona text not null default '',  -- zona del vecino al crear la alerta; '' = cualquier zona
  activa boolean not null default true,
  creado timestamptz default now()
);

drop index if exists alertas_servicio_uq;
create unique index alertas_servicio_uq
  on public.alertas_servicio (usuario_id, termino, zona);

alter table public.alertas_servicio enable row level security;

drop policy if exists "usuario gestiona sus alertas de servicio" on public.alertas_servicio;
create policy "usuario gestiona sus alertas de servicio" on public.alertas_servicio
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ── Trigger: al crear un prestador activo, notificar a quien lo esperaba ──
--
-- El match es por FRASE completa (a.termino dentro del texto) O por
-- CUALQUIER palabra significativa (≥3 letras) del término de la alerta.
-- Sin esto, una alerta "gasista matriculado" no matcheaba con un prestador
-- que sólo puso "Gasista" como rubro — que es justo a quien el vecino está
-- buscando. El costo es más falsos positivos con palabras muy genéricas,
-- aceptable frente a perderse la coincidencia obvia.
create or replace function public.match_alertas_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text;
begin
  if new.activo is distinct from true then
    return new;
  end if;

  texto := lower(
    coalesce(new.nombre, '') || ' ' ||
    coalesce(new.rubro, '') || ' ' ||
    coalesce(new.subrubro, '') || ' ' ||
    coalesce(array_to_string(new.rubros, ' '), '')
  );

  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, url)
  select a.usuario_id, 'alerta_servicio',
         'Nuevo prestador: ' || coalesce(new.nombre, 'alguien nuevo'),
         'Hay un prestador nuevo que coincide con tu búsqueda "' || a.termino || '"'
           || case when a.zona <> '' then ' en ' || a.zona else '' end || '.',
         '/#s-buscar'
    from public.alertas_servicio a
   where a.activa = true
     and (
       texto like '%' || a.termino || '%'
       or exists (
         select 1 from unnest(string_to_array(a.termino, ' ')) as palabra
          where length(palabra) >= 3 and texto like '%' || palabra || '%'
       )
     )
     and (a.zona = '' or a.zona = new.zona or a.zona = any(coalesce(new.zonas, array[]::text[])));

  return new;
end;
$$;

drop trigger if exists trg_match_alertas_servicio on public.prestadores;
create trigger trg_match_alertas_servicio
  after insert on public.prestadores
  for each row execute function public.match_alertas_servicio();

-- ── Verificación ────────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
 where table_name = 'alertas_servicio' order by ordinal_position;
select tgname from pg_trigger where tgname = 'trg_match_alertas_servicio';
