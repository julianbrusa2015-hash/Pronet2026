// ═══════════════════════════════════════════════════════════════════════
// PRONET · E3 — Suscripciones y pasarela de pagos
//
// Este NO es un test de throughput: es un test de CORRECTITUD BAJO
// CONCURRENCIA. Volumen bajo (decenas de VUs) y criterios binarios —
// en dinero, un resultado "casi correcto" es un incidente.
//
// ⛔ NUNCA generar carga contra la API de MercadoPago. Testear un gateway
//    de terceros con cientos de VUs es abuso de servicio y deriva en
//    bloqueo de credenciales. Este script sólo golpea NUESTRAS Edge
//    Functions; las credenciales de MP en staging deben ser de SANDBOX.
//
// Uso:
//   k6 run -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… \
//          -e MP_WEBHOOK_SECRET=<secret de staging> \
//          [-e MP_SANDBOX_PAYMENT_IDS=123,456,789] \
//          tests/perf/e3-pagos.js
// ═══════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import crypto from 'k6/crypto';
import { check, fail } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE       = __ENV.SUPABASE_URL;
const ANON_KEY   = __ENV.SUPABASE_ANON_KEY;
const WH_SECRET  = __ENV.MP_WEBHOOK_SECRET;
const PW         = __ENV.TEST_PW || 'LoadTest1234!';

// payment_ids REALES de sandbox que MP devuelve como 'approved'.
// Sin esto, el escenario de idempotencia se saltea — ver nota abajo.
const SANDBOX_IDS = (__ENV.MP_SANDBOX_PAYMENT_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (!BASE || !ANON_KEY) fail('Faltan SUPABASE_URL / SUPABASE_ANON_KEY');
if (!WH_SECRET)          fail('Falta MP_WEBHOOK_SECRET (el de staging, no el de producción)');
if (/pronetprueba|prod/i.test(BASE) && __ENV.ALLOW_PROD !== 'yo-asumo-el-riesgo') {
  fail('ABORTADO: la URL parece de producción. Este escenario toca cobros.');
}

const FN = BASE.replace('.supabase.co', '.functions.supabase.co');

// ── Métricas ───────────────────────────────────────────────────────────
const tFirmaValida   = new Trend('op_webhook_firma_valida', true);
const tFirmaInvalida = new Trend('op_webhook_firma_invalida', true);
const tPreferencia   = new Trend('op_crear_preferencia', true);
const tPrefFrio      = new Trend('op_crear_preferencia_frio', true);
const tIdempotencia  = new Trend('op_webhook_idempotencia', true);

const okFirma        = new Rate('firma_verificada_correctamente');
const okRechazo      = new Rate('firma_invalida_rechazada');
const cActivaciones  = new Counter('webhook_activaciones_reportadas');
const cYaProcesado   = new Counter('webhook_ya_procesado');

// ── Firma x-signature de MercadoPago ───────────────────────────────────
// El manifest lleva punto y coma FINAL — omitirlo hace que el HMAC nunca
// coincida y TODO webhook devuelva 401. Fue la causa real de un bloqueo
// el 2026-07-31; no tocar sin releer webhook-mp/index.ts.
function firmar(paymentId, requestId, ts) {
  const manifest = `id:${String(paymentId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  return crypto.hmac('sha256', WH_SECRET, manifest, 'hex');
}

function llamarWebhook(paymentId, { firmaValida = true } = {}) {
  const ts  = Math.floor(Date.now() / 1000);
  const rid = `k6-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  const v1  = firmaValida ? firmar(paymentId, rid, ts) : 'deadbeef'.repeat(8);
  return http.post(
    `${FN}/webhook-mp?type=payment&data.id=${encodeURIComponent(paymentId)}`,
    null,
    {
      headers: {
        // MP intercala espacios tras la coma: se replica el formato real.
        'x-signature':  `ts=${ts}, v1=${v1}`,
        'x-request-id': rid,
        'Content-Type': 'application/json',
      },
      tags: { op: firmaValida ? 'wh_valida' : 'wh_invalida' },
    }
  );
}

// ── Perfil ─────────────────────────────────────────────────────────────
// Concurrencia baja y deliberada. Subirla no aporta: lo que se busca es
// la carrera, no el volumen.
export const options = {
  scenarios: {
    // A · Verificación de firma bajo concurrencia (no requiere sandbox).
    firma_valida: {
      executor: 'constant-vus', exec: 'firmaValida',
      vus: 20, duration: '3m', startTime: '0s',
    },
    // B · Rechazo de firma forjada (control negativo).
    firma_invalida: {
      executor: 'constant-vus', exec: 'firmaInvalida',
      vus: 10, duration: '3m', startTime: '0s',
    },
    // C · Creación de preferencia (mide arranque en frío del isolate).
    preferencia: {
      executor: 'constant-vus', exec: 'crearPreferencia',
      vus: 10, duration: '3m', startTime: '10s',
    },
    // D · Carrera de idempotencia — el test más importante del escenario.
    //     Se ejecuta sólo si hay payment_ids de sandbox cargados.
    idempotencia: {
      executor: 'per-vu-iterations', exec: 'carreraIdempotencia',
      vus: SANDBOX_IDS.length ? 20 : 0,
      iterations: 1, startTime: '30s', maxDuration: '2m',
    },
  },
  thresholds: {
    'op_webhook_firma_valida':        ['p(95)<500', 'p(99)<1000'],
    'op_webhook_firma_invalida':      ['p(95)<300'],   // rechazo debe ser barato
    'op_crear_preferencia':           ['p(95)<600', 'p(99)<1200'],
    'op_crear_preferencia_frio':      ['p(95)<2500'],
    'firma_verificada_correctamente': ['rate>0.999'],
    'firma_invalida_rechazada':       [{ threshold: 'rate>0.999', abortOnFail: true }],
    // Tolerancia cero en el flujo de pago (ver plan, sección 03).
    'http_req_failed{op:preferencia}': ['rate<0.001'],
  },
};

export function setup() {
  if (!SANDBOX_IDS.length) {
    console.warn(
      '\n⚠ MP_SANDBOX_PAYMENT_IDS vacío — se SALTEA la prueba de idempotencia.\n' +
      '  Motivo: webhook-mp consulta el pago contra la API de MP ANTES de\n' +
      '  tocar pagos_procesados. Un payment_id falso devuelve 404 y la\n' +
      '  función responde 200 sin llegar nunca al candado de idempotencia.\n' +
      '  Para ejercitar esa ruta hacen falta pagos de sandbox REALES en\n' +
      '  estado approved. Ver README (sección E3).\n'
    );
  }

  const r = http.post(
    `${BASE}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: 'presta0001@load.test', password: PW }),
    { headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' } }
  );
  if (r.status !== 200) fail('No se pudo autenticar presta0001@load.test. ¿Corriste el seed?');
  return { token: r.json().access_token, arranque: Date.now() };
}

// ── A · Firma válida, pago inexistente ─────────────────────────────────
// Con un id falso MP responde 404 y el webhook devuelve 200 sin activar
// nada. Ejercita de verdad: parseo del header, cálculo del HMAC,
// verificación y manejo del 404. Es la ruta caliente del endpoint.
export function firmaValida() {
  const idFalso = `k6${Date.now()}${exec.vu.idInTest}`;
  const r = llamarWebhook(idFalso, { firmaValida: true });
  tFirmaValida.add(r.timings.duration);
  // 200 = firma aceptada y pago inexistente descartado correctamente.
  // Un 401 acá significa que la verificación de firma se rompió.
  okFirma.add(check(r, {
    'firma valida aceptada (200)': (x) => x.status === 200,
    'no devuelve 401':             (x) => x.status !== 401,
  }));
}

// ── B · Firma forjada — control negativo ───────────────────────────────
// Si esto empieza a devolver 200, la verificación de firma dejó de
// proteger el endpoint y cualquiera puede activar planes. Por eso el
// umbral tiene abortOnFail.
export function firmaInvalida() {
  const idFalso = `k6bad${Date.now()}${exec.vu.idInTest}`;
  const r = llamarWebhook(idFalso, { firmaValida: false });
  tFirmaInvalida.add(r.timings.duration);
  okRechazo.add(check(r, { 'firma forjada rechazada (401)': (x) => x.status === 401 }));
}

// ── C · Creación de preferencia ────────────────────────────────────────
export function crearPreferencia(data) {
  const r = http.post(
    `${FN}/crear-preferencia`,
    JSON.stringify({ plan: 'pro', periodo: 'mes' }),
    { headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json',
      }, tags: { op: 'preferencia' } }
  );
  // Las primeras invocaciones tras el arranque incluyen el cold start del
  // isolate de Deno; mezclarlas con el estado caliente distorsiona el p95.
  const esFrio = (Date.now() - data.arranque) < 15000;
  (esFrio ? tPrefFrio : tPreferencia).add(r.timings.duration);
  check(r, {
    'preferencia creada (200)': (x) => x.status === 200,
    'devuelve init_point':      (x) => { try { return !!x.json().init_point; } catch { return false; } },
  });
}

// ── D · Carrera de idempotencia ────────────────────────────────────────
// 20 VUs disparan el MISMO payment_id a la vez. La PK de pagos_procesados
// actúa de candado: exactamente uno debe aplicar la activación y el resto
// debe salir con 200 sin tocar suscripciones.
//
// La aserción final NO la puede hacer k6 (pagos_procesados tiene RLS sin
// policies: sólo el webhook con service_role la escribe, y nadie la lee
// desde el cliente). Se verifica con SQL después de la corrida —
// consulta en el README, sección E3.
export function carreraIdempotencia() {
  const paymentId = SANDBOX_IDS[exec.vu.idInTest % SANDBOX_IDS.length];
  const r = llamarWebhook(paymentId, { firmaValida: true });
  tIdempotencia.add(r.timings.duration);

  const cuerpo = String(r.body || '');
  if (cuerpo.includes('ya procesado')) cYaProcesado.add(1);
  else if (r.status === 200)           cActivaciones.add(1);

  check(r, {
    'sin 5xx en la carrera': (x) => x.status < 500,
    'responde 200':          (x) => x.status === 200,
  });
}

export function teardown() {
  if (!SANDBOX_IDS.length) return;
  console.log(
    '\n═══ VERIFICACIÓN OBLIGATORIA (correr en SQL, no la hace k6) ═══\n' +
    'Por cada payment_id usado debe existir UNA fila y UNA sola activación:\n\n' +
    `  select payment_id, count(*) from public.pagos_procesados\n` +
    `   where payment_id in ('${SANDBOX_IDS.join("','")}')\n` +
    `   group by payment_id having count(*) <> 1;   -- debe dar 0 filas\n\n` +
    '  select usuario_id, plan, vence_en from public.suscripciones\n' +
    '   where activado_en > now() - interval \'10 minutes\';\n' +
    '  -- vence_en debe ser ~1 mes, NO N meses acumulados.\n'
  );
}
