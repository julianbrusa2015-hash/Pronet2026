-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Verificación de prestadores (paso 1: datos declarados)
--
-- El badge "verificado" existía sin nada detrás. Esto le pone contenido,
-- empezando por lo mínimo: nombre completo, dirección y número de DNI.
--
-- ── Qué verifica esto, con honestidad ──────────────────────────────────
-- Un DNI tipeado por el propio prestador NO prueba identidad. Sirve por
-- otros dos motivos, que igual son reales:
--
--   1. Sube el costo de fabricar cuentas falsas — el índice único sobre
--      dni impide que la misma persona abra cinco fichas.
--   2. Ante una denuncia hay a quién identificar. Hoy no hay nada.
--
-- Por eso el circuito es de DOS pasos: el prestador declara, y el ADMIN
-- marca verificado desde el panel. `prestadores.verificado` sigue siendo
-- la bandera pública, y pasa a significar "alguien miró esto", no "el
-- usuario completó un formulario". Sin ese segundo paso, el badge
-- seguiría mintiendo con más campos.
--
-- Las fotos de DNI quedaron afuera a propósito (decisión del 2026-08-09):
-- mucha fricción para el valor que agregan en esta etapa, y guardar
-- imágenes de documentos trae obligaciones de custodia que hoy no hay
-- cómo sostener.
--
-- ── Por qué una tabla aparte y no columnas en prestadores ──────────────
-- `prestadores` tiene la policy `leer_prestadores using (true)` para
-- {anon, authenticated}: la lee cualquiera, incluso sin sesión. El RLS de
-- Postgres es por FILA, no por columna, así que no hay forma de meter un
-- DNI ahí y esconderlo. Va en su propia tabla, con su propia policy.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.prestadores_verificacion (
  prestador_id    uuid primary key references public.prestadores(id) on delete cascade,
  nombre_completo text not null,
  direccion       text not null,
  dni             text not null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'verificado', 'rechazado')),
  motivo_rechazo  text,
  revisado_por    uuid references auth.users(id) on delete set null,
  revisado_en     timestamptz,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);

-- Un DNI, una ficha. Es la única barrera real contra cuentas múltiples que
-- da este paso, así que conviene que sea dura.
create unique index if not exists idx_verificacion_dni
  on public.prestadores_verificacion (dni);

comment on table public.prestadores_verificacion is
  'Datos declarados para verificar a un prestador. Lectura restringida: sólo el dueño y el admin. Nunca exponer por la API pública.';

alter table public.prestadores_verificacion enable row level security;

-- ── Lectura: el dueño de la ficha y el admin. Nadie más. ───────────────
create policy "verificacion_leer" on public.prestadores_verificacion
  for select to authenticated
  using (prestador_id = public.mi_prestador_id() or public.es_admin());

-- ── Alta: sólo sobre la ficha propia. ──────────────────────────────────
create policy "verificacion_crear" on public.prestadores_verificacion
  for insert to authenticated
  with check (prestador_id = public.mi_prestador_id());

-- ── Edición del prestador: sólo mientras no esté resuelto, y sin poder
--    tocar su propio estado. `with check` mira la fila DESPUÉS del cambio:
--    sin él, un update podría dejar estado='verificado' y autoaprobarse.
create policy "verificacion_editar_propia" on public.prestadores_verificacion
  for update to authenticated
  using  (prestador_id = public.mi_prestador_id() and estado = 'pendiente')
  with check (prestador_id = public.mi_prestador_id() and estado = 'pendiente');

-- ── El admin resuelve. ─────────────────────────────────────────────────
create policy "verificacion_admin" on public.prestadores_verificacion
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── Resolver la verificación ───────────────────────────────────────────
-- En una sola operación para que no puedan quedar desfasados el estado de
-- la solicitud y la bandera pública del prestador.
create or replace function public.resolver_verificacion(
  p_prestador_id uuid,
  p_aprobar      boolean,
  p_motivo       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    return jsonb_build_object('ok', false, 'error', 'solo admin');
  end if;

  update public.prestadores_verificacion
     set estado       = case when p_aprobar then 'verificado' else 'rechazado' end,
         motivo_rechazo = case when p_aprobar then null else p_motivo end,
         revisado_por = auth.uid(),
         revisado_en  = now(),
         actualizado  = now()
   where prestador_id = p_prestador_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin solicitud para ese prestador');
  end if;

  -- La bandera pública. Al rechazar se apaga: si estaba verificado por el
  -- circuito viejo y ahora se rechaza, dejarlo prendido sería peor que no
  -- haber revisado nunca.
  update public.prestadores
     set verificado    = p_aprobar,
         verificado_en = case when p_aprobar then now() else null end
   where id = p_prestador_id;

  return jsonb_build_object('ok', true, 'estado',
    case when p_aprobar then 'verificado' else 'rechazado' end);
end;
$$;

revoke all on function public.resolver_verificacion(uuid, boolean, text) from public;
grant execute on function public.resolver_verificacion(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';

select (select count(*) from public.prestadores_verificacion)              as solicitudes,
       (select count(*) from public.prestadores where verificado)          as verificados_hoy,
       (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relname = 'prestadores_verificacion')                     as policies;
