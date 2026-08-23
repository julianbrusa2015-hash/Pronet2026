-- ═══════════════════════════════════════════════════════════════════════
-- El rubro Vidriería no tenía emoji en el buscador
-- ═══════════════════════════════════════════════════════════════════════
--
-- 2026-08-23. Pedido directo del usuario.
--
-- Era el único rubro sin ícono propio: emoji, color y fondo genéricos
-- (📋 / #2B5BFF / #EEF2FF — los mismos default que trae cualquier alta sin
-- personalizar) y sin SVG, cuando los otros 14 rubros sí lo tienen.
--
-- El NOMBRE se deja tal cual está ('Vidrieria', sin tilde) a propósito: hay
-- 1 pedido y 1 prestador que ya guardan ese string exacto en `rubro`/
-- `rubros[]` — el catálogo no está vinculado por FK, es texto libre que
-- tiene que calzar. Ponerle el acento los deja sin matchear con nada.

update public.rubros
   set emoji = '🪟', color = '#0891B2', bg = '#ECFEFF'
 where slug = 'vidrieria';

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
select slug, nombre, emoji, color, bg from public.rubros where slug = 'vidrieria';
-- vidrieria · Vidrieria · 🪟 · #0891B2 · #ECFEFF
