// @ts-check
// Login único por rol: guarda la sesión en disco para que los specs no tengan
// que autenticarse en cada test.
//
// Antes cada test hacía su propio login contra Supabase — 11 logins seguidos
// contra producción, que tardaban 4 minutos y fallaban por timeout de forma
// intermitente. La lentitud no era el problema principal: un test que falla a
// veces por infraestructura enseña a ignorar los rojos.
// Destructuring con rename usa `:`, no `as` (eso es sintaxis de import).
const { test: setup } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { CUENTAS, login } = require('./helpers');

const DIR = path.join(__dirname, '.auth');
const archivo = (rol) => path.join(DIR, `${rol}.json`);

for (const rol of ['vecino', 'prestador', 'doble']) {
  setup(`sesión ${rol}`, async ({ page }) => {
    if (!CUENTAS[rol]?.email) {
      setup.skip(true, `Sin cuenta configurada para "${rol}"`);
      return;
    }
    fs.mkdirSync(DIR, { recursive: true });
    await login(page, rol);
    await page.context().storageState({ path: archivo(rol) });
  });
}

module.exports = { archivo };
