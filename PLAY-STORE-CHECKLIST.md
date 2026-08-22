# Publicación en Google Play

App: **PRONET** — `com.pronet.app` (inmutable, ya definido)

## Planificación: los dos plazos van en paralelo

```
HOY ─┬─ testing cerrado: 12 testers × 14 días ────────────┐
     │  (APK con pronetprueba.netlify.app, sirve igual)   │
     │                                                     ├─→ APK producción
     └─ espera NIC.ar → pago → migración de dominio ──────┘   (app.pronet.com.ar)
```

**No esperar el dominio para arrancar el testing cerrado.** El `server.url` puede
cambiar entre el APK de testing y el de producción; los testers reciben la
actualización normalmente. Esperar suma 14 días en vez de solaparlos.

---

## Estado

- [x] 1. Cuenta de Play Console creada + verificación de identidad iniciada
- [ ] 2. Testing cerrado: 12 testers, 14 días corridos — **CONFIRMADO que aplica**
- [ ] 3. Capturas de pantalla
- [ ] 4. Ícono, gráfico destacado, descripciones
- [ ] 5. Clasificación de contenido + Seguridad de los datos
- [ ] 6. APK de producción con el dominio nuevo

---

## 2. Testing cerrado — arrancar YA

- [ ] Compilar APK/AAB con el dominio **actual** (`pronetprueba.netlify.app`)
- [ ] Crear track de Closed testing en Play Console
- [ ] Juntar **12 testers reales** con cuenta de Google (mail de cada uno)
- [ ] Que los 12 acepten la invitación e instalen
- [ ] Los 14 días cuentan desde que hay 12 opted-in **continuos** — si alguien
      se sale, el contador se puede reiniciar. Avisarles que no desinstalen.

## 3. Capturas

- [ ] Mínimo 2, recomendado 4-8, de dispositivo real
- [ ] **Mostrar las features nativas**: cámara, mapa de Entre Vecinos,
      notificaciones. Es lo que diferencia la app de un "webview wrapper",
      que es la causa de rechazo más probable dado que usa \`server.url\` remoto.

## 5. Seguridad de los datos — borrador derivado del código

**Revisar antes de enviar.** Esto sale de leer el esquema y los permisos;
confirmá cada línea contra lo que realmente hace la app hoy.

Permisos declarados en \`AndroidManifest.xml\`:
\`INTERNET\`, \`CAMERA\`, \`ACCESS_FINE_LOCATION\`, \`ACCESS_COARSE_LOCATION\`,
\`POST_NOTIFICATIONS\`.

| Categoría Play | Dato | Dónde vive | Obligatorio | Propósito |
|---|---|---|---|---|
| Personal info → Name | nombre, nombre_completo | \`perfiles\`, \`prestadores_verificacion\` | Sí | Funcionalidad de la app |
| Personal info → Email address | email | \`perfiles\` / auth | Sí | Cuenta, funcionalidad |
| Personal info → Phone number | telefono | \`perfiles\` | Sí para publicar | Funcionalidad, antifraude |
| Personal info → Address | direccion | \`perfiles\`, \`prestadores_verificacion\` | Opcional | Funcionalidad |
| Personal info → Other info | **DNI** | \`prestadores_verificacion\`, prealta | Opcional | Verificación de identidad, antifraude |
| Personal info → User IDs | id de usuario | \`perfiles\` | Sí | Funcionalidad |
| Location → Approximate | comunidad / barrio | \`perfiles\` | Sí | Funcionalidad (matching por zona) |
| Location → Precise | lat, lng | \`perfiles\`, \`mercado\` | Opcional | Funcionalidad (mapa, cobertura) |
| Photos and videos → Photos | avatar, portfolio, publicaciones | \`avatares\`, \`portfolio_fotos\`, \`publicaciones\` | Opcional | Funcionalidad |
| Messages → Other in-app messages | chat vecino↔prestador y de mercado | \`mensajes_chat\`, \`mensajes_mercado\` | Sí | Funcionalidad |
| App activity → In-app search history | búsquedas guardadas | \`busquedas_mercado\`, \`alertas_busqueda\` | Opcional | Funcionalidad (alertas) |
| App activity → Other UGC | pedidos, reseñas, denuncias | \`pedidos\`, \`resenas\`, \`denuncias\` | Sí | Funcionalidad |
| Financial info → Purchase history | suscripciones y pagos | tablas de planes / MP | Opcional | Funcionalidad |
| Device or other IDs | token FCM | \`push_suscripciones\` | Opcional | Notificaciones |

Preguntas transversales del formulario:

- **¿Se encripta en tránsito?** → **Sí.** HTTPS forzado, HSTS en \`netlify.toml\`.
- **¿El usuario puede pedir la eliminación de sus datos?** → **Sí.**
  Edge Function \`eliminar-cuenta\` + sección 3 de \`privacidad.html\`.
- **¿Se comparte con terceros?** → Revisar con criterio. Supabase y Netlify son
  *service providers* que procesan por cuenta tuya, lo que normalmente NO se
  declara como "shared". MercadoPago procesa el pago en su propio checkout: la
  app **no recolecta** datos de tarjeta. La visibilidad entre usuarios (un
  prestador ve el teléfono del vecino) no es "sharing" con terceros, pero **sí**
  tiene que estar explicada en la política de privacidad.

### URLs de la ficha

Se pueden cambiar en cualquier momento sin release. Cargar con el dominio
actual y actualizarlas después de la migración.

- [ ] Política de privacidad: `https://pronetprueba.netlify.app/privacidad.html` ✅ verificada 200
- [ ] Eliminación de cuenta: idem (sección 3) — confirmar que Play acepta el
      ancla o si pide una URL dedicada
- [ ] Después de la migración: reemplazar por `app.pronet.com.ar` en ambos campos

## 6. APK de producción — último paso

Recién cuando `app.pronet.com.ar` resuelva y esté verificado
(ver `MIGRACION-DOMINIO.md`, fases 1 a 5).

- [ ] `capacitor.config.json` → dominio nuevo
- [ ] `npx cap sync android`
- [ ] Compilar release con el JBR de Android Studio (memoria `build_apk_java21`)
- [ ] Probar en dispositivo real ANTES de subir
- [ ] Promover a producción
