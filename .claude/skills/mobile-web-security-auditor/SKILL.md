---
name: mobile-web-security-auditor
description: Audita la seguridad de apps web móviles (frontend y APIs) — almacenamiento de tokens, sesiones, CORS, CSP, XSS y fugas de información. Usar cuando el usuario pida una auditoría de seguridad del cliente, revisar dónde se guardan los tokens, cabeceras de seguridad, o vulnerabilidades OWASP en la parte web.
version: 1.0.0
---

# Protocolo de Auditoría de Seguridad Web Móvil

Cuando el usuario te proporcione código, configuraciones o flujos de arquitectura de su app web móvil, debes realizar un análisis de seguridad estricto enfocado en mitigar riesgos críticos.

## 1. Almacenamiento Seguro de Datos (Client-Side Storage)
- **Inspección:** Revisa dónde se guardan los datos sensibles en el navegador móvil (Tokens JWT, datos de usuario, llaves API).
- **Regla Estricta:** Prohíbe el uso de `localStorage` o `sessionStorage` para guardar tokens de sesión de larga duración.
- **Alternativa Segura:** Exige el uso de cookies con atributos `HttpOnly`, `Secure` y `SameSite=Strict` o el manejo de tokens en la memoria del estado de la app.

## 2. Autenticación y Gestión de Sesiones
- **Exposición de Tokens:** Verifica que los tokens de sesión no se pasen a través de parámetros en la URL (pueden quedar registrados en el historial o logs del servidor).
- **Cierre de Sesión:** Asegúrate de que exista un mecanismo claro para invalidar el token tanto en el cliente como en el servidor.
- **Validación:** Comprueba si se implementa protección contra ataques de fijación de sesión.

## 3. Seguridad en la Comunicación (APIs y Tráfico)
- **CORS (Cross-Origin Resource Sharing):** Si se expone código de configuración, verifica que `Access-Control-Allow-Origin` no esté configurado como un comodín (`*`) si la API maneja datos privados.
- **Políticas de Seguridad (CSP):** Verifica la presencia o configuración de cabeceras `Content-Security-Policy` para prevenir ataques de Inyección de Código (XSS).

## 4. Vulnerabilidades de Inyección y XSS en Entornos Móviles
- **Sanitización:** Evalúa si la app renderiza HTML dinámico de forma insegura (ej. `dangerouslySetInnerHTML` en React o `innerHTML` en JS puro) sin sanitizar los inputs del usuario.
- **Fugas de Información:** Comprueba que los mensajes de error mostrados en la interfaz móvil no expongan detalles internos de la base de datos o stack tecnológico.

## 5. Estructura Obligatoria del Reporte de Seguridad
Tras analizar el código o arquitectura, debes estructurar tu respuesta exactamente así:
1. **Nivel de Riesgo Global:** [Bajo / Medio / Alto / Crítico]
2. **Matriz de Vulnerabilidades:** Tabla detallando: Vulnerabilidad encontrada | Nivel de Riesgo (OWASP) | Impacto potencial.
3. **Plan de Mitigación:** Explicación técnica de cómo solucionarlo.
4. **Código Refactorizado Seguro:** El fragmento de código corregido aplicando las defensas recomendadas.

## Notas para PRONET

- **La regla de `localStorage` choca con la arquitectura.** PRONET es una SPA
  estática en Netlify + Supabase: no hay servidor propio que pueda emitir una
  cookie `HttpOnly`. Reportar el riesgo real, no exigir un rediseño de auth como
  si fuera un cambio de configuración. Lo que sí aplica es reducir el daño de un
  XSS (CSP) y no guardar datos sensibles de más.
- **La anon key NO es un secreto.** Va en el cliente por diseño; lo que protege
  los datos es RLS. No reportarla como credencial filtrada.
- **El CORS lo maneja Supabase**, no la app. Lo auditable es la CSP y las
  cabeceras que sirve Netlify (`_headers` o `netlify.toml`).
- Verificar en el navegador (`localStorage`, cabeceras reales de respuesta), no
  sólo leyendo el código.
