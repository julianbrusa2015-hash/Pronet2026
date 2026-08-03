-- Mismo patrón que ya se cerró para 'notificaciones' (auditoría 2026-07-29):
-- policies duplicadas para el mismo comando se combinan con OR, así que la
-- más permisiva gana aunque exista una versión "bien" acotada al lado.
--
-- 'pedidos'/'trabajos': la policy acotada exigía foldername = auth.uid(),
-- pero el código sube a foldername = pedidoId/chatId (no al uid del que
-- sube) — esa policy nunca hubiera matcheado un upload real. Lo que
-- sostenía el upload real era la policy genérica sin ninguna restricción
-- de carpeta, que de paso dejaba a cualquier autenticado escribir en la
-- carpeta de CUALQUIER pedido o chat de trabajo ajeno.
--
-- Fix: una sola policy por bucket, acotada a la relación real (dueño del
-- pedido / participante del chat de trabajo), no al nombre de carpeta.

-- ── pedidos ──────────────────────────────────────────────────────────
drop policy if exists "usuarios autenticados pueden subir pedidos" on storage.objects;
drop policy if exists "pedidos_upload_dueno" on storage.objects;
create policy "pedidos_upload_dueno"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pedidos'
    and exists (
      select 1 from public.pedidos p
      where p.id::text = (storage.foldername(name))[1]
        and p.usuario_id = auth.uid()
    )
  );

-- ── trabajos ─────────────────────────────────────────────────────────
drop policy if exists "usuarios autenticados pueden subir trabajos" on storage.objects;
drop policy if exists "trabajos_upload_participante" on storage.objects;
create policy "trabajos_upload_participante"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trabajos'
    and exists (
      select 1 from public.chats_trabajo ct
      where ct.id::text = (storage.foldername(name))[1]
        and (
          ct.vecino_id = auth.uid()
          or ct.prestador_id = (select prestador_id from public.perfiles where id = auth.uid())
        )
    )
  );

-- ── propuestas-adjuntos ──────────────────────────────────────────────
-- Folder real = auth.uid() (ver subirAdjuntoPropuesta en datos.js), así
-- que acá sí corresponde el patrón simple.
drop policy if exists "prestadores_pueden_subir_adjuntos" on storage.objects;
create policy "prestadores_pueden_subir_adjuntos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'propuestas-adjuntos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
