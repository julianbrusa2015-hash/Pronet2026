-- ═══ PRONET · El teléfono del vecino se comparte al ser elegido ════════
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- ── El problema ────────────────────────────────────────────────────────
-- `obtener_telefono_contacto()` sólo exigía que EXISTIERA un chat entre las
-- dos partes. No miraba `ct.estado` en ningún lado: no distinguía una
-- consulta de un trabajo en curso, ni le importaba si la propuesta había
-- sido elegida o rechazada.
--
-- El chat de consulta lo abre EL PRESTADOR, desde "Consultar primero",
-- sobre cualquier pedido de su zona. O sea que cualquier prestador podía
-- quedarse con el teléfono de cualquier vecino que publicara: sin ofertar,
-- sin que el vecino aceptara nada y sin que se enterara.
--
-- Y el modal que le pide el teléfono al vecino le promete, con todas las
-- letras: "No se publica: sólo lo ve quien vos elegís". No era cierto.
--
-- ── Por qué asimétrico y no simétrico ──────────────────────────────────
-- Los dos lados no están en la misma situación.
--
-- El prestador PUBLICA una ficha para que lo contacten: su teléfono es un
-- dato comercial que él eligió exponer. Que el vecino lo vea durante la
-- consulta no le saca nada, y sirve — para coordinar una visita hay que
-- poder llamarse.
--
-- El vecino sólo publicó un pedido. Su teléfono es dato personal, y la
-- única razón por la que lo cargó es que se lo pedimos para que lo
-- contacte QUIEN ÉL ELIJA.
--
-- Por eso el candado va de un solo lado.

create or replace function public.obtener_telefono_contacto(p_usuario_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.telefono from public.perfiles p
  where p.id = p_usuario_id
    and (
      -- Entre Vecinos: simétrico. Los dos son vecinos y el contacto es el
      -- punto de la sección; no hay una parte que publique y otra que no.
      exists (
        select 1 from public.chats_mercado c
        where (c.autor_id = auth.uid() and c.consultante_id = p_usuario_id)
           or (c.consultante_id = auth.uid() and c.autor_id = p_usuario_id)
      )
      or exists (
        select 1 from public.chats_trabajo ct
        where (
          -- Soy el vecino y pido el teléfono del prestador: sin condición de
          -- estado. Él publicó su ficha para que lo llamen.
          ct.vecino_id = auth.uid()
          and exists (
            select 1 from public.perfiles pf
            where pf.id = p_usuario_id and pf.prestador_id = ct.prestador_id
          )
        ) or (
          -- Soy el prestador y pido el teléfono del vecino: sólo si ya me
          -- eligió. Los cinco estados de abajo son exactamente los que no se
          -- alcanzan sin haber sido elegido — 'activo' lo pone
          -- elegir_propuesta(), y de ahí en adelante.
          --
          -- 'cancelado' entra a propósito: sólo se llega desde 'activo' o
          -- 'terminado_*' (ver cancelarChat), así que implica que el trabajo
          -- existió. Si se cayó a mitad de camino, todavía tienen cosas que
          -- arreglar entre ellos.
          --
          -- Quedan afuera 'consulta', 'propuesta_enviada' y 'rechazada'.
          ct.vecino_id = p_usuario_id
          and ct.prestador_id = public.mi_prestador_id()
          and ct.estado in ('activo', 'terminado_prestador',
                            'terminado_por_vecino', 'calificado', 'cancelado')
        )
      )
    );
$fn$;

-- La firma no cambió: mismo nombre, mismo parámetro, mismo tipo. Cambiarla
-- crearía una sobrecarga y PostgREST dejaría de poder elegir cuál llamar
-- (PGRST203). Ya pasó una vez con otra función.
select p.proname, pg_get_function_identity_arguments(p.oid) as firma
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'obtener_telefono_contacto';
