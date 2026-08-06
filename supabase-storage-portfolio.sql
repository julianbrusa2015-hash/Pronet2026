-- Storage policies para el bucket 'portfolio'
-- Ejecutar en Supabase → SQL Editor

-- Lectura pública (las URLs ya son públicas; la policy habilita listados via API)
drop policy if exists "portfolio_lectura_publica" on storage.objects;
create policy "portfolio_lectura_publica"
on storage.objects
for select
to public
using (bucket_id = 'portfolio');

-- Un prestador solo puede subir a su propia carpeta ({prestador_id}/...)
-- La vinculación usuario→prestador vive en perfiles.prestador_id
drop policy if exists "portfolio_subir_propio" on storage.objects;
create policy "portfolio_subir_propio"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolio'
  and (storage.foldername(name))[1] = (
    select prestador_id::text from public.perfiles where id = auth.uid()
  )
);

-- Un prestador solo puede borrar archivos de su propia carpeta
-- (necesario para el cleanup de huérfanos en subirFotoPortfolio y para eliminarFotoPortfolio)
drop policy if exists "portfolio_borrar_propio" on storage.objects;
create policy "portfolio_borrar_propio"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portfolio'
  and (storage.foldername(name))[1] = (
    select prestador_id::text from public.perfiles where id = auth.uid()
  )
);
