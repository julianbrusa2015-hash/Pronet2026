// @ts-check
// Cobertura de lo que cambió el 2026-08-29 (v353 → v365), antes de
// llevarlo al APK.
//
// El APK carga el sitio en vivo (`server.url` en capacitor.config.json),
// así que verificar producción ES verificar lo que va a mostrar el APK.
//
//   EV-1 · Entre Vecinos: el ámbito vive en el header y absorbió el
//          selector de zona; el origen tiene fila propia; los chips van a
//          lo ancho; los huecos entre filas son parejos.
//   EV-2 · El renglón de ámbito NO se esconde para quien no declaró
//          comunidad — ahí adentro vive el único filtro de zona.
//   PF-1 · "Mis alertas" salió de Entre Vecinos y la ven los dos roles.
//   PF-2 · Las etiquetas del prestador distinguen Banner de Vecinos.
//   PF-3 · El vecino puede guardar su foto de perfil (la columna no
//          existía y rompía el guardado ENTERO del perfil).
//   AD-1 · El panel de precios incluye las compras sueltas.
//   AD-2 · "Verificaciones de identidad" en el panel.
//   BN-1 · La previsualización del banner usa el recorte real (16:5).
//
// Corre contra: https://pronetprueba.netlify.app
const { test, expect } = require('@playwright/test');
const path = require('path');
const H = require('./helpers');

const sesionVecino = path.join(__dirname, '.auth', 'vecino.json');
const sesionPrestador = path.join(__dirname, '.auth', 'prestador.json');

/** Entra a Entre Vecinos y espera a que el feed haya pintado. */
async function entrarAEntreVecinos(page) {
  await H.abrir(page);
  await H.irA(page, 's-mercado');
  await page.waitForTimeout(3500);
}

// ══════════════════════════════════════════════════════════════════════════
test.describe('EV · Entre Vecinos rediseñado', () => {
  test.use({ storageState: sesionVecino });

  test('EV-1 · el ámbito vive en el header y se llevó el selector de zona', async ({ page }) => {
    await entrarAEntreVecinos(page);

    const r = await page.evaluate(() => ({
      // El <select> de zona tiene que estar DENTRO del appbar, no en una
      // fila propia debajo del buscador.
      zonaEnHeader: !!document.querySelector('#s-mercado .appbar #mkt-zona-select'),
      ambitoEnHeader: !!document.querySelector('#s-mercado .appbar #mkt-ambito'),
      // Y la barra vieja de ámbito, que vivía debajo del carrusel, ya no está.
      barraViejaAbajo: !!document.querySelector('#s-mercado > #mkt-ambito'),
      textoAmbito: document.getElementById('mkt-ambito-txt')?.textContent || '',
    }));
    expect(r.zonaEnHeader).toBe(true);
    expect(r.ambitoEnHeader).toBe(true);
    expect(r.barraViejaAbajo).toBe(false);
    expect(r.textoAmbito.length).toBeGreaterThan(0);
  });

  test('EV-1b · el origen tiene fila propia y los chips arrancan pegados al borde', async ({ page }) => {
    await entrarAEntreVecinos(page);

    const r = await page.evaluate(() => {
      const chips = document.getElementById('mkt-chips');
      const primer = chips?.querySelector('.chip');
      const fila = document.getElementById('mkt-origen-row');
      // Relativo al MARCO, no a la ventana: el proyecto corre con viewport
      // de escritorio (1280px) y `.phone` va centrado, así que la posición
      // absoluta del chip arranca cerca de 445 y no dice nada.
      const marco = document.querySelector('.phone')?.getBoundingClientRect();
      return {
        // El selector de origen NO puede estar adentro de la fila de chips:
        // ahí se comía ~150px de ancho y las dejaba asomando.
        origenDentroDeChips: !!chips?.querySelector('.mkt-origen-seg'),
        filaOrigenExiste: !!fila,
        // Los chips arrancan en el padding de la fila, sin nada delante.
        primerChipX: (primer && marco)
          ? Math.round(primer.getBoundingClientRect().left - marco.left) : null,
      };
    });
    expect(r.origenDentroDeChips).toBe(false);
    expect(r.filaOrigenExiste).toBe(true);
    expect(r.primerChipX).not.toBeNull();
    expect(r.primerChipX).toBeLessThan(40);
  });

  test('EV-1c · los huecos entre filas de control son parejos', async ({ page }) => {
    await entrarAEntreVecinos(page);

    const huecos = await page.evaluate(() => {
      const publicar = document.getElementById('mkt-btn-publicar-fijo');
      const visibles = [
        document.getElementById('mkt-secciones'),
        document.querySelector('.mkt-origen-seg'),
        publicar,
        document.querySelector('#mkt-chips .chip'),
      ].filter(Boolean);
      const out = [];
      for (let i = 1; i < visibles.length; i++) {
        const a = visibles[i - 1].getBoundingClientRect();
        const b = visibles[i].getBoundingClientRect();
        out.push(Math.round(b.top - a.bottom));
      }
      return out;
    });
    // Todos iguales, con 2px de tolerancia por redondeo de subpíxeles.
    expect(huecos.length).toBeGreaterThan(1);
    const max = Math.max(...huecos), min = Math.min(...huecos);
    expect(max - min).toBeLessThanOrEqual(2);
  });

  test('EV-2 · sin comunidad declarada, el renglón de ámbito NO se esconde', async ({ page }) => {
    // Regresión concreta: al mudar el ámbito al header quedó adentro el
    // único filtro de zona. Si el renglón se ocultara para quien no tiene
    // comunidad —que hoy es la mayoría de los perfiles— esa gente se
    // quedaría sin ninguna forma de filtrar por zona.
    await entrarAEntreVecinos(page);

    const r = await page.evaluate(() => {
      const amb = document.getElementById('mkt-ambito');
      const sel = document.getElementById('mkt-zona-select');
      return {
        ambitoVisible: amb ? amb.offsetParent !== null : false,
        selectUsable: !!sel && !sel.disabled,
        opcionesDeZona: sel ? sel.options.length : 0,
      };
    });
    expect(r.ambitoVisible).toBe(true);
    expect(r.selectUsable).toBe(true);
    // El catálogo real tiene ~28 zonas; con sólo el placeholder algo falló.
    expect(r.opcionesDeZona).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
test.describe('PF · Mi Perfil', () => {
  test('PF-1 · "Mis alertas" está en Tu actividad para el VECINO', async ({ page }) => {
    await H.login(page, 'vecino');
    await H.irA(page, 's-miperfil');
    const r = await page.evaluate(() => {
      const it = document.getElementById('menu-mis-alertas-mkt');
      return {
        visible: it ? it.offsetParent !== null : false,
        dentroDeEntreVecinos: !!document.querySelector('#seccion-promarket-perfil #menu-mis-alertas-mkt'),
      };
    });
    expect(r.visible).toBe(true);
    expect(r.dentroDeEntreVecinos).toBe(false);
  });

  test('PF-1b · y también para el PRESTADOR, que antes no la veía', async ({ page }) => {
    // El caso que motivó la mudanza: el prestador puede guardar alertas de
    // Servicios desde Buscar, pero como toda la sección Entre Vecinos está
    // oculta para su rol, no tenía dónde verlas ni cómo borrarlas.
    await H.login(page, 'prestador');
    await H.irA(page, 's-miperfil');
    const r = await page.evaluate(() => ({
      alertasVisible: document.getElementById('menu-mis-alertas-mkt')?.offsetParent !== null,
      seccionEntreVecinos: document.getElementById('seccion-promarket-perfil')?.style.display,
    }));
    expect(r.alertasVisible).toBe(true);
    expect(r.seccionEntreVecinos).toBe('none');
  });

  test('PF-2 · las etiquetas distinguen el Banner del aviso en Entre Vecinos', async ({ page }) => {
    await H.login(page, 'prestador');
    await H.irA(page, 's-miperfil');
    const r = await page.evaluate(() => ({
      banner: document.querySelector('#menu-promocionar .m-title')?.textContent || '',
      avisos: document.querySelector('#menu-pubs-prestador .m-title')?.textContent || '',
    }));
    expect(r.banner).toContain('Banner');
    expect(r.avisos).toContain('Vecinos');
  });

  test('PF-3 · el vecino puede guardar su foto sin romper el resto del perfil', async ({ page }) => {
    // El bug: `perfiles` no tenía columna foto_url, y como nombre, teléfono
    // y foto viajan en un ÚNICO update, elegir una foto rechazaba la
    // sentencia entera (PGRST204). No se guardaba nada.
    await H.login(page, 'vecino');
    const r = await page.evaluate(async () => {
      const uid = (await window._sb.auth.getUser()).data.user.id;
      const { data: antes } = await window._sb.rpc('mi_perfil');
      const nombreOriginal = (Array.isArray(antes) ? antes[0] : antes)?.nombre;
      const url = 'https://ejemplo.supabase.co/storage/v1/object/public/avatares/test.png';

      const up = await window._sb.from('perfiles')
        .update({ nombre: nombreOriginal, foto_url: url }).eq('id', uid);

      const { data: despues } = await window._sb.rpc('mi_perfil');
      const p = Array.isArray(despues) ? despues[0] : despues;

      // Dejar la cuenta como estaba: es compartida por toda la suite.
      await window._sb.from('perfiles').update({ foto_url: null }).eq('id', uid);

      return { error: up.error?.message || null, foto: p?.foto_url, nombre: p?.nombre, nombreOriginal };
    });
    expect(r.error).toBeNull();
    expect(r.foto).toContain('avatares');
    // Lo que el bug rompía de verdad: el resto del perfil se guarda igual.
    expect(r.nombre).toBe(r.nombreOriginal);
  });
});

// ══════════════════════════════════════════════════════════════════════════
test.describe('AD · Panel de administración', () => {
  test.use({ storageState: sesionVecino });

  test('AD-1 · el panel de precios incluye las cinco compras sueltas', async ({ page }) => {
    // Se verifica el RENDER, que es lo que faltaba: los cinco precios sólo
    // se cambiaban por SQL. Guardar exige ser admin y lo frena la RLS —
    // eso se cubre abajo.
    await H.abrir(page);
    const r = await page.evaluate(async () => {
      await window.renderParamPlanes?.();
      await new Promise(res => setTimeout(res, 2000));
      const ids = ['banner', 'impulso', 'renovacion', 'impulso_mercado', 'promarket_credito'];
      return {
        precios: ids.map(k => document.getElementById('ps-' + k)?.value ?? null),
        botonGuardar: !!document.querySelector('[onclick="guardarComprasSueltas()"]'),
        // Las tarjetas de plan siguen siendo sólo base/plus/pro.
        tarjetasDePlan: document.querySelectorAll('#param-planes-lista [id$="-precio_mes"]').length,
      };
    });
    expect(r.botonGuardar).toBe(true);
    expect(r.tarjetasDePlan).toBe(3);
    r.precios.forEach(p => {
      expect(p).not.toBeNull();
      expect(Number(p)).toBeGreaterThan(0);
    });
  });

  test('AD-1b · un no-admin no puede cambiar esos precios', async ({ page }) => {
    await H.abrir(page);
    const r = await page.evaluate(async () => {
      const res = await window.PronetDB.guardarPlanLimites('banner', { precio_mes: 1 });
      return { ok: res?.ok, error: res?.error || '' };
    });
    expect(r.ok).toBeFalsy();
    expect(r.error.toLowerCase()).toContain('administrador');
  });

  test('AD-2 · el panel dice "Verificaciones de identidad"', async ({ page }) => {
    await H.abrir(page);
    const txt = await page.evaluate(() =>
      document.querySelector('[onclick*="s-verificaciones"] div')?.textContent || '');
    expect(txt).toContain('identidad');
  });
});

// ══════════════════════════════════════════════════════════════════════════
test.describe('BN · Banners', () => {
  test.use({ storageState: sesionPrestador });

  test('BN-1 · la previsualización usa el recorte real del carrusel (16:5)', async ({ page }) => {
    // Llegaron a convivir cuatro relaciones distintas —3:1, 16:7 y 16:5— y
    // ninguna era la que se publica, así que a nadie le quedaba el aviso
    // como lo había subido. La fuente de verdad es `.ads-slide img`.
    await H.abrir(page);
    const r = await page.evaluate(async () => {
      await window.abrirPromocionar();
      await new Promise(res => setTimeout(res, 2500));
      const caja = document.getElementById('promo-img-prev');
      const norm = (s) => (s || '').replace(/\s+/g, '');
      return {
        aspectoCaja: norm(getComputedStyle(caja).aspectRatio),
        destino: document.getElementById('promo-hero-tit')?.textContent || '',
      };
    });
    expect(r.aspectoCaja).toBe('16/5');
    // Y el prestador compra en la portada, no en Entre Vecinos.
    expect(r.destino.toLowerCase()).toContain('portada');
  });
});
