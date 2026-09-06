-- ═══ PRONET · Tigre y Nordelta compartían una coordenada placeholder ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Detectado 2026-09-06 barriendo la tabla `zonas`. Las dos zonas tenían
-- EXACTAMENTE la misma coordenada, y redonda a dos decimales:
--
--   Tigre    -34.400000, -58.650000
--   Nordelta -34.400000, -58.650000
--
-- Una coincidencia exacta entre dos zonas distintas es la señal de que alguien
-- rellenó un valor aproximado y quedó — el mismo patrón que ya se había
-- anotado como criterio de revisión al cargar tandas de coordenadas. Ese punto
-- no cae en ninguna de las dos: queda en el medio, entre Benavídez y Tigre.
--
-- Consecuencia: toda publicación de esas zonas se dibujaba en el mismo pin, y
-- la distancia que ve el vecino (mktDistanciaLabel) salía mal para las dos.
--
-- Valores nuevos, geocodificados con el Geocoder de Google desde el sitio:
--   Nordelta → "Nordelta, B1670 Benavidez, Provincia de Buenos Aires"
--   Tigre    → "B1648 Tigre, Provincia de Buenos Aires"
--
-- ⚠ Criterio pendiente de confirmación: para los barrios CERRADOS la regla del
-- proyecto es usar el ACCESO y no el centro geométrico. Acá se usó el centro
-- porque son dos zonas de cobertura vecinas —no comunidades con detalle de
-- lote— y no tienen un acceso único. Si Nordelta se va a tratar como comunidad
-- con lotes, corresponde reemplazar por la coordenada de su acceso real.

update public.zonas
   set lat = -34.402644, lng = -58.668478
 where nombre = 'Nordelta';

update public.zonas
   set lat = -34.425087, lng = -58.579659
 where nombre = 'Tigre';

-- Verificación: no debe quedar ninguna coordenada compartida por dos zonas.
select lat::text || ', ' || lng::text as coord,
       string_agg(nombre, ' = ') as zonas,
       count(*) as cuantas
  from public.zonas
 where lat is not null
 group by lat, lng
having count(*) > 1;
