# PRONET

PRONET es un marketplace PWA de servicios de barrio en Escobar, Buenos Aires.
Conecta vecinos (clientes) con prestadores de servicios (plomeros, electricistas, niñeras, etc.)

## Stack

Vanilla JS + HTML + CSS (sin frameworks), Supabase (Auth/DB/Storage/Realtime/Edge Functions), Netlify.

## Archivos principales

- `index.html`: UI completa (~3500 líneas) — todas las pantallas como divs con `class="screen"`
- `app.js`: lógica de negocio, routing, renderizado, feature flags (~5700 líneas)
- `datos.js`: capa de datos `PronetDB` con dual-mode localStorage/Supabase
- `styles.css`: design system completo con CSS variables
- `sw.js`: Service Worker con push notifications
- `config.js`: SW_VERSION, SUPABASE_URL/KEY, SLIDER_RANGOS

## Roles

- **vecino**: publica pedidos
- **prestador**: envía propuestas
- **admin**: modera

## Deploy

Netlify en pronetprueba.netlify.app

## Etapa actual

8 — estabilización y nuevas features.

## Convenciones importantes

- Las pantallas se activan con `goTo(id)` y tienen `class="screen active"`
- Los IDs de elementos dinámicos usan prefijos: `ep-` (estado propuesta), `np-` (nuevo pedido), `pd-` (detalle pedido)
- `PronetDB.listar()`, `PronetDB.listarSimple()`, `PronetDB.obtener()` son los métodos de acceso a datos
- `FEATURES.{flag}` controla qué funcionalidades están activas por nivel (N1/N2/N3)
- Nunca usar `innerHTML` para contenido de usuario — siempre `escHTML()` para sanitizar

## Política de `git push` a `main` (decidida 2026-08-01)

`git push origin main` dispara un deploy automático a producción en Netlify (pronetprueba.netlify.app), una app que ya procesa pagos reales con MercadoPago.

**Autorización:** hacer `git push origin main` directamente, sin pedir confirmación previa en el chat, sin excepciones por tipo de archivo (incluye cambios en Edge Functions, `.sql`, auth, o lógica de cobro).

**Aviso posterior obligatorio:** después de cada push, informar en el mismo mensaje qué se subió y que el deploy quedó disparado — no es una confirmación previa, es un aviso de lo que ya se ejecutó.

Esta autorización cubre únicamente `git push origin main` normal. Operaciones destructivas o difíciles de revertir (`push --force`, `git reset --hard`, borrar ramas, reescribir historial) siguen requiriendo confirmación explícita como siempre.
