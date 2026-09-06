#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PRONET · desplegar una Edge Function
// ═══════════════════════════════════════════════════════════════════════
//
//   node scripts/deploy-function.js <slug>
//
// Sube supabase/functions/<slug>/index.ts al proyecto.
//
// ── Por qué existe ─────────────────────────────────────────────────────
// Un .ts commiteado no es un .ts desplegado, igual que pasa con los .sql.
// Sin esto había que abrir el panel y pegar el código a mano, que es como se
// terminan acumulando diferencias entre lo que dice el repo y lo que corre.
//
// ── Por qué es un script y no un curl suelto ───────────────────────────
// Mismo criterio que scripts/sql.js y scripts/borrar-function.js: el
// endpoint está fijo acá y lo único que varía es el slug. El token sale de
// .env.local y no se imprime nunca.

const fs = require('fs');
const path = require('path');

const DEPLOY = (ref, slug) =>
  `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`;

function leerEnv() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) {
    console.error('✖ Falta .env.local (necesita SUPABASE_PAT y SUPABASE_PROJECT_REF).');
    process.exit(1);
  }
  const env = {};
  for (const linea of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = linea.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Uso: node scripts/deploy-function.js <slug>');
    process.exit(1);
  }

  const archivo = path.join(__dirname, '..', 'supabase', 'functions', slug, 'index.ts');
  if (!fs.existsSync(archivo)) {
    console.error(`✖ No existe ${archivo}`);
    process.exit(1);
  }

  const env = leerEnv();
  const { SUPABASE_PAT: pat, SUPABASE_PROJECT_REF: ref } = env;
  if (!pat || !ref) {
    console.error('✖ Faltan SUPABASE_PAT o SUPABASE_PROJECT_REF en .env.local');
    process.exit(1);
  }

  const codigo = fs.readFileSync(archivo, 'utf8');
  console.log(`── ${slug} · ${codigo.split('\n').length} líneas ──`);

  const metadata = {
    entrypoint_path: 'index.ts',
    name: slug,
    verify_jwt: false,
  };

  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', new File([codigo], 'index.ts', { type: 'application/typescript' }));

  const r = await fetch(DEPLOY(ref, slug), {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}` },
    body: form,
  });

  if (!r.ok) {
    console.error(`✖ HTTP ${r.status}`);
    console.error(await r.text());
    process.exit(1);
  }
  const res = await r.json();
  console.log(`✓ desplegada — versión ${res.version}, estado ${res.status}`);
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
