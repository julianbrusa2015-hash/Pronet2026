-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · `propuesta_expiracion_hs` pasa a llamarse `pedido_vencimiento_hs`
--
-- El nombre mentía: no controla nada de las propuestas, controla cuánto
-- dura un PEDIDO publicado antes de vencer. Lo lee `pedido_vence_en()`,
-- que es lo único que decide el vencimiento. Con ese nombre, cualquiera
-- que quisiera cambiar la vida de un pedido no lo encontraba, y quien
-- tocara lo que creía ser "expiración de propuestas" cambiaba otra cosa.
--
-- El rename NO puede ser a secas: la clave la leen el servidor
-- (`pedido_vence_en`) y también el cliente, que la mapea a
-- PRONET_CONFIG. Una PWA con el JS viejo en caché sigue pidiendo el
-- nombre anterior, así que la clave vieja se conserva como ALIAS con el
-- mismo valor. Se puede borrar cuando ya no queden clientes previos a
-- v143; hasta entonces, borrarla haría que esos clientes cayeran al
-- default de 168 en silencio.
--
-- Los dos valores se mantienen sincronizados por trigger: si alguien edita
-- uno desde el panel de admin, el otro lo sigue. Sin eso, el alias es una
-- trampa esperando a que los dos números diverjan.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. La clave nueva, con el valor que ya estaba ───────────────────────
insert into public.config_app (clave, valor)
select 'pedido_vencimiento_hs', coalesce(nullif(valor,''), '168')
  from public.config_app where clave = 'propuesta_expiracion_hs'
on conflict (clave) do nothing;

-- Si no existía ninguna de las dos, sembrar el default.
insert into public.config_app (clave, valor) values ('pedido_vencimiento_hs','168')
on conflict (clave) do nothing;

-- ── 2. Que las dos no puedan divergir ───────────────────────────────────
create or replace function public.sync_alias_vencimiento()
returns trigger
language plpgsql
as $function$
declare
  v_otra text;
begin
  if new.clave = 'pedido_vencimiento_hs' then
    v_otra := 'propuesta_expiracion_hs';
  elsif new.clave = 'propuesta_expiracion_hs' then
    v_otra := 'pedido_vencimiento_hs';
  else
    return new;
  end if;

  -- `is distinct from` y no `<>`: con NULL, `<>` da NULL y el update no se
  -- haría, dejando las claves desincronizadas justo en el caso raro.
  update public.config_app
     set valor = new.valor
   where clave = v_otra
     and valor is distinct from new.valor;

  return new;
end;
$function$;

drop trigger if exists trg_sync_alias_vencimiento on public.config_app;
create trigger trg_sync_alias_vencimiento
  after insert or update of valor on public.config_app
  for each row execute function public.sync_alias_vencimiento();

-- ── 3. La función pasa a leer el nombre nuevo ───────────────────────────
-- coalesce sobre las dos por si el orden de despliegue las dejara
-- desfasadas un instante.
create or replace function public.pedido_vence_en(
  p_expira timestamp with time zone,
  p_creado timestamp with time zone
)
returns timestamp with time zone
language sql
stable
as $function$
  select coalesce(
    p_expira,
    p_creado + ((select coalesce(
                   (select nullif(valor,'')::int from public.config_app where clave = 'pedido_vencimiento_hs'),
                   (select nullif(valor,'')::int from public.config_app where clave = 'propuesta_expiracion_hs'),
                   168)) || ' hours')::interval
  );
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select clave, valor from public.config_app
 where clave in ('pedido_vencimiento_hs','propuesta_expiracion_hs') order by clave;

-- El vencimiento calculado no cambió: 168hs desde la creación.
select round(extract(epoch from (public.pedido_vence_en(null, now()) - now())) / 3600) as horas_de_vida;
