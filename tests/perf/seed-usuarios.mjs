#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// PRONET · Alta de usuarios de prueba para pruebas de carga
//
// Crea las cuentas vecinoNNNN@load.test y prestaNNNN@load.test que
// esperan los scripts de k6, vía Admin API de Auth.
//
// ⛔ SOLO STAGING. Crea cientos de usuarios reales en el proyecto Auth.
//    Tiene dos guardas independientes (URL + marcador en config_app) y
//    ninguna se puede saltear por parámetro.
//
// Uso:
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=<service_role de STAGING>
//   node tests/perf/seed-usuarios.mjs --vecinos=60 --prestadores=200
//
//   node tests/perf/seed-usuarios.mjs --dry-run     # sin escribir nada
//   node tests/perf/seed-usuarios.mjs --limpiar     # borra los @load.test
//
// ⚠ La SERVICE_ROLE_KEY saltea RLS por completo. Va SIEMPRE por variable
//   de entorno: nunca como argumento (queda en el historial del shell) ni
//   commiteada al repo.
// ═══════════════════════════════════════════════════════════════════════

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW       = process.env.TEST_PW || 'LoadTest1234!';

const args = process.argv.slice(2);
const flag = (n, def) => {
  const a = args.find(x => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : def;
};
const N_VECINOS     = parseInt(flag('vecinos', '60'), 10);
const N_PRESTADORES = parseInt(flag('prestadores', '200'), 10);
const DRY_RUN       = args.includes('--dry-run');
const LIMPIAR       = args.includes('--limpiar');
const CONCURRENCIA  = 8;   // altas en paralelo; Auth limita si se abusa

const RUBROS = ['Electricistas','Plomería','Limpieza','Jardinería',
                'Pintura','Cuidado','Mascotas'];
const ZONAS  = ['Puertos del Lago','El Cantón','San Matías','El Naudir','CUBE',
                'El Cazador','Nordelta','Escobar Centro','Matheu / Garín'];

// ── Salida ─────────────────────────────────────────────────────────────
const c = { gris:'\x1b[90m', rojo:'\x1b[31m', verde:'\x1b[32m',
            amar:'\x1b[33m', neg:'\x1b[1m', off:'\x1b[0m' };
const log  = (m) => console.log(m);
const info = (m) => console.log(`${c.gris}·${c.off} ${m}`);
const ok   = (m) => console.log(`${c.verde}✓${c.off} ${m}`);
const warn = (m) => console.log(`${c.amar}⚠${c.off} ${m}`);
const morir = (m) => { console.error(`\n${c.rojo}${c.neg}ABORTADO${c.off} ${m}\n`); process.exit(1); };

// ── HTTP ───────────────────────────────────────────────────────────────
function headers(extra = {}) {
  return {
    'apikey': SERVICE,
    'Authorization': `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function req(url, opts = {}) {
  let r;
  try {
    r = await fetch(url, { ...opts, headers: headers(opts.headers) });
  } catch (e) {
    // fetch() sólo tira por fallo de red/DNS. El mensaje nativo es
    // "fetch failed", inservible para diagnosticar: se reemplaza.
    return { status: 0, ok: false, redFallo: true,
             cuerpo: `No se pudo conectar a ${new URL(url).origin} (${e.cause?.code || e.message})` };
  }
  let cuerpo = null;
  const txt = await r.text();
  if (txt) { try { cuerpo = JSON.parse(txt); } catch { cuerpo = txt; } }
  return { status: r.status, ok: r.ok, cuerpo };
}

// ── Guardas ────────────────────────────────────────────────────────────
// Dos comprobaciones independientes. La primera es heurística sobre la
// URL; la segunda exige un marcador explícito en la base, que es la que
// realmente decide.
async function verificarEntorno() {
  if (!URL_BASE || !SERVICE) {
    morir('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }
  // Lista negra explícita del proyecto de producción. El dominio de
  // Supabase no contiene "pronet" por ningún lado, así que una heurística
  // por nombre no alcanza: hay que nombrar el ref del proyecto.
  // Comparación por host EXACTO, no por substring: un staging llamado
  // "<ref>-staging.supabase.co" es legítimo y no debe quedar bloqueado.
  const PROD_HOSTS = [
    'zgmwtyxtygnjfakeriiz.supabase.co',
    'pronetprueba.netlify.app',
  ];
  let host;
  try { host = new URL(URL_BASE).host.toLowerCase(); }
  catch { morir(`SUPABASE_URL no es una URL válida: ${URL_BASE}`); }
  if (PROD_HOSTS.includes(host)) {
    morir(`la URL apunta a PRODUCCIÓN (${host}).\n` +
          '  Producción procesa cobros reales de MercadoPago y tiene\n' +
          '  usuarios reales con notificaciones push activas.');
  }

  const r = await req(`${URL_BASE}/rest/v1/config_app?select=valor&clave=eq.entorno`);
  if (r.redFallo) morir(`${r.cuerpo}\n  Revisá que SUPABASE_URL sea correcta y que haya conexión.`);
  if (r.status === 401 || r.status === 403) {
    morir(`la SERVICE_ROLE_KEY fue rechazada (HTTP ${r.status}).\n` +
          '  Verificá que sea la service_role del proyecto de STAGING\n' +
          '  (no la anon key, y no la de producción).');
  }
  if (!r.ok) {
    morir(`no se pudo leer config_app (HTTP ${r.status}).\n` +
          '  ¿El esquema está aplicado en este proyecto?');
  }
  const valor = Array.isArray(r.cuerpo) && r.cuerpo[0] ? r.cuerpo[0].valor : null;
  if (valor !== 'staging') {
    morir('la base no está marcada como staging.\n\n' +
          '  Si de verdad es un proyecto de staging, marcalo con:\n\n' +
          `    insert into public.config_app (clave, valor) values ('entorno','staging')\n` +
          `      on conflict (clave) do update set valor = 'staging';\n`);
  }
  ok(`Entorno verificado como staging: ${URL_BASE}`);
}

// ── Alta de un usuario ─────────────────────────────────────────────────
// handle_new_user() (trigger sobre auth.users) se encarga del resto a
// partir del metadata: crea la fila en perfiles y, si tipo='prestador',
// también la ficha en prestadores, la enlaza en perfiles.prestador_id y
// abre la fila de loyalty. Por eso acá sólo se crea el usuario.
async function crearUsuario({ email, nombre, tipo, zona, rubro }) {
  const r = await req(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: PW,
      email_confirm: true,               // sin esto no puede loguearse
      user_metadata: { nombre, tipo, zona, ...(rubro ? { rubro } : {}) },
    }),
  });

  if (r.ok && r.cuerpo?.id) return { estado: 'creado', id: r.cuerpo.id };

  // Ya existía: el script es idempotente, se puede re-correr sin miedo.
  const msg = JSON.stringify(r.cuerpo || '');
  if (r.status === 422 || /already.*registered|already exists/i.test(msg)) {
    return { estado: 'existente', id: null };
  }
  return { estado: 'error', detalle: `HTTP ${r.status} ${msg.slice(0, 160)}` };
}

// Ejecuta tareas con concurrencia acotada. Auth aplica rate limit y
// mandar 200 altas de golpe termina en 429.
async function enLotes(items, fn, tam = CONCURRENCIA) {
  const salida = [];
  for (let i = 0; i < items.length; i += tam) {
    salida.push(...await Promise.all(items.slice(i, i + tam).map(fn)));
    process.stdout.write(`\r${c.gris}  ${Math.min(i + tam, items.length)}/${items.length}${c.off}   `);
  }
  process.stdout.write('\r');
  return salida;
}

// ── Suscripciones plan 'pro' ───────────────────────────────────────────
// Sin esto los prestadores quedan en 'base' y el trigger
// chequear_limite_propuestas los corta a las 3 propuestas del mes (10 en
// etapa fundadora, porque plan_para_limites mapea base→plus). La prueba
// terminaría midiendo el trigger rechazando, no la capacidad del sistema.
//
// 'pro' tiene propuestas_mes = null en planes_limites ⇒ ilimitadas.
// El trigger trg_sync_plan_prestador propaga el plan a prestadores.plan.
async function activarPlanPro(uids) {
  const vence = new Date();
  vence.setFullYear(vence.getFullYear() + 1);
  const filas = uids.map(uid => ({
    usuario_id: uid,
    plan: 'pro',
    estado: 'activo',
    periodo: 'anual',
    activado_en: new Date().toISOString(),
    vence_en: vence.toISOString(),
  }));

  let aplicadas = 0;
  for (let i = 0; i < filas.length; i += 50) {
    const lote = filas.slice(i, i + 50);
    const r = await req(`${URL_BASE}/rest/v1/suscripciones`, {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    });
    if (r.ok) aplicadas += lote.length;
    else warn(`lote de suscripciones falló: HTTP ${r.status} ${JSON.stringify(r.cuerpo).slice(0,120)}`);
  }
  return aplicadas;
}

// ── Listado de cuentas @load.test ──────────────────────────────────────
async function listarDePrueba() {
  const encontrados = [];
  for (let page = 1; page <= 40; page++) {   // techo de seguridad
    const r = await req(`${URL_BASE}/auth/v1/admin/users?page=${page}&per_page=1000`);
    if (!r.ok) break;
    const users = r.cuerpo?.users || [];
    if (!users.length) break;
    encontrados.push(...users.filter(u => u.email?.endsWith('@load.test')));
    if (users.length < 1000) break;
  }
  return encontrados;
}

// ── Limpieza ───────────────────────────────────────────────────────────
async function limpiar() {
  const usuarios = await listarDePrueba();
  if (!usuarios.length) { info('No hay cuentas @load.test para borrar.'); return; }

  log(`\n${c.neg}Se van a borrar ${usuarios.length} cuentas @load.test${c.off}`);
  if (DRY_RUN) { warn('--dry-run: no se borra nada.'); return; }

  // Borrar el usuario de Auth arrastra perfiles/prestadores por las FK
  // en cascada del esquema. Las filas de pedidos/propuestas que hayan
  // dejado se limpian con el teardown de los scripts de k6.
  const res = await enLotes(usuarios, async (u) => {
    const r = await req(`${URL_BASE}/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
    return r.ok;
  });
  ok(`Borradas ${res.filter(Boolean).length}/${usuarios.length} cuentas.`);
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  log(`\n${c.neg}PRONET · seed de usuarios de prueba${c.off}`);
  await verificarEntorno();

  if (LIMPIAR) return limpiar();

  const pad = (n) => String(n).padStart(4, '0');
  const vecinos = Array.from({ length: N_VECINOS }, (_, i) => ({
    email:  `vecino${pad(i + 1)}@load.test`,
    nombre: `Vecino Carga ${i + 1}`,
    tipo:   'cliente',
    zona:   ZONAS[i % ZONAS.length],
  }));
  const prestadores = Array.from({ length: N_PRESTADORES }, (_, i) => ({
    email:  `presta${pad(i + 1)}@load.test`,
    nombre: `Prestador Carga ${i + 1}`,
    tipo:   'prestador',
    zona:   ZONAS[i % ZONAS.length],
    rubro:  RUBROS[i % RUBROS.length],
  }));

  log(`\n  Vecinos:     ${N_VECINOS}`);
  log(`  Prestadores: ${N_PRESTADORES}  ${c.gris}(plan pro, propuestas ilimitadas)${c.off}`);
  log(`  Contraseña:  ${PW}\n`);

  if (DRY_RUN) {
    warn('--dry-run: no se crea nada.');
    info(`Ejemplo vecino:    ${vecinos[0].email}`);
    info(`Ejemplo prestador: ${prestadores[0].email} · ${prestadores[0].rubro}`);
    return;
  }

  info('Creando vecinos...');
  const rv = await enLotes(vecinos, crearUsuario);
  info('Creando prestadores...');
  const rp = await enLotes(prestadores, crearUsuario);

  const todos   = [...rv, ...rp];
  const creados = todos.filter(r => r.estado === 'creado').length;
  const existen = todos.filter(r => r.estado === 'existente').length;
  const errores = todos.filter(r => r.estado === 'error');

  ok(`Altas: ${creados} creadas · ${existen} ya existían`);
  if (errores.length) {
    warn(`${errores.length} fallaron. Primeras:`);
    errores.slice(0, 3).forEach(e => info(e.detalle));
  }

  // Los prestadores necesitan el uid; los reciclados ("existente") no lo
  // devuelven, así que se releen de Auth para no dejarlos en plan base.
  info('Activando plan pro en prestadores...');
  const cuentas = await listarDePrueba();
  const uidsPrestadores = cuentas
    .filter(u => u.email.startsWith('presta'))
    .map(u => u.id);
  const aplicadas = await activarPlanPro(uidsPrestadores);
  ok(`Plan pro activo en ${aplicadas}/${uidsPrestadores.length} prestadores.`);

  log(`\n${c.neg}Listo.${c.off} Verificá antes de correr k6:\n`);
  log(`${c.gris}  -- Debe dar 0 filas: prestadores sin ficha enlazada${c.off}`);
  log(`  select p.id, p.nombre from public.perfiles p`);
  log(`   where p.tipo = 'prestador' and p.prestador_id is null;\n`);
  log(`${c.gris}  -- Debe devolver 'pro' para cualquier prestador de prueba${c.off}`);
  log(`  select plan, estado from public.suscripciones limit 5;\n`);
}

main().catch(e => morir(e.message || String(e)));
