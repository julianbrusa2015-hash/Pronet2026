// ═══ PRONET · config.js — Configuración de la base de datos ═══
//
// FASE 2: acá se pegan las credenciales de tu proyecto Supabase.
// Mientras estos dos valores estén vacíos, la app funciona en MODO LOCAL
// (los datos se guardan solo en cada dispositivo).
// Al completarlos, pasa automáticamente a MODO REMOTO: los pedidos y
// mensajes se guardan en tu base de datos y se ven desde cualquier celular.
//
// Dónde encontrarlos (ver INSTRUCTIVO-FASE2.md paso a paso):
//   Supabase → tu proyecto → Settings → API
//   - Project URL  → va en SUPABASE_URL
//   - anon public  → va en SUPABASE_ANON_KEY
//
// Nota de seguridad: la clave "anon" está pensada para ser pública (viaja
// en el navegador de cada usuario). Lo que protege tus datos son las
// políticas RLS de las tablas, no el secreto de esta clave. NUNCA pongas
// acá la clave "service_role".

window.PRONET_CONFIG = {
  SUPABASE_URL: "https://zgmwtyxtygnjfakeriiz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnbXd0eXh0eWduamZha2VyaWl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NDkzMDUsImV4cCI6MjA5OTIyNTMwNX0.CKv9L3py6fbidKhBfNe6ZVNtS_U7gyMshLLLSS257Ac",
};

// ── FASE 3: Notificaciones push ──
// Clave PÚBLICA de VAPID (la privada va como secret en Supabase, NUNCA acá).
window.PRONET_CONFIG.VAPID_PUBLIC_KEY = "BFvzCuNl7hsD6NmAhL63KqPPr1mMVTFiophRSDhhDujMYEnGVx3NsLnPZDgVG0Xg_jPJocWE-aDxRnVK_Yfq8Vo";

// ── Constantes de negocio ──
// Editables sin tocar app.js; cambian la lógica en prod con solo un redeploy.
// ── Rangos de precio por rubro (fallback cuando catalogo_servicios no tiene datos) ──
// Se sobreescriben en runtime con datos reales de la tabla catalogo_servicios.
window.PRONET_CONFIG.SLIDER_RANGOS = {
  'Limpieza':      { min: 30000,  max: 150000 },
  'Electricistas': { min: 30000,  max: 300000 },
  'Plomería':      { min: 30000,  max: 350000 },
  'Pintura':       { min: 30000,  max: 500000 },
  'Cuidado':       { min: 30000,  max: 150000 },
  'Jardinería':    { min: 30000,  max: 250000 },
  'Mascotas':      { min: 30000,  max: 150000 },
  'Chef':          { min: 30000,  max: 300000 },
  '_default':      { min: 30000,  max: 500000 },
};

// ── Niveles del programa Loyalty ──
// Orden ascendente: cada nivel define su rango de puntos.
window.PRONET_CONFIG.LOYALTY_NIVELES = [
  { nombre: 'Bronce', emoji: '🥉', min: 0,     max: 1000  },
  { nombre: 'Plata',  emoji: '🥈', min: 1000,  max: 5000  },
  { nombre: 'Oro',    emoji: '🥇', min: 5000,  max: 10000 },
  { nombre: 'Élite',  emoji: '💎', min: 10000, max: 25000 },
];

// ── FASE 4: Google Maps ──
// Pegá acá la clave pública de Google Maps (Maps JS API + Geocoding API).
// Dejarlo vacío mantiene el mapa simulado actual; al completarlo activa el
// mapa real con marcadores, distancias y GPS sin ningún otro cambio de código.
//
// Cómo obtenerla:
//   console.cloud.google.com → nuevo proyecto → APIs & Services →
//   Habilitar: Maps JavaScript API + Geocoding API →
//   Credentials → Create API Key → restringir a tu dominio (pronetprueba.netlify.app)
window.PRONET_CONFIG.MAPS_KEY = 'AIzaSyCkSY-QijgqiSuanlgp5EpjxxCkfoOFSMY';   // ← pegá tu key acá

Object.assign(window.PRONET_CONFIG, {
  // Propuestas
  PROPUESTA_EXPIRACION_HS: 168,    // 7 días — el pedido no vence si tiene propuestas pendientes (ver supabase-vencer-pedidos.sql)
  INACTIVIDAD_CIERRE_DIAS: 7,       // días sin actividad para que el vecino pueda cerrar el pedido

  // Búsqueda / descubrimiento
  RATING_TOP: 4.5,                  // umbral para el filtro "top" en el listado de prestadores
  SUGERIDOS_PEDIDO: 3,              // cantidad de prestadores sugeridos al crear un pedido
  MAPA_PRESTADORES_MAX: 8,          // pines máximos en el mapa (evita saturación visual)

  // Contenido
  PEDIDO_FOTOS_MAX: 4,              // fotos máximas al publicar un pedido
  ADJUNTO_MAX_MB: 5,                // tamaño máximo de adjunto en chat (MB)
  IMG_PORTFOLIO_PX: 800,            // ancho máximo al redimensionar fotos de portfolio
  IMG_TRABAJO_PX: 1024,             // ancho máximo al redimensionar fotos de trabajo terminado

  // Planes de suscripción (3 tiers: Base · Plus · Pro)
  // Precios en ARS. Anual = 10 meses (2 meses gratis).
  //
  // Estos valores son el FALLBACK offline/inicial. En restaurarSesion()
  // (app.js) se pisan con precio_mes/precio_anual/propuestas_mes/
  // fotos_portfolio reales de la tabla planes_limites en Supabase — la misma
  // que usa el trigger de límites y crear-preferencia para el cobro real. Si
  // cambia un precio, la fuente de verdad es la tabla; actualizar acá es solo
  // para que el fallback no quede muy desactualizado si la sync falla.
  PLANES: [
    {
      id: 'base', nombre: 'Base', emoji: '🆓',
      precio_mes: 0, precio_anual: 0,
      propuestas_mes: 3, fotos_portfolio: 3,
      badge_label: 'Gratuito',
      loyalty_boost: 1.0,
      badge_busqueda: false, desempate: false,
      estadisticas: false,
    },
    {
      id: 'plus', nombre: 'Plus', emoji: '⚡',
      precio_mes: 4990, precio_anual: 49900,
      propuestas_mes: 10, fotos_portfolio: 10,
      badge_label: 'Plus',
      loyalty_boost: 1.25,
      badge_busqueda: false, desempate: false,
      estadisticas: 'basicas',
    },
    {
      id: 'pro', nombre: 'Pro', emoji: '⭐',
      precio_mes: 9990, precio_anual: 99900,
      propuestas_mes: null, fotos_portfolio: 20,
      badge_label: 'Pro',
      loyalty_boost: 1.5,
      badge_busqueda: true, desempate: true,
      estadisticas: 'export',
    },
  ],

  // Analytics
  CONVERSION_PROMEDIO_ZONAL: 9,        // % de conversión promedio zonal (vistas → contactos)

  // Soporte
  WHATSAPP_SOPORTE: '5491140618983', // número de WhatsApp del equipo PRONET (sin + ni espacios)

  // UI / previews
  RESENAS_PREVIEW: 5,               // reseñas visibles antes del botón "ver todas"
  ESPECIALIDADES_CARD: 4,           // especialidades mostradas en tarjeta de prestador
  NOTIF_CUERPO_MAX: 80,             // caracteres máximos en el cuerpo de una push notification
  CHAT_PREVIEW_MAX: 50,             // caracteres de preview en la notificación de chat
});
