#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PRONET · borrar una Edge Function del proyecto
// ═══════════════════════════════════════════════════════════════════════
//
//   node scripts/borrar-function.js <slug> --confirmar
//
// ── Por qué existe ─────────────────────────────────────────────────────
// Sacar una function del repo no la saca de producción: sigue desplegada y
// sigue siendo invocable por cualquiera con la anon key. `eliminar-cuenta`
// borraba cuentas de forma irreversible y quedó sin usar cuando la baja
// pasó a ser diferida: dejarla desplegada era dejar el gatillo puesto.
//
// ── Por qué es un script y no un curl suelto ───────────────────────────
// Igual que scripts/sql.js: el endpoint está fijo acá y lo único que varía
// es el slug. Y pide --confirmar porque un DELETE contra un proyecto de
// producción no puede salir de un typo.
//
// El token sale de .env.local y no se imprime nunca.

const fs = require('fs');
const path = require('path');

const LISTA   = (ref) => `https://api.supabase.com/v1/projects/${ref}/functions`;
const BORRAR  = (ref, slug) => `https://api.supabase.com/v1/projects/${ref}/functions/${slug}`;

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
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  const confirmar = args.includes('--confirmar');

  if (!slug) {
    console.error('Uso: node scripts/borrar-function.js <slug> [--confirmar]');
    process.exit(1);
  }

  const env = leerEnv();
  const { SUPABASE_PAT: pat, SUPABASE_PROJECT_REF: ref } = env;
  if (!pat || !ref) {
    console.error('✖ Faltan SUPABASE_PAT o SUPABASE_PROJECT_REF en .env.local');
    process.exit(1);
  }
  const cab = { Authorization: `Bearer ${pat}` };

  // Siempre se lista primero: sirve de verificación antes y después.
  const r = await fetch(LISTA(ref), { headers: cab });
  if (!r.ok) {
    console.error(`✖ HTTP ${r.status} al listar`);
    console.error(await r.text());
    process.exit(1);
  }
  const funciones = await r.json();
  const encontrada = funciones.find((f) => f.slug === slug);

  console.log('── Functions desplegadas ──');
  for (const f of funciones) {
    console.log(`  ${f.slug === slug ? '→' : ' '} ${f.slug}  (v${f.version}, ${f.status})`);
  }

  if (!encontrada) {
    console.log(`\n✓ "${slug}" no está desplegada. Nada que borrar.`);
    return;
  }
  if (!confirmar) {
    console.log(`\n⚠ "${slug}" está desplegada. Volvé a correr con --confirmar para borrarla.`);
    return;
  }

  const d = await fetch(BORRAR(ref, slug), { method: 'DELETE', headers: cab });
  if (!d.ok) {
    console.error(`✖ HTTP ${d.status} al borrar`);
    console.error(await d.text());
    process.exit(1);
  }

  const r2 = await fetch(LISTA(ref), { headers: cab });
  const quedan = r2.ok ? await r2.json() : [];
  const sigue = quedan.some((f) => f.slug === slug);
  console.log(sigue
    ? `\n✖ "${slug}" TODAVÍA aparece desplegada.`
    : `\n✓ "${slug}" borrada. Quedan ${quedan.length}: ${quedan.map((f) => f.slug).join(', ')}`);
  if (sigue) process.exit(1);
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
