// Chequeo estático de PRONET.
// Apunta a la familia de bugs que aparecieron el 2026-08-10: nombres
// duplicados o mal pasados que no dan error y hacen algo distinto.
//
// Se corre con `npm run check`. Sale con código 1 si encuentra algo, así que
// sirve tal cual en un hook de pre-commit o en CI.
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..') + path.sep;
const app = fs.readFileSync(D + 'app.js', 'utf8');
const datos = fs.readFileSync(D + 'datos.js', 'utf8');
const html = fs.readFileSync(D + 'index.html', 'utf8');
const problemas = [];
const ok = [];

// ── 1 · Métodos repetidos en el objeto PronetDB ──────────────────────
// El que pisó el ABM de publicidad: en un objeto gana la última clave.
{
  const nombres = [...datos.matchAll(/^\s{4}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm)]
    .map(m => m[1]).filter(n => !['if','for','while','switch','catch','return'].includes(n));
  const vistos = new Map(), dup = new Set();
  nombres.forEach(n => { if (vistos.has(n)) dup.add(n); vistos.set(n, 1); });
  dup.size ? problemas.push('datos.js tiene métodos repetidos: ' + [...dup].join(', '))
           : ok.push('datos.js: ' + nombres.length + ' métodos, ninguno repetido');
}

// ── 2 · Handlers del HTML que no existen ─────────────────────────────
// Cazaría un rename cuyo llamador quedó sin actualizar.
{
  const fns = new Set();
  for (const m of html.matchAll(/on(?:click|change|input|submit)\s*=\s*"([^"]*)"/g)) {
    // `(?<![.\w$])` descarta los métodos: en `this.classList.toggle(...)` el
    // nombre viene después de un punto y no es una función global.
    for (const f of m[1].matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) fns.add(f[1]);
  }
  const nativas = new Set(['this','alert','confirm','prompt','event','setTimeout','Number','String','parseInt','document','window','JSON','Math','console','if','return','typeof']);
  const faltan = [...fns].filter(f => {
    if (nativas.has(f)) return false;
    return !(new RegExp('window\\.' + f + '\\s*=').test(app) ||
             new RegExp('function\\s+' + f + '\\b').test(app) ||
             new RegExp('\\b' + f + '\\s*[:=]\\s*(async\\s*)?(function|\\()').test(app));
  });
  faltan.length ? problemas.push('onclick del HTML sin función definida: ' + faltan.join(', '))
                : ok.push('HTML: ' + fns.size + ' handlers, todos existen en app.js');
}

// ── 3 · window.X = X apuntando a algo inexistente ────────────────────
{
  const malos = [];
  for (const m of app.matchAll(/window\.([a-zA-Z_$][\w$]*)\s*=\s*([a-zA-Z_$][\w$]*)\s*;/g)) {
    const [, expuesto, real] = m;
    // `= null` / `= undefined` son limpiezas de bandera, no exports rotos.
    if (['null','undefined','true','false'].includes(real)) continue;
    const definida = new RegExp('(function\\s+' + real + '\\b|\\b(const|let|var)\\s+' + real + '\\b)').test(app);
    if (!definida) malos.push(expuesto + ' → ' + real);
  }
  malos.length ? problemas.push('window.X apunta a algo no definido: ' + malos.join(', '))
               : ok.push('exports a window: todos apuntan a algo definido');
}

// ── 4 · Pantallas registradas vs presentes en el HTML ────────────────
{
  const m = app.match(/const all = \[([\s\S]*?)\];/);
  const ids = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  const faltan = ids.filter(id => !html.includes('id="' + id + '"'));
  faltan.length ? problemas.push('pantallas registradas que no existen: ' + faltan.join(', '))
                : ok.push('pantallas: ' + ids.length + ' registradas, todas en el HTML');
  // Y al revés: pantallas en el HTML que goTo no conoce → inalcanzables
  const enHtml = [...html.matchAll(/class="screen[^"]*"\s+id="([^"]+)"/g)].map(x => x[1]);
  const huerfanas = enHtml.filter(id => !ids.includes(id));
  huerfanas.length ? problemas.push('pantallas en el HTML que goTo no conoce: ' + huerfanas.join(', '))
                   : ok.push('no hay pantallas inalcanzables');
}

// ── 5 · IDs repetidos en el HTML ─────────────────────────────────────
// Dos elementos con el mismo id: getElementById devuelve el primero y el
// segundo queda muerto sin dar error.
{
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const vistos = new Map(), dup = new Set();
  ids.forEach(i => { if (vistos.has(i)) dup.add(i); vistos.set(i, 1); });
  dup.size ? problemas.push('IDs repetidos en el HTML: ' + [...dup].join(', '))
           : ok.push('HTML: ' + ids.length + ' ids, ninguno repetido');
}

// ── 6 · .catch() colgado de un builder de PostgREST ──────────────────
// El builder que devuelven sb.from(...) y sb.rpc(...) es un *thenable*:
// tiene .then() pero NO tiene .catch(). Colgarle un .catch() tira
// TypeError ANTES de mandar el request, así que la escritura nunca sale
// — y como el TypeError suele caer en un catch de más arriba, no se ve.
// Fue lo que dejó sin registrar el consentimiento de T&C, las vistas de
// perfil, los contactos y las búsquedas del mercado.
// Un .then(...).catch(...) SÍ es válido: .then() devuelve Promise real.
{
  const malos = [];
  for (const src of [['datos.js', datos], ['app.js', app]]) {
    const [archivo, texto] = src;
    for (const m of texto.matchAll(/\b(?:sb|window\._sb|_sb)\.(?:from|rpc)\(/g)) {
      // Recortar hasta el fin de la sentencia para no cruzar a la siguiente.
      const resto = texto.slice(m.index, texto.indexOf(';', m.index) + 1 || m.index + 400);
      const iCatch = resto.indexOf('.catch(');
      if (iCatch === -1) continue;
      const iThen = resto.indexOf('.then(');
      if (iThen !== -1 && iThen < iCatch) continue; // .then().catch() es válido
      malos.push(archivo + ':' + (texto.slice(0, m.index).split('\n').length));
    }
  }
  malos.length ? problemas.push('.catch() colgado de un builder de PostgREST (nunca manda el request): ' + malos.join(', '))
               : ok.push('PostgREST: ningún .catch() colgado del builder');
}

console.log('✅ BIEN');
ok.forEach(o => console.log('   · ' + o));
if (problemas.length) {
  console.log('\n❌ PROBLEMAS');
  problemas.forEach(p => console.log('   · ' + p));
  process.exit(1);
}
console.log('\n(sin problemas estáticos)');
