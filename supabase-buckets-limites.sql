-- Límite de tamaño y lista de tipos permitidos en los buckets de imágenes.
-- APLICADO EN PRODUCCIÓN EL 2026-08-12. Se deja para que quede el registro de
-- qué se corrió; no hace falta volver a ejecutarlo.
--
-- Por qué: estos cinco buckets aceptaban cualquier archivo de cualquier tamaño.
-- Se verificó desde el cliente real que un usuario común podía subir un SVG con
-- <script> adentro y quedaba servido como image/svg+xml, y que no había techo
-- de tamaño — el riesgo concreto es la factura de storage.
--
-- 10 MB y no 5: la foto más grande ya subida a 'mercado' pesaba 4,3 MB, o sea
-- que una foto real de celular raspa los 5 MB. El objetivo es cortar el abuso
-- de gigabytes, no ajustar megabytes.
--
-- heic/heif van incluidos porque el bucket 'pedidos' ya los aceptaba: la app ya
-- recibe fotos de iPhone y dejarlos afuera rompería algo que hoy funciona.
--
-- 'pedidos' y 'propuestas-adjuntos' no se tocan: ya tenían límite y allowlist.

update storage.buckets
   set file_size_limit   = 10485760,  -- 10 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
       ]
 where id in ('avatares', 'banners', 'mercado', 'portfolio', 'trabajos');

-- Verificación (desde el cliente real, no por la Management API):
--   SVG con <script>  -> 415 invalid_mime_type
--   text/html         -> 415 invalid_mime_type
--   jpeg normal       -> 200
--   jpeg de 12 MB     -> 413 Payload too large
