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
