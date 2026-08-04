// ═══════════════════════════════════════════════════════════════════════
// PRONET · E2 — Carga en Marketplace (ProMarket)
// Navegación intensiva de lectura: scroll paginado, filtros combinados,
// búsqueda por texto y contadores del mapa.
//
// Uso:
//   k6 run -e SUPABASE_URL=https://<ref>.supabase.co \
//          -e SUPABASE_ANON_KEY=<anon> \
//          tests/perf/e2-marketplace.js
//
// A diferencia de E1 (mixto lectura/escritura), este escenario es
// prácticamente read-only: mide capacidad de servicio de consultas, no
// contención de escritura.
//
// NOTA: el flag `promarket_activo` de config_app sólo controla la UI.
// La API de publicaciones responde igual con la feature apagada, así que
// este escenario es válido aunque ProMarket esté oculto en la app.
// ═══════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const BASE     = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const PW       = __ENV.TEST_PW || 'LoadTest1234!';

if (!BASE || !ANON_KEY) fail('Faltan SUPABASE_URL / SUPABASE_ANON_KEY');
if (/pronetprueba|prod/i.test(BASE) && __ENV.ALLOW_PROD !== 'yo-asumo-el-riesgo') {
  fail('ABORTADO: la URL parece de producción. Usá staging.');
}

// ── Métricas ───────────────────────────────────────────────────────────
// La paginación por OFFSET se mide en tres profundidades separadas: el
// costo crece con la profundidad porque Postgres descarta las filas
// previas antes de devolver la página. Un p95 único las promediaría y
// escondería la degradación, que es justamente lo que hay que detectar.
const tPagina0    = new Trend('op_feed_offset_0', true);
const tPagina50   = new Trend('op_feed_offset_50', true);
const tPagina200  = new Trend('op_feed_offset_200', true);
const tFiltros    = new Trend('op_filtro_zona_categoria', true);
const tBusqueda   = new Trend('op_busqueda_texto', true);
const tContadores = new Trend('op_contadores_mapa', true);
const bytesMapa   = new Trend('bytes_contadores_mapa', false);
const okRate      = new Rate('operaciones_exitosas');
const cVacios     = new Counter('resultados_vacios');

// ── Cardinalidad ───────────────────────────────────────────────────────
// Términos variados a propósito: repetir siempre el mismo mediría el
// caché de plan y de buffers, no el costo real de la búsqueda.
const CATEGORIAS = ['gastronomia', 'productos', 'comercios', 'anuncios'];
const ZONAS = ['Puertos del Lago','El Cantón','San Matías','El Naudir','CUBE',
               'El Cazador','Nordelta','Escobar Centro','Escobar',
               'Matheu / Garín','Garín'];
const TERMINOS = [
  'pizza','empanadas','torta','vianda','catering','pan','budin','helado',
  'bicicleta','sillon','mesa','heladera','cochecito','ropa','zapatillas',
  'plomero','flete','clases','ingles','matematica','peluqueria','manicura',
  'jardin','pileta','parrilla','herramientas','celular','notebook','monitor',
  'juguetes','libros','plantas','macetas','perro','gato','alimento',
];

// Los campos exactos que pide listarPublicaciones() en datos.js. Usar
// select=* mediría una consulta que la app no hace.
const SELECT_FEED = encodeURIComponent(
  'id,autor_id,categoria,titulo,descripcion,precio,precio_convenir,detalles,' +
  'foto_url,zona,creado,likes_count,comentarios_count,perfiles:autor_id(nombre,zona)'
);

const N_USUARIOS = Number(__ENV.N_USUARIOS) || 60;

// ── Perfil de carga ────────────────────────────────────────────────────
// Escenario de lectura: se usa constant-arrival-rate en vez de VUs fijos
// porque modela mejor "N usuarios llegan por segundo" independientemente
// de cuánto tarde el sistema. Con VUs fijos, si el servidor se degrada
// los VUs esperan y la carga ofrecida baja sola — enmascarando el problema.
export const options = {
  scenarios: {
    navegacion_marketplace: {
      executor: 'ramping-arrival-rate',
      exec: 'navegarMarketplace',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { duration: '2m',  target: 20 },   // 20 sesiones/s
        { duration: '3m',  target: 60 },   // 60 sesiones/s
        { duration: '8m',  target: 60 },   // meseta de observación
        { duration: '2m',  target: 0  },
      ],
    },
  },
  thresholds: {
    'op_feed_offset_0':         ['p(95)<600',  'p(99)<1100'],
    'op_feed_offset_50':        ['p(95)<700'],
    'op_feed_offset_200':       ['p(95)<900'],   // degradación tolerada por OFFSET
    'op_filtro_zona_categoria': ['p(95)<600'],
    'op_busqueda_texto':        ['p(95)<1200'],  // sin índice trigram activo
    'op_contadores_mapa':       ['p(95)<1500'],
    'operaciones_exitosas':     [{ threshold: 'rate>0.999', abortOnFail: true, delayAbortEval: '1m' }],
    'http_req_failed':          ['rate<0.01'],
  },
};

export function setup() {
  const usuarios = [];
  for (let i = 1; i <= N_USUARIOS; i++) {
    const r = http.post(
      `${BASE}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: `vecino${String(i).padStart(4,'0')}@load.test`, password: PW }),
      { headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' } }
    );
    if (r.status === 200) {
      const b = r.json();
      usuarios.push({ token: b.access_token, uid: b.user.id });
    }
  }
  if (!usuarios.length) fail('No se autenticó ninguna cuenta. ¿Corriste el seed?');

  // Confirmar que hay volumen suficiente: con pocas publicaciones el
  // offset 200 devuelve vacío y la prueba no mide nada.
  const r = http.get(
    `${BASE}/rest/v1/publicaciones?select=id&activa=eq.true&limit=1`,
    { headers: hdr(usuarios[0].token, { 'Prefer': 'count=exact' }) }
  );
  const total = parseInt(String(r.headers['Content-Range'] || '0/0').split('/')[1], 10) || 0;
  if (total < 500) {
    fail(`Solo ${total} publicaciones activas; se requieren 500+ para medir paginación profunda.`);
  }
  console.log(`Publicaciones activas disponibles: ${total}`);

  return { usuarios };
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

function feedURL({ offset = 0, zona = null, categoria = null, termino = null }) {
  let u = `${BASE}/rest/v1/publicaciones?select=${SELECT_FEED}` +
          `&activa=eq.true&order=creado.desc&offset=${offset}&limit=10`;
  if (zona)      u += `&zona=eq.${encodeURIComponent(zona)}`;
  if (categoria) u += `&categoria=eq.${encodeURIComponent(categoria)}`;
  if (termino) {
    const t = encodeURIComponent(`%${termino}%`);
    u += `&or=(titulo.ilike.${t},descripcion.ilike.${t})`;
  }
  return u;
}

function medir(trend, res, nombre) {
  trend.add(res.timings.duration);
  const ok = check(res, { [`${nombre} 200`]: (x) => x.status === 200 });
  okRate.add(ok);
  if (ok && Array.isArray(res.json()) && res.json().length === 0) cVacios.add(1);
  return ok;
}

// ── Sesión de navegación ───────────────────────────────────────────────
// Mix del plan: 70 % scroll · 20 % filtros · 10 % búsqueda.
// Cada iteración es una sesión completa de un usuario, no una request
// suelta: así el think-time y la secuencia reproducen el patrón real.
export function navegarMarketplace(data) {
  const sesion = data.usuarios[exec.vu.idInTest % data.usuarios.length];
  const h = hdr(sesion.token);
  const dado = Math.random();

  // ── Paso 1 · Entrada al feed (todas las sesiones) ────────────────────
  let r = http.get(feedURL({ offset: 0 }), { headers: h, tags: { op: 'feed_p0' } });
  medir(tPagina0, r, 'feed offset 0');
  think(2, 5);

  if (dado < 0.70) {
    // ── 70 % · Scroll paginado en profundidad ──────────────────────────
    // El costo de OFFSET crece con la profundidad: Postgres genera y
    // descarta las filas previas. Si offset 200 supera 2× el de offset 0,
    // corresponde migrar a paginación por cursor (keyset).
    r = http.get(feedURL({ offset: 50 }), { headers: h, tags: { op: 'feed_p50' } });
    medir(tPagina50, r, 'feed offset 50');
    think(2, 4);

    r = http.get(feedURL({ offset: 200 }), { headers: h, tags: { op: 'feed_p200' } });
    medir(tPagina200, r, 'feed offset 200');
    think(2, 4);

  } else if (dado < 0.90) {
    // ── 20 % · Filtro combinado zona + categoría ───────────────────────
    // Hay índices en zona y categoria por separado. Verificar con EXPLAIN
    // que el planner los combina (BitmapAnd) y no degrada a seq scan por
    // baja selectividad del filtro.
    const zona = pick(ZONAS), cat = pick(CATEGORIAS);
    r = http.get(feedURL({ zona, categoria: cat }),
                 { headers: h, tags: { op: 'filtros' } });
    medir(tFiltros, r, 'filtro zona+categoria');
    think(2, 5);

    // Los contadores del mapa: el usuario abre el mapa tras filtrar.
    // ⚠ Esta llamada NO es un GROUP BY server-side. datos.js hace
    //   select('zona') sin límite y agrupa en JavaScript: a 50k
    //   publicaciones transfiere las 50k filas al navegador sólo para
    //   armar un contador. Se mide el peso de la respuesta además de la
    //   latencia, porque el problema acá es el volumen transferido.
    r = http.get(
      `${BASE}/rest/v1/publicaciones?select=zona&activa=eq.true` +
      `&categoria=eq.${encodeURIComponent(cat)}`,
      { headers: h, tags: { op: 'contadores' } }
    );
    tContadores.add(r.timings.duration);
    bytesMapa.add(r.body ? r.body.length : 0);
    okRate.add(check(r, { 'contadores 200': (x) => x.status === 200 }));

  } else {
    // ── 10 % · Búsqueda por texto ──────────────────────────────────────
    // ILIKE con comodín inicial sobre titulo y descripcion. Es el subcaso
    // caro y se mide aparte del resto del escenario a propósito: mezclado
    // con el scroll, su costo quedaría diluido en el promedio.
    const termino = pick(TERMINOS);
    r = http.get(feedURL({ termino }), { headers: h, tags: { op: 'busqueda' } });
    medir(tBusqueda, r, 'busqueda texto');
    think(3, 6);

    // La app registra cada búsqueda (alimenta tendencias_busqueda_zona).
    // Es la única escritura del escenario y va en el camino crítico de
    // la búsqueda, así que corresponde incluirla.
    const encontrados = r.status === 200 && Array.isArray(r.json()) ? r.json().length : 0;
    http.post(
      `${BASE}/rest/v1/busquedas_mercado`,
      JSON.stringify({
        termino,
        zona: pick(ZONAS),
        categoria: null,
        resultados_count: encontrados,
        usuario_id: sesion.uid,   // igual que registrarBusquedaMercado()
      }),
      { headers: h, tags: { op: 'registrar_busqueda' } }
    );
  }
}

// ── Limpieza ───────────────────────────────────────────────────────────
// El escenario es casi read-only; lo único que escribe es el registro de
// búsquedas, que se acumula corrida tras corrida y contamina las
// tendencias por zona (tendencias_busqueda_zona cuenta términos sin
// resultado de los últimos 7 días).
//
// ⚠ `busquedas_mercado` NO tiene policy de DELETE: sólo existe una de
//   INSERT para authenticated. Este borrado con JWT de usuario afecta
//   CERO filas y devuelve 204 igual — silenciosamente. La limpieza real
//   hay que correrla fuera de k6 con service_role:
//
//     delete from public.busquedas_mercado
//      where termino in (...) and creado > now() - interval '1 day';
//
//   Se deja el aviso en vez del DELETE inútil para no dar una falsa
//   sensación de limpieza.
export function teardown() {
  console.log(
    'RECORDATORIO: limpiar busquedas_mercado manualmente con service_role.\n' +
    'La tabla no tiene policy de DELETE, k6 no puede hacerlo con JWT de usuario.'
  );
}
