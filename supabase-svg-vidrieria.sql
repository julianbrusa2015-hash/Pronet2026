-- ═══════════════════════════════════════════════════════════════════════
-- Vidriería no tenía ícono en la grilla de Categorías del Home
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23. El emoji (🪟) se le puso hoy en supabase-emoji-vidrieria.sql,
-- pero la grilla de "Categorías" del Home (pintarRubros()) no usa `emoji`
-- — usa `svg`, un path vectorial en el mismo estilo lineal que el resto
-- (Plomería tiene su llave, Pintura su rodillo, etc.). Vidriería nunca tuvo
-- ese campo cargado, así que el chip se dibujaba con el color de fondo
-- correcto pero sin nada adentro: un cuadrado celeste vacío.
--
-- Ventana de 4 paneles — el símbolo más directo de "vidrio/ventana" en el
-- mismo trazo fino (stroke-width 1.8) que ya usan los otros catorce.

update public.rubros
   set svg = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M12 4v16"/>'
 where slug = 'vidrieria';

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
select slug, emoji, svg from public.rubros where slug = 'vidrieria';
