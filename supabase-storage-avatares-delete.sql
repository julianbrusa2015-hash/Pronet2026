-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · El bucket `avatares` no tenía policy de DELETE
--
-- Tenía INSERT (subir la propia), SELECT (lectura pública) y UPDATE
-- (reemplazar la propia), pero ninguna de borrado. Consecuencia: un
-- usuario podía cambiar su foto de perfil pero nunca eliminarla, y la API
-- de Storage devolvía "ok" con cero archivos borrados — sin error, así que
-- del lado del cliente parecía haber funcionado.
--
-- Mismo alcance que la de UPDATE: sólo la carpeta propia, que es el uuid
-- del usuario. Nadie puede tocar los archivos de otro.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "avatar_borrar_propio" on storage.objects;
create policy "avatar_borrar_propio" on storage.objects
  for delete
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ── Verificación ────────────────────────────────────────────────────────
select policyname, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (qual ilike '%avatares%' or with_check ilike '%avatares%')
 order by cmd;
