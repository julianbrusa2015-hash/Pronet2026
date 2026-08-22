// ═══════════════════════════════════════════════════════════════════════
// PRONET · E1 — Alta concurrencia en contratación
// Vecinos publican pedidos mientras prestadores compiten por cotizar.
//
// Uso:
//   k6 run -e SUPABASE_URL=https://<ref>.supabase.co \
//          -e SUPABASE_ANON_KEY=<anon> \
//          tests/perf/e1-contratacion.js
//
// REQUISITOS PREVIOS (ver tests/perf/README.md):
//   · Entorno de STAGING. Este script se niega a correr contra producción.
//   · Volumetría sembrada (seed-volumetria.sql).
//   · Cuentas de prueba con plan 'pro' (propuestas_mes = null), o el
//     trigger chequear_limite_propuestas rechaza a partir de la propuesta
//     3–10 y la prueba mide el trigger, no el sistema.
// ═══════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE     = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const PW       = __ENV.TEST_PW || 'LoadTest1234!';

// Guarda de seguridad: producción procesa pagos reales de MercadoPago y
// envía push a usuarios reales. Generar carga ahí no es una prueba, es un
// incidente.
if (!BASE || !ANON_KEY) fail('Faltan SUPABASE_URL / SUPABASE_ANON_KEY');
if (/pronetprueba|prod/i.test(BASE) && __ENV.ALLOW_PROD !== 'yo-asumo-el-riesgo') {
  fail('ABORTADO: la URL parece de producción. Usá staging.');
}

// ── Métricas segmentadas ───────────────────────────────────────────────
// Un p95 agregado promedia lecturas baratas con escrituras caras y
// esconde exactamente lo que hay que vigilar.
const tFeedVecino    = new Trend('op_feed_vecino', true);
const tFeedPrestador = new Trend('op_feed_prestador_filtrado', true);
const tPublicar      = new Trend('op_publicar_pedido', true);
const tCotizar       = new Trend('op_enviar_propuesta', true);
const tNotificar     = new Trend('op_notificar_rubro', true);
const okRate         = new Rate('operaciones_exitosas');
const cDuplicadas    = new Counter('propuestas_duplicadas_409');
const cCupoAgotado   = new Counter('cupo_plan_agotado');

const RUBROS = ['Electricistas','Plomería','Limpieza','Jardinería',
                'Pintura','Cuidado','Mascotas'];
const ZONAS  = ['Puertos del Lago','El Cantón','San Matías','El Naudir',
                'CUBE','El Cazador','Nordelta','Escobar Centro','Matheu / Garín'];
const URGENCIAS = ['hoy','semana','flexible'];

const N_VECINOS     = Number(__ENV.N_VECINOS)     || 60;
const N_PRESTADORES = Number(__ENV.N_PRESTADORES) || 200;

// ── Perfil de carga ────────────────────────────────────────────────────
// Dos ejecutores en paralelo: las poblaciones tienen think-time y ratio
// de escritura distintos; promediarlas produciría un modelo irreal.
// Reparto de 500 VUs → 10 % vecinos (50) / 90 % prestadores (450).
export const options = {
  scenarios: {
    vecinos_publican: {
      executor: 'ramping-vus',
      exec: 'flujoVecino',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 15 },
        { duration: '3m',  target: 50 },
        { duration: '10m', target: 50 },
        { duration: '2m',  target: 0  },
      ],
      gracefulRampDown: '30s',
      tags: { poblacion: 'vecino' },
    },
    prestadores_cotizan: {
      executor: 'ramping-vus',
      exec: 'flujoPrestador',
      startVUs: 0,
      startTime: '30s',            // entran cuando ya hay pedidos publicados
      stages: [
        { duration: '2m',  target: 135 },
        { duration: '3m',  target: 450 },
        { duration: '10m', target: 450 },
        { duration: '2m',  target: 0   },
      ],
      gracefulRampDown: '30s',
      tags: { poblacion: 'prestador' },
    },
  },
  // Umbrales = criterios de aceptación del plan de performance.
  thresholds: {
    'op_feed_vecino':             ['p(95)<500',  'p(99)<900'],
    'op_feed_prestador_filtrado': ['p(95)<500',  'p(99)<900'],
    'op_publicar_pedido':         ['p(95)<900',  'p(99)<1800'],
    'op_enviar_propuesta':        ['p(95)<1200', 'p(99)<2200'],
    'op_notificar_rubro':         ['p(95)<1500'],
    'operaciones_exitosas':       [{ threshold: 'rate>0.999', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_failed':            ['rate<0.01'],
  },
};

// ── Autenticación previa ───────────────────────────────────────────────
// Los tokens se obtienen una sola vez. Autenticar dentro del bucle mediría
// el login en lugar del flujo y saturaría Auth antes que la base,
// desplazando el cuello de botella real.
export function setup() {
  const login = (email) => {
    const r = http.post(
      `${BASE}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email, password: PW }),
      { headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' } }
    );
    if (r.status !== 200) return null;
    const b = r.json();
    return { token: b.access_token, uid: b.user.id };
  };

  const vecinos = [], prestadores = [];
  for (let i = 1; i <= N_VECINOS; i++) {
    const s = login(`vecino${String(i).padStart(4,'0')}@load.test`);
    if (s) vecinos.push(s);
  }
  for (let i = 1; i <= N_PRESTADORES; i++) {
    const s = login(`presta${String(i).padStart(4,'0')}@load.test`);
    if (s) prestadores.push(s);
  }
  if (!vecinos.length || !prestadores.length) {
    fail('No se autenticó ninguna cuenta. ¿Corriste el seed de datos?');
  }

  // prestador_id vive en perfiles y es lo que exige la FK de propuestas.
  prestadores.forEach((p) => {
    const r = http.get(`${BASE}/rest/v1/rpc/mi_prestador_id`, { headers: hdr(p.token) });
    p.prestadorId = r.status === 200 ? r.json() : null;
  });

  // pedidos_leer sólo deja ver a un vecino sus propios pedidos: dueño,
  // admin, o prestador con el feed abierto (dirigido_a null o suyo). Para
  // chequear el feed general hay que consultar como prestador.
  const r = http.get(
    `${BASE}/rest/v1/pedidos?select=id,rubro,zona&estado=eq.Publicado&limit=500`,
    { headers: hdr(prestadores[0].token) }
  );
  const pedidos = r.status === 200 ? r.json() : [];
  if (pedidos.length < 50) fail(`Solo ${pedidos.length} pedidos sembrados; se requieren 500+.`);

  return { vecinos, prestadores, pedidos };
}

function hdr(token, extra = {}) {
  return Object.assign({
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }, extra);
}

const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (min, max) => sleep(min + Math.random() * (max - min));

// Asigna pedido↔prestador de forma determinista y disjunta. Con selección
// aleatoria, el índice único (pedido_id, prestador_id) dispara 409 masivos
// que se leerían como fallas de rendimiento sin serlo.
function elegirPedido(pedidos, idxPrestador, iteracion) {
  const salto = 7919; // primo > |pedidos| ⇒ recorrido sin colisión temprana
  return pedidos[(idxPrestador * salto + iteracion) % pedidos.length];
}

// ── FLUJO A · Vecino publica ───────────────────────────────────────────
export function flujoVecino(data) {
  const sesion = data.vecinos[exec.vu.idInTest % data.vecinos.length];
  const h = hdr(sesion.token);

  // 1 · "Mis pedidos" (PronetDB.listarMios) — fix 2026-08-21: antes sin
  // LIMIT (5.3s avg / 7.5s p95 medido con 50k filas), ahora acotado a 100.
  let r = http.get(
    `${BASE}/rest/v1/pedidos?select=*&usuario_id=eq.${sesion.uid}&order=creado.desc&limit=100`,
    { headers: h, tags: { op: 'feed_vecino' } }
  );
  tFeedVecino.add(r.timings.duration);
  okRate.add(check(r, { 'feed 200': (x) => x.status === 200 }));
  think(2, 4);

  // 2 · Publicación del pedido
  const rubro = pick(RUBROS), zona = pick(ZONAS);
  r = http.post(
    `${BASE}/rest/v1/pedidos`,
    JSON.stringify({
      titulo:      `[LOAD] ${rubro} — VU${exec.vu.idInTest}-${exec.scenario.iterationInTest}`,
      descripcion: 'Pedido generado por prueba de carga automatizada.',
      rubro, zona,
      urgencia:    pick(URGENCIAS),
      estado:      'Publicado',
      usuario_id:  sesion.uid,
      fotos:       [],
    }),
    { headers: hdr(sesion.token, { 'Prefer': 'return=representation' }),
      tags: { op: 'publicar' } }
  );
  tPublicar.add(r.timings.duration);
  const creado = check(r, { 'pedido creado 201': (x) => x.status === 201 });
  okRate.add(creado);

  // 3 · Difusión al rubro — amplificación de escritura 1:N
  if (creado) {
    r = http.post(
      `${BASE}/rest/v1/rpc/notificar_rubro`,
      JSON.stringify({ p_rubro: rubro, p_tipo: 'pedido_nuevo',
                       p_titulo: 'Nuevo pedido en tu zona',
                       p_cuerpo: `${rubro} · ${zona}`, p_url: null }),
      { headers: h, tags: { op: 'notificar' } }
    );
    tNotificar.add(r.timings.duration);
    okRate.add(check(r, { 'notificar 200': (x) => x.status === 200 }));
  }

  // 4 · El vecino vuelve a mirar si le llegaron propuestas
  think(8, 15);
  const p = pick(data.pedidos);
  r = http.get(
    `${BASE}/rest/v1/propuestas?select=*&pedido_id=eq.${p.id}`,
    { headers: h, tags: { op: 'ver_propuestas' } }
  );
  okRate.add(check(r, { 'propuestas 200': (x) => x.status === 200 }));
}

// ── FLUJO B · Prestador cotiza ─────────────────────────────────────────
export function flujoPrestador(data) {
  const idx    = exec.vu.idInTest % data.prestadores.length;
  const sesion = data.prestadores[idx];
  if (!sesion.prestadorId) return; // cuenta sin ficha: no puede cotizar
  const h = hdr(sesion.token);

  // 1 · Feed filtrado
  const rubro = pick(RUBROS), zona = pick(ZONAS);
  let r = http.get(
    `${BASE}/rest/v1/pedidos?select=*&rubro=eq.${encodeURIComponent(rubro)}` +
    `&zona=eq.${encodeURIComponent(zona)}&order=creado.desc`,
    { headers: h, tags: { op: 'feed_prestador' } }
  );
  tFeedPrestador.add(r.timings.duration);
  okRate.add(check(r, { 'feed filtrado 200': (x) => x.status === 200 }));
  think(3, 6);

  // 2 · Detalle del pedido a cotizar
  const pedido = elegirPedido(data.pedidos, idx, exec.scenario.iterationInTest);
  r = http.get(
    `${BASE}/rest/v1/pedidos?select=*&id=eq.${pedido.id}`,
    { headers: h, tags: { op: 'detalle' } }
  );
  okRate.add(check(r, { 'detalle 200': (x) => x.status === 200 }));
  think(3, 6);

  // 3 · Envío de la propuesta. El trigger chequear_limite_propuestas
  //     ejecuta un COUNT del mes por cada INSERT: es la escritura más
  //     cara del sistema.
  r = http.post(
    `${BASE}/rest/v1/propuestas`,
    JSON.stringify({
      pedido_id:    pedido.id,
      prestador_id: sesion.prestadorId,
      precio:       15000 + Math.floor(Math.random() * 85000),
      plazo:        pick(['urgente', 'semana', 'coordinar']),
      mensaje:      'Propuesta generada por prueba de carga.',
      estado:       'pendiente',
    }),
    { headers: hdr(sesion.token, { 'Prefer': 'return=representation' }),
      tags: { op: 'cotizar' } }
  );
  tCotizar.add(r.timings.duration);

  // 409 (unicidad) y cupo agotado son comportamiento ESPERADO del
  // negocio, no fallas de rendimiento. Contabilizarlos como error
  // inflaría el error rate y ocultaría las fallas reales.
  if (r.status === 409) {
    cDuplicadas.add(1);
  } else if (r.status === 400 && String(r.body).includes('limite_propuestas')) {
    cCupoAgotado.add(1); // ⚠ seed incorrecto: las cuentas necesitan plan 'pro'
  } else {
    okRate.add(check(r, { 'propuesta creada 201': (x) => x.status === 201 }));
  }
}

// ── Limpieza ───────────────────────────────────────────────────────────
// Sin esto, cada corrida deja decenas de miles de filas que distorsionan
// la volumetría de la siguiente.
export function teardown(data) {
  const h = hdr(data.vecinos[0].token);
  http.del(`${BASE}/rest/v1/pedidos?titulo=like.%5BLOAD%5D%25`, null, { headers: h });
  console.log('Limpieza de datos [LOAD] solicitada.');
}
