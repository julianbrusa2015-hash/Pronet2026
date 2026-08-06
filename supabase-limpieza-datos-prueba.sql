-- PRONET - Limpieza de datos de prueba
-- Ejecutar en Supabase SQL Editor usando el archivo directamente (no copiar del chat)

DELETE FROM public.trabajo_fotos
WHERE chat_id IN (
  SELECT id FROM public.chats_trabajo
  WHERE prestador_id IN (
    '4a42881c-f515-41fc-b40a-c0004abdde91',
    '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
    'f992267c-62d4-4238-97fe-12c0cb6d3979',
    '0f48ada4-d711-42ec-a638-a08e802d08a4'
  )
);

DELETE FROM public.mensajes_chat
WHERE chat_id IN (
  SELECT id FROM public.chats_trabajo
  WHERE prestador_id IN (
    '4a42881c-f515-41fc-b40a-c0004abdde91',
    '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
    'f992267c-62d4-4238-97fe-12c0cb6d3979',
    '0f48ada4-d711-42ec-a638-a08e802d08a4'
  )
);

DELETE FROM public.resenas
WHERE chat_id IN (
  SELECT id FROM public.chats_trabajo
  WHERE prestador_id IN (
    '4a42881c-f515-41fc-b40a-c0004abdde91',
    '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
    'f992267c-62d4-4238-97fe-12c0cb6d3979',
    '0f48ada4-d711-42ec-a638-a08e802d08a4'
  )
);

DELETE FROM public.chats_trabajo
WHERE prestador_id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

DELETE FROM public.propuestas
WHERE prestador_id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

DELETE FROM public.portfolio_fotos
WHERE prestador_id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

DELETE FROM public.perfil_vistas
WHERE prestador_id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

DELETE FROM public.loyalty_historial
WHERE prestador_id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

DELETE FROM public.prestadores
WHERE id IN (
  '4a42881c-f515-41fc-b40a-c0004abdde91',
  '95f6640f-59cb-4ab4-9656-d3bcbcffc2e7',
  'f992267c-62d4-4238-97fe-12c0cb6d3979',
  '0f48ada4-d711-42ec-a638-a08e802d08a4'
);

SELECT id, nombre, rubro FROM public.prestadores ORDER BY nombre;
