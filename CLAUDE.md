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
