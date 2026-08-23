#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PRONET · correr un .sql contra Supabase sin copiar y pegar
// ═══════════════════════════════════════════════════════════════════════
//
//   node scripts/sql.js supabase-loquesea.sql          ← lo corre
//   node scripts/sql.js supabase-loquesea.sql --ver    ← sólo lo muestra
//
// ── Por qué existe ─────────────────────────────────────────────────────
// Cada cambio de esquema pasaba por abrir el SQL Editor y pegar el archivo
// a mano. Con ~90 archivos .sql en el repo eso ya costó un bug real: el fix
// del teléfono cosechable estuvo una semana commiteado sin haberse
// ejecutado, porque nadie se acordó de correrlo.
//
// ── Por qué es un script y no un curl suelto ───────────────────────────
// La regla de permisos que lo habilita apunta a ESTE archivo, no a "curl
// contra api.supabase.com". Así el permiso es auditable: el endpoint está
// fijo acá abajo y no se puede apuntar a otro lado desde la línea de
// comandos. Lo único que varía es qué .sql se manda.
//
// El token sale de .env.local y no se imprime nunca.

const fs = require('fs');
const path = require('path');

const ENDPOINT = (ref) =>
  `https://api.supabase.com/v1/projects/${ref}/database/query`;

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
  const soloVer = args.includes('--ver');
  const archivo = args.find((a) => !a.startsWith('--'));

  if (!archivo) {
    console.error('Uso: node scripts/sql.js <archivo.sql> [--ver]');
    process.exit(1);
  }
  if (!fs.existsSync(archivo)) {
    console.error(`✖ No existe: ${archivo}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(archivo, 'utf8');

  // Se muestra siempre lo que se va a correr: el valor de tener esto
  // automatizado es no copiar y pegar, no dejar de mirar.
  console.log(`── ${archivo} · ${sql.split('\n').length} líneas ──`);
  if (soloVer) { console.log(sql); return; }

  const env = leerEnv();
  const { SUPABASE_PAT: pat, SUPABASE_PROJECT_REF: ref } = env;
  if (!pat || !ref) {
    console.error('✖ .env.local no tiene SUPABASE_PAT y/o SUPABASE_PROJECT_REF.');
    process.exit(1);
  }

  const res = await fetch(ENDPOINT(ref), {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });

  const cuerpo = await res.text();
  if (!res.ok) {
    // El mensaje de Postgres es lo único que sirve para arreglarlo, así que
    // se imprime entero en vez de un "falló".
    console.error(`✖ HTTP ${res.status}`);
    console.error(cuerpo.slice(0, 2000));
    process.exit(1);
  }

  let datos;
  try { datos = JSON.parse(cuerpo); } catch { datos = cuerpo; }
  console.log('✅ Ejecutado.');
  console.log(JSON.stringify(datos, null, 1));
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
