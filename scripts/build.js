#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Lee secretos desde env vars (Netlify CI) o usa valores vacíos (en repo no van)
const secrets = {
  SUPABASE_URL:      process.env.SUPABASE_URL      || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  VAPID_PUBLIC_KEY:  process.env.VAPID_PUBLIC_KEY  || '',
  MAPS_KEY:          process.env.MAPS_KEY           || '',
};

const missing = Object.entries(secrets).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('⚠ Variables de entorno faltantes:', missing.join(', '));
  console.warn('  → Crea config-secrets.js manualmente para desarrollo local.');
}

// Genera config-secrets.js con los valores reales
const out = `// Generado en build desde variables de entorno. NO editar ni versionar.
window.PRONET_CONFIG = window.PRONET_CONFIG || {};
Object.assign(window.PRONET_CONFIG, ${JSON.stringify(secrets, null, 2)});
`;
fs.writeFileSync(path.join(__dirname, '..', 'config-secrets.js'), out);
console.log('✓ config-secrets.js generado');

// Minifica CSS
execSync('npx cleancss -o styles.min.css styles.css', { stdio: 'inherit' });
console.log('✓ styles.min.css generado');
