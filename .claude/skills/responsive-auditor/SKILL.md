---
name: responsive-auditor
description: Audita, verifica y reporta problemas de diseño responsivo y mobile-first en componentes web. Usar cuando el usuario pida verificar la responsividad de la app o de un componente, revisar desbordamiento horizontal, tamaños táctiles, breakpoints o cómo se ve en móvil.
version: 1.0.0
---

# Protocolo de Auditoría Web Responsiva

Cuando el usuario te pida verificar la responsividad de su app o de un componente específico, debes ejecutar un análisis exhaustivo basado en los siguientes 5 pilares, simulando pantallas desde 320px (Mobile S) hasta 2560px (UltraWide).

## 1. Detección de Desbordamiento (Overflow & Scrolling)
- Busca elementos con anchos fijos en píxeles (`width: 500px`) que superen el ancho de la pantalla móvil.
- Verifica que no ocurra un scroll horizontal no deseado en el elemento contenedor principal (`body` o `main`).
- Revisa que las imágenes y elementos multimedia tengan `max-width: 100%; height: auto;`.

## 2. Flexibilidad Estructural (Layout Fluidity)
- Prioriza el uso de CSS Intrínseco: Comprueba si se están usando `flex-wrap`, grid con `auto-fit`/`auto-fill`, o funciones como `clamp()`, `min()`, `max()`.
- Si se detectan Media Queries de Tailwind o CSS puro, evalúa si son realmente necesarias o si el diseño se rompe abruptamente en los puntos de transición (breakpoints).

## 3. Accesibilidad y Elementos Táctiles (Touch Targets)
- Verifica que los botones y enlaces tengan un tamaño mínimo de **48x48px** en dispositivos móviles para evitar clics accidentales.
- Asegúrate de que las fuentes escalen correctamente (ej. usando `rem` o tipografía fluida) y que el tamaño mínimo de lectura en móvil sea de **16px** (1rem).

## 4. Transformaciones Críticas de UI
- **Tablas de datos:** Verifica si cambian a un formato de lista/tarjetas o si implementan un contenedor con scroll horizontal nativo accesible en móvil.
- **Navegación:** Evalúa si el menú de escritorio se transforma correctamente en un menú hamburguesa, una barra inferior (bottom nav) o pestañas deslizables en pantallas pequeñas.

## 5. Salida del Reporte (Estructura obligatoria de respuesta)
Tras el análisis, debes presentar la respuesta dividida en:
1. **Estado General:** [Aprobado / Requiere Cambios Críticos / Optimizable]
2. **Fallas Críticas Encontradas:** Lista numerada con problemas de desbordamiento o bloqueo visual en móviles.
3. **Código de Corrección:** Proporciona el fragmento de código refactorizado listo para copiar y pegar.

## Notas para PRONET

- Las pantallas son `<div class="screen">` dentro de `index.html`; sólo la que
  tiene `.active` está visible. Para medir una pantalla concreta hay que
  activarla con `goTo(id)` desde la consola, no alcanza con cargar la página.
- Mucho estilo vive **inline en plantillas de `app.js`**, no en `styles.css`.
  Un grep sólo sobre el CSS deja afuera la mitad del problema.
- Medir con el navegador (`scrollWidth > clientWidth`, `getBoundingClientRect`)
  antes de afirmar que algo desborda. El análisis estático solo señala
  candidatos.
