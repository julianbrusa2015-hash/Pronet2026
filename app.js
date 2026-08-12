// ═══ PRONET · app.js ═══
// Bloque 1: inicialización de pantalla (era el script del <head>)
document.addEventListener('DOMContentLoaded', function() {
    // ── Fix safe-area para PWA instalada en iOS ──────────────────────
    // Combina CSS env() + JS como seguro para todos los modelos de iPhone.
    // El CSS ya define padding-top: env(safe-area-inset-top) pero en la PWA
    // instalada iOS a veces resuelve env() como 0 en el primer render.
    // JS lo detecta y corrige usando el valor real del dispositivo.
    if (window.navigator.standalone) {
      const aplicarSafeArea = () => {
        // Leer el valor que iOS calculó para ESTE modelo
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:1px;height:1px;pointer-events:none;opacity:0;z-index:-1;visibility:hidden';
        document.body.appendChild(probe);
        const safeTop = probe.getBoundingClientRect().top;
        document.body.removeChild(probe);
        // Si iOS resolvió correctamente (> 10px), usar ese valor exacto
        // Si no resolvió (0 o muy chico), estimar según la pantalla del dispositivo
        let paddingTop;
        if (safeTop > 10) {
          paddingTop = safeTop; // valor real del modelo (44px, 47px, 59px, etc.)
        } else {
          // Estimación por altura de pantalla como fallback
          const h = window.screen.height;
          if (h <= 667) paddingTop = 20;      // SE, 8 y anteriores
          else if (h <= 812) paddingTop = 44; // X, XS, 11 Pro
          else if (h <= 926) paddingTop = 47; // 12, 13, 14
          else paddingTop = 59;               // 15, 16, 17 Pro y futuros
        }
        const screens = document.querySelector('.screens');
        if (screens) screens.style.setProperty('padding-top', paddingTop + 'px', 'important');
        console.log('[PWA] safe-area:', paddingTop + 'px (env resolvió:', safeTop + 'px)');
      };
      // Aplicar ahora y también después de que iOS termine de calcular el layout
      aplicarSafeArea();
      setTimeout(aplicarSafeArea, 100);
    }
    // 1. Ocultar todos los overlays de onboarding
    document.querySelectorAll('.ob-screen').forEach(function(s) {
      s.classList.add('hidden');
    });
    // 2. Desactivar todas las screens
    document.querySelectorAll('.screen').forEach(function(s) {
      s.classList.remove('active');
    });
    // 3. Mostrar login SOLO si no hay indicios de sesión guardada.
    //    Supabase guarda el token en localStorage con clave que incluye 'auth-token'.
    //    Si existe, dejamos el login oculto para evitar el "flash" al recargar;
    //    restaurarSesion() confirmará después. Si no hay token, mostramos login ya.
    const login = document.getElementById('login-screen');
    let haySesionGuardada = false;
    try {
      haySesionGuardada = Object.keys(localStorage).some(k =>
        (k.includes('auth-token') && k.startsWith('sb-')) || k === 'pronet-usuario'
      );
    } catch (e) {}
    if (login) {
      // El link de invitación (?prealta=CODIGO) abre la única pantalla
      // pública de la app. La bandera ya está puesta acá: la captura corre
      // al parsear el script, o sea antes de este DOMContentLoaded.
      if (haySesionGuardada || window._prealtaPendiente) login.classList.add('hidden');
      else login.classList.remove('hidden');
    }
    // 4. Home listo en segundo plano
    var home = document.getElementById('s-home');
    if (home) home.classList.add('active');
    // 5. Activar botón nav Home
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    var nb = document.getElementById('nb-home');
    if (nb) nb.classList.add('active');
    // 6. Aplicar feature flags — oculta accesos a funcionalidades desactivadas
    if (typeof aplicarFeatureFlags === 'function') aplicarFeatureFlags();
  });

// Bloque 1b-0: frases rotantes en el pill del hero de login
(function() {
  const FRASES = [
    'la red de los que saben hacer',
    'conexiones de trabajo garantizadas',
    'el punto de encuentro de los que trabajan',
    'profesionales de confianza, a un clic de distancia',
  ];
  let idx = 0;
  function cicloPill() {
    const el = document.getElementById('login-pill-msg');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      idx = (idx + 1) % FRASES.length;
      el.textContent = FRASES[idx];
      el.style.opacity = '1';
    }, 420);
  }
  document.addEventListener('DOMContentLoaded', () => {
    setInterval(cicloPill, 3500);
  });
})();

// Bloque 1b: handler de teclado virtual (visualViewport API)
// Cuando el teclado abre en iOS/Android PWA, el viewport se achica.
// Ajustamos el padding-bottom de la pantalla activa para que el contenido
// no quede tapado por el teclado.
if (window.visualViewport) {
  let teclado = false;
  window.visualViewport.addEventListener('resize', () => {
    const vv = window.visualViewport;
    const offset = window.innerHeight - vv.height - vv.offsetTop;
    const activa = document.querySelector('.screen.active');
    if (!activa) return;
    if (offset > 80) {
      // Teclado abierto: compensar con padding-bottom
      if (!teclado) { teclado = true; activa.dataset.padOrig = activa.style.paddingBottom || ''; }
      activa.style.paddingBottom = offset + 'px';
      // Scroll al elemento enfocado para que quede visible
      const focused = document.activeElement;
      if (focused && focused !== document.body) focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      // Teclado cerrado: restaurar
      if (teclado) {
        teclado = false;
        activa.style.paddingBottom = activa.dataset.padOrig || '';
        delete activa.dataset.padOrig;
      }
    }
  });
}

// Bloque 1c: scroll controlado al enfocar un input (Fix iOS layout jump)
// iOS scrollea el contenedor equivocado al enfocar inputs. Sobreescribimos
// con un scroll al contenedor .screen.active después de un frame.
document.addEventListener('focusin', (e) => {
  const tag = e.target.tagName;
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  const t = e.target.type;
  if (['checkbox', 'radio', 'range', 'file', 'hidden'].includes(t)) return;
  const screen = e.target.closest('.screen.active');
  if (!screen) return;
  requestAnimationFrame(() => {
    e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
});

// Bloque 1d: bloquear pull-to-refresh nativo de iOS en PWA
// overscroll-behavior:none no es suficiente en standalone; iOS igual
// dispara el PTR del sistema cuando scrollTop===0 y el gesto es hacia abajo.
(function () {
  let startY = 0;
  let startX = 0;
  document.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    // Ignorar swipes principalmente horizontales (carruseles, filtros)
    if (dx > Math.abs(dy)) return;
    // Solo bloquear si el gesto es hacia abajo Y el scroll está en el tope
    if (dy <= 0) return;
    const screen = document.querySelector('.screen.active');
    if (screen && screen.scrollTop === 0) {
      e.preventDefault();
    }
  }, { passive: false });
})();

// Bloque 2: lógica principal de la aplicación
// ══════════════════════════════════════════════════════════════════
  // SISTEMA DE FEATURE FLAGS — controla qué funcionalidades están activas
  // Cambiar a true/false para escalar entre Nivel 1 → 2 → 3
  // ══════════════════════════════════════════════════════════════════
  const FEATURES = {
    // ── NIVEL 1 · Núcleo (lanzamiento real Escobar) ──
    // Core transaccional completo — sin esto no hay marketplace
    home:            true,
    buscar:          true,
    mapa:            true,
    ficha:           true,
    chat:            true,
    resenaSimple:    true,
    zonaModal:       true,
    miPerfilBasico:  true,
    bolsaTrabajo:    true,   // Pedidos, propuestas, estado de propuesta — ciclo transaccional completo
    tutorialOnboarding: true, // Tutorial de 4 pasos al primer login — guía para usuarios nuevos

    // ── NIVEL 2 · Crecimiento (mes 2-3) ──
    // Profesionalización, monetización y confianza
    badgeVerificado: true,   // Escudo verde lima automático
    suscripcionPro:  true,   // Planes y pagos
    catalogoPrecios: true,   // Catálogo referencial (admin + fichas)
    editarPerfilPro: true,   // Editar perfil completo, historial de trabajos
    denuncias:       true,   // Sistema de denuncias + moderación — necesario con transacciones reales

    // ── NIVEL 3 · Sofisticación (fase de escala) ──
    // Engagement y analítica avanzada — requieren volumen de datos
    loyalty:         true,   // PRONET Points
    analyticsAvanzado: true, // Analítica detallada

    // ── Nivel 4 · Exploración (no lanzado) ──
    mercadoPlaza: true, // Wireframe del feed "Mercado/Plaza" — mock, sin conectar a datos reales todavía

    // ── Config de demo ──
    mostrarSelectorDemo: false,
    panelConfiguracion:  true, // Botón ⚙️ de niveles — visible solo para admins (ver esAdmin() gate)
  };

  // Pantallas asociadas a cada feature — se ocultan del nav y bloquean en goTo
  const FEATURE_SCREENS = {
    // La bolsa de trabajo (vista prestador: ofertar propuestas) es Nivel 2.
    // Publicar y ver pedidos propios (cliente) son core Nivel 1 → NO se listan acá.
    bolsaTrabajo:      ['s-nueva-propuesta','s-estado-propuesta','s-mis-propuestas'],
    catalogoPrecios:   ['s-catalogo','s-ficha-ref','s-catalogo-form'],
    denuncias:         ['s-denuncia','s-moderacion'],
    loyalty:           ['s-loyalty','s-loyalty-admin'],
    editarPerfilPro:   ['s-historial'],
    suscripcionPro:    [], // s-subs siempre accesible — es donde el usuario activa el plan
    analyticsAvanzado: ['s-analytics'],
    // 's-vecinos-portada' va acá y no aparte: es la puerta de Entre Vecinos,
    // así que con el flag apagado tiene que quedar tan inalcanzable como el
    // feed. Una portada accesible hacia una sección apagada sería peor que
    // no tenerla.
    mercadoPlaza:      ['s-mercado', 's-vecinos-portada', 's-pub-mercado', 's-chat-mercado', 's-mis-publicaciones', 's-mis-consultas-mkt', 's-mis-consultas-enviadas', 's-comentarios-pub', 's-mis-alertas'],
  };

  function isScreenEnabled(id) {
    for (const feature in FEATURE_SCREENS) {
      if (FEATURE_SCREENS[feature].includes(id)) return FEATURES[feature];
    }
    return true; // pantallas de Nivel 1 siempre habilitadas
  }

  // Aplica los flags: oculta botones de menú/nav que apunten a features desactivadas
  function aplicarFeatureFlags() {
    document.querySelectorAll('[data-feature]').forEach(el => {
      const feature = el.dataset.feature;
      el.style.display = FEATURES[feature] ? '' : 'none';
    });
    // Ocultar tab de Pedidos en bottom nav si la bolsa de trabajo está apagada
    const navPedidos = document.getElementById('nb-pedidos');
    if (navPedidos) navPedidos.style.display = FEATURES.bolsaTrabajo ? '' : 'none';

    // Toggle de clases en <body> para ocultar elementos que no usan data-feature
    // (badge verificado, badges de plan Premium) mediante reglas CSS
    document.body.classList.toggle('feature-badgeVerificado-off', !FEATURES.badgeVerificado);
    document.body.classList.toggle('feature-suscripcionPro-off', !FEATURES.suscripcionPro);

    // Re-evaluar banner de pedidos del prestador (si el modo prestador está activo)
    const pedBanner = document.getElementById('home-ped-banner');
    if (pedBanner && pedBanner.dataset.prestadorActivo === 'true') {
      pedBanner.style.display = FEATURES.bolsaTrabajo ? 'flex' : 'none';
    }
  }

  const navMap = {
    's-home':             'nb-home',
    's-buscar':           'nb-buscar',
    's-publicar':         'nb-pub',
    's-mapa':             'nb-mercado',
    's-miperfil':         'nb-perfil',
    's-ranking':          'nb-mercado',
    's-mercado':          'nb-mercado',
    's-vecinos-portada':  'nb-mercado',
    's-pub-mercado':      'nb-mercado',
    's-chat-mercado':       'nb-mercado',
    's-mis-publicaciones':  'nb-perfil',
    's-mis-consultas-mkt':       'nb-perfil',
    's-mis-consultas-enviadas':  'nb-perfil',
    's-mis-alertas':             'nb-perfil',
    's-comentarios-pub':         'nb-mercado',
    's-chat':             'nb-buscar',
    's-chats':            'nb-buscar',
    's-prof':             'nb-buscar',
    's-notif':            'nb-home',
    's-subs':             'nb-perfil',
    's-analytics':        'nb-perfil',
    's-pedidos':          'nb-pedidos',
    's-nuevo-pedido':     'nb-pedidos',
    's-detalle-pedido':   'nb-pedidos',
    's-nueva-propuesta':  'nb-pedidos',
    's-confirmacion':     'nb-pedidos',
    's-catalogo':         'nb-perfil',
    's-ficha-ref':        'nb-perfil',
    's-catalogo-form':    'nb-perfil',
    's-edit-perfil':        'nb-perfil',
    's-estado-propuesta':   'nb-pedidos',
    's-historial':          'nb-perfil',
    's-tyc':                'nb-home',
    's-privacidad':         'nb-perfil',
    's-loyalty':            'nb-perfil',
    's-denuncia':         'nb-perfil',
    's-moderacion':       'nb-perfil',
    's-loyalty-admin':    'nb-perfil',
    's-mis-propuestas':   'nb-pedidos',
    's-resena':           'nb-pedidos',
    's-invitar':          'nb-perfil',
    's-promocionar':      'nb-perfil',
    's-pubs-prestador':   'nb-perfil',
  };
  const all = ['s-home','s-buscar','s-ranking','s-prof','s-publicar','s-miperfil','s-mapa','s-chat','s-chats','s-notif','s-subs','s-analytics','s-pedidos','s-nuevo-pedido','s-detalle-pedido','s-nueva-propuesta','s-confirmacion','s-catalogo','s-ficha-ref','s-catalogo-form','s-edit-perfil','s-estado-propuesta','s-historial','s-tyc','s-loyalty','s-denuncia','s-moderacion','s-loyalty-admin','s-mis-propuestas','s-resena','s-mercado','s-vecinos-portada','s-pub-mercado','s-chat-mercado','s-mis-publicaciones','s-mis-consultas-mkt','s-mis-consultas-enviadas','s-comentarios-pub','s-privacidad','s-mis-alertas',
    's-param-planes','s-param-features','s-param-rubros','s-param-zonas','s-param-niveles','s-param-ajustes','s-servicios-fijos','s-verificaciones','s-parametrias','s-param-banners','s-param-mkt-cats','s-carrito',
    's-invitar','s-prealta','s-promocionar','s-pubs-prestador'];

  function goTo(id) {
    // Bloquear navegación a pantallas de features desactivadas
    if (!isScreenEnabled(id)) {
      console.warn(`[FEATURE FLAG] Pantalla "${id}" desactivada en este nivel.`);
      return;
    }
    // ── Gating: pantallas que requieren cuenta (modo invitado) ──
    const PANTALLA_ACCION = {
      's-mapa':         'mapa',
      's-miperfil':     'miPerfil',
      's-pedidos':      'pedidosZona',
      's-nuevo-pedido': 'publicar',
      's-chat':         'contactar',
      's-chats':        'contactar',
    };
    if (PANTALLA_ACCION[id] && !usuarioActual) {
      mostrarGate(ACCIONES_PROTEGIDAS[PANTALLA_ACCION[id]]);
      return;
    }
    // Gating de pantallas admin: bloquear acceso a no-admins
    const PANTALLAS_ADMIN = ['s-moderacion', 's-loyalty-admin', 's-catalogo', 's-catalogo-form', 's-ficha-ref',
      's-parametrias','s-param-planes','s-param-rubros','s-param-zonas','s-param-niveles',
      's-param-ajustes','s-param-banners','s-param-mkt-cats','s-param-features'];
    if (PANTALLAS_ADMIN.includes(id) && !esAdmin()) {
      console.warn('[ADMIN] Pantalla "' + id + '" requiere rol admin.');
      showToast && showToast('🛡 Esta sección es solo para administradores');
      return;
    }
    all.forEach(s => {
      const el = document.getElementById(s);
      if (el) { el.classList.remove('active'); el.scrollTop = 0; }
    });
    // El scroll que importa no es el de cada .screen (eso ya se resetea
    // arriba) sino el del contenedor compartido .phone: si quedó desplazado
    // por la pantalla anterior, la nueva pantalla activa hereda ese offset
    // y su header puede renderizar fuera del viewport visible.
    const phone = document.querySelector('.phone');
    if (phone) phone.scrollTop = 0;
    const t = document.getElementById(id);
    if (t) { t.classList.add('active'); }
    // Ocultar FAB de WhatsApp en pantallas con input de texto (chat)
    const SIN_FAB = ['s-chat', 's-nueva-propuesta', 's-nuevo-pedido', 's-publicar'];
    const fab = document.getElementById('wa-fab');
    if (fab) fab.style.display = SIN_FAB.includes(id) ? 'none' : '';
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
    const nb = navMap[id];
    if (nb) { const btn = document.getElementById(nb); if(btn) btn.classList.add('active'); }
    // Si va a Publicar, siempre arrancar en paso 1
    if (id === 's-publicar') { pubNext(1); }
    // Si va a Nuevo Pedido, siempre arrancar en paso 1
    // Entrar al alta limpia el destinatario: si viene de recontratar, lo
    // vuelve a setear después de este goTo.
    if (id === 's-nuevo-pedido') { npNext(1); quitarRecontratar(); }
    if (id === 's-mis-publicaciones') { renderMisPublicaciones(); }
    if (id === 's-mis-consultas-mkt') { renderMisConsultasMkt(); }
    if (id === 's-mis-consultas-enviadas') { renderMisConsultasEnviadas(); }
    if (id === 's-mis-alertas') { renderMisAlertas(); }
    // Si va a Mercado, renderizar el feed (sin resetear búsqueda si vuelve desde chat)
    if (id === 's-mercado') {
      const inp = document.getElementById('mkt-buscador');
      if (inp && !mktBusqueda) inp.value = '';
      const sel = document.getElementById('mkt-zona-select');
      if (sel) sel.value = mktZonaActiva || '';
      const alertaRow = document.getElementById('mkt-alerta-row');
      if (alertaRow && !mktBusqueda) alertaRow.style.display = 'none';
      // Asegurarse de que el mapa esté oculto y el feed visible al entrar
      if (mktModo === 'mapa') {
        mktModo = 'lista';
        const mc = document.getElementById('mkt-mapa-cont'); if (mc) mc.style.display = 'none';
        const fd = document.getElementById('mkt-feed'); if (fd) fd.style.display = '';
        const lbl = document.getElementById('mkt-toggle-lbl'); if (lbl) lbl.textContent = 'Mapa';
      }
      // Pedir geolocalización best-effort; si ya la tenemos no volvemos a pedir
      if (!userLat && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            userLat = pos.coords.latitude;
            userLng = pos.coords.longitude;
            renderMercado(); // re-render para mostrar distancias
          },
          () => {} // permiso denegado — silencioso
        );
      }
      renderMercado();
    }
    // Si va a Pedidos, refrescar la lista desde la base de datos
    if (id === 's-pedidos') {
      // Tabs siempre ocultos — el rol lo define el login, no una selección manual
      const tabs = document.getElementById('ped-tabs');
      if (tabs) tabs.style.display = 'none';
      // Mostrar la vista según el rol real
      const vBusco = document.getElementById('pview-busco');
      const vPresto = document.getElementById('pview-presto');
      if (esPrestador()) {
        if (vBusco) vBusco.style.display = 'none';
        if (vPresto) vPresto.style.display = 'block';
        // renderPedidosGuardados() renderiza en #mis-pedidos-guardados, que
        // vive dentro de #pview-busco — oculto para el prestador. O sea que
        // se ejecutaba y su resultado no lo veía nadie. La vista del
        // prestador tiene su propio render.
        // Sólo guarda la marca anterior; pisarla es decisión del render,
        // que es el único que sabe qué se llegó a listar.
        capturarMarcaPedidos();
        // Entrar por la barra inferior limpia los filtros que vienen del
        // tablero; irAPedidosPresto() ya dejó el suyo puesto.
        aplicarModoPresto(pedidosModoPendiente === 'ninguno' ? null : pedidosModoPendiente);
        pedidosModoPendiente = null;
        renderPedidosPresto();
      } else if (!usuarioActual) {
        // Invitado: mostrar CTA para registrarse
        if (vBusco) vBusco.style.display = 'block';
        if (vPresto) vPresto.style.display = 'none';
        const lista = document.getElementById('mis-pedidos-guardados');
        const count = document.getElementById('ped-count');
        if (count) count.textContent = '0 pedidos';
        if (lista) lista.innerHTML = `
          <div style="padding:32px 18px;text-align:center">
            <div style="font-size:48px;margin-bottom:12px">📋</div>
            <div style="font-size:16px;font-weight:700;color:var(--ink);margin-bottom:8px">Publicá tu primer pedido</div>
            <div style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:20px">Creá una cuenta gratis y recibí propuestas de prestadores verificados de tu barrio.</div>
            <button onclick="mostrarFormRegistro()" style="background:var(--blue);color:white;border:none;border-radius:14px;padding:14px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;width:100%">Registrate gratis →</button>
          </div>`;
      } else {
        if (vBusco) vBusco.style.display = 'block';
        if (vPresto) vPresto.style.display = 'none';
        renderPedidosGuardados();
      }
    }
    // Si va a Home, cargar prestadores
    if (id === 's-home') { renderHomeFeed(catActiva || 'todos'); }
    // Si va a Buscar, cargar resultados
    if (id === 's-buscar') { renderBusqueda('', filtroActivo); }
    // Si va a Chats, cargar lista de conversaciones
    // Entrar por la barra inferior arranca sin filtro; irAChats() ya dejó el
    // suyo puesto antes de llamar acá, así que no se pisa.
    if (id === 's-chats') { if (!chatsFiltroPendiente) chatsFiltroPendiente = 'todos'; renderChats(); }
    // Los toggles de configuración se mudaron con las parametrías, así que
    // renderConfigAdmin() se llama desde ahí y no desde moderación.
    if (id === 's-moderacion') { renderModeracion(); renderBannersPendientes(); renderPubsPendientes(); }
    if (id === 's-parametrias') { renderConfigAdmin(); }
    if (id === 's-param-planes')   { renderParamPlanes(); }
    if (id === 's-param-features') { renderParamFeatures(); }
    if (id === 's-param-rubros')   { renderParamRubros(); }
    if (id === 's-param-zonas')    { renderParamZonas(); }
    if (id === 's-param-niveles')  { renderParamNiveles(); }
    if (id === 's-param-ajustes')  { renderParamAjustes(); }
    if (id === 's-servicios-fijos'){ renderServiciosFijos(); }
    if (id === 's-verificaciones') { renderVerificaciones(); }
    if (id === 's-param-banners')  { renderParamBanners(); }
    if (id === 's-param-mkt-cats') { renderParamMktCats(); }
    if (id === 's-carrito')        { renderCarrito(); }
    if (id === 's-loyalty-admin') { renderCanjesPendientes(); renderBeneficiosAdmin(); }
    if (id === 's-loyalty') { renderLoyaltyScreen(); }
    if (id === 's-subs')    { reflejarPlan(); }
    if (id === 's-catalogo') { renderCatalogo(); }
    if (id === 's-historial') { renderHistorial(); }
    if (id === 's-notif') { renderNotificaciones(); }
    if (id === 's-analytics') { aplicarTierEstadisticas(); renderAnalytica(analiticaPeriodo || '30d'); }
    // Si va a Ranking, cargar el ranking dinámico
    if (id === 's-ranking') { renderRanking(rankCatActiva); }
    // Si va a Denuncia, poblar con el prestador actual
    if (id === 's-denuncia' && prestadorActual) {
      const p = prestadorActual;
      const setT = (elid, val) => { const e = document.getElementById(elid); if (e) e.textContent = val; };
      const avEl = document.getElementById('den-av');
      if (avEl) { avEl.textContent = p.iniciales || '?'; if (p.color_bg) avEl.style.background = p.color_bg; if (p.color_text) avEl.style.color = p.color_text; }
      setT('den-nombre', p.nombre || 'Prestador');
      setT('den-rol', (p.rubro || '') + ' · ' + (p.zona || 'Escobar'));
    }
    // Si va al Mapa, cargar prestadores cercanos
    if (id === 's-mapa') { renderMapa(); }
    // Si va a Editar perfil, poblar con datos del usuario
    if (id === 's-miperfil') { refrescarMenuPush(); reflejarPlan(); mostrarBannerPrimerTrabajoPro(); }
    if (id === 's-edit-perfil' && usuarioActual) {
      const partes = (usuarioActual.nombre || '').split(' ');
      const setV = (elid, val) => { const e = document.getElementById(elid); if (e) e.value = val; };
      setV('edit-nombre', partes[0] || '');
      setV('edit-apellido', partes.slice(1).join(' ') || '');
      setV('edit-email', usuarioActual.email || '');
      // Mostrar teléfono formateado
      const telInput = document.getElementById('edit-tel');
      if (telInput) {
        telInput.value = usuarioActual.telefono || '';
        if (telInput.value) formatearTel(telInput);
      }
      cargarEdicionPrestador();
      if (usuarioActual.prestador_id) cargarPortfolioEdit(usuarioActual.prestador_id);
    }
    if (id === 's-prof' && prestadorActual?.id) {
      cargarPortfolioPerfil(prestadorActual.id);
    }
  }

  let catActiva = 'todos';

  // ── Búsqueda en el feed de Inicio (vista vecino) ─────────────────────
  // Filtra en vivo en vez de saltar a otra pantalla. El término va al
  // mismo `busqueda` que ya acepta listarPrestadores(), que busca sobre
  // nombre, rubro y subrubro.
  let busquedaHome = '';
  let _tBusqueda = null;

  function buscarEnHome(valor) {
    busquedaHome = (valor || '').trim();
    const btn = document.getElementById('home-search-clear');
    if (btn) btn.style.display = busquedaHome ? '' : 'none';
    // Debounce: sin esto cada tecla dispara una consulta a Supabase.
    clearTimeout(_tBusqueda);
    _tBusqueda = setTimeout(() => renderHomeFeed(catActiva || 'todos'), 300);
  }
  window.buscarEnHome = buscarEnHome;

  function limpiarBusquedaHome() {
    const inp = document.getElementById('home-search');
    if (inp) { inp.value = ''; inp.focus(); }
    buscarEnHome('');
  }
  window.limpiarBusquedaHome = limpiarBusquedaHome;
  let rankCatActiva = 'electricistas';

  function switchCat(el) {
    document.querySelectorAll('.rank-cat').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    rankCatActiva = el.dataset.cat || 'electricistas';
    renderRanking(rankCatActiva);
  }

  // Renderiza el ranking zonal dinámicamente, ordenado por rating
  async function renderRanking(cat) {
    const wrap = document.getElementById('rank-list');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando ranking...</div>';
    const filtros = {};
    if (cat) filtros.rubro = cat.charAt(0).toUpperCase() + cat.slice(1);
    if (zonaActual) filtros.zona = zonaParaFiltro();
    let prestadores = await PronetDB.listarPrestadores(filtros);
    const _bs = (p) => ((p.rating||0)*(p.resenas||0)+15)/((p.resenas||0)+5);
    prestadores = [...prestadores].sort((a,b) => _bs(b) - _bs(a));
    wrap.innerHTML = '';
    // Actualizar subtítulo con zona
    const sub = document.querySelector('#s-ranking .rank-header p');
    if (sub) sub.textContent = '📍 ' + (zonaActual || 'Escobar') + ' · Actualizado hoy';
    if (prestadores.length === 0) {
      wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">No hay prestadores en esta categoría y zona.</div>';
      return;
    }
    const medallas = ['🥇','🥈','🥉'];
    const medallaBg = ['var(--gold-s)','#F1F5F9','#FEF3C7'];
    const medallaColor = ['var(--gold)','#64748B','#D97706'];
    prestadores.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'rank-item';
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => abrirPerfilPrestador(p));
      const numHTML = i < 3
        ? `<div class="rank-num" style="background:${medallaBg[i]};color:${medallaColor[i]}">${medallas[i]}</div>`
        : `<div class="rank-num" style="background:var(--surface);color:var(--ink3);font-size:13px;font-weight:700">${i+1}</div>`;
      const stars = (p.resenas || 0) > 0 ? estrellasHTML(p.rating, '10px') : '';
      const badge = badgePlanPrestador(p.plan)
        || (p.premium ? '<span style="font-size:10px;color:#B86A00;font-weight:700">⭐ Premium</span>'
        : (p.verificado ? '<span style="font-size:10px;color:#047857;font-weight:700">✓ Verif.</span>' : ''));
      item.innerHTML = `
        ${numHTML}
        <div class="rank-av" style="background:${escHTML(p.color_bg||'#EEF2FF')};color:${escHTML(p.color_text||'#2B5BFF')}">${avatarInner(p)}</div>
        <div class="rank-info">
          <div class="rank-name">${escHTML(p.nombre)} ${badge}</div>
          <div class="rank-sub">${escHTML(p.subrubro || p.rubro || '')}</div>
          <div class="rank-score">
            ${stars ? `<div class="stars">${stars}</div>` : ''}
            <span style="font-size:11px;color:var(--ink3)">${(p.resenas || 0) > 0 ? p.resenas + ' reseñas' : 'Sin reseñas aún'}</span>
          </div>
        </div>
        <div class="rank-right">
          <div class="rank-pts">${(p.resenas || 0) > 0 ? (p.rating || 5).toFixed(1) : '–'}</div>
          <div class="rank-pts-lbl">score</div>
        </div>`;
      wrap.appendChild(item);
    });
  }

  function selectChip(el) {
    document.querySelectorAll('.r-chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    actualizarMapaCobertura();
  }

  function togglePago(el) { el.classList.toggle('on'); }

  // ── Loyalty ──────────────────────────────────────────────────────────
  let ptsDisponibles = 0; // se sincroniza con la DB real en renderLoyaltyScreen()
  const _canjesCatalogoCache = new Map(); // id → item, evita interpolar nombre libre en onclick

  function switchLoyalty(tab) {
    ['ganar','canjear','niveles','planes','historial'].forEach(t => {
      const ltEl = document.getElementById('lt-'+t);
      const lvEl = document.getElementById('lv-'+t);
      if (ltEl) ltEl.classList.toggle('on', t===tab);
      if (lvEl) lvEl.style.display = t===tab ? 'block' : 'none';
    });
  }

  async function canjear(btn, costo, canjeId) {
    const nombre = _canjesCatalogoCache.get(canjeId)?.nombre || 'Beneficio';
    if (ptsDisponibles < costo) {
      btn.textContent = 'Sin pts';
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    btn.textContent = '⏳ Canjeando...';

    // El costo NO se manda: lo lee el servidor del canje. `costo` acá es solo
    // para el chequeo optimista de arriba y el fallback del saldo.
    const res = await PronetDB.canjearPuntos(canjeId).catch(() => ({ ok: false }));
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = 'Canjear';
      showToast && showToast('⚠️ ' + (res.error || 'No se pudo canjear. Revisá tu conexión.'));
      return;
    }

    ptsDisponibles = res.puntos ?? (ptsDisponibles - costo);

    const toast = document.getElementById('canje-confirm');
    if (toast) {
      toast.textContent = '✓ ¡' + nombre + ' activado!';
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }
    // Refresca toda la pantalla (KPIs, nivel, badge, catálogo) para evitar
    // que solo un campo se actualice y el resto quede desincronizado.
    await renderLoyaltyScreen();
  }

  // ── Tutorial Onboarding ───────────────────────────────────────────────
  const TUTORIAL_VECINO = [
    { step:'1 de 5', title:'¡Bienvenido a PRONET! 👋', desc:'Conectamos vecinos con prestadores de confianza en tu barrio. Ranking zonal, precios referenciales y todo sin salir de la app.' },
    { step:'2 de 5', title:'Explorá prestadores 🔍', desc:'Buscá por rubro (electricista, plomero, niñera...) y filtrá por zona. Cada prestador tiene puntaje, reseñas y precio referencial.' },
    { step:'3 de 5', title:'Publicá un pedido 📋', desc:'Describí lo que necesitás, elegí rubro y zona. Los prestadores Pro de tu zona reciben tu pedido y te envían propuestas.' },
    { step:'4 de 5', title:'Compará y elegí 🤝', desc:'Recibís hasta 3 propuestas con precio, plazo y ranking. Compará y elegí al que más te convenza. Todo transparente.' },
    { step:'5 de 5', title:'Calificá y recomendá ⭐', desc:'Después del trabajo, dejá tu reseña. Tu opinión construye el ranking zonal y ayuda a otros vecinos a elegir mejor.' },
  ];
  const TUTORIAL_PRESTADOR = [
    { step:'1 de 6', title:'¡Bienvenido a PRONET! 🔧', desc:'Acá los vecinos de tu zona te encuentran, te contactan y te contratan. Tu reputación es tu mejor herramienta.' },
    { step:'2 de 6', title:'Completá tu perfil 📝', desc:'Agregá foto, descripción, zona y rubros. Un perfil completo genera más confianza y aparece más arriba en el ranking.' },
    { step:'3 de 6', title:'Encontrá pedidos 📬', desc:'Los vecinos publican pedidos en tu zona. Entrá desde el Home, mirá los insights del pedido y decidí si te interesa.' },
    { step:'4 de 6', title:'Enviá propuestas 💰', desc:'Ofertá tu precio y plazo. El algoritmo te posiciona según velocidad de respuesta, precio y ranking. Respondé rápido para estar en el Top.' },
    { step:'5 de 6', title:'Chat y coordinación 💬', desc:'Cuando te eligen, se abre un chat privado para coordinar el trabajo. Podés enviar fotos y marcar el trabajo como terminado.' },
    { step:'6 de 6', title:'Construí tu reputación ⭐', desc:'Cada reseña positiva sube tu ranking zonal. La velocidad de respuesta y la cantidad de trabajos también cuentan. ¡Cada trabajo suma!' },
  ];

  let tutorialStepsActual = TUTORIAL_VECINO;
  let tutorialStep = 0;

  function mostrarTutorial(forzar) {
    if (!FEATURES.tutorialOnboarding) return;
    // Persistencia: no mostrar si ya lo vió (salvo que sea forzado desde Mi Perfil)
    const key = 'pronet_tutorial_visto_' + (usuarioActual?.id || 'anon');
    if (!forzar && localStorage.getItem(key)) return;
    // Elegir steps según rol
    const esPrest = esPrestador();
    tutorialStepsActual = esPrest ? TUTORIAL_PRESTADOR : TUTORIAL_VECINO;
    tutorialStep = 0;
    // Ajustar dots dinámicamente
    const dotsWrap = document.getElementById('tt-dots');
    if (dotsWrap) {
      dotsWrap.innerHTML = '';
      for (let i = 0; i < tutorialStepsActual.length; i++) {
        const dot = document.createElement('div');
        dot.className = 'tt-dot' + (i === 0 ? ' on' : '');
        dotsWrap.appendChild(dot);
      }
    }
    renderTutorialStep();
    document.getElementById('tutorial-overlay').classList.add('show');
  }
  window.mostrarTutorial = mostrarTutorial;

  function renderTutorialStep() {
    const s = tutorialStepsActual[tutorialStep];
    if (!s) return;
    document.getElementById('tt-step').textContent  = 'Paso ' + s.step;
    document.getElementById('tt-title').textContent = s.title;
    document.getElementById('tt-desc').textContent  = s.desc;
    const dots = document.getElementById('tt-dots').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === tutorialStep);
    const btn = document.getElementById('tt-next-btn');
    btn.textContent = tutorialStep === tutorialStepsActual.length - 1 ? '¡Empezar! 🚀' : 'Siguiente →';
  }

  function nextTutorial() {
    if (tutorialStep < tutorialStepsActual.length - 1) {
      tutorialStep++;
      renderTutorialStep();
    } else {
      cerrarTutorial();
    }
  }

  function cerrarTutorial() {
    document.getElementById('tutorial-overlay').classList.remove('show');
    // Marcar como visto
    const key = 'pronet_tutorial_visto_' + (usuarioActual?.id || 'anon');
    localStorage.setItem(key, 'true');
  }

  // ── Historial filter ─────────────────────────────────────────────────
  function filterHist(chip, filtro) {
    document.querySelectorAll('#s-historial .filter-row .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
  }

  // ── Error overlay ────────────────────────────────────────────────────
  function mostrarError() {
    document.getElementById('error-overlay').classList.add('show');
  }
  function cerrarError() {
    document.getElementById('error-overlay').classList.remove('show');
  }

  /** Formatea el teléfono argentino mientras el usuario escribe.
   *  Entrada: cualquier combinación de dígitos y símbolos
   *  Salida: +54 9 11 XXXX-XXXX (celular) o +54 11 XXXX-XXXX (fijo)
   */
  function formatearTel(input) {
    // Extraer solo dígitos
    let digits = input.value.replace(/\D/g, '');
    // Quitar prefijo 54 si viene al principio
    if (digits.startsWith('54')) digits = digits.slice(2);
    // Quitar el 9 de celular si viene después del 54
    const esCelular = digits.startsWith('9');
    if (esCelular) digits = digits.slice(1);
    // Quitar cero inicial de área
    if (digits.startsWith('0')) digits = digits.slice(1);
    // Área: primeros 2-4 dígitos según la longitud total
    let area = '', numero = '';
    if (digits.length <= 8) {
      area = digits.slice(0, 2);
      numero = digits.slice(2);
    } else {
      area = digits.slice(0, 2);
      numero = digits.slice(2, 10);
    }
    // Formatear número con guión en el medio
    let numFmt = numero;
    if (numero.length > 4) numFmt = numero.slice(0, 4) + '-' + numero.slice(4, 8);
    // Armar el resultado
    let result = '+54';
    if (esCelular) result += ' 9';
    if (area) result += ' ' + area;
    if (numFmt) result += ' ' + numFmt;
    input.value = result.trim();
  }

  function setUserTipo(tipo) {
    userTipo = tipo;
    guardarEstado(); // persistir tipo de usuario
    // El selector demo del login fue eliminado — el rol lo define perfiles.tipo en la BD
  }

  function activarHomePrestador() {
    // Mostrar banner de pedidos solo si la bolsa de trabajo está activa (Nivel 2+)
    const pedBanner  = document.getElementById('home-ped-banner');
    const rankBanner = document.getElementById('home-rank-banner');
    if (pedBanner) {
      pedBanner.dataset.prestadorActivo = 'true';
      pedBanner.style.display = FEATURES.bolsaTrabajo ? 'flex' : 'none';
    }
    if (rankBanner) rankBanner.style.display = 'none';
    // Zona pill muestra cobertura del prestador (sin romper el nombre de zona)
    const lbl = document.getElementById('zona-label');
    if (lbl) lbl.textContent = zonaActual || 'Escobar';
    // Cambiar pill color para prestador
    const pill = document.querySelector('.zona-pill');
    if (pill) {
      pill.style.background = 'rgba(57,255,20,.15)';
      pill.style.color = '#39FF14';
    }
    // Nav inferior: ocultar Buscar y Cerca (son para clientes buscando prestadores)
    // El prestador busca pedidos, no otros prestadores
    const nbBuscar = document.getElementById('nb-buscar');
    const nbMapa   = document.getElementById('nb-mercado');
    if (nbBuscar) nbBuscar.style.display = 'none';
    if (nbMapa)   nbMapa.style.display   = 'none';
    // Ocultar botón "Publicar pedido" — los prestadores ofertan, no publican pedidos
    const btnPub = document.getElementById('btn-publicar-pedido');
    if (btnPub) btnPub.style.display = 'none';
    // Pre-filtrar feed por el rubro del prestador
    if (usuarioActual?.rubro) {
      const cat = catDeRubro(usuarioActual.rubro);
      if (cat) {
        catActiva = cat;
        document.querySelectorAll('.rubro').forEach(r => r.classList.remove('on'));
        const chip = document.getElementById('cat-' + cat);
        if (chip) chip.classList.add('on');
      }
    }
  }

  // ── Sistema de denuncias ─────────────────────────────────────────────
  function selDenuncia(el) {
    document.querySelectorAll('.denuncia-tipo').forEach(d => d.classList.remove('on'));
    el.classList.add('on');
  }

  let evidenciaFile = null;

  function addEvidencia() {
    const input = document.getElementById('ev-input');
    if (input) input.click();
  }

  function onEvidenciaChange(input) {
    const file = input.files?.[0];
    if (!file) return;
    evidenciaFile = file;
    const slot = document.getElementById('ev-slot');
    if (slot) {
      const icono = file.type.includes('pdf') ? '📄' : '📷';
      slot.classList.add('filled');
      slot.innerHTML = '<div style="font-size:28px;margin-bottom:8px">' + icono + '</div><div style="font-size:13px;font-weight:600;color:var(--green)">1 archivo adjunto</div><div style="font-size:11px;color:var(--ink3);margin-top:4px">' + escHTML(file.name) + ' · Tocá para cambiar</div>';
    }
  }

  async function enviarDenuncia() {
    // Obtener tipo de denuncia seleccionado
    const tipoEl = document.querySelector('.denuncia-tipo.on .dt-name');
    if (!tipoEl) { showToast && showToast('⚠️ Elegí el tipo de problema'); return; }
    const motivo = tipoEl.textContent.trim();

    // Obtener detalle
    const detalle = (document.getElementById('f-conta-con-el-mayor-detalle-posible')?.value || '').trim();
    if (!detalle) { showToast && showToast('⚠️ Describí lo que ocurrió'); return; }

    // Obtener user_id del prestador denunciado via perfiles
    let denunciadoId = null;
    if (prestadorActual?.id) {
      denunciadoId = await PronetDB.usuarioIdDePrestador(prestadorActual.id).catch(() => null);
    }
    const pedidoId = pedidoActual?.id || null;

    const btn = document.querySelector('#s-denuncia button[onclick="enviarDenuncia()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    // Subir evidencia si hay archivo seleccionado
    let evidenciaUrl = null;
    if (evidenciaFile) {
      showToast && showToast('⏳ Subiendo evidencia...');
      const res = await PronetDB.subirAdjuntoPropuesta(evidenciaFile).catch(() => null);
      if (res) evidenciaUrl = res.url;
    }

    try {
      const result = await PronetDB.crear('denuncias', {
        denunciante_id: usuarioActual.id,
        denunciado_id: denunciadoId,
        pedido_id: pedidoId,
        motivo,
        detalle,
        estado: 'pendiente',
        ...(evidenciaUrl ? { evidencia_url: evidenciaUrl } : {}),
      });
      if (result) {
        const exito = document.getElementById('denuncia-exito');
        if (exito) exito.style.display = 'flex';
        // Resetear formulario
        document.querySelectorAll('.denuncia-tipo').forEach(d => d.classList.remove('on'));
        if (document.getElementById('f-conta-con-el-mayor-detalle-posible'))
          document.getElementById('f-conta-con-el-mayor-detalle-posible').value = '';
        evidenciaFile = null;
        const evSlot = document.getElementById('ev-slot');
        if (evSlot) { evSlot.classList.remove('filled'); evSlot.innerHTML = '<div style="font-size:28px;margin-bottom:8px">📎</div><div style="font-size:13px;font-weight:600;color:var(--ink2)">Tocá para adjuntar</div><div style="font-size:11px;color:var(--ink3);margin-top:4px">Fotos, capturas de conversación, comprobante de pago</div>'; }
        const evInput = document.getElementById('ev-input'); if (evInput) evInput.value = '';
      } else {
        showToast && showToast('❌ Error al enviar la denuncia. Intentá de nuevo.');
      }
    } catch (e) {
      showToast && showToast('❌ Error al enviar la denuncia.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🚨 Enviar denuncia'; }
    }
  }

  function toggleProblemTag(el) {
    el.classList.toggle('on');
    if (el.classList.contains('on')) {
      el.style.borderColor = 'currentColor';
      el.style.opacity = '1';
    } else {
      el.style.borderColor = 'transparent';
      el.style.opacity = '0.6';
    }
  }

  // ── Panel Admin — acceso con PIN desde Mi Perfil ───────────────────
  // Tocar "PRONET v1.0" al final de Mi Perfil → pide PIN → abre admin
  // El PIN se guarda en config_app (Supabase) y se verifica server-side via RPC.

  document.addEventListener('DOMContentLoaded', () => {
    const versionTap = document.getElementById('version-tap');
    if (versionTap) {
      versionTap.addEventListener('click', () => {
        if (!esAdmin()) return;
        const modal = document.getElementById('admin-pin-modal');
        if (modal) {
          modal.style.display = 'flex';
          const inp = document.getElementById('admin-pin-input');
          if (inp) { inp.value = ''; inp.focus(); }
          const err = document.getElementById('admin-pin-error');
          if (err) err.textContent = '';
        }
      });
    }
    // Enter para confirmar PIN
    const pinInp = document.getElementById('admin-pin-input');
    if (pinInp) pinInp.addEventListener('keydown', e => { if (e.key === 'Enter') verificarPin(); });
  });

  async function verificarPin() {
    const inp = document.getElementById('admin-pin-input');
    const err = document.getElementById('admin-pin-error');
    if (!inp) return;

    // Verificar PIN server-side — el valor real nunca viaja al cliente
    if (err) err.textContent = 'Verificando…';
    inp.disabled = true;
    let pinOk = false;
    try {
      const { data, error } = await window._sb.rpc('fn_verificar_pin_admin', { p_pin: inp.value });
      pinOk = data === true && !error;
    } catch (e) { pinOk = false; }
    inp.disabled = false;

    if (!pinOk) {
      if (err) err.textContent = 'Código incorrecto o acceso denegado';
      inp.value = '';
      inp.style.border = '2px solid #EF4444';
      setTimeout(() => { inp.style.border = '2px solid var(--border)'; if (err) err.textContent = ''; }, 1500);
      return;
    }

    cerrarAdminPin();
    abrirAdmin();
  }

  function cerrarAdminPin(ev) {
    if (ev && ev.target && ev.target.id !== 'admin-pin-modal') return;
    const modal = document.getElementById('admin-pin-modal');
    if (modal) modal.style.display = 'none';
  }

  function abrirAdmin() {
    const ov = document.getElementById('admin-overlay');
    if (ov) ov.style.display = 'flex';
  }

  function cerrarAdmin(ev) {
    if (ev && ev.target && ev.target.id !== 'admin-overlay') return;
    const ov = document.getElementById('admin-overlay');
    if (ov) ov.style.display = 'none';
  }

  function toggleDevPanel() {
    abrirAdmin();
  }

  // ═══ RENDERS DINÁMICOS — datos reales desde Supabase ════════════════

  // Genera el HTML de una card de prestador
  // Guarda el prestador actualmente visible en el perfil
  let prestadorActual = null;

  /** Abre el perfil de un prestador poblándolo con sus datos reales */
  function abrirPerfilPrestador(p) {
    prestadorActual = p;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setHTML = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

    const badgeVerif = p.verificado
      ? ' <svg class="verified-badge-lg" viewBox="0 0 18 20" fill="none"><path d="M9 1L2 4v6c0 4.4 3 8.5 7 9.5C13 18.5 16 14.4 16 10V4L9 1z" fill="#39FF14"/><path d="M5.5 10l2.5 2.5 4.5-4.5" stroke="#0D0F1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '';
    const avEl = document.getElementById('prof-av');
    if (avEl) { avEl.innerHTML = avatarInner(p); if (p.color_bg) avEl.style.background = p.color_bg; if (p.color_text) avEl.style.color = p.color_text; }
    setHTML('prof-name', escHTML(p.nombre || 'Prestador') + badgeVerif);
    set('prof-sub', (p.rubro || '') + (p.subrubro ? ' · ' + p.subrubro : ''));
    // Un guión en vez de 5.0 cuando nadie lo calificó: el rating arranca en
    // 5.0 por defecto y mostrarlo como puntaje real es inventarle reputación.
    const conResenas = (p.resenas || 0) > 0;
    set('prof-rating', conResenas ? (p.rating || 5).toFixed(1) : '–');
    set('prof-resenas', p.resenas || 0);
    // Precio visible en stats
    const precioVal = document.getElementById('prof-precio-val');
    const precioLbl = document.getElementById('prof-precio-lbl');
    if (precioVal) precioVal.textContent = '$' + (p.precio || 0).toLocaleString('es-AR');
    if (precioLbl) precioLbl.textContent = '/ ' + (p.precio_unidad || 'visita');
    set('prof-desc', p.descripcion || 'Sin descripción disponible.');

    // Tags dinámicos: premium + especialidades guardadas + cobertura
    const tagsEl = document.getElementById('prof-tags');
    if (tagsEl) {
      const tags = [];
      if (p.premium) tags.push('⭐ Premium');
      (p.especialidades || []).slice(0, PRONET_CONFIG.ESPECIALIDADES_CARD).forEach(e => tags.push(escHTML(e)));
      tags.push('📍 ' + escHTML(p.zona || 'Escobar'));
      tagsEl.innerHTML = tags.map(t => '<div class="prof-tag">' + t + '</div>').join('')
        + (p.verificado ? '<div class="b-verified"><svg width="10" height="11" viewBox="0 0 18 20" fill="none"><path d="M9 1L2 4v6c0 4.4 3 8.5 7 9.5C13 18.5 16 14.4 16 10V4L9 1z" fill="#39FF14"/><path d="M5.5 10l2.5 2.5 4.5-4.5" stroke="#0D0F1A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Verificado</div>' : '');
    }
    // Zona de cobertura dinámica
    const zonaTxt = document.getElementById('prof-zona-txt');
    if (zonaTxt) {
      const partes = [];
      if (p.zona) partes.push(p.zona);
      if (p.radio_cobertura) partes.push('<span style="color:var(--blue)">Radio: ' + escHTML(p.radio_cobertura) + '</span>');
      zonaTxt.innerHTML = partes.length ? partes.join('<br>') : 'No especificada';
    }

    // Chips de pago dinámicos
    const pagosEl = document.getElementById('prof-pagos');
    if (pagosEl) {
      const ICONO_PAGO = { 'Efectivo':'💵', 'Transferencia':'🏦', 'MercadoPago':'📲', 'Tarjeta':'💳', 'QR':'📲' };
      const CLASE_PAGO = { 'Efectivo':'efectivo', 'Transferencia':'transferencia', 'MercadoPago':'qr', 'Tarjeta':'transferencia', 'QR':'qr' };
      pagosEl.innerHTML = (p.medios_pago || ['Efectivo']).map(m =>
        '<div class="pago-chip ' + (CLASE_PAGO[m]||'efectivo') + '">' + (ICONO_PAGO[m]||'💰') + ' ' + escHTML(m) + '</div>'
      ).join('');
    }

    // Badge de suspensión en el perfil
    const suspBadge = document.getElementById('prof-suspendido-badge');
    if (suspBadge) suspBadge.style.display = p.suspendido ? '' : 'none';

    const btn = document.getElementById('prof-contactar');
    if (btn) {
      if (p.suspendido) {
        btn.innerHTML = '🚫 Cuenta suspendida';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.onclick = null;
      } else {
        btn.disabled = false;
        btn.style.opacity = '';
        const precioTexto = p.precio ? ' · $' + p.precio.toLocaleString('es-AR') + '/' + (p.precio_unidad || 'visita') : '';
        btn.innerHTML = '💬 Contactar' + precioTexto;
        btn.onclick = () => {
          if (PronetDB.esRemoto() && p.id) PronetDB.registrarContacto(p.id, 'perfil').catch(() => {});
          openChat(p.id || 'x');
        };
      }
    }
    // Link denuncia: solo para vecinos logueados, no para el propio prestador ni admin
    const denunciaWrap = document.getElementById('prof-denuncia-wrap');
    if (denunciaWrap) {
      const puedenDenunciar = usuarioActual && !esPrestador() && !esAdmin() && FEATURES.denuncias;
      denunciaWrap.style.display = puedenDenunciar ? '' : 'none';
    }

    // Botón reseña: solo si hay trabajo completado sin reseña previa
    const btnResena = document.getElementById('prof-btn-resena');
    if (btnResena) {
      btnResena.style.display = 'none';
      if (usuarioActual && !esPrestador() && PronetDB.esRemoto()) {
        PronetDB.listarMisChats().then(chats => {
          const chatPendiente = chats.find(c =>
            c.prestador_id === p.id &&
            ['terminado_por_vecino','terminado_prestador'].includes(c.estado)
          );
          if (chatPendiente && btnResena) {
            btnResena.style.display = '';
            btnResena.onclick = () => { chatActualId = chatPendiente.id; abrirResena(); };
          }
        }).catch(() => {});
      }
    }
    goTo('s-prof');
    // Registrar vista (async, no bloquea la navegación)
    if (PronetDB.esRemoto() && p.id) {
      // Detectar origen según la pantalla activa antes de s-prof
      const activa = document.querySelector('.screen.active:not(#s-prof)');
      const origenVista = activa?.id === 's-mapa' ? 'mapa' :
                          activa?.id === 's-buscar' ? 'busqueda' :
                          activa?.id === 's-home' ? 'inicio' : 'busqueda';
      PronetDB.registrarVista(p.id, origenVista).catch(() => {});
    }
    // Cargar reseñas reales (async, no bloquea la navegación)
    renderResenasPerfil(p.id);
    // Cargar recomendaciones de vecinos (async)
    if (PronetDB.esRemoto() && p.id) {
      PronetDB.contarRecomendaciones(p.id).then(({ actual }) => {
        const el = document.getElementById('prof-recom');
        if (el) el.textContent = actual || 0;
        // Badge en los tags si tiene al menos 1 recomendación este mes
        const tagsEl = document.getElementById('prof-tags');
        if (tagsEl && actual > 0) {
          const badge = document.createElement('div');
          badge.className = 'prof-tag';
          badge.style.cssText = 'background:#EEF2FF;color:#2B5BFF';
          badge.textContent = '👥 ' + actual + (actual === 1 ? ' recomendación' : ' recomendaciones');
          tagsEl.appendChild(badge);
        }
      }).catch(() => {});
    }
  }

  /** Renderiza las reseñas reales de un prestador en el perfil */
  async function renderResenasPerfil(prestadorId, verTodas) {
    const wrap = document.getElementById('prof-resenas-list');
    if (!wrap) return;
    wrap.innerHTML = '<div style="color:var(--ink3);font-size:13px;padding:12px 0">Cargando reseñas...</div>';
    const resenas = await PronetDB.listarResenas(prestadorId).catch(() => []);
    if (!resenas.length) {
      wrap.innerHTML = '<div style="color:var(--ink3);font-size:13px;padding:12px 0">Todavía no hay reseñas.</div>';
      return;
    }
    const ESTRELLAS = n => '★'.repeat(Math.max(1,Math.min(5,Math.round(n)))) + '☆'.repeat(5 - Math.max(1,Math.min(5,Math.round(n))));
    const hace = ts => {
      if (!ts) return '';
      const hs = Math.floor((Date.now() - new Date(ts).getTime()) / 3600000);
      return hs < 1 ? 'Hace menos de 1h' : hs < 24 ? `Hace ${hs}h` : hs < 168 ? `Hace ${Math.floor(hs/24)}d` : `Hace ${Math.floor(hs/168)}sem`;
    };
    // Parsear tags (comentario puede ser "✓ Puntual, ✓ Prolijo · texto libre")
    const parsear = (r) => {
      const partes = (r.comentario || '').split(' · ');
      const tags = partes[0]?.includes('✓') ? partes[0] : '';
      const texto = tags ? partes.slice(1).join(' · ') : partes.join(' · ');
      return { tags, texto };
    };
    const aMostrar = verTodas ? resenas : resenas.slice(0, PRONET_CONFIG.RESENAS_PREVIEW);
    wrap.innerHTML = aMostrar.map(r => {
      const nombre = r.perfiles?.nombre || 'Vecino';
      const zona = r.perfiles?.zona ? ' · ' + r.perfiles.zona : '';
      const { tags, texto } = parsear(r);
      return `
        <div class="review-card">
          <div class="rev-head">
            <span class="rev-name">${escHTML(nombre + zona)}</span>
            <span class="rev-date">${hace(r.creado)}</span>
          </div>
          <div class="stars" style="margin-bottom:4px;color:#F5A623">${ESTRELLAS(r.puntos)}</div>
          ${tags ? `<div style="font-size:12px;color:var(--ink2);margin-bottom:4px">${escHTML(tags)}</div>` : ''}
          ${texto ? `<div class="rev-txt">${escHTML(texto)}</div>` : ''}
        </div>`;
    }).join('');
    if (!verTodas && resenas.length > PRONET_CONFIG.RESENAS_PREVIEW) {
      wrap.innerHTML += `<div style="text-align:center;font-size:13px;color:var(--blue);padding:8px 0;cursor:pointer" onclick="window.renderResenasPerfil('${prestadorId}', true)">Ver las ${resenas.length} reseñas →</div>`;
    }
  }
  window.renderResenasPerfil = renderResenasPerfil; // expuesta global: el link "Ver todas" la llama desde un onclick inline en el HTML

  /** Las 5 estrellas, llenas hasta el rating. Sólo tiene sentido llamarlo
   *  cuando hay reseñas: sin ellas no se muestran estrellas, ver más abajo. */
  function estrellasHTML(rating, tam) {
    const llenas = Math.round(rating || 5);
    const est = tam ? ` style="font-size:${tam}"` : '';
    return Array(5).fill(0).map((_, i) =>
      `<span class="star${i >= llenas ? ' e' : ''}"${est}>★</span>`).join('');
  }

  function crearCardPrestador(p, onclick) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.addEventListener('click', onclick || (() => abrirPerfilPrestador(p)));

    const badgeVerif = p.verificado
      ? `<svg class="verified-badge" viewBox="0 0 18 20" fill="none"><path d="M9 1L2 4v6c0 4.4 3 8.5 7 9.5C13 18.5 16 14.4 16 10V4L9 1z" fill="#39FF14"/><path d="M5.5 10l2.5 2.5 4.5-4.5" stroke="#0D0F1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    // El badge de plan reemplaza al de "Premium" (campo legacy); si el
    // prestador no tiene un plan con badge, cae al premium viejo.
    const badgePrem = badgePlanPrestador(p.plan) || (p.premium ? '<span class="badge b-prem">⭐ Premium</span>' : '');
    const badgeSusp = p.suspendido ? '<div style="background:#FEE2E2;color:#BE123C;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;margin:6px 0">🚫 Cuenta suspendida</div>' : '';
    // Sin reseñas no se dibujan estrellas. `rating` arranca en 5.0 por
    // defecto, así que la versión anterior mostraba ★★★★★ 5.0 (0) a alguien
    // que nadie calificó nunca — prueba social inventada, que es justo lo
    // que un vecino mira para decidir a quién deja entrar a su casa.
    const califHTML = (p.resenas || 0) > 0
      ? `<div class="stars">${estrellasHTML(p.rating)}</div>` +
        `<span class="rating">${(p.rating || 5).toFixed(1)}</span>` +
        `<span class="reviews">(${p.resenas})</span>`
      : '<span class="reviews">Sin reseñas aún</span>';
    const pagos = (p.medios_pago || ['Efectivo']).map(m => {
      const tipo = m === 'Efectivo' ? 'efectivo' : m === 'QR' ? 'qr' : 'transferencia';
      const ico  = m === 'Efectivo' ? '💵' : m === 'QR' ? '📲' : '🏦';
      return `<div class="pago-chip ${tipo}">${ico} ${m}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="card-top">
        <div class="c-av" style="background:${escHTML(p.color_bg||'#EEF2FF')};color:${escHTML(p.color_text||'#2B5BFF')}">${avatarInner(p)}</div>
        <div class="c-info">
          <div class="c-name">${escHTML(p.nombre)} ${badgeVerif}</div>
          <div class="c-role">${escHTML(p.rubro)}${p.subrubro ? ' · ' + escHTML(p.subrubro) : ''}</div>
          <div class="c-badges">${califHTML}
            ${badgePrem}
          </div>
        </div>
      </div>
      ${badgeSusp}
      ${p.descripcion ? `<div class="c-desc">${escHTML(p.descripcion)}</div>` : ''}
      <div class="c-foot">
        <div class="c-price">$${(p.precio||0).toLocaleString('es-AR')} <span>/ ${p.precio_unidad||'visita'}</span></div>
        <div class="c-zona">📍 ${p.zona||'Escobar'}</div>
      </div>
      <div class="pago-row" style="margin-top:10px">${pagos}</div>`;
    return card;
  }

  // Renderiza el home feed según categoría activa
  // ── Checklist de bienvenida ──────────────────────────────────────────
  const CHECKLIST_VECINO = [
    { id: 'perfil',    label: 'Completá tu perfil',         check: () => !!(usuarioActual?.nombre && usuarioActual?.zona) },
    // listarMios() y no listar(): la pregunta es "¿tengo alguno?", y traer
    // los pedidos de todo el barrio para responderla no escala.
    { id: 'pedido',    label: 'Publicá tu primer pedido',   check: async () => { const p = await PronetDB.listarMios('pedidos').catch(()=>[]); return p.length > 0; } },
    { id: 'elegir',    label: 'Elegí un prestador',         check: async () => { const c = await PronetDB.listarMisChats().catch(()=>[]); return c.some(x=>x.vecino_id===usuarioActual?.id && ['activo','terminado_prestador','terminado_por_vecino','calificado'].includes(x.estado)); } },
    { id: 'resena',    label: 'Dejá tu primera reseña',     check: async () => { const r = await PronetDB.listar('resenas').catch(()=>[]); return r.some(x=>x.vecino_id===usuarioActual?.id); } },
  ];
  const CHECKLIST_PRESTADOR = [
    { id: 'perfil',    label: 'Completá tu perfil',              check: () => !!(usuarioActual?.nombre && usuarioActual?.descripcion) },
    { id: 'propuesta', label: 'Respondé tu primer pedido',       check: async () => { const p = await PronetDB.listar('propuestas').catch(()=>[]); return p.some(x=>x.prestador_id===usuarioActual?.prestador_id); } },
    { id: 'trabajo',   label: 'Completá tu primer trabajo',      check: async () => { const c = await PronetDB.listarMisChats().catch(()=>[]); return c.some(x=>x.prestador_id===usuarioActual?.prestador_id && ['calificado','terminado_por_vecino'].includes(x.estado)); } },
    { id: 'resena',    label: 'Recibí tu primera reseña',        check: async () => { const r = await PronetDB.listar('resenas').catch(()=>[]); return r.some(x=>x.prestador_id===usuarioActual?.prestador_id); } },
  ];
  let _checklistEstados = [];
  let _checklistItems = [];

  async function renderChecklist() {
    if (!FEATURES.tutorialOnboarding || !usuarioActual) return;
    const clKey = 'pronet_checklist_cerrado_' + usuarioActual.id;
    if (localStorage.getItem(clKey)) return;

    const wrap   = document.getElementById('home-checklist');
    const bar    = document.getElementById('home-checklist-bar');
    const label  = document.getElementById('home-checklist-label');
    if (!wrap) return;

    const esPrest = esPrestador();
    _checklistItems = esPrest ? CHECKLIST_PRESTADOR : CHECKLIST_VECINO;

    _checklistEstados = await Promise.all(_checklistItems.map(async item => {
      try { const r = item.check(); return r instanceof Promise ? await r : r; } catch(e) { return false; }
    }));

    const completados = _checklistEstados.filter(Boolean).length;
    const total = _checklistItems.length;

    if (completados === total) {
      wrap.style.display = 'none';
      localStorage.setItem(clKey, 'true');
      return;
    }

    if (label) label.textContent = completados + '/' + total + ' pasos completados';
    if (bar) bar.style.width = Math.round(completados / total * 100) + '%';
    wrap.style.display = 'block';
  }

  function abrirChecklistModal() {
    const modal = document.getElementById('checklist-modal');
    const itemsWrap = document.getElementById('checklist-modal-items');
    if (!modal || !itemsWrap) return;

    itemsWrap.innerHTML = _checklistItems.map((item, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:${i < _checklistItems.length-1 ? '1px solid var(--border)' : 'none'}">
        <div style="width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;
          ${_checklistEstados[i] ? 'background:#16A34A;color:white' : 'background:var(--blue-s);color:var(--blue)'}">
          ${_checklistEstados[i] ? '✓' : (i+1)}
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:${_checklistEstados[i] ? 'var(--ink3)' : 'var(--ink)'};${_checklistEstados[i] ? 'text-decoration:line-through' : ''}">${item.label}</div>
        </div>
        ${!_checklistEstados[i] ? `<button onclick="cerrarChecklistModal();irAChecklistItem('${item.id}')" style="background:var(--blue);color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Ir →</button>` : ''}
      </div>
    `).join('');

    modal.style.display = 'flex';
  }
  window.abrirChecklistModal = abrirChecklistModal;

  function cerrarChecklistModal() {
    const modal = document.getElementById('checklist-modal');
    if (modal) modal.style.display = 'none';
  }
  window.cerrarChecklistModal = cerrarChecklistModal;

  function cerrarChecklist() {
    const wrap = document.getElementById('home-checklist');
    if (wrap) wrap.style.display = 'none';
    if (!usuarioActual) return;
    localStorage.setItem('pronet_checklist_cerrado_' + usuarioActual.id, 'true');
  }
  window.cerrarChecklist = cerrarChecklist;

  function irAChecklistItem(id) {
    const esPrest = esPrestador();
    if (id === 'perfil')     goTo('s-miperfil');
    if (id === 'pedido')     goTo('s-pedidos');
    if (id === 'elegir')     goTo('s-pedidos');
    if (id === 'propuesta')  goTo('s-mis-propuestas');
    if (id === 'trabajo')    goTo('s-mis-propuestas');
    if (id === 'resena')     goTo(esPrest ? 's-miperfil' : 's-pedidos');
  }
  window.irAChecklistItem = irAChecklistItem;

  // ── Catálogo único de rubros ────────────────────────────────────────
  //
  // Había TRES listas escritas a mano en el HTML y cada una omitía un
  // rubro distinto: los chips de Inicio no tenían Chef, el filtro de Mis
  // pedidos no tenía Pintura, y sólo Publicar pedido estaba completa.
  // Resultado: se podía publicar un pedido de Chef y después no encontrar
  // chefs desde Inicio, o publicar uno de Pintura y no poder filtrarlo en
  // la propia lista. Ya había pasado antes con Plomería y Pintura.
  //
  // Ahora las tres se generan de acá. Agregar un rubro es agregar una
  // entrada; no hay forma de que una pantalla quede atrás.
  //
  // `slug` es el id del chip (sin tildes, va en la URL y en los onclick) y
  // `n` el nombre real guardado en la base — no se pueden derivar uno del
  // otro: 'jardineria' capitalizado da 'Jardineria', no 'Jardinería'.
  const RUBROS = [
    { n: 'Limpieza',      slug: 'limpieza',      emoji: '🧹', bg: '#FFF8EC', color: '#C67D00',
      svg: '<path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/>' },
    { n: 'Cuidado',       slug: 'cuidado',       emoji: '👶', bg: '#FFF1F2', color: '#E11D48',
      svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
    { n: 'Mascotas',      slug: 'mascotas',      emoji: '🐶', bg: '#EEF2FF', color: '#2B5BFF',
      svg: '<path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306"/>' },
    { n: 'Electricistas', slug: 'electricistas', emoji: '⚡', bg: '#ECFDF5', color: '#059669',
      svg: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>' },
    { n: 'Jardinería',    slug: 'jardineria',    emoji: '🌿', bg: '#F0FDF4', color: '#16A34A',
      svg: '<path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M12 3a4 4 0 0 1 0 8"/><path d="M12 3a4 4 0 0 0 0 8"/>' },
    { n: 'Plomería',      slug: 'plomeria',      emoji: '🔧', bg: '#EFF6FF', color: '#1D4ED8',
      svg: '<path d="M12 2v6m0 0c-2 0-4 1-4 4v8h8v-8c0-3-2-4-4-4z"/><path d="M9 18h6"/><circle cx="12" cy="2" r="1"/>' },
    { n: 'Pintura',       slug: 'pintura',       emoji: '🎨', bg: '#FFF7ED', color: '#EA580C',
      svg: '<path d="M2 13.5V20h4l9.5-9.5-4-4L2 16"/><path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L16 7l-3-3 1.5-1.5z"/><path d="M20 19c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.5 2-4 2-4s2 2.5 2 4z"/>' },
    { n: 'Chef',          slug: 'chef',          emoji: '🍳', bg: '#FEF2F2', color: '#DC2626',
      svg: '<path d="M6 13h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6z"/><path d="M7 13a5 5 0 0 1 .6-8.9A3 3 0 0 1 12 3a3 3 0 0 1 4.4 1.1A5 5 0 0 1 17 13"/>' },
  ];

  const RUBRO_POR_SLUG = Object.fromEntries(RUBROS.map(r => [r.slug, r]));
  function rubroDeCat(cat) {
    return RUBRO_POR_SLUG[cat]?.n || (cat.charAt(0).toUpperCase() + cat.slice(1));
  }
  /** Inverso de rubroDeCat — el slug de categoría para un rubro guardado.
   *  Sale del catálogo y no del DOM: antes recorría los chips renderizados,
   *  así que devolvía null si se lo llamaba antes de que existieran. */
  function catDeRubro(rubro) {
    if (!rubro) return null;
    const norm = r => (r || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return RUBROS.find(r => norm(r.n) === norm(rubro))?.slug || null;
  }

  /** Reemplaza el catálogo local con el de la base y repinta.
   *
   *  `RUBROS` en el código pasa a ser el RESPALDO: si la consulta falla o
   *  la app abre sin conexión, los chips igual se dibujan. Es el mismo
   *  criterio que ya usaban los planes con `planes_limites`.
   *
   *  De paso alimenta los rangos de precio y las especialidades, que vivían
   *  en dos objetos aparte indexados por NOMBRE de rubro — con eso, agregar
   *  un rubro desde el panel lo dejaba sin rango y sin especialidades. */
  async function cargarRubrosDeLaBase() {
    const filas = await PronetDB.listarRubros(true).catch(() => []);
    if (!filas.length) return false;   // sin datos: se queda el respaldo

    RUBROS.splice(0, RUBROS.length, ...filas.map(r => ({
      n: r.nombre, slug: r.slug, emoji: r.emoji,
      bg: r.bg, color: r.color, svg: r.svg || '',
    })));
    Object.keys(RUBRO_POR_SLUG).forEach(k => delete RUBRO_POR_SLUG[k]);
    RUBROS.forEach(r => { RUBRO_POR_SLUG[r.slug] = r; });

    filas.forEach(r => {
      if (window.PRONET_CONFIG?.SLIDER_RANGOS) {
        window.PRONET_CONFIG.SLIDER_RANGOS[r.nombre] = { min: r.precio_min, max: r.precio_max };
      }
      if (r.especialidades?.length) ESPECIALIDADES_POR_RUBRO[r.nombre] = r.especialidades;
    });

    pintarRubros();
    return true;
  }

  /** Pinta las tres listas de rubros desde el catálogo. Se llama una vez al
   *  arrancar; el HTML sólo aporta los contenedores vacíos. */
  function pintarRubros() {
    const chips = document.querySelector('.rubros');
    if (chips) {
      const ico = (bg, color, svg) =>
        '<div class="rubro-icon" style="background:' + bg + '">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8">' + svg + '</svg></div>';
      chips.innerHTML =
        '<div class="rubro on" id="cat-todos" onclick="filtrarCategoria(\'todos\',this)">' +
          ico('#EEF2FF', '#2B5BFF', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>') +
          '<span>Todos</span></div>' +
        RUBROS.map(r =>
          '<div class="rubro" id="cat-' + r.slug + '" onclick="filtrarCategoria(\'' + r.slug + '\',this)">' +
          ico(r.bg, r.color, r.svg) + '<span>' + escHTML(r.n) + '</span></div>'
        ).join('');
    }

    const filtroMis = document.getElementById('ped-filter-chips');
    if (filtroMis) {
      filtroMis.innerHTML =
        '<div class="chip on" data-filtro="todos" onclick="filtrarMisPedidos(this,\'todos\')">📋 Todos</div>' +
        RUBROS.map(r =>
          '<div class="chip" data-filtro="' + escHTML(r.n) + '" onclick="filtrarMisPedidos(this,\'' + escHTML(r.n) + '\')">' +
          r.emoji + ' ' + escHTML(r.n) + '</div>'
        ).join('');
    }

    // Las dos grillas de rubro: la del vecino al publicar un pedido y la del
    // prestador al darse de alta. La segunda decía "Electricista" en
    // singular y "Chef / Catering", y el alta guarda el label TAL CUAL — un
    // prestador que entrara por ahí quedaba con un rubro que no coincide con
    // ningún pedido ni con ningún filtro, invisible sin que nada falle. Es
    // el mismo problema que 'General', por otra puerta.
    const grillas = [
      { id: 'np-rubro-opts',  onclick: r => "selFormOpt(this,'#np-rubro-opts')" },
      { id: 'pub-rubro-opts', onclick: r => 'selPubRubro(this)' },
    ];
    for (const g of grillas) {
      const cont = document.getElementById(g.id);
      if (!cont) continue;
      cont.innerHTML = RUBROS.map((r, i) =>
        '<div class="form-opt' + (i === 0 ? ' on' : '') + '" onclick="' + g.onclick(r) + '">' +
        '<div class="opt-icon">' + r.emoji + '</div><div class="opt-lbl">' + escHTML(r.n) + '</div></div>'
      ).join('');
    }
  }

  async function renderHomeFeed(cat) {
    const wrap = document.getElementById('home-feed-container');
    if (!wrap) return;
    setBannerContextual();
    pintarBanners();   // Carrusel de publicidad (sirve para vecino y prestador)
    renderChecklist(); // Checklist de primeros pasos

    // ── Vista PRESTADOR: tablero de actividad, no un listado ──
    // Antes Inicio repetía el mismo listado de pedidos que la pantalla
    // Pedidos: dos entradas del nav al mismo contenido. Ahora Inicio
    // responde "¿tengo algo pendiente?" y Pedidos "¿dónde consigo
    // trabajo?". El listado vive sólo en Pedidos.
    if (esPrestador()) {
      cromoHomePrestador(true);
      return renderInicioPrestador();
    }
    cromoHomePrestador(false);

    // ── Vista CLIENTE / INVITADO: mostrar prestadores para contratar ──
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    // Al buscar se IGNORA la categoría activa: buscar "plomero" con el chip
    // Electricistas puesto devolvía cero y el rótulo decía "Resultados para
    // plomero" sin nombrar el rubro — el texto mentía sobre lo que filtraba.
    // Una búsqueda explícita gana sobre un chip que quedó de antes.
    const filtros = {};
    if (!busquedaHome && cat && cat !== 'todos') filtros.rubro = rubroDeCat(cat);
    if (zonaActual) filtros.zona = zonaParaFiltro();
    if (busquedaHome) filtros.busqueda = busquedaHome;
    let prestadores = await PronetDB.listarPrestadores(filtros);
    // Score Bayesiano: evita que un prestador con 0 reseñas (rating 5.0 por default)
    // le gane a alguien con historial real. M=3.0 (prior neutro), C=5 (peso mínimo).
    const _bayScore   = (p) => ((p.rating || 0) * (p.resenas || 0) + 15) / ((p.resenas || 0) + 5);
    const _boostPro    = window.PRONET_CONFIG?.BOOST_PRO     || 1.4;
    const _boostDePlan = (p) => {
      const des = p.plan ? getPlanConfig(p.plan).desempate : false;
      if (des || p.premium)  return _boostPro;
      return 1.0;
    };
    prestadores = prestadores
      .map(p => ({ ...p, _score: _bayScore(p) * _boostDePlan(p) }))
      .sort((a, b) => b._score - a._score);
    wrap.innerHTML = '';
    // Actualizar meta con conteo real
    const meta = document.getElementById('home-cat-meta');
    const catLabel = cat && cat !== 'todos' ? rubroDeCat(cat) : 'Todos los servicios';
    if (meta) {
      meta.textContent = (busquedaHome ? 'Resultados para “' + busquedaHome + '”' : catLabel)
        + ' · ' + (zonaActual || 'Escobar') + ' · '
        + prestadores.length + ' prestador' + (prestadores.length !== 1 ? 'es' : '');
    }
    if (prestadores.length === 0) {
      // El mensaje tiene que nombrar el motivo real: decir "no hay en esta
      // categoría" cuando en verdad no hubo coincidencias de búsqueda manda
      // al usuario a cambiar el filtro equivocado.
      const msg = busquedaHome
        ? 'Sin resultados para <strong>' + escHTML(busquedaHome) + '</strong> en ' + escHTML(zonaActual || 'tu zona') + '.<br>Probá con otra palabra o cambiá de zona.'
        : 'No hay prestadores en esta categoría aún.';
      wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3);line-height:1.6">' + msg + '</div>';
      return;
    }
    prestadores.forEach(p => wrap.appendChild(crearCardPrestador(p)));
  }

  // Acá vivía "Hay N vecinos buscando servicios en…", que se quitó el
  // 2026-08-09 el mismo día que se agregó. El dato era correcto pero estaba
  // apuntado al lector equivocado: a un vecino no le sirve saber cuántos
  // otros buscan lo mismo —si acaso, es competencia por los mismos
  // prestadores—. A quien le diría algo es al prestador, que es justo quien
  // no lo veía porque ve los pedidos de verdad.
  //
  // El RPC contar_pedidos_activos() queda en la base: devuelve sólo un
  // número y no expone nada, por si más adelante se muestra en otro lado.

  /** Compara rubros ignorando singular/plural y mayúsculas */
  function matchRubro(rubroA, rubroB) {
    if (!rubroA || !rubroB) return false;
    const a = rubroA.toLowerCase().replace(/s$/, '');
    const b = rubroB.toLowerCase().replace(/s$/, '');
    return a === b;
  }

  // Renderiza pedidos disponibles (vista prestador), filtrados por zona y rubro
  /** Muestra u oculta el cromo del Inicio que sólo aplica a la vista de
   *  vecino (chips de rubro, cabecera del feed, banda de urgencias y el
   *  banner contextual). Para prestador el tablero los reemplaza. */
  /** Reubica el checklist de primeros pasos dentro del tablero.
   *
   *  En el DOM vive arriba de todo, que para un prestador que ya opera es
   *  el lugar más valioso de la pantalla y se lo lleva por delante a
   *  "Te esperan". Se mueve el NODO (no se re-dibuja) para no duplicar la
   *  lógica de renderChecklist ni sus estados. */
  let _hogarChecklist = null;
  function moverChecklist(slotId) {
    const cl = document.getElementById('home-checklist');
    if (!cl) return;
    if (!_hogarChecklist) _hogarChecklist = { padre: cl.parentNode, sig: cl.nextSibling };
    if (slotId) {
      const slot = document.getElementById(slotId);
      if (slot) slot.appendChild(cl);
    } else if (_hogarChecklist.padre) {
      _hogarChecklist.padre.insertBefore(cl, _hogarChecklist.sig);
    }
  }

  function cromoHomePrestador(esTablero) {
    if (!esTablero) moverChecklist(null); // vecino: vuelve a su lugar original
    const v = esTablero ? 'none' : '';
    // `home-banner` y `home-urgencias` ya NO están en esta lista: pasaron a
    // ser slides del carrusel y quedan ocultos para todos. Estaban acá con
    // `display = ''`, que le borraba el `none` del HTML y los volvía a
    // mostrar apilados encima del carrusel — duplicados.
    const el = document.getElementById('home-cat-header');
    if (el) el.style.display = v;
    // Buscador: el prestador no busca prestadores, filtra pedidos — y eso
    // vive en la pantalla Pedidos. Se le libera esa franja.
    const barra = document.getElementById('home-search-bar');
    if (barra) barra.style.display = v;
    // Chips de rubro y su rótulo "Categorías", que no tiene id propio.
    const chips = document.querySelector('#s-home .rubros');
    if (chips) chips.style.display = v;
    const rotulo = chips && chips.previousElementSibling;
    if (rotulo && rotulo.classList.contains('sec-label')) rotulo.style.display = v;
  }

  /** Tablero de Inicio del prestador: qué necesita su atención hoy.
   *
   *  Todo sale de datos que ya existen — chats, propuestas, ranking,
   *  analítica y cupo del plan. La gracia no es calcular nada nuevo sino
   *  traer al frente lo que hoy está enterrado a dos toques dentro de
   *  Mi Perfil.
   *
   *  El bloque "Te esperan" se OMITE cuando no hay nada pendiente, en vez
   *  de mostrar una caja vacía: con la app recién arrancando ese va a ser
   *  el caso habitual, y una caja vacía es peor que no tenerla. */
  // Generación del render: dos llamadas concurrentes (navegar rápido entre
  // Inicio y Pedidos) se pisaban entre sí. La vieja terminaba DESPUÉS de la
  // nueva, reescribía el innerHTML y metía el checklist en su propio slot;
  // el innerHTML de la nueva lo destruía y el nodo se perdía hasta recargar.
  // Cada render toma un número y se retira si dejó de ser el vigente.
  let _genInicio = 0;

  /** Fecha desde la que se cuentan los pedidos "nuevos" para el prestador.
   *
   *  Por dispositivo (localStorage), que para un contador de novedades
   *  alcanza y no agrega una tabla ni una escritura por visita.
   *
   *  La primera vez NO devuelve el principio de los tiempos: eso mostraría
   *  "23 pedidos nuevos" a alguien que recién entra, que es ruido y no una
   *  novedad. Se sella el momento actual y se empieza a contar desde ahí. */
  function claveVistos() {
    return 'pronet_pedidos_vistos_' + (usuarioActual?.id || 'anon');
  }

  // ── Reseñas nuevas ──────────────────────────────────────────────────
  // Mismo mecanismo que los pedidos vistos: una reseña no se "abre", así
  // que se guarda cuándo fue la última vez que miró sus reseñas y se
  // cuentan las posteriores. Es el único indicador de buena noticia junto
  // a "te eligieron", y hasta ahora una reseña nueva no avisaba nada.
  function claveResenasVistas() {
    return 'pronet_resenas_vistas_' + (usuarioActual?.id || 'anon');
  }
  function marcaResenasVistas() {
    const guardada = localStorage.getItem(claveResenasVistas());
    if (guardada) return new Date(guardada);
    const ahora = new Date();
    localStorage.setItem(claveResenasVistas(), ahora.toISOString());
    return ahora;
  }
  function marcarResenasComoVistas() {
    if (usuarioActual) localStorage.setItem(claveResenasVistas(), new Date().toISOString());
  }
  function marcaPedidosVistos() {
    const guardada = localStorage.getItem(claveVistos());
    if (guardada) return new Date(guardada);
    const ahora = new Date();
    localStorage.setItem(claveVistos(), ahora.toISOString());
    return ahora;
  }
  // Marca anterior a la visita actual. Entrar a Pedidos pisa la marca con
  // "ahora", así que sin esta copia el chip "Nuevos" se quedaría sin
  // referencia justo en el momento en que el prestador lo va a usar: llega
  // desde el indicador "3 pedidos nuevos" y encuentra cero.
  let _marcaPedidosPrevia = null;
  /** Guarda la marca anterior SIN pisarla. Va al entrar a la pantalla. */
  function capturarMarcaPedidos() {
    if (!usuarioActual) return;
    const previa = localStorage.getItem(claveVistos());
    _marcaPedidosPrevia = previa ? new Date(previa) : null;
  }
  /** Pisa la marca: de acá en adelante nada es "nuevo". Va DESPUÉS de
   *  renderizar, y sólo si lo que se listó incluye todo lo nuevo. */
  function marcarPedidosComoVistos() {
    if (usuarioActual) localStorage.setItem(claveVistos(), new Date().toISOString());
  }

  async function renderInicioPrestador() {
    const gen = ++_genInicio;
    const wrap = document.getElementById('home-feed-container');
    if (!wrap) return;
    // Rescatar el checklist ANTES de pisar el innerHTML: si quedó dentro
    // del slot de un render anterior, este innerHTML lo destruiría.
    moverChecklist(null);
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const pid = usuarioActual?.prestador_id || null;
    // El rubro NO está en usuarioActual: mi_perfil() devuelve la fila de
    // `perfiles`, y el rubro vive en `prestadores`. Hay que traer la ficha
    // aparte, igual que hace el ranking de Mi Perfil.
    const ficha = pid ? await PronetDB.obtener('prestadores', pid).catch(() => null) : null;
    // 'General' es el rubro por DEFECTO que pone handle_new_user cuando el
    // alta no trae uno — lo tienen 4 de los 11 prestadores. No matchea
    // ningún pedido, así que tratarlo como rubro real dejaba el tablero
    // vacío y el filtro "Mi rubro" sin resultados.
    // Se lo trata como "sin rubro definido": se muestran todos los de la
    // zona. Ver de más es mejor que no ver nada.
    const rubroFicha = ficha?.rubro || '';
    const rubro = /^general$/i.test(rubroFicha.trim()) ? '' : rubroFicha;

    const [chats, sinLeerPorChat, cupo, analitica, ranking, feed, misPropuestas, resenasNuevas] = await Promise.all([
      PronetDB.listarChats().catch(() => []),
      // Desglose por chat, no el total de mensajes: ver más abajo por qué.
      PronetDB.noLeidosPorChat().catch(() => ({})),
      puedeEnviarPropuesta().catch(() => ({ ok: true })),
      PronetDB.obtenerAnalitica().catch(() => null),
      pid
        ? PronetDB.obtenerPosicionPrestador(pid).catch(() => null)
        : Promise.resolve(null),
      PronetDB.listarPedidosDisponibles({
        zonas: zonasDelFiltro(),
        excluirUsuario: usuarioActual?.id || null,
        miPrestadorId: usuarioActual?.prestador_id || null,
      }).catch(() => ({ pedidos: [], total: 0 })),
      // Las propuestas propias, con su estado. Alimentan dos cosas: el
      // contador de "esperando respuesta" y la exclusión de los pedidos
      // donde ya oferté (más abajo). Antes eran dos consultas.
      pid && window._sb
        ? window._sb.from('propuestas').select('pedido_id, estado').eq('prestador_id', pid)
            .then(r => r.data || []).catch(() => [])
        : Promise.resolve([]),
      pid ? PronetDB.contarResenasNuevas(pid, marcaResenasVistas()).catch(() => 0)
          : Promise.resolve(0),
    ]);
    if (gen !== _genInicio) return; // llegó un render más nuevo

    // ── Pendientes ──
    // Los estados salen del mismo mapa que usa la pantalla de estado de
    // propuesta (ESTADOS, ~línea 9230). 'activo' NO es "para cerrar": ahí
    // la app dice "¡Te eligieron! Trabajo en curso". Etiquetarlo como
    // tarea pendiente convertía el mejor momento del prestador —ganar el
    // trabajo— en un mandado.
    const mios = chats.filter(c => c.prestador_id === pid);

    // Cada indicador cuenta la COSA que nombra, no las filas de chat que la
    // representan. Dos chats sobre el mismo pedido son un solo trabajo, y el
    // mismo vecino consultando por dos pedidos es un solo vecino. Contando
    // filas, el tablero decía "2 trabajos en curso" para un único trabajo.
    // Los chats sin pedido (chat directo) valen por sí mismos: no hay pedido
    // que los agrupe, así que la clave cae en su propio id.
    const distintos = (lista, campo) =>
      new Set(lista.map(c => c[campo] || ('chat:' + c.id))).size;

    const porEstado = est => mios.filter(c => est.includes(c.estado));
    const elegido    = distintos(porEstado(['activo', 'elegida']), 'pedido_id');
    const paraCerrar = distintos(porEstado(['terminado_por_vecino']), 'pedido_id');
    const enConsulta = distintos(porEstado(['consulta']), 'vecino_id');
    // Se cuentan CONVERSACIONES, no mensajes. "4 mensajes sin leer" puede ser
    // una sola charla de cuatro líneas: el número no decía cuántas cosas hay
    // que abrir, que es la única pregunta que el prestador se hace acá.
    // El resto del tablero ya cuenta cosas que se atienden de a una (trabajos,
    // propuestas, pedidos) — contar mensajes era la excepción.
    const chatsSinLeer = Object.values(sinLeerPorChat).filter(n => n > 0).length;
    // "Esperando respuesta" se cuenta sobre PROPUESTAS, no sobre chats: una
    // propuesta puede no tener chat abierto, así que contar chats daba un
    // número menor al de la pantalla a la que lleva el indicador (decía 3 y
    // "Mis propuestas" listaba 10). La fuente de verdad es propuestas.estado.
    const enEspera   = misPropuestas.filter(pr => pr.estado === 'pendiente').length;

    // Orden deliberado: primero lo que es una buena noticia y exige
    // reaccionar (te eligieron), después lo que espera acción, y al final
    // lo informativo.
    const items = [];
    // Cada acción deja la pantalla destino FILTRADA por lo que dice el
    // indicador. Mandar a la lista completa obligaba a volver a buscar a
    // mano lo que el tablero acababa de señalar.
    if (elegido > 0)    items.push({ ic:'🟢', txt: '¡Te eligieron! ' + elegido + ' trabajo' + (elegido>1?'s':'') + ' en curso', accion: "irAChats('activo')" });
    if (resenasNuevas > 0) items.push({ ic:'⭐', txt: resenasNuevas === 1 ? '1 reseña nueva' : resenasNuevas + ' reseñas nuevas', accion: 'verResenasNuevas()' });
    if (chatsSinLeer > 0) items.push({ ic:'💬', txt: chatsSinLeer === 1 ? '1 conversación sin leer' : chatsSinLeer + ' conversaciones sin leer', accion: "irAChats('no_leidos')" });
    if (paraCerrar > 0) items.push({ ic:'🏁', txt: paraCerrar + ' trabajo' + (paraCerrar>1?'s':'') + ' para cerrar', accion: "irAChats('terminado_por_vecino')" });
    if (enConsulta > 0) items.push({ ic:'💭', txt: enConsulta + ' vecino' + (enConsulta>1?'s':'') + ' consultando', accion: "irAChats('consulta')" });
    if (enEspera > 0)   items.push({ ic:'🕐', txt: enEspera + ' propuesta' + (enEspera>1?'s':'') + ' esperando respuesta', accion: "abrirMisPropuestas('pendiente')" });

    // ── Pedidos disponibles de su zona ──
    // Base de los indicadores, del total del acceso a Pedidos y del relleno
    // cuando no hay pendientes. Ya viene filtrado por el servidor (abierto,
    // de la zona, sin los propios); NO se filtra por rubro, que es el filtro
    // fino de la pantalla Pedidos.
    //
    // `total` es el count real del servidor. Los indicadores se calculan
    // sobre el array, que está topeado en 200: si alguna vez una zona
    // superara ese número, los contadores quedarían cortos y hay que pasar a
    // contar con un RPC en vez de sobre las filas.
    const disponibles = feed.pedidos;
    const totalDisponibles = feed.total;
    // Los del rubro propio primero; dentro de cada grupo, los más nuevos.
    // Sólo se usan cuando el tablero no tiene nada pendiente que mostrar.
    const recientes = disponibles.slice().sort((a, b) => {
      const ra = rubro && matchRubro(a.rubro, rubro) ? 0 : 1;
      const rb = rubro && matchRubro(b.rubro, rubro) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return new Date(b.creado || 0) - new Date(a.creado || 0);
    }).slice(0, 3);

    // ── Pedidos de mi rubro por vencer sin mi propuesta ──
    // El más accionable de todos: el pedido existe, es de su rubro, tiene
    // reloj corriendo y él todavía no ofertó. Si no aparece acá, se entera
    // cuando ya cerró.
    if (pid) {
      const HS = window.PRONET_CONFIG?.PROPUESTA_EXPIRACION_HS || 72;
      const UMBRAL_HS = 24; // "por vencer" = le queda menos de un día
      const ahora = Date.now();

      // Pedidos donde YA oferté: se excluyen. Salen de misPropuestas, que ya
      // vino en el Promise.all de arriba.
      const yaOferte = new Set(misPropuestas.map(pr => pr.pedido_id));

      const porVencer = disponibles.filter(p => {
        if (rubro && !matchRubro(p.rubro, rubro)) return false;
        if (yaOferte.has(p.id)) return false;
        if (!p.creado) return false;
        const vence = p.expira_en ? new Date(p.expira_en)
                                  : new Date(new Date(p.creado).getTime() + HS * 3600000);
        const restan = (vence - ahora) / 3600000;
        return restan > 0 && restan <= UMBRAL_HS;
      }).length;

      if (porVencer > 0) {
        items.push({
          ic: '⏳',
          txt: porVencer + (porVencer > 1 ? ' pedidos vencen' : ' pedido vence') + ' pronto sin tu propuesta',
          accion: "irAPedidosPresto('porVencer')",
        });
      }
    }

    // ── Pedidos de mi rubro que todavía no vi ──
    // Los mensajes traen leído/no leído de la base; los pedidos no —
    // nadie "abre" un pedido. Se guarda la fecha de la última visita a la
    // pantalla Pedidos y se cuentan los posteriores. Va en "Te esperan"
    // porque un pedido nuevo del rubro propio vence en 72hs: es una
    // oportunidad con reloj, no una novedad decorativa.
    {
      const desde = marcaPedidosVistos();
      const sinVer = disponibles.filter(p =>
        (!rubro || matchRubro(p.rubro, rubro)) && p.creado && new Date(p.creado) > desde
      ).length;
      if (sinVer > 0) {
        items.push({
          ic: '💼',
          // Sin rubro definido el texto no puede decir "de tu rubro".
          txt: sinVer + ' pedido' + (sinVer > 1 ? 's' : '') + ' nuevo' + (sinVer > 1 ? 's' : '') +
               (rubro ? ' de tu rubro' : ' en tu zona'),
          accion: "irAPedidosPresto('nuevos')",
        });
      }
    }

    // ── Números del mes ──
    const vistas = analitica?.vistas_mes ?? 0;
    const posTxt = ranking?.pos_zona ? '#' + ranking.pos_zona : '—';
    const cupoTxt = cupo.limite == null ? '∞' : (cupo.usadas ?? 0) + '/' + cupo.limite;
    // El bloque azul muestra LOGROS, no gestión: "1/10 propuestas" es un
    // límite administrativo del plan, no algo de lo que enorgullecerse. El
    // cupo se movió a Mi analítica, donde vive el resto de lo operativo.
    const nResenas = ficha?.resenas || 0;
    const ratingTxt = nResenas > 0 ? '⭐ ' + Number(ficha.rating || 0).toFixed(1) : '—';
    const ratingLbl = nResenas > 0
      ? (nResenas === 1 ? '1 reseña' : nResenas + ' reseñas')
      : 'sin reseñas';

    // Bloque de métricas en azul de marca. Va ARRIBA de los pendientes: es lo
    // primero que identifica al prestador en su propio tablero.
    // Se muestra siempre, incluso en cero — una cuenta nueva ve "—", "0" y
    // "0/10", que es la información correcta y además enseña qué se mide.
    // Los separadores son verticales y no bordes de tarjeta: tres cajas
    // sueltas sobre azul se leen como tres botones.
    const metrica = (v, l, conBorde) =>
      `<div style="text-align:center;padding:0 4px${conBorde ? ';border-left:1px solid rgba(255,255,255,.22);border-right:1px solid rgba(255,255,255,.22)' : ''}">
         <div style="font-size:21px;font-weight:800;color:#FFFFFF;line-height:1.15">${escHTML(String(v))}</div>
         <div style="font-size:11px;color:#C7D5FF;margin-top:3px">${escHTML(l)}</div>
       </div>`;

    const bloqueMetricas = `
      <div style="background:var(--blue);border-radius:14px;padding:14px 6px;margin-bottom:10px;display:grid;grid-template-columns:repeat(3,1fr)">
        ${metrica(posTxt, 'en tu rubro', false)}
        ${metrica(vistas, 'vistas del mes', true)}
        ${metrica(ratingTxt, ratingLbl, false)}
      </div>`;

    const bloquePendientes = items.length ? `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px">Te esperan</div>
        ${items.map((it, i) => `
          <div role="button" tabindex="0" onclick="${it.accion}"
               style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer${i < items.length-1 ? ';border-bottom:1px solid var(--border)' : ''}">
            <span style="font-size:15px;width:18px;text-align:center;flex-shrink:0">${it.ic}</span>
            <span style="flex:1;font-size:13px;color:var(--ink);line-height:1.35">${escHTML(it.txt)}</span>
            <span style="color:var(--ink3);font-size:15px">›</span>
          </div>`).join('')}
      </div>` : `
      <div style="background:var(--green-s);border-radius:14px;padding:13px 15px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">✅</span>
        <span style="font-size:13.5px;color:var(--green);font-weight:600">Todo al día — no tenés nada pendiente</span>
      </div>`;

    // Sin rubro definido el prestador está INVISIBLE: notificar_rubro no lo
    // alcanza y no aparece cuando el vecino filtra por categoría. Es un
    // problema silencioso —nada falla, simplemente no llega nada— así que
    // se avisa arriba de todo, antes que los pendientes.
    // Alcanza a los dados de alta antes de que el registro exigiera rubro.
    const sinRubro = !(ficha?.rubros?.length) && !rubro;
    const avisoRubro = sinRubro ? `
      <div role="button" tabindex="0" onclick="goTo('s-edit-perfil')"
           style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:14px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;cursor:pointer">
        <span style="font-size:18px">⚠️</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:#92400E">Elegí tus rubros</div>
          <div style="font-size:11.5px;color:#92400E;opacity:.85;margin-top:2px;line-height:1.45">
            Sin rubro no te avisamos de los pedidos nuevos ni aparecés cuando un vecino busca.
          </div>
        </div>
        <span style="color:#92400E;font-size:15px">›</span>
      </div>` : '';

    wrap.innerHTML = `
      <div style="padding:0 14px 8px">
        ${avisoRubro}
        ${bloqueMetricas}
        ${bloquePendientes}
        <div id="slot-checklist"></div>
        ${!items.length && recientes.length ? `
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin:2px 2px 8px">
            <span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)">Oportunidades para vos</span>
            <span role="button" tabindex="0" onclick="goTo('s-pedidos')"
                  style="font-size:12px;font-weight:600;color:var(--blue);cursor:pointer">Ver los ${totalDisponibles} →</span>
          </div>
          <div id="inicio-recientes"></div>` : `
          <div role="button" tabindex="0" onclick="goTo('s-pedidos')"
               style="background:var(--blue-s);border:1px solid rgba(43,91,255,.15);border-radius:14px;padding:13px 15px;display:flex;align-items:center;gap:10px;cursor:pointer">
            <span style="font-size:16px">💼</span>
            <span style="flex:1;font-size:13.5px;font-weight:700;color:var(--blue)">${
              totalDisponibles
                ? 'Ver los ' + totalDisponibles + ' pedidos disponibles'
                : 'Ver pedidos disponibles'}</span>
            <span style="color:var(--blue);font-size:15px">›</span>
          </div>`}
      </div>`;

    if (gen !== _genInicio) return;
    // Orden del tablero: métricas (azul) → pendientes → checklist → pedidos.
    moverChecklist('slot-checklist');

    // Las tarjetas de pedidos aparecen SÓLO si no hay nada pendiente.
    //
    // Con el tablero lleno estorbaban: repetían la pantalla Pedidos —misma
    // lista, recortada a 3 y sin filtros— y empujaban los indicadores fuera
    // de la pantalla. Pero sin ellas, un prestador al día se encontraba con
    // el bloque azul, un "Todo al día" y nada más: una pantalla vacía justo
    // cuando lo único que puede hacer es buscar trabajo.
    // Así, ocupan el lugar que dejan los pendientes en vez de competir con
    // ellos, y el que está al día entra viendo dónde ofertar.
    const cont = document.getElementById('inicio-recientes');
    if (cont && recientes.length) {
      let lista = recientes;
      if (window._sb) {
        const uids = [...new Set(lista.map(p => p.usuario_id).filter(Boolean))];
        if (uids.length) {
          const { data: prfs } = await window._sb.from('perfiles_publicos')
            .select('id, nombre').in('id', uids);
          const mapa = {};
          (prfs || []).forEach(pr => { mapa[pr.id] = pr.nombre; });
          lista = lista.map(p => ({ ...p, vecino_nombre: mapa[p.usuario_id] || null }));
        }
      }
      if (gen !== _genInicio) return;
      lista.forEach(p => cont.appendChild(crearCardPedidoDisponible(p)));
    }
  }

  // ── Filtros de la pantalla Pedidos (vista prestador) ─────────────────
  // Antes esta vista era HTML estático: tres pedidos inventados con
  // distancias y conteos escritos a mano, y cuatro chips que sólo hacían
  // this.classList.toggle('on') — se prendían y no filtraban nada.
  // Ahora consultan datos reales.
  const filtrosPresto = { zona: true, rubro: false, urgentes: false, presupuesto: false, porVencer: false, nuevos: false };

  function togglePrestoFiltro(el, clave) {
    filtrosPresto[clave] = !filtrosPresto[clave];
    if (el) el.classList.toggle('on', filtrosPresto[clave]);
    renderPedidosPresto();
  }
  window.togglePrestoFiltro = togglePrestoFiltro;

  /** Deja los chips reflejando el estado real de `filtrosPresto`.
   *  Hace falta cuando el filtro lo prendió el tablero y no un click. */
  function sincronizarChipsPresto() {
    document.querySelectorAll('#presto-chips .chip').forEach(ch => {
      const k = ch.dataset.f;
      if (k) ch.classList.toggle('on', !!filtrosPresto[k]);
    });
  }

  // Modo con el que hay que abrir Pedidos en la próxima entrada.
  let pedidosModoPendiente = null;

  /** Abre Pedidos con el filtro del indicador que se tocó.
   *  `modo`: 'porVencer' | 'nuevos' | null (sin filtro). */
  function irAPedidosPresto(modo) {
    pedidosModoPendiente = modo || 'ninguno';
    goTo('s-pedidos');
  }
  window.irAPedidosPresto = irAPedidosPresto;

  function aplicarModoPresto(modo) {
    filtrosPresto.porVencer = (modo === 'porVencer');
    filtrosPresto.nuevos    = (modo === 'nuevos');
    // Los dos indicadores hablan del rubro propio, así que el chip "Mi rubro"
    // se prende; si no, el número del tablero no coincidiría con la lista.
    // Al entrar SIN modo no se apaga: el prestador pudo haberlo puesto a mano
    // y perder su filtro al volver de otra pantalla sería un bug.
    if (modo) filtrosPresto.rubro = true;
    sincronizarChipsPresto();
  }

  /** Lista de pedidos disponibles para ofertar, con los 4 filtros.
   *
   *  "Tu zona" filtra por zona-madre, no por kilómetros: `pedidos` no
   *  tiene lat/lng, así que la distancia real es imposible hoy. Por eso
   *  el chip dice "Tu zona" a secas — el "· 8 km" anterior prometía una
   *  precisión que no existe.
   *
   *  "Mayor presupuesto" ordena, no filtra: los pedidos a convenir no
   *  quedan afuera, van al final. */
  async function renderPedidosPresto() {
    const wrap = document.getElementById('presto-lista');
    const meta = document.getElementById('presto-meta');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando pedidos…</div>';

    const pid = usuarioActual?.prestador_id || null;
    const ficha = pid ? await PronetDB.obtener('prestadores', pid).catch(() => null) : null;
    // 'General' es el rubro por DEFECTO que pone handle_new_user cuando el
    // alta no trae uno — lo tienen 4 de los 11 prestadores. No matchea
    // ningún pedido, así que tratarlo como rubro real dejaba el tablero
    // vacío y el filtro "Mi rubro" sin resultados.
    // Se lo trata como "sin rubro definido": se muestran todos los de la
    // zona. Ver de más es mejor que no ver nada.
    const rubroFicha = ficha?.rubro || '';
    const rubro = /^general$/i.test(rubroFicha.trim()) ? '' : rubroFicha;

    // "Publicado", ajeno y —si el chip de zona está puesto— de la zona: todo
    // eso lo resuelve el servidor. Antes viajaba la tabla completa y se
    // descartaba acá. Los demás chips sí filtran en el cliente: operan sobre
    // un conjunto ya chico y cambiar de chip no debería costar otra consulta.
    const feed = await PronetDB.listarPedidosDisponibles({
      zonas: filtrosPresto.zona ? zonasDelFiltro() : null,
      excluirUsuario: usuarioActual?.id || null,
      miPrestadorId: usuarioActual?.prestador_id || null,
    }).catch(() => ({ pedidos: [], total: 0 }));
    let pedidos = feed.pedidos;

    if (filtrosPresto.rubro && rubro) {
      pedidos = pedidos.filter(p => matchRubro(p.rubro, rubro));
    }
    if (filtrosPresto.urgentes) {
      pedidos = pedidos.filter(p => p.urgencia === 'hoy');
    }
    // "Por vencer" replica exactamente el indicador del tablero: menos de
    // 24hs de reloj y sin propuesta mía. Excluir los que ya oferté es lo que
    // lo vuelve accionable — si no, la lista repite trabajo ya hecho.
    if (filtrosPresto.porVencer) {
      const HS = window.PRONET_CONFIG?.PROPUESTA_EXPIRACION_HS || 168;
      const ahora = Date.now();
      let yaOferte = new Set();
      if (window._sb && pid) {
        const { data: mias } = await window._sb.from('propuestas')
          .select('pedido_id').eq('prestador_id', pid);
        (mias || []).forEach(pr => yaOferte.add(pr.pedido_id));
      }
      pedidos = pedidos.filter(p => {
        if (!p.creado || yaOferte.has(p.id)) return false;
        const vence = p.expira_en ? new Date(p.expira_en)
                                  : new Date(new Date(p.creado).getTime() + HS * 3600000);
        const restan = (vence - ahora) / 3600000;
        return restan > 0 && restan <= 24;
      });
    }
    // "Nuevos" usa la marca ANTERIOR a esta visita (ver marcarPedidosComoVistos).
    if (filtrosPresto.nuevos) {
      const desde = _marcaPedidosPrevia;
      pedidos = desde ? pedidos.filter(p => p.creado && new Date(p.creado) > desde) : [];
    }
    if (filtrosPresto.presupuesto) {
      const tope = p => p.presupuesto_max || p.presupuesto_min || 0;
      pedidos = pedidos.slice().sort((a, b) => tope(b) - tope(a));
    }

    const activos = Object.entries(filtrosPresto).filter(([, v]) => v).length;
    if (meta) {
      meta.innerHTML = pedidos.length
        ? 'Pedidos disponibles · <span style="color:var(--blue);font-weight:600">' +
          pedidos.length + ' pedido' + (pedidos.length !== 1 ? 's' : '') + '</span>'
        : 'Sin resultados';
    }

    if (!pedidos.length) {
      wrap.innerHTML = '<div style="padding:28px 18px;text-align:center;font-size:13px;color:var(--ink3)">' +
        (activos > 1
          ? 'Ningún pedido coincide con los filtros.<br>Probá desactivar alguno.'
          : 'No hay pedidos disponibles en ' + (zonaActual || 'tu zona') + ' por ahora.') +
        '</div>';
      return;
    }

    // Nombre de quien publicó: sale de perfiles_publicos, porque la RLS de
    // `perfiles` limita la lectura y el prestador no vería el nombre.
    if (window._sb) {
      const uids = [...new Set(pedidos.map(p => p.usuario_id).filter(Boolean))];
      if (uids.length) {
        const { data: prfs } = await window._sb.from('perfiles_publicos').select('id, nombre').in('id', uids);
        const mapa = {};
        (prfs || []).forEach(pr => { mapa[pr.id] = pr.nombre; });
        pedidos = pedidos.map(p => ({ ...p, vecino_nombre: mapa[p.usuario_id] || null }));
      }
    }

    wrap.innerHTML = '';
    pedidos.forEach(p => wrap.appendChild(crearCardPedidoDisponible(p)));

    // Marcar como vistos SÓLO si la lista no escondió pedidos nuevos.
    // Antes se marcaba al entrar, sin mirar el filtro: llegabas desde
    // "5 pedidos nuevos", tocabas "4 vencen pronto" —que muestra otros
    // cuatro— y al volver el indicador de nuevos había desaparecido sin que
    // los vieras nunca. `porVencer` y `urgentes` recortan por criterios que
    // no tienen nada que ver con la antigüedad; el resto no: `zona` y
    // `rubro` son los mismos límites con los que se cuenta, `nuevos` muestra
    // exactamente esos, y `presupuesto` sólo ordena.
    if (!filtrosPresto.porVencer && !filtrosPresto.urgentes) marcarPedidosComoVistos();
  }

  async function renderPedidosDisponibles(cat) {
    const wrap = document.getElementById('home-feed-container');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando pedidos...</div>';
    // Publicados, ajenos y de la zona: filtrado en el servidor.
    const feedCat = await PronetDB.listarPedidosDisponibles({
      zonas: zonasDelFiltro(),
      excluirUsuario: usuarioActual?.id || null,
      miPrestadorId: usuarioActual?.prestador_id || null,
    }).catch(() => ({ pedidos: [], total: 0 }));
    let pedidos = feedCat.pedidos;
    // Filtrar por rubro/categoría
    if (cat && cat !== 'todos') {
      pedidos = pedidos.filter(p => matchRubro(p.rubro, rubroDeCat(cat)));
    }
    wrap.innerHTML = '';
    // Meta
    const meta = document.getElementById('home-cat-meta');
    const catLabel = cat && cat !== 'todos' ? rubroDeCat(cat) : 'Todos los rubros';
    if (meta) meta.textContent = '💼 Pedidos disponibles · ' + (zonaActual || 'Escobar') + ' · ' + pedidos.length + ' pedido' + (pedidos.length !== 1 ? 's' : '');
    if (pedidos.length === 0) {
      wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">No hay pedidos disponibles en ' + (zonaActual || 'tu zona') + ' por ahora.<br>Probá cambiar de zona o rubro.</div>';
      return;
    }
    // Enriquecer con nombre de quien publicó cada pedido (B-06)
    if (window._sb) {
      const uids = [...new Set(pedidos.map(p => p.usuario_id).filter(Boolean))];
      if (uids.length > 0) {
        // perfiles_publicos, no perfiles: RLS de lectura propia hacía que el
        // prestador no viera el nombre de quien publicó cada pedido (B-06).
        const { data: prfs } = await window._sb.from('perfiles_publicos').select('id, nombre').in('id', uids);
        const nombresMap = {};
        (prfs || []).forEach(pr => { nombresMap[pr.id] = pr.nombre; });
        pedidos = pedidos.map(p => ({ ...p, vecino_nombre: nombresMap[p.usuario_id] || null }));
      }
    }
    pedidos.forEach(p => wrap.appendChild(crearCardPedidoDisponible(p)));
  }

  // Guarda el pedido actualmente visible
  let pedidoActual = null;

  /** Abre el detalle de un pedido poblándolo con datos reales */
  async function abrirDetallePedido(p) {
    pedidoActual = p;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('pd-rubro', (p.icono || '📋') + ' ' + (p.rubro || 'Servicio'));
    set('pd-titulo', p.titulo || 'Pedido sin título');
    set('pd-desc', p.descripcion || 'Sin descripción.');
    set('pd-zona', p.zona || 'Escobar');
    // Urgencia
    const urgMap = { hoy: 'Hoy — urgente', semana: 'Esta semana', flexible: 'Flexible' };
    const urgEl = document.getElementById('pd-urgencia');
    if (urgEl) {
      urgEl.textContent = urgMap[p.urgencia] || 'Flexible';
      urgEl.className = 'urg-badge ' + (p.urgencia === 'hoy' ? 'urg-hoy' : p.urgencia === 'flexible' ? 'urg-flexible' : 'urg-semana');
    }
    // Presupuesto (reemplaza el conteo de propuestas que era hardcodeado)
    const propsEl = document.getElementById('pd-props');
    if (propsEl) {
      let presupuesto = 'A convenir';
      if (p.presupuesto_min && p.presupuesto_max) presupuesto = '$' + p.presupuesto_min.toLocaleString('es-AR') + '–$' + p.presupuesto_max.toLocaleString('es-AR');
      else if (p.presupuesto_min) presupuesto = 'Desde $' + p.presupuesto_min.toLocaleString('es-AR');
      propsEl.textContent = presupuesto;
      propsEl.style.color = 'var(--ink)';
      const lbl = propsEl.previousElementSibling;
      if (lbl) lbl.textContent = 'Presupuesto';
    }
    // Tiempo desde publicación
    let hace = 'Reciente';
    if (p.creado) {
      const hs = Math.floor((Date.now() - new Date(p.creado).getTime()) / 3600000);
      hace = hs < 1 ? 'Hace menos de 1h' : hs < 24 ? `Hace ${hs}h` : `Hace ${Math.floor(hs/24)}d`;
    }
    set('pd-tiempo', hace);
    // Ocultar "Pedido por" por defecto; se muestra solo al prestador
    const vecinoWrap = document.getElementById('pd-vecino-wrap');
    if (vecinoWrap) vecinoWrap.style.display = 'none';
    // Poblar propuestas sugeridas con prestadores reales del rubro
    const soyDuenia2 = usuarioActual && p.usuario_id === usuarioActual.id;
    const esPrestadorView = usuarioActual && esPrestador() && !soyDuenia2;
    const tEl=document.getElementById('pd-props-title'),sEl=document.getElementById('pd-props-sub'),fEl=document.getElementById('pd-props-foot');
    if(soyDuenia2){
      if(tEl) tEl.textContent='📬 Propuestas recibidas';
      if(sEl) sEl.textContent='Compará precio, plazo y reputación antes de elegir';
      if(fEl) fEl.style.display='none';
      renderPropuestasRecibidas(p);
    } else if(esPrestadorView){
      if(tEl) tEl.textContent='📊 Insights del pedido';
      if(sEl) sEl.textContent='Información para ayudarte a armar tu propuesta';
      if(fEl) fEl.style.display='none';
      renderInsightsPedido(p);
      // Mostrar quién publicó el pedido (B-06)
      if (vecinoWrap) {
        if (p.vecino_nombre) {
          set('pd-vecino', p.vecino_nombre); vecinoWrap.style.display = '';
        } else if (p.usuario_id && window._sb) {
          try {
            const { data: perfil } = await window._sb.from('perfiles_publicos').select('nombre').eq('id', p.usuario_id).maybeSingle();
            if (perfil?.nombre) { set('pd-vecino', perfil.nombre); vecinoWrap.style.display = ''; }
          } catch(e) {}
        }
      }
    } else {
      if(tEl) tEl.textContent='🤖 Prestadores sugeridos para este pedido';
      if(sEl) sEl.textContent='Ordenados por ranking zonal y puntuación';
      if(fEl) fEl.style.display='';
      renderPropuestasSugeridas(p);
    }
    const cta=document.getElementById('pd-cta-prestador');
    if(cta){
      // esPrestador() respeta el toggle de doble perfil. Antes esto exigía
      // tipo==='prestador' literal, así que un doble perfil en modo prestador
      // veía los Insights pero no tenía botón para ofertar.
      // Y nunca en un pedido propio: un prestador no oferta en lo que publicó.
      const esPrest=usuarioActual&&esPrestador()&&usuarioActual.prestador_id&&!soyDuenia2;
      const publicado=(p.estado||'Publicado')==='Publicado';
      cta.style.display=(esPrest&&publicado)?'block':'none';
      if(esPrest&&publicado) marcarSiYaOferte(p);
    }
    // Precargar el resumen del formulario de propuesta YA, con los datos completos del pedido.
    // Así cuando el prestador toca "Enviar propuesta" el título ya está en el DOM
    // y no aparece "Cargando..." aunque abrirNuevaPropuesta corra antes de tener los datos.
    const npIcono = document.getElementById('np-icono');
    const npTitulo = document.getElementById('nprop-titulo');
    const npMeta = document.getElementById('np-meta');
    if(npIcono) npIcono.textContent = p.icono || '📋';
    if(npTitulo) npTitulo.textContent = p.titulo || 'Pedido';
    if(npMeta) {
      const urgMap2 = {hoy:'Hoy — urgente', semana:'Esta semana', flexible:'Flexible'};
      let presup = 'A convenir';
      if(p.presupuesto_min && p.presupuesto_max) presup = '$'+p.presupuesto_min.toLocaleString('es-AR')+'–$'+p.presupuesto_max.toLocaleString('es-AR');
      npMeta.textContent = '📍 '+(p.zona||'Escobar')+' · '+presup+' · '+(urgMap2[p.urgencia]||'Flexible');
    }
    // Cargar referencial de precios para el rubro del pedido
    if (p.rubro) cargarRefPrecio(p.rubro);
    // Mostrar fotos del pedido si las tiene
    const fotosWrap = document.getElementById('pd-fotos-wrap');
    if (fotosWrap) {
      const fotos = Array.isArray(p.fotos) ? p.fotos : [];
      if (fotos.length > 0) {
        fotosWrap.style.display = 'block';
        fotosWrap.innerHTML = `
          <div style="font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:8px">📷 Fotos del problema</div>
          <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px">
            ${fotos.map(url => `<img src="${escHTML(url)}" style="width:90px;height:90px;object-fit:cover;border-radius:10px;flex-shrink:0;cursor:pointer" onclick="abrirFotoModal(this.src)">`).join('')}
          </div>`;
      } else {
        fotosWrap.style.display = 'none';
        fotosWrap.innerHTML = '';
      }
    }
    goTo('s-detalle-pedido');
  }

  /** Card compacta de precio referencial del catálogo, con tap-to-toggle sobre
   *  el precio para desplegar el alcance (incluye/no incluye) — no ocupa
   *  espacio hasta que el usuario lo pide. `id` debe ser único en la pantalla. */
  function refPronetCardHTML(id, refTxt, incluye, noIncluye, subtitulo) {
    const detalleId = id + '-detalle';
    const tieneDetalle = (incluye && incluye.length) || (noIncluye && noIncluye.length);
    let detalleHtml = '';
    if (incluye && incluye.length) detalleHtml += '<div><span style="font-weight:600">✅ Incluye:</span> ' + incluye.map(escHTML).join(' · ') + '</div>';
    if (noIncluye && noIncluye.length) detalleHtml += '<div style="margin-top:4px"><span style="font-weight:600">❌ No incluye:</span> ' + noIncluye.map(escHTML).join(' · ') + '</div>';
    let html = '<div' + (tieneDetalle ? ' onclick="toggleRefPronet(\'' + detalleId + '\')" style="cursor:pointer' : ' style="') + 'display:flex;align-items:center;gap:10px;padding:12px;background:#F0FDF4;border-radius:' + (tieneDetalle ? '12px 12px 0 0' : '12px') + ';margin-bottom:' + (tieneDetalle ? '0' : '10px') + '">';
    html += '<div style="font-size:24px">📈</div>';
    html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--ink)">Ref. PRONET: ' + refTxt + (tieneDetalle ? ' <span style="color:var(--blue)">ⓘ</span>' : '') + '</div>';
    html += '<div style="font-size:11px;color:var(--ink3)">' + escHTML(subtitulo) + '</div></div></div>';
    if (tieneDetalle) {
      html += '<div id="' + detalleId + '" style="display:none;padding:10px 12px;background:#F0FDF4;border-radius:0 0 12px 12px;margin-bottom:10px;font-size:11px;color:var(--ink2);line-height:1.5">' + detalleHtml + '</div>';
    }
    return html;
  }

  function toggleRefPronet(id) {
    const box = document.getElementById(id);
    if (box) box.style.display = box.style.display === 'none' ? '' : 'none';
  }
  window.toggleRefPronet = toggleRefPronet;

  // Genera propuestas sugeridas a partir de prestadores reales del rubro del pedido
  async function renderInsightsPedido(pedido) {
    const wrap = document.getElementById('pd-propuestas');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando insights...</div>';

    // Contar propuestas recibidas (RPC SECURITY DEFINER → count real sin exponer datos ajenos)
    let nProps = 0;
    try {
      nProps = await PronetDB.contarPropuestasPedido(pedido.id);
    } catch (e) {}

    // Ref PRONET desde catálogo — solo si el rubro tiene ficha activa real, no el fallback
    let refTxt = null;
    let refIncluye = [];
    let refNoIncluye = [];
    try {
      const tieneCatalogo = FEATURES.catalogoPrecios && pedido.rubro && RUBROS_CON_CATALOGO.has(pedido.rubro);
      const rango = tieneCatalogo ? SLIDER_RANGOS[pedido.rubro] : null;
      if (rango) refTxt = '$' + rango.min.toLocaleString('es-AR') + ' – $' + rango.max.toLocaleString('es-AR');
      if (tieneCatalogo) {
        const ficha = await PronetDB.obtenerFichaPorRubro(pedido.rubro);
        if (Array.isArray(ficha?.incluye)) refIncluye = ficha.incluye;
        if (Array.isArray(ficha?.no_incluye)) refNoIncluye = ficha.no_incluye;
      }
    } catch (e) {}

    // Tiempo desde publicación
    let tiempoPub = '';
    if (pedido.creado) {
      const diff = Math.floor((Date.now() - new Date(pedido.creado).getTime()) / 60000);
      if (diff < 60) tiempoPub = diff + ' min';
      else if (diff < 1440) tiempoPub = Math.floor(diff / 60) + 'h ' + (diff % 60) + 'min';
      else tiempoPub = Math.floor(diff / 1440) + ' día' + (Math.floor(diff / 1440) > 1 ? 's' : '');
    }

    // Expiración
    let expiraTxt = '';
    if (pedido.expira_en || pedido.creado) {
      const base = pedido.expira_en ? new Date(pedido.expira_en) : new Date(new Date(pedido.creado).getTime() + PRONET_CONFIG.PROPUESTA_EXPIRACION_HS * 3600000);
      const horas = Math.max(0, Math.floor((base - Date.now()) / 3600000));
      if (horas > 0) expiraTxt = horas + ' horas';
    }

    // Construir HTML
    let html = '<div style="padding:14px">';

    // Propuestas recibidas
    html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--blue-s);border-radius:12px;margin-bottom:10px">';
    html += '<div style="font-size:24px">📬</div>';
    html += '<div><div style="font-size:13px;font-weight:700;color:var(--ink)">' + nProps + ' propuesta' + (nProps !== 1 ? 's' : '') + ' recibida' + (nProps !== 1 ? 's' : '') + '</div>';
    html += '<div style="font-size:11px;color:var(--ink3)">' + (nProps === 0 ? 'Sé el primero en ofertar' : 'Mientras más rápido respondas, mejor tu posición') + '</div></div></div>';

    // Ref PRONET
    if (refTxt) {
      html += refPronetCardHTML('ref-insights', refTxt, refIncluye, refNoIncluye, 'Rango de precios del mercado para este rubro');
    }

    // Tiempo y expiración
    if (tiempoPub || expiraTxt) {
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#F3E8FF;border-radius:12px;margin-bottom:10px">';
      html += '<div style="font-size:24px">⏱️</div>';
      html += '<div><div style="font-size:13px;font-weight:700;color:var(--ink)">Publicado hace ' + tiempoPub + '</div>';
      if (expiraTxt) html += '<div style="font-size:11px;color:var(--ink3)">Expira en ' + expiraTxt + ' — ofertá antes de que cierre</div>';
      html += '</div></div>';
    }

    // Tip
    html += '<div style="padding:10px;text-align:center;font-size:12px;color:var(--ink3);line-height:1.5">';
    html += '💡 Respondé rápido y con precio competitivo para mejorar tu posición en el algoritmo.';
    html += '</div>';

    html += '</div>';
    wrap.innerHTML = html;
  }

  async function renderPropuestasSugeridas(pedido) {
    const wrap = document.getElementById('pd-propuestas');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando sugerencias...</div>';
    const filtros = {};
    if (pedido.rubro) filtros.rubro = pedido.rubro;
    if (pedido.zona) filtros.zona = ZONA_DB[pedido.zona] || pedido.zona;
    let prestadores = await PronetDB.listarPrestadores(filtros);
    // Si no hay resultado exacto, intentar sin filtro de rubro (el matcheo de Supabase es exacto)
    if (prestadores.length === 0 && pedido.rubro) {
      // Intentar con el singular/plural alternativo
      const alt = pedido.rubro.endsWith('s') ? pedido.rubro.slice(0,-1) : pedido.rubro + 's';
      filtros.rubro = alt;
      prestadores = await PronetDB.listarPrestadores(filtros);
    }
    prestadores = [...prestadores].sort((a,b) => { const s=(p)=>((p.rating||0)*(p.resenas||0)+15)/((p.resenas||0)+5); return s(b)-s(a); }).slice(0, PRONET_CONFIG.SUGERIDOS_PEDIDO);
    wrap.innerHTML = '';
    if (prestadores.length === 0) {
      wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no hay prestadores de este rubro en la zona.</div>';
      return;
    }
    const medallas = ['🥇','🥈','🥉'];
    prestadores.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'prop-card' + (i === 0 ? ' top1' : i === 1 ? ' top2' : ' top3');
      card.style.cssText = 'background:white;border-radius:14px;padding:14px;margin-bottom:10px;border:1.5px solid ' + (i === 0 ? 'var(--gold)' : 'var(--border)');
      const badgeVerif = p.verificado ? ' <svg class="verified-badge" viewBox="0 0 18 20" fill="none"><path d="M9 1L2 4v6c0 4.4 3 8.5 7 9.5C13 18.5 16 14.4 16 10V4L9 1z" fill="#39FF14"/><path d="M5.5 10l2.5 2.5 4.5-4.5" stroke="#0D0F1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
      const badgePrem = p.premium ? ' · ⭐ Premium' : '';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <span style="font-size:16px">${medallas[i]}</span>
          <span style="font-size:11px;font-weight:700;color:#92400E">${i === 0 ? 'Mejor opción' : 'Sugerido'}</span>
          <div style="margin-left:auto;background:var(--gold-s);color:#92400E;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">${(p.resenas || 0) > 0 ? '⭐ ' + (p.rating || 5).toFixed(1) : 'Sin reseñas'}</div>
        </div>
        <div class="prop-top">
          <div class="prop-av" style="background:${escHTML(p.color_bg||'#EEF2FF')};color:${escHTML(p.color_text||'#2B5BFF')}">${avatarInner(p)}</div>
          <div>
            <div class="prop-name">${escHTML(p.nombre)}${badgeVerif}</div>
            <div class="prop-rank">📍 ${escHTML(p.zona||'Escobar')}${badgePrem}</div>
          </div>
        </div>
        <div style="display:flex;gap:16px;align-items:baseline;margin:8px 0">
          <div class="prop-precio">$${(p.precio||0).toLocaleString('es-AR')} <span>/ ${escHTML(p.precio_unidad||'visita')}</span></div>
        </div>
        ${p.descripcion ? `<div class="prop-msg">"${escHTML(p.descripcion)}"</div>` : ''}
        <button class="prop-select-btn ${i===0?'gold':''}" style="margin-top:10px">Contactar a ${escHTML((p.nombre||'').split(' ')[0])} →</button>`;
      card.querySelector('.prop-select-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        prestadorActual = p;
        openChat(p.id || 'x');
      });
      wrap.appendChild(card);
    });
  }

  // Card de pedido disponible (para que el prestador oferte)
  function crearCardPedidoDisponible(p) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => abrirDetallePedido(p));
    const icono = p.icono || '📋';
    const rubro = escHTML(p.rubro || 'Servicio');
    const zona = escHTML(p.zona || 'Escobar');
    const titulo = escHTML(p.titulo || 'Pedido sin título');
    const desc = escHTML(p.descripcion || '');
    // Tiempo desde publicación
    let hace = '';
    if (p.creado) {
      const diff = Date.now() - new Date(p.creado).getTime();
      const hs = Math.floor(diff / 3600000);
      hace = hs < 1 ? 'Hace menos de 1h' : hs < 24 ? `Hace ${hs}h` : `Hace ${Math.floor(hs/24)}d`;
    }
    // Presupuesto y urgencia
    const urgMap = { hoy: '🔴 Hoy', semana: '🟡 Esta semana', flexible: '🟢 Flexible' };
    const urgTxt = urgMap[p.urgencia] || '🟢 Flexible';
    let presupuesto = '';
    if (p.presupuesto_min && p.presupuesto_max) presupuesto = '$' + p.presupuesto_min.toLocaleString('es-AR') + '–$' + p.presupuesto_max.toLocaleString('es-AR');
    else if (p.presupuesto_min) presupuesto = 'Desde $' + p.presupuesto_min.toLocaleString('es-AR');
    else presupuesto = 'A convenir';
    const vecinoNombre = p.vecino_nombre ? escHTML(p.vecino_nombre) : null;
    card.innerHTML = `
      <div class="card-top">
        <div class="c-av" style="background:#EEF2FF;color:#2B5BFF;font-size:22px">${icono}</div>
        <div class="c-info">
          <div class="c-name">${titulo}</div>
          <div class="c-role">${rubro} · 📍 ${zona}</div>
          ${vecinoNombre ? `<div class="c-role" style="color:var(--ink3);font-size:11px">👤 ${vecinoNombre}</div>` : ''}
          ${hace ? `<div class="c-role" style="color:var(--ink3);font-size:11px">${hace}</div>` : ''}
        </div>
      </div>
      ${desc ? `<div class="c-desc">${desc}</div>` : ''}
      <div style="display:flex;gap:8px;margin:8px 0 4px;flex-wrap:wrap">
        <span style="background:var(--surface);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--ink2)">💰 ${presupuesto}</span>
        <span style="background:var(--surface);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--ink2)">${urgTxt}</span>
      </div>
      <div class="c-foot">
        <div style="font-size:13px;font-weight:700;color:var(--blue)">Ver detalle y ofertar →</div>
        <div class="c-zona" style="background:#ECFDF5;color:#059669">💼 Disponible</div>
      </div>`;
    return card;
  }

  // Renderiza los resultados de búsqueda
  async function renderBusqueda(texto, filtro) {
    const wrap = document.getElementById('search-results');
    const meta = document.getElementById('search-meta');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Buscando...</div>';
    const filtros = {};
    const hayTexto = texto && texto.length > 1;
    if (hayTexto) filtros.busqueda = texto;
    if (filtro === 'premium') filtros.premium = true;
    // Con texto libre → búsqueda en toda la red (sin filtro de zona)
    // Sin texto → filtrar por zona del usuario
    if (!hayTexto && zonaActual) filtros.zona = zonaParaFiltro();
    const prestadores = await PronetDB.listarPrestadores(filtros);
    // Filtros locales
    let resultado = prestadores;
    if (filtro === 'top') resultado = prestadores.filter(p => p.rating >= PRONET_CONFIG.RATING_TOP);
    if (filtro === 'economico') resultado = [...prestadores].sort((a,b) => (a.precio||0)-(b.precio||0));
    wrap.innerHTML = '';
    const zonaLabel = hayTexto ? 'toda la red' : (zonaActual || 'Escobar');
    if (meta) meta.textContent = resultado.length + ' resultado' + (resultado.length !== 1 ? 's' : '') + ' en ' + zonaLabel + ' · ' + getLabelFiltro(filtro);
    if (resultado.length === 0) {
      wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">No encontramos prestadores con esos criterios.</div>';
      return;
    }
    resultado.forEach(p => wrap.appendChild(crearCardPrestador(p)));
  }

  // Renderiza la lista de chats
  async function renderChats() {
    const lista = document.getElementById('chats-lista');
    const badge = document.getElementById('chats-badge-nuevos');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando mensajes...</div>';
    const [chats, porChat] = await Promise.all([
      PronetDB.listarChats(),
      PronetDB.noLeidosPorChat().catch(() => ({})),
    ]);
    // Se cuelga de cada chat para que el filtro "Sin leer" pueda decidir sin
    // volver a consultar. El total del badge sale de la misma suma.
    chatsCache = chats.map(c => ({ ...c, _noLeidos: porChat[c.id] || 0 }));
    // Conversaciones con algo sin leer, no total de mensajes: tiene que dar
    // el mismo número que el indicador del tablero que trae hasta acá.
    const noLeidos = Object.values(porChat).filter(n => n > 0).length;
    if (badge) {
      if (noLeidos > 0) { badge.textContent = noLeidos + ' sin leer'; badge.style.display = ''; }
      else badge.style.display = 'none';
    }
    if (chatsFiltroPendiente) {
      const f = chatsFiltroPendiente;
      chatsFiltroPendiente = null;
      filtrarChats(null, f);   // ya llama a renderizarListaChats
    } else {
      renderizarListaChats(chatsCache);
    }
  }

  // Renderiza el panel de moderación dinámicamente
  async function renderModeracion(filtro = 'todas') {
    if (!await verificarAdminServidor()) return;
    const listaEl = document.getElementById('mod-lista');
    if (!listaEl) return;
    listaEl.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    try {
      // El denunciante se trae por su propia FK a `perfiles`. Faltaba: el fix
      // de moderación del 2026-08-03 agregó la de `denunciado_id` pero no
      // ésta, así que el panel decía a quién denunciaron pero no quién —
      // justo lo que hace falta para detectar a alguien que denuncia en masa
      // a un competidor, y para el botón "Contactar partes".
      const { data: todas, error: errDenuncias } = await window._sb.from('denuncias')
        .select('*, perfiles!denunciado_id(nombre, prestador_id, prestadores(id, suspendido, denuncias_confirmadas)), denunciante:perfiles!denuncias_denunciante_id_perfiles_fkey(nombre)')
        .order('creado', { ascending: false });
      if (errDenuncias) throw errDenuncias;
      const denuncias = todas || [];
      // Stats
      const setPendientes = denuncias.filter(d => d.estado === 'pendiente').length;
      const setRevision = denuncias.filter(d => d.estado === 'en_revision').length;
      const setResueltas = denuncias.filter(d => d.estado === 'resuelta').length;
      const cp = document.getElementById('mod-count-pendientes');
      const cr = document.getElementById('mod-count-revision');
      const cs = document.getElementById('mod-count-resueltas');
      if (cp) cp.textContent = setPendientes;
      if (cr) cr.textContent = setRevision;
      if (cs) cs.textContent = setResueltas;
      // Filtrar
      const lista = filtro === 'todas' ? denuncias : denuncias.filter(d => d.estado === filtro);
      if (lista.length === 0) {
        listaEl.innerHTML = '<div style="padding:60px 24px;text-align:center"><div style="font-size:40px;margin-bottom:10px">🛡️</div><div style="font-size:14px;font-weight:700;color:var(--ink)">Sin denuncias</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">No hay denuncias en esta categoría.</div></div>';
        return;
      }
      listaEl.innerHTML = '';
      lista.forEach(d => {
        const iconos = { pendiente: '🚨', en_revision: '⚠️', resuelta: '✅' };
        const clases = { pendiente: 'critica', en_revision: 'alta', resuelta: 'resuelta' };
        // El badge de resuelta dice QUÉ se decidió. Antes confirmar y
        // desestimar terminaban las dos en un "Resuelta" idéntico, así que un
        // día después no se sabía si se le había dado la razón al denunciante.
        const resueltaHTML = d.resolucion === 'falta_confirmada'
          ? '<div style="background:#FEE2E2;color:#BE123C;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Falta confirmada</div>'
          : d.resolucion === 'desestimada'
          ? '<div style="background:var(--surface);color:var(--ink2);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✕ Desestimada</div>'
          // Las resueltas antes de este cambio no tienen resolución guardada:
          // no hay forma de saber cuál fue y adivinarla sería peor.
          : '<div style="background:var(--green-s);color:var(--green);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Resuelta</div>';
        const badgeHTML = d.estado === 'pendiente'
          ? '<div class="badge-suspendido">🔴 Pendiente</div>'
          : d.estado === 'en_revision'
          ? '<div class="badge-revision">⚠️ En revisión</div>'
          : resueltaHTML;
        const hace = d.creado ? tiempoRelativo(d.creado) : '';
        const perfil = d.perfiles || {};
        const prestadorInfo = perfil.prestadores || {};
        const prestadorId = perfil.prestador_id || prestadorInfo.id || null;
        const suspendido = !!prestadorInfo.suspendido;
        const nDenuncias = prestadorInfo.denuncias_confirmadas || 0;
        const nombreDenunciado = perfil.nombre ? `<span style="font-size:12px;color:var(--ink2)">Denunciado: <b>${escHTML(perfil.nombre)}</b>${nDenuncias > 0 ? ` · ${nDenuncias} denuncia/s confirmada/s` : ''}</span>` : '';
        const quienDenuncio = d.denunciante?.nombre
          ? `<div style="font-size:12px;color:var(--ink2);margin-top:2px">Denunció: <b>${escHTML(d.denunciante.nombre)}</b></div>` : '';
        const toggleBtnHTML = prestadorId ? `
          <button class="mod-btn ${suspendido ? 'mod-btn-ok' : 'mod-btn-suspend'}"
            onclick="toggleSuspensionPrestador('${prestadorId}', ${!suspendido})"
            style="margin-top:6px;width:100%">
            ${suspendido ? '✅ Reactivar prestador' : '🚫 Suspender prestador'}
          </button>` : '';
        const card = document.createElement('div');
        card.className = 'mod-card ' + (clases[d.estado] || '');
        card.innerHTML = `
          <div class="mod-head">
            <div style="font-size:16px">${iconos[d.estado] || '📋'}</div>
            <div class="mod-tipo">${escHTML(d.motivo)}</div>
            <div class="mod-time">${escHTML(hace)}</div>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">${badgeHTML}${suspendido ? '<div style="background:#FEE2E2;color:#BE123C;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">🚫 Suspendido</div>' : ''}</div>
          ${nombreDenunciado || quienDenuncio ? `<div style="margin-bottom:6px">${nombreDenunciado}${quienDenuncio}</div>` : ''}
          <div class="mod-desc">${escHTML(d.detalle || 'Sin detalle')}</div>
          ${d.resuelto_en ? `<div style="font-size:11px;color:var(--ink3);margin-top:6px">Resuelta el ${new Date(d.resuelto_en).toLocaleDateString('es-AR')}</div>` : ''}
          ${d.estado !== 'resuelta' ? `
          <div class="mod-actions">
            <!-- Antes decía "Confirmar baja", que hacía pensar en eliminar la
                 cuenta. No da de baja a nadie: suma +1 al contador del
                 prestador y lo suspende recién a las 3. -->
            <button class="mod-btn mod-btn-suspend" onclick="accionDenuncia('${d.id}','falta_confirmada')">Confirmar falta</button>
            <button class="mod-btn mod-btn-info" onclick="accionDenuncia('${d.id}','contacto')">Contactar partes</button>
            <button class="mod-btn mod-btn-ok" onclick="accionDenuncia('${d.id}','desestimada')">Desestimar</button>
          </div>` : `
          <div class="mod-actions">
            <button class="mod-btn mod-btn-info" onclick="reabrirDenuncia('${d.id}')" style="width:100%">↩ Reabrir</button>
          </div>`}
          ${toggleBtnHTML}`;
        listaEl.appendChild(card);
      });
    } catch (e) {
      listaEl.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">Error al cargar denuncias.</div>';
    }
  }

  function filtrarMod(filtro, chip) {
    document.querySelectorAll('#s-moderacion .chip').forEach(c => c.classList.remove('on'));
    if (chip) chip.classList.add('on');
    renderModeracion(filtro);
  }

  let filtroCanjes = 'pendiente';

  function filtrarCanjes(filtro, chip) {
    filtroCanjes = filtro;
    document.querySelectorAll('#canjes-filtros .chip').forEach(c => c.classList.remove('on'));
    if (chip) chip.classList.add('on');
    renderCanjesPendientes();
  }
  window.filtrarCanjes = filtrarCanjes;

  async function renderCanjesPendientes() {
    const el = document.getElementById('mod-canjes-lista');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    try {
      let q = window._sb.from('loyalty_solicitudes').select('*');
      if (filtroCanjes !== 'todos') q = q.eq('estado', filtroCanjes);
      // Los resueltos se ordenan por fecha de resolución (lo último que resolví
      // arriba). En 'pendiente' y 'todos' se usa `creado`, porque los pendientes
      // no tienen `resuelto` y quedarían al final justo los que hay que atender.
      const esResueltos = filtroCanjes === 'aprobado' || filtroCanjes === 'rechazado';
      const { data, error } = await q.order(esResueltos ? 'resuelto' : 'creado',
        { ascending: false, nullsFirst: false });
      if (error) throw error;
      const items = data || [];
      if (!items.length) {
        const vacio = {
          pendiente: 'Sin canjes pendientes ✓',
          aprobado:  'Todavía no aprobaste ningún canje.',
          rechazado: 'No rechazaste ningún canje.',
          todos:     'No hay solicitudes de canje.',
        }[filtroCanjes];
        el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">' + vacio + '</div>';
        return;
      }

      // Traer nombres por separado desde perfiles_publicos (perfiles tiene RLS de lectura propia)
      const uids = [...new Set(items.map(s => s.usuario_id).filter(Boolean))];
      let nombresPorId = {};
      if (uids.length) {
        const { data: perfilesData } = await window._sb.from('perfiles_publicos')
          .select('id, nombre').in('id', uids);
        (perfilesData || []).forEach(p => { nombresPorId[p.id] = p.nombre; });
      }

      const SELLO = {
        aprobado:  { txt: '✓ Aprobado',  bg: '#DCFCE7', color: '#047857' },
        rechazado: { txt: '✗ Rechazado', bg: '#FEE2E2', color: '#BE123C' },
      };

      el.innerHTML = items.map(s => {
        const nombre = nombresPorId[s.usuario_id] || 'Usuario';
        const pendiente = s.estado === 'pendiente';
        const hace = tiempoRelativo(pendiente ? s.creado : (s.resuelto || s.creado));
        const sello = SELLO[s.estado];
        const pie = pendiente
          ? `<div class="mod-actions">
               <button class="mod-btn mod-btn-ok"      onclick="accionCanje('${s.id}','aprobado')">✓ Aprobar</button>
               <button class="mod-btn mod-btn-suspend" onclick="accionCanje('${s.id}','rechazado')">✗ Rechazar</button>
             </div>`
          : (sello
              ? `<div style="display:inline-block;background:${sello.bg};color:${sello.color};border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700">${sello.txt}</div>`
              : '');
        return `<div class="mod-card" style="margin-bottom:10px${pendiente ? '' : ';opacity:.75'}">
          <div class="mod-head">
            <div style="font-size:16px">💜</div>
            <div class="mod-tipo">${escHTML(s.nombre_canje)}</div>
            <div class="mod-time">${escHTML(hace)}</div>
          </div>
          <div style="font-size:12px;color:var(--ink2);margin-bottom:10px">${escHTML(nombre)} · ${s.puntos_descontados.toLocaleString('es-AR')} pts</div>
          ${pie}
        </div>`;
      }).join('');
    } catch(e) {
      console.warn('[renderCanjesPendientes]', e.message || e);
      el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">Error al cargar.</div>';
    }
  }

  async function accionCanje(id, estado) {
    try {
      // Necesitamos el destinatario para la notificación; el resto (validar
      // admin, transicionar el estado, aplicar el beneficio o devolver los
      // puntos) lo hace resolver_canje() en el servidor, de forma atómica.
      const { data: sol } = await window._sb.from('loyalty_solicitudes')
        .select('usuario_id, nombre_canje').eq('id', id).maybeSingle();

      const res = await PronetDB.resolverCanje(id, estado);
      if (!res.ok) {
        showToast && showToast('⚠️ ' + (res.error || 'No se pudo actualizar el canje'));
        renderCanjesPendientes();
        return;
      }

      if (sol) {
        const aprobado = estado === 'aprobado';
        PronetDB.notificar({
          destino: 'usuario', usuario_id: sol.usuario_id, tipo: 'loyalty',
          titulo: aprobado ? '✅ Canje aprobado' : '❌ Canje rechazado',
          cuerpo: res.mensaje || ('Tu canje "' + sol.nombre_canje + '" fue ' + estado + '.'),
          url: '/#s-loyalty',
        }).catch(() => {});
      }

      showToast && showToast(estado === 'aprobado' ? '✅ Canje aprobado' : '❌ Canje rechazado');
      renderCanjesPendientes();
    } catch(e) {
      showToast && showToast('⚠️ No se pudo actualizar el canje');
    }
  }

  // ── ABM Beneficios PRONET Points (admin) ────────────────────────────
  async function renderBeneficiosAdmin() {
    const el = document.getElementById('mod-beneficios-lista');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    try {
      const items = await PronetDB.listarCatalogoCanjeAdmin();
      _canjesAdminCache = items;
      if (!items.length) {
        el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">Sin beneficios cargados aún.</div>';
        return;
      }
      const tipoBenLbl = { manual: 'Manual', plan_mes: 'Regala plan', puntos_extra: 'Puntos extra' };
      el.innerHTML = items.map(i => `
        <div class="acc-card" style="opacity:${i.activo ? '1' : '.5'}">
          <div class="acc-ico" style="background:#F3E8FF">${escHTML(i.icono || '🎁')}</div>
          <div class="acc-body">
            <div class="acc-name">${escHTML(i.nombre)}</div>
            <div class="acc-sub">${i.costo_puntos.toLocaleString('es-AR')} pts · ${escHTML(i.tipo)} · ${escHTML(tipoBenLbl[i.tipo_beneficio] || 'Manual')}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button onclick="abrirFormCanje('${i.id}')" style="background:var(--surface);border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:13px">✏️</button>
            <button onclick="toggleCanjeAdmin('${i.id}',${!i.activo})" style="background:var(--surface);border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:13px">${i.activo ? '🚫' : '✅'}</button>
            <button onclick="eliminarCanjeAdmin('${i.id}')" style="background:var(--surface);border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:13px">🗑️</button>
          </div>
        </div>`).join('');
    } catch(e) {
      el.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:13px;color:var(--ink3)">Error al cargar.</div>';
    }
  }

  let _canjesAdminCache = [];

  function onCambioTipoBeneficio() {
    const tipo = document.getElementById('cf-tipo-beneficio').value;
    const wrap = document.getElementById('cf-valor-wrap');
    const selPlan = document.getElementById('cf-valor-plan');
    const inpPts  = document.getElementById('cf-valor-puntos');
    const lbl = document.getElementById('cf-valor-label');
    if (tipo === 'manual') {
      wrap.style.display = 'none';
    } else if (tipo === 'plan_mes') {
      wrap.style.display = ''; lbl.textContent = 'Plan a regalar';
      selPlan.style.display = ''; inpPts.style.display = 'none';
    } else if (tipo === 'puntos_extra') {
      wrap.style.display = ''; lbl.textContent = 'Cantidad de puntos';
      selPlan.style.display = 'none'; inpPts.style.display = '';
    }
  }
  window.onCambioTipoBeneficio = onCambioTipoBeneficio;

  async function abrirFormCanje(id) {
    document.getElementById('cf-id').value = '';
    document.getElementById('cf-nombre').value = '';
    document.getElementById('cf-descripcion').value = '';
    document.getElementById('cf-icono').value = '🎁';
    document.getElementById('cf-costo').value = '';
    document.getElementById('cf-tipo').value = 'ambos';
    document.getElementById('cf-tipo-beneficio').value = 'manual';
    document.getElementById('cf-activo').checked = true;
    document.getElementById('canje-form-title').textContent = 'Nuevo beneficio';
    onCambioTipoBeneficio();

    if (id) {
      if (!_canjesAdminCache.length) _canjesAdminCache = await PronetDB.listarCatalogoCanjeAdmin();
      const item = _canjesAdminCache.find(c => c.id === id);
      if (item) {
        document.getElementById('canje-form-title').textContent = 'Editar beneficio';
        document.getElementById('cf-id').value = item.id;
        document.getElementById('cf-nombre').value = item.nombre || '';
        document.getElementById('cf-descripcion').value = item.descripcion || '';
        document.getElementById('cf-icono').value = item.icono || '🎁';
        document.getElementById('cf-costo').value = item.costo_puntos || '';
        document.getElementById('cf-tipo').value = item.tipo || 'ambos';
        document.getElementById('cf-tipo-beneficio').value = item.tipo_beneficio || 'manual';
        document.getElementById('cf-activo').checked = item.activo !== false;
        onCambioTipoBeneficio();
        if (item.tipo_beneficio === 'plan_mes') document.getElementById('cf-valor-plan').value = item.valor_beneficio || 'plus';
        if (item.tipo_beneficio === 'puntos_extra') document.getElementById('cf-valor-puntos').value = item.valor_beneficio || '';
      }
    }
    document.getElementById('canje-form-overlay').classList.add('show');
  }
  window.abrirFormCanje = abrirFormCanje;

  function cerrarFormCanje() {
    document.getElementById('canje-form-overlay').classList.remove('show');
  }
  window.cerrarFormCanje = cerrarFormCanje;

  async function guardarFormCanje() {
    const nombre = document.getElementById('cf-nombre').value.trim();
    const costo  = parseInt(document.getElementById('cf-costo').value, 10);
    if (!nombre || !costo || costo <= 0) {
      showToast && showToast('⚠️ Completá nombre y costo en puntos');
      return;
    }
    const tipoBen = document.getElementById('cf-tipo-beneficio').value;
    let valorBen = '';
    if (tipoBen === 'plan_mes') valorBen = document.getElementById('cf-valor-plan').value;
    if (tipoBen === 'puntos_extra') valorBen = document.getElementById('cf-valor-puntos').value;

    const canje = {
      id: document.getElementById('cf-id').value || null,
      nombre,
      descripcion: document.getElementById('cf-descripcion').value.trim(),
      icono: document.getElementById('cf-icono').value.trim() || '🎁',
      costo_puntos: costo,
      tipo: document.getElementById('cf-tipo').value,
      tipo_beneficio: tipoBen,
      valor_beneficio: valorBen,
      activo: document.getElementById('cf-activo').checked,
    };
    const res = await PronetDB.guardarCanje(canje);
    if (res.ok) {
      showToast && showToast('✅ Beneficio guardado');
      cerrarFormCanje();
      _canjesAdminCache = [];
      renderBeneficiosAdmin();
    } else {
      showToast && showToast('⚠️ No se pudo guardar');
    }
  }
  window.guardarFormCanje = guardarFormCanje;

  async function toggleCanjeAdmin(id, nuevoActivo) {
    const res = await PronetDB.toggleCanjeActivo(id, nuevoActivo);
    if (res.ok) { _canjesAdminCache = []; renderBeneficiosAdmin(); }
    else showToast && showToast('⚠️ No se pudo actualizar');
  }
  window.toggleCanjeAdmin = toggleCanjeAdmin;

  async function eliminarCanjeAdmin(id) {
    const nombre = _canjesAdminCache.find(c => c.id === id)?.nombre || '';
    if (!confirm('¿Eliminar el beneficio "' + nombre + '"? Esta acción no se puede deshacer.')) return;
    const res = await PronetDB.eliminarCanje(id);
    if (res.ok) { showToast && showToast('🗑️ Beneficio eliminado'); _canjesAdminCache = []; renderBeneficiosAdmin(); }
    else showToast && showToast('⚠️ No se pudo eliminar');
  }
  window.eliminarCanjeAdmin = eliminarCanjeAdmin;

  function tiempoRelativo(fecha) {
    const diff = (Date.now() - new Date(fecha).getTime()) / 1000;
    if (diff < 3600) return 'Hace ' + Math.floor(diff / 60) + ' min';
    if (diff < 86400) return 'Hace ' + Math.floor(diff / 3600) + ' hs';
    return 'Hace ' + Math.floor(diff / 86400) + ' días';
  }

  /** Resuelve una denuncia. Los tres caminos pasan por el mismo RPC, que
   *  registra QUÉ se decidió, quién y cuándo — antes confirmar y desestimar
   *  escribían el mismo estado y después no se distinguían. */
  async function accionDenuncia(id, resolucion) {
    try {
      const { data, error } = await window._sb.rpc('resolver_denuncia', {
        p_denuncia_id: id, p_resolucion: resolucion,
      });
      if (error) throw error;
      if (!data?.ok) { showToast && showToast('⚠️ ' + (data?.error || 'No se pudo resolver')); return; }

      if (resolucion === 'contacto') {
        showToast && showToast('✅ Marcada en revisión');
      } else if (resolucion === 'desestimada') {
        showToast && showToast('✅ Denuncia desestimada');
      } else if (data.suspendido) {
        showToast && showToast('🚫 Prestador suspendido automáticamente (3 faltas confirmadas)', null, true);
      } else if (!data.aplica_a_prestador) {
        // Al vecino denunciado no le pasa nada: no hay dónde acumular la
        // falta. Decirlo evita que el admin crea que aplicó una sanción.
        showToast && showToast('✓ Falta confirmada. Ojo: el denunciado no es prestador, así que no se le aplica ninguna sanción.', 6000);
      } else {
        showToast && showToast('✓ Falta confirmada (' + (data.denuncias || 1) + ' de 3 para la suspensión)');
      }
      renderModeracion();
      cargarBadgeDenuncias && cargarBadgeDenuncias();
    } catch (e) {
      const esConectividad = e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError');
      showToast && showToast(esConectividad ? '⚠️ Sin conexión. Intentá de nuevo.' : '❌ Error al actualizar: ' + (e?.message || 'intentá de nuevo'));
    }
  }

  /** Vuelve una denuncia a pendiente. Si había sumado al contador del
   *  prestador, se lo resta. La suspensión NO se levanta sola: pudo haberla
   *  puesto el admin a mano por otro motivo. Para eso está "Reactivar". */
  async function reabrirDenuncia(id) {
    if (!confirm('¿Reabrir esta denuncia? Vuelve a quedar pendiente y se descuenta la falta si la habías confirmado.')) return;
    try {
      const { data, error } = await window._sb.rpc('reabrir_denuncia', { p_denuncia_id: id });
      if (error) throw error;
      if (!data?.ok) { showToast && showToast('⚠️ ' + (data?.error || 'No se pudo reabrir')); return; }
      showToast && showToast(data.descontado
        ? '↩ Reabierta. Se descontó la falta del prestador.'
        : '↩ Reabierta.');
      renderModeracion();
      cargarBadgeDenuncias && cargarBadgeDenuncias();
    } catch (e) {
      showToast && showToast('❌ Error: ' + (e?.message || 'intentá de nuevo'));
    }
  }
  window.reabrirDenuncia = reabrirDenuncia;

  async function toggleSuspensionPrestador(prestadorId, suspender) {
    try {
      const { data, error } = await window._sb.rpc('admin_toggle_suspension', {
        p_prestador_id: prestadorId, p_suspendido: suspender
      });
      if (error) throw error;
      showToast && showToast(suspender ? '🚫 Prestador suspendido' : '✅ Prestador reactivado');
      renderModeracion();
    } catch (e) {
      showToast && showToast('❌ Error: ' + (e?.message || 'intentá de nuevo'));
    }
  }

  // ── CATÁLOGO DE SERVICIOS (ABM) ──────────────────────────────────────

  let catalogoActual = null;

  async function renderCatalogo() {
    if (!await verificarAdminServidor()) return;
    const lista = document.getElementById('catalogo-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando catálogo...</div>';
    try {
      const fichas = await PronetDB.listarCatalogo();
      const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      el('cat-count-rubros', fichas.length);
      el('cat-count-activos', fichas.filter(f => f.activo).length);
      el('cat-count-inactivos', fichas.filter(f => !f.activo).length);
      if (fichas.length === 0) {
        lista.innerHTML = '<div style="padding:60px 24px;text-align:center"><div style="font-size:40px;margin-bottom:10px">📚</div><div style="font-size:14px;font-weight:700;color:var(--ink)">Catálogo vacío</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">Tocá "+ Nuevo" para agregar el primer servicio.</div></div>';
        return;
      }
      lista.innerHTML = '';
      fichas.forEach(f => {
        const card = document.createElement('div');
        card.style.cssText = 'background:white;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.05);cursor:pointer;' + (f.activo ? '' : 'opacity:.55;');
        card.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:28px;flex-shrink:0">${escHTML(f.icono||'🔧')}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:var(--ink)">${escHTML(f.rubro)}${f.activo?'':' <span style="font-size:10px;color:var(--ink3);font-weight:400">(inactivo)</span>'}</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:2px">${escHTML(f.descripcion||'')}</div>
              <div style="font-size:12px;font-weight:600;color:var(--blue);margin-top:4px">$${(f.precio_ref_min||0).toLocaleString('es-AR')} – $${(f.precio_ref_max||0).toLocaleString('es-AR')} · ${escHTML(f.precio_unidad||'visita')}</div>
            </div>
            <button onclick="event.stopPropagation();abrirCatalogoForm('${f.id}')" style="background:var(--surface);border:1.5px solid var(--border);border-radius:8px;padding:5px 8px;font-size:11px;cursor:pointer;flex-shrink:0;font-family:'Inter',sans-serif">✏️</button>
          </div>
          ${f.incluye?.length?`<div style="margin-top:8px;font-size:11px;color:var(--green)">✅ ${f.incluye.slice(0,2).map(i=>escHTML(i)).join(' · ')}${f.incluye.length>2?` +${f.incluye.length-2} más`:''}</div>`:''}
          ${f.no_incluye?.length?`<div style="margin-top:2px;font-size:11px;color:var(--red)">❌ ${f.no_incluye.slice(0,2).map(i=>escHTML(i)).join(' · ')}${f.no_incluye.length>2?` +${f.no_incluye.length-2} más`:''}</div>`:''}`;
        card.addEventListener('click', () => abrirFicha(f));
        lista.appendChild(card);
      });
    } catch(e) {
      lista.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">Error al cargar el catálogo.</div>';
    }
  }

  function abrirFicha(ficha) {
    catalogoActual = ficha;
    const titulo = document.getElementById('ficha-titulo');
    if (titulo) titulo.textContent = ficha.rubro;
    const cont = document.getElementById('ficha-contenido');
    if (!cont) { goTo('s-ficha-ref'); return; }
    const incluyeHTML = (ficha.incluye||[]).map(i=>`<div class="ref-item inc"><span class="ri-ico">✅</span>${escHTML(i)}</div>`).join('');
    const noIncluyeHTML = (ficha.no_incluye||[]).map(i=>`<div class="ref-item exc"><span class="ri-ico">❌</span>${escHTML(i)}</div>`).join('');
    cont.innerHTML = `
      <div class="ref-card">
        <div class="ref-header">
          <div class="ref-cat-path">${escHTML(ficha.icono||'🔧')} ${escHTML(ficha.rubro)}</div>
          <div class="ref-title">${escHTML(ficha.rubro)}</div>
          <div class="ref-desc">${escHTML(ficha.descripcion||'')}</div>
        </div>
        ${incluyeHTML?`<div class="ref-section"><div class="ref-section-title">✅ Incluye</div><div class="ref-list">${incluyeHTML}</div></div>`:''}
        ${noIncluyeHTML?`<div class="ref-section"><div class="ref-section-title">❌ No incluye</div><div class="ref-list">${noIncluyeHTML}</div></div>`:''}
        <div class="ref-price-box">
          <div class="ref-price-label">💰 Precio referencial PRONET</div>
          <div class="ref-price-amount">$${(ficha.precio_ref_min||0).toLocaleString('es-AR')} – $${(ficha.precio_ref_max||0).toLocaleString('es-AR')}</div>
          <div class="ref-price-note">Por ${escHTML(ficha.precio_unidad||'visita')} · Puede variar según complejidad</div>
        </div>
        <div class="ref-disclaimer">
          <span style="font-size:14px;flex-shrink:0">⚠️</span>
          <span>Precio referencial basado en un servicio estándar. El precio final lo define el prestador en su propuesta.</span>
        </div>
      </div>`;
    goTo('s-ficha-ref');
  }

  function editarFichaActual() {
    if (catalogoActual) abrirCatalogoForm(catalogoActual.id);
  }

  function abrirCatalogoForm(id) {
    const titulo = document.getElementById('cat-form-titulo');
    const eliminarWrap = document.getElementById('cat-f-eliminar-wrap');
    const hiddenId = document.getElementById('cat-f-id');
    if (hiddenId) hiddenId.value = id || '';
    if (!id) {
      if (titulo) titulo.textContent = 'Nuevo servicio';
      if (eliminarWrap) eliminarWrap.style.display = 'none';
      ['cat-f-icono','cat-f-rubro','cat-f-descripcion','cat-f-precio-min','cat-f-precio-max','cat-f-unidad','cat-f-orden'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
      const activo = document.getElementById('cat-f-activo'); if (activo) activo.checked = true;
      catRenderLista('incluye', []); catRenderLista('no_incluye', []);
      goTo('s-catalogo-form');
    } else {
      PronetDB.obtenerFicha(id).then(f => {
        if (!f) { showToast && showToast('⚠️ No se encontró el servicio'); return; }
        if (titulo) titulo.textContent = 'Editar servicio';
        if (eliminarWrap) eliminarWrap.style.display = '';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
        set('cat-f-icono', f.icono); set('cat-f-rubro', f.rubro); set('cat-f-descripcion', f.descripcion);
        set('cat-f-precio-min', f.precio_ref_min); set('cat-f-precio-max', f.precio_ref_max);
        set('cat-f-unidad', f.precio_unidad); set('cat-f-orden', f.orden);
        const activo = document.getElementById('cat-f-activo'); if (activo) activo.checked = !!f.activo;
        catRenderLista('incluye', f.incluye||[]); catRenderLista('no_incluye', f.no_incluye||[]);
        goTo('s-catalogo-form');
      });
    }
  }

  function catRenderLista(tipo, items) {
    const id = tipo === 'incluye' ? 'cat-f-incluye-lista' : 'cat-f-noincluye-lista';
    const cont = document.getElementById(id); if (!cont) return;
    cont.innerHTML = '';
    items.forEach(item => catAgregarItemConValor(tipo, item));
  }

  function catAgregarItem(tipo) { catAgregarItemConValor(tipo, ''); }

  function catAgregarItemConValor(tipo, valor) {
    const contId = tipo === 'incluye' ? 'cat-f-incluye-lista' : 'cat-f-noincluye-lista';
    const cont = document.getElementById(contId); if (!cont) return;
    const row = document.createElement('div');
    row.className = 'incexc-row';
    row.innerHTML = `<input class="incexc-input cat-item-${tipo}" value="${escHTML(valor)}" placeholder="Agregar item..."><button onclick="this.parentElement.remove()" style="background:#FFF1F2;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--red);font-size:14px;font-weight:700">−</button>`;
    cont.appendChild(row);
    const inp = row.querySelector('input'); if (inp && !valor) inp.focus();
  }

  async function guardarFichaCatalogo() {
    const get = id => document.getElementById(id)?.value?.trim()||'';
    const rubro = get('cat-f-rubro');
    if (!rubro) { showToast && showToast('⚠️ El rubro es obligatorio'); return; }
    const precioMin = parseInt(get('cat-f-precio-min'))||0;
    const precioMax = parseInt(get('cat-f-precio-max'))||0;
    if (precioMax > 0 && precioMin > precioMax) { showToast && showToast('⚠️ El mínimo no puede ser mayor al máximo'); return; }
    const incluye = [...document.querySelectorAll('.cat-item-incluye')].map(i=>i.value.trim()).filter(Boolean);
    const noIncluye = [...document.querySelectorAll('.cat-item-no_incluye')].map(i=>i.value.trim()).filter(Boolean);
    const id = get('cat-f-id');
    const datos = { icono: get('cat-f-icono')||'🔧', rubro, descripcion: get('cat-f-descripcion'), incluye, no_incluye: noIncluye, precio_ref_min: precioMin, precio_ref_max: precioMax, precio_unidad: get('cat-f-unidad')||'visita', orden: parseInt(get('cat-f-orden'))||99, activo: document.getElementById('cat-f-activo')?.checked??true };
    if (id) datos.id = id;
    const btn = document.querySelector('#s-catalogo-form .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    try {
      const result = await PronetDB.guardarFicha(datos);
      if (result) {
        showToast && showToast('✅ Servicio guardado');
        SLIDER_RANGOS[rubro] = { min: precioMin||30000, max: precioMax||500000 };
        if (datos.activo) RUBROS_CON_CATALOGO.add(rubro); else RUBROS_CON_CATALOGO.delete(rubro);
        goTo('s-catalogo');
      } else {
        showToast && showToast('❌ Error al guardar. Verificá los permisos.');
      }
    } catch(e) {
      showToast && showToast('❌ Error: ' + (e?.message||'intentá de nuevo'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar servicio'; }
    }
  }

  async function eliminarFichaActual() {
    const id = document.getElementById('cat-f-id')?.value;
    const rubro = document.getElementById('cat-f-rubro')?.value;
    if (!id) return;
    if (!confirm(`¿Eliminar el servicio "${rubro}"? Esta acción no se puede deshacer.`)) return;
    const ok = await PronetDB.eliminarFicha(id);
    if (ok) { showToast && showToast('✅ Servicio eliminado'); goTo('s-catalogo'); }
    else { showToast && showToast('❌ Error al eliminar'); }
  }

  // ── FOTOS DE PORTFOLIO ───────────────────────────────────────────────

  async function cargarPortfolioPerfil(prestadorId) {
    const grid = document.getElementById('prof-portfolio-grid');
    if (!grid || !prestadorId) return;
    grid.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:var(--ink3);width:100%">⏳ Cargando...</div>';
    const fotos = await PronetDB.listarPortfolio(prestadorId).catch(() => []);
    if (fotos.length === 0) {
      grid.innerHTML = '<div style="padding:20px 0;text-align:center;font-size:12px;color:var(--ink3);width:100%">Sin fotos aún</div>';
      return;
    }
    grid.innerHTML = fotos.map(f =>
      `<div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer" onclick="abrirFotoModal(this.querySelector('img').src)">
        <img src="${escHTML(f.url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" alt="${escHTML(f.descripcion||'Foto de trabajo')}">
      </div>`
    ).join('');
  }

  async function cargarPortfolioEdit(prestadorId) {
    const grid = document.getElementById('portfolio-edit-grid');
    const count = document.getElementById('portfolio-count');
    if (!grid || !prestadorId) return;
    const fotos = await PronetDB.listarPortfolio(prestadorId).catch(() => []);
    const maxFotos = limitePlan('fotos_portfolio');
    if (count) count.textContent = fotos.length + '/' + (maxFotos == null ? '∞' : maxFotos);
    if (fotos.length === 0) {
      grid.innerHTML = '<div style="padding:16px 0;text-align:center;font-size:12px;color:var(--ink3);grid-column:span 3">Sin fotos aún</div>';
      return;
    }
    grid.innerHTML = fotos.map(f =>
      `<div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden">
        <img src="${escHTML(f.url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
        <button onclick="eliminarFotoPortfolio('${f.id}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);border:none;border-radius:50%;width:24px;height:24px;color:white;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
      </div>`
    ).join('');
  }

  async function onFotoPortfolioSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!usuarioActual?.prestador_id) { showToast && showToast('⚠️ No tenés perfil de prestador'); return; }
    const fotos = await PronetDB.listarPortfolio(usuarioActual.prestador_id).catch(() => []);
    const maxFotos = limitePlan('fotos_portfolio');
    if (maxFotos != null && fotos.length >= maxFotos) {
      avisarLimitePlan('Llegaste al límite de ' + maxFotos + ' fotos de portfolio');
      return;
    }
    showToast && showToast('⏳ Subiendo foto...');
    // Resize a 800px antes de subir
    const resized = await resizarImagen(file, PRONET_CONFIG.IMG_PORTFOLIO_PX);
    let result = null, errSubida = null;
    try { result = await PronetDB.subirFotoPortfolio(usuarioActual.prestador_id, resized); }
    catch (e) { errSubida = e; }
    if (result) {
      showToast && showToast('✅ Foto agregada');
      cargarPortfolioEdit(usuarioActual.prestador_id);
      cargarPortfolioPerfil(usuarioActual.prestador_id);
    } else if (String(errSubida?.message || '').includes('limite_portfolio')) {
      avisarLimitePlan('Llegaste al límite de fotos de portfolio');
    } else {
      showToast && showToast('❌ Error al subir la foto');
    }
  }

  async function eliminarFotoPortfolio(fotoId) {
    if (!confirm('¿Eliminar esta foto?')) return;
    const ok = await PronetDB.eliminarFotoPortfolio(fotoId).catch(() => false);
    if (ok) {
      showToast && showToast('✅ Foto eliminada');
      cargarPortfolioEdit(usuarioActual?.prestador_id);
      cargarPortfolioPerfil(usuarioActual?.prestador_id);
    } else {
      showToast && showToast('❌ Error al eliminar');
    }
  }

  // ── FOTOS DE TRABAJO ─────────────────────────────────────────────────

  function toggleFotosChat() {
    const panel = document.getElementById('chat-fotos-galeria');
    if (!panel) return;
    const visible = panel.style.display !== 'none' && panel.style.display !== '';
    panel.style.display = visible ? 'none' : '';
    if (!visible && chatActualId) cargarFotosTrabajo(chatActualId);
  }

  async function cargarFotosTrabajo(chatId) {
    const lista = document.getElementById('chat-fotos-lista');
    if (!lista || !chatId) return;
    lista.innerHTML = '<div style="font-size:12px;color:var(--ink3);padding:4px 0">⏳ Cargando...</div>';
    const fotos = await PronetDB.listarFotosTrabajo(chatId).catch(() => []);
    if (fotos.length === 0) {
      lista.innerHTML = '<div style="font-size:12px;color:var(--ink3);padding:4px 0">Sin fotos aún</div>';
      return;
    }
    lista.innerHTML = fotos.map(f =>
      `<div style="flex-shrink:0;width:72px;height:72px;border-radius:8px;overflow:hidden;cursor:pointer;position:relative" onclick="abrirFotoModal(this.querySelector('img').src)">
        <img src="${escHTML(f.url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
      </div>`
    ).join('');
  }

  function subirFotoTrabajo() {
    document.getElementById('foto-trabajo-input')?.click();
  }

  async function onFotoTrabajoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!chatActualId) { showToast && showToast('⚠️ No hay chat activo'); return; }
    const fotos = await PronetDB.listarFotosTrabajo(chatActualId).catch(() => []);
    if (fotos.length >= 5) { showToast && showToast('⚠️ Límite de 5 fotos por trabajo'); return; }
    showToast && showToast('⏳ Subiendo foto...');
    const resized = await resizarImagen(file, PRONET_CONFIG.IMG_TRABAJO_PX);
    const result = await PronetDB.subirFotoTrabajo(chatActualId, resized).catch(() => null);
    if (result) {
      showToast && showToast('✅ Foto agregada al trabajo');
      cargarFotosTrabajo(chatActualId);
    } else {
      showToast && showToast('❌ Error al subir la foto');
    }
  }

  function abrirFotoModal(url) {
    // Modal simple para ver foto a pantalla completa
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${escHTML(url)}" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px">
      <button style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.2);border:none;border-radius:50%;width:36px;height:36px;color:white;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>`;
    document.body.appendChild(overlay);
  }
  // Se llama desde onclick inline (portfolio, fotos de pedido, adjuntos de
  // propuesta), que solo ve el scope global — sin esto tira ReferenceError.
  window.abrirFotoModal = abrirFotoModal;

  // Helper: redimensionar imagen antes de subir
  function resizarImagen(file, maxPx) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.85);
      };
      img.src = url;
    });
  }

  // ── HISTORIAL DE TRABAJOS (dinámico) ─────────────────────────────────

  let historialData = []; // cache para filtrar sin recargar

  async function renderHistorial(filtro = 'todos') {
    const lista = document.getElementById('hist-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando historial...</div>';
    try {
      historialData = await PronetDB.listarHistorialPrestador();
      renderHistorialFiltrado(filtro);
    } catch(e) {
      lista.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">Error al cargar el historial.</div>';
    }
  }

  function filtrarHistorial(filtro, chip) {
    document.querySelectorAll('#s-historial .chip').forEach(c => c.classList.remove('on'));
    if (chip) chip.classList.add('on');
    renderHistorialFiltrado(filtro);
  }

  function renderHistorialFiltrado(filtro) {
    const lista = document.getElementById('hist-lista');
    if (!lista) return;

    let items = historialData;
    if (filtro === 'sin_resena') items = historialData.filter(t => !t.resena);
    if (filtro === 'con_resena') items = historialData.filter(t => t.resena);

    // Stats
    const total = historialData.length;
    const facturado = historialData.reduce((s, t) => s + (t.precio || 0), 0);
    const ratings = historialData.filter(t => t.resena?.estrellas).map(t => t.resena.estrellas);
    const rating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '–';
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('hist-count-total', total);
    setEl('hist-facturado', facturado >= 1000 ? '$' + Math.round(facturado/1000) + 'k' : '$' + facturado.toLocaleString('es-AR'));
    setEl('hist-rating', rating);

    if (items.length === 0) {
      lista.innerHTML = '<div style="padding:60px 24px;text-align:center"><div style="font-size:40px;margin-bottom:10px">📋</div><div style="font-size:14px;font-weight:700;color:var(--ink)">' + (total === 0 ? 'Sin trabajos aún' : 'Sin resultados') + '</div><div style="font-size:13px;color:var(--ink3);margin-top:4px">' + (total === 0 ? 'Cuando te elijan en un pedido aparecerá aquí.' : 'Probá otro filtro.') + '</div></div>';
      return;
    }

    lista.innerHTML = '';
    // Agrupar por mes/año
    const grupos = {};
    items.forEach(t => {
      const fecha = new Date(t.creado);
      const key = fecha.getFullYear() + '-' + String(fecha.getMonth()+1).padStart(2,'0');
      const label = fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
      if (!grupos[key]) grupos[key] = { label, items: [] };
      grupos[key].items.push(t);
    });

    Object.keys(grupos).sort((a,b) => b.localeCompare(a)).forEach(key => {
      const grupo = grupos[key];
      const header = document.createElement('div');
      header.style.cssText = 'padding:12px 14px 4px;font-size:11px;color:var(--ink3);text-transform:capitalize';
      header.textContent = grupo.label + ' · ' + grupo.items.length + ' trabajo' + (grupo.items.length > 1 ? 's' : '');
      lista.appendChild(header);

      grupo.items.forEach(t => {
        const tieneResena = !!t.resena;
        const estrellas = t.resena?.estrellas || 0;
        const precioTxt = t.modalidad === 'rango'
          ? '$' + (t.precio||0).toLocaleString('es-AR') + '–$' + (t.precio_max||0).toLocaleString('es-AR')
          : '$' + (t.precio||0).toLocaleString('es-AR');
        const fechaTxt = new Date(t.creado).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
        const iniciales = (t.vecino_nombre||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const colores = ['#ECFDF5,#059669','#EEF2FF,#2B5BFF','#FFF8EC,#C67D00','#F5F3FF,#7C3AED','#F0FDF4,#16A34A','#FFF1F2,#E11D48'];
        const col = colores[t.vecino_nombre?.charCodeAt(0) % colores.length] || colores[0];
        const [bg, fg] = col.split(',');

        const item = document.createElement('div');
        item.className = 'hist-item';
        item.innerHTML = `
          <div class="hi-top">
            <div class="hi-av" style="background:${bg};color:${fg}">${escHTML(iniciales)}</div>
            <div>
              <div class="hi-name">${escHTML(t.vecino_nombre)}</div>
              <div class="hi-role">${escHTML(t.rubro)} · ${escHTML(t.zona)}</div>
            </div>
            <div class="hi-date">${escHTML(fechaTxt)}</div>
          </div>
          <div class="hi-foot">
            <div class="hi-precio">${escHTML(precioTxt)}</div>
            <div class="hi-estado ${tieneResena ? 'hi-completado' : 'hi-reseña-pend'}">
              ${tieneResena ? '✓ Completado · ★ ' + estrellas : '⭐ Sin reseña'}
            </div>
          </div>`;
        lista.appendChild(item);
      });
    });
  }

  async function cargarSliderRangosDesdeDB() {
    // Con el catálogo apagado, no se marca ningún rubro como "con catálogo real" —
    // el fallback de config.js sigue fijando límites del slider, pero ninguna
    // pantalla muestra "Ref. PRONET" sin este flag.
    if (!FEATURES.catalogoPrecios) return;
    try {
      const fichas = await PronetDB.listarCatalogo(true);
      fichas.forEach(f => {
        if (f.rubro && f.precio_ref_min && f.precio_ref_max) {
          SLIDER_RANGOS[f.rubro] = { min: f.precio_ref_min, max: f.precio_ref_max };
          RUBROS_CON_CATALOGO.add(f.rubro);
        }
      });
    } catch(e) { console.warn('[cargarSliderRangosDesdeDB]', e); }
  }

  // Ajusta el banner del Home según el tipo de usuario
  // ══ CARRUSEL DE PUBLICIDAD ═════════════════════════════════════════
  //
  // Rota solo y se puede deslizar. El movimiento se hace con scrollTo()
  // sobre un contenedor con scroll-snap, no con transform + un índice
  // propio: así el deslizar del dedo y la rotación automática comparten la
  // misma fuente de verdad —la posición del scroll— y no pueden quedar
  // desfasados, que es el bug clásico de los carruseles hechos a mano.

  let _adsTimer = null;
  let _adsPausado = false;
  let _adsObserver = null;

  async function pintarBanners() {
    const caja  = document.getElementById('home-ads');
    const track = document.getElementById('home-ads-track');
    const dots  = document.getElementById('home-ads-dots');
    if (!caja || !track) return;

    const banners = await PronetDB.listarBannersVigentes().catch(() => []);
    // Las tarjetas propias —el CTA que cambia según el usuario y Urgencias—
    // van como slides del carrusel y no como bloques apilados arriba. Antes
    // sumaban 148px de alto propio y empujaban el feed fuera de la pantalla;
    // acá ocupan cero espacio extra y además rotan, que es lo que hace que
    // se vean.
    const propias = slidesPropias();
    const total = propias.length + banners.length;
    if (!total) { caja.style.display = 'none'; detenerAds(); return; }

    track.innerHTML = propias.join('') + banners.map((b, i) => {
      // <button> y no <div>: es un elemento clickeable, y así se llega con
      // el teclado y lo anuncia el lector de pantalla sin agregar nada.
      const alt = 'Publicidad ' + (i + 1) + ' de ' + banners.length;
      // Sin `loading="lazy"`, a propósito. Adentro de un contenedor con
      // scroll horizontal hay motores que nunca consideran visibles a las
      // imágenes y no las bajan NI deslizando hasta ellas: quedaba el hueco
      // del banner en blanco aunque la URL respondiera 200 (verificado el
      // 2026-08-09). Son pocas y están arriba de todo, así que se cargan
      // todas; lo que hay que cuidar es que pesen poco.
      const carga = i === 0 ? ' fetchpriority="high"' : '';
      return '<button class="ads-slide" data-id="' + escHTML(b.id) + '"' +
             (b.enlace ? ' data-enlace="' + escHTML(b.enlace) + '"' : '') +
             ' aria-label="' + alt + '">' +
             '<img src="' + escHTML(b.imagen_url) + '" alt=""' + carga + '></button>';
    }).join('');

    dots.innerHTML = total > 1
      ? Array.from({ length: total }, (_, i) =>
          '<button class="ads-dot' + (i === 0 ? ' on' : '') + '" data-i="' + i +
          '" aria-label="Ir al aviso ' + (i + 1) + '"></button>').join('')
      : '';

    track.querySelectorAll('.ads-slide').forEach(el => {
      // Las propias llevan `data-accion`; las de publicidad, `data-id`.
      const accion = el.dataset.accion;
      el.addEventListener('click', accion === 'cta'      ? () => bannerAction()
                                 : accion === 'urgencia' ? () => verUrgencias()
                                 : () => abrirBanner(el.dataset.id, el.dataset.enlace));
    });
    dots.querySelectorAll('.ads-dot').forEach(d => {
      d.addEventListener('click', () => irASlide(Number(d.dataset.i)));
    });

    // El punto activo se sincroniza con un IntersectionObserver y NO con el
    // evento 'scroll': hay contextos donde ese evento no se dispara para un
    // scroll programático —verificado acá el 2026-08-09, scrollLeft pasaba
    // de 0 a 715 sin un solo disparo— y los puntos quedaban clavados en el
    // primero. El observer mira qué slide está a la vista, que es la
    // pregunta real, y sirve igual para el dedo que para la rotación.
    if (_adsObserver) _adsObserver.disconnect();
    _adsObserver = new IntersectionObserver((entradas) => {
      entradas.forEach(e => {
        if (!e.isIntersecting || e.intersectionRatio < 0.6) return;
        marcarPunto([...track.children].indexOf(e.target));
      });
    }, { root: track, threshold: [0.6] });
    [...track.children].forEach(el => _adsObserver.observe(el));
    // Mientras lo está tocando no se le mueve solo de abajo del dedo.
    track.onpointerdown  = () => { _adsPausado = true; };
    track.onpointerup    = () => { _adsPausado = false; };
    track.onpointercancel = () => { _adsPausado = false; };

    caja.style.display = 'block';
    arrancarAds(total);
  }

  /** Las tarjetas propias del carrusel: el CTA que cambia según el usuario y
   *  la banda de Urgencias.
   *
   *  Antes vivían como bloques apilados arriba del feed (#home-banner y
   *  #home-urgencias, ahora ocultos). Sumaban 148px de alto propio y, con el
   *  carrusel y el buscador, empujaban la primera tarjeta de prestador fuera
   *  de la pantalla. Como slides no ocupan alto extra y encima rotan.
   *
   *  Para el prestador no se arma ninguna: su Inicio es el tablero, y estos
   *  dos bloques ya estaban ocultos para él. */
  function slidesPropias() {
    if (esPrestador()) return [];
    const tipo = usuarioActual ? usuarioActual.tipo : 'invitado';
    const cta = tipo === 'cliente'
      ? { icono: '📋', titulo: 'Publicá tu pedido gratis', sub: 'Recibí propuestas de prestadores de tu zona' }
      : { icono: '🚀', titulo: 'Sumate a PRONET gratis',   sub: 'Publicá pedidos y contactá prestadores' };

    const tarjeta = (accion, fondo, color, icono, titulo, sub) =>
      '<button class="ads-slide ads-propia" data-accion="' + accion + '"' +
      ' style="background:' + fondo + '" aria-label="' + escHTML(titulo) + '">' +
        '<div class="ads-propia-in">' +
          '<div class="ads-propia-ico">' + icono + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="ads-propia-tit" style="color:' + color + '">' + escHTML(titulo) + '</div>' +
            '<div class="ads-propia-sub" style="color:' + color + '">' + escHTML(sub) + '</div>' +
          '</div>' +
          '<span class="ads-propia-fle" style="color:' + color + '">›</span>' +
        '</div></button>';

    const slides = [
      tarjeta('cta', 'linear-gradient(135deg,#0D0F1A,#1A3ACC)', '#fff',
              cta.icono, cta.titulo, cta.sub),
    ];
    // Urgencias sólo si la feature está prendida, igual que el bloque viejo.
    if (!document.getElementById('home-urgencias')?.hasAttribute('data-feature-off')) {
      slides.push(tarjeta('urgencia', 'linear-gradient(135deg,#BE123C,#F43F5E)', '#fff',
              '⚡', 'Urgencias', 'Prestadores con atención inmediata en tu zona'));
    }
    return slides;
  }

  /** Qué slide se está viendo: el que tiene el centro más cerca del centro
   *  del carrusel.
   *
   *  Dividir scrollLeft por el ancho del contenedor NO sirve: hay `gap`
   *  entre slides, así que el slide i no arranca en i·ancho sino un poco más
   *  a la derecha, y el desfasaje se acumula. Con 5 slides ya erraba de
   *  slide y el punto activo se quedaba pegado en el primero. */
  function slideVisible(track) {
    const centro = track.getBoundingClientRect().left + track.clientWidth / 2;
    let mejor = 0, dist = Infinity;
    [...track.children].forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs((r.left + r.width / 2) - centro);
      if (d < dist) { dist = d; mejor = i; }
    });
    return mejor;
  }

  function marcarPunto(i) {
    document.querySelectorAll('#home-ads-dots .ads-dot')
      .forEach((d, j) => d.classList.toggle('on', j === i));
  }

  function irASlide(i) {
    const track = document.getElementById('home-ads-track');
    const el = track?.children[i];
    if (!track || !el) return;
    // Posición REAL del slide, no una multiplicación: ver slideVisible().
    const destino = el.getBoundingClientRect().left
                  - track.getBoundingClientRect().left + track.scrollLeft;
    track.scrollTo({ left: destino, behavior: 'smooth' });
    // Se marca acá y no sólo desde el observer: cuando el movimiento lo
    // pedimos nosotros ya sabemos a qué slide vamos, y así el punto queda
    // bien aunque el navegador no emita eventos de scroll ni de
    // intersección — que es exactamente lo que pasa en algunos contextos.
    marcarPunto(i);
  }

  function arrancarAds(total) {
    detenerAds();
    if (total < 2) return;
    // Quien pidió menos animación no debería tener algo moviéndose solo.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    _adsTimer = setInterval(() => {
      const track = document.getElementById('home-ads-track');
      // Si la pantalla no está visible el ancho es 0 y el cálculo se rompe;
      // además rotar en una pantalla que nadie mira sólo gasta batería.
      if (!track || !track.clientWidth || _adsPausado) return;
      irASlide((slideVisible(track) + 1) % total);
    }, 5000);
  }

  function detenerAds() {
    if (_adsTimer) { clearInterval(_adsTimer); _adsTimer = null; }
  }

  function abrirBanner(id, enlace) {
    PronetDB.clickBanner(id);
    if (!enlace) return;
    // '#s-algo' navega dentro de la app; cualquier otra cosa es un sitio
    // externo y se abre aparte, sin sacar al usuario de PRONET.
    if (enlace.startsWith('#')) {
      const pantalla = enlace.slice(1);
      if (typeof goTo === 'function') goTo(pantalla);
    } else {
      // noopener: sin esto la página destino puede manipular la nuestra.
      window.open(enlace, '_blank', 'noopener,noreferrer');
    }
  }

  function setBannerContextual() {
    const icon = document.getElementById('home-banner-icon');
    const title = document.getElementById('home-banner-title');
    const sub = document.getElementById('home-banner-sub');
    if (!title || !sub) return;
    const tipo = usuarioActual ? usuarioActual.tipo : 'invitado';
    // El banner pasó a una sola línea, así que el subtítulo dejó de ser una
    // frase y es sólo la acción. Lo que se decía ahí ("recibí propuestas",
    // "conseguí clientes") se movió al título, que es lo único que se lee.
    if (esPrestador()) {
      if (icon) icon.textContent = '💼';
      title.textContent = 'Mirá los pedidos disponibles';
      sub.textContent = 'Ofertá →';
    } else if (tipo === 'cliente') {
      if (icon) icon.textContent = '📋';
      title.textContent = 'Publicá tu pedido gratis';
      sub.textContent = 'Publicar →';
    } else {
      if (icon) icon.textContent = '🚀';
      title.textContent = 'Sumate a PRONET gratis';
      sub.textContent = 'Registrarme →';
    }
  }

  // Acción del banner según contexto
  function bannerAction() {
    const tipo = usuarioActual ? usuarioActual.tipo : 'invitado';
    if (esPrestador()) {
      // Llevar a la pantalla completa de pedidos (con filtros y todos los pedidos)
      goTo('s-pedidos');
    } else if (tipo === 'cliente') {
      // Publicar pedido: primero mostrar la pantalla, después resetear al paso 1
      goTo('s-nuevo-pedido');
      npReset();
    } else {
      // Invitado: registro
      mostrarFormRegistro();
    }
  }

  // ── ProMarket mapa — centroides por zona ─────────────────────────────────
  const MKT_ZONA_COORD = {
    'Puertos del Lago': { lat: -34.2960, lng: -58.7460 },
    'El Cantón':        { lat: -34.3350, lng: -58.7580 },
    'San Matías':       { lat: -34.2640, lng: -58.7880 },
    'El Naudir':        { lat: -34.3050, lng: -58.8050 },
    'CUBE':             { lat: -34.3180, lng: -58.7720 },
    'El Cazador':       { lat: -34.3900, lng: -58.8230 },
    'Nordelta':         { lat: -34.4000, lng: -58.6500 }, // Tigre, no Escobar — coordenada real del centro de Nordelta
    'Escobar Centro':   { lat: -34.3494, lng: -58.7938 },
    'Escobar':          { lat: -34.3486, lng: -58.8100 },
    'Matheu / Garín':   { lat: -34.4420, lng: -58.7050 },
    'Garín':            { lat: -34.4280, lng: -58.7300 },
  };
  let mapaGoogleMkt = null;
  let mktMarcadores = [];
  let mktModo = 'lista'; // 'lista' | 'mapa'

  // ── Google Maps ──────────────────────────────────────────────────────────
  let mapaGoogle = null;       // instancia google.maps.Map
  let mapaUserMarker = null;   // marcador de la ubicación del usuario
  let mapaPrestMarkers = [];   // marcadores de los prestadores
  let userLat = null, userLng = null; // coords GPS del usuario (null = desconocidas)

  // Coordenadas del centro de Escobar como fallback
  const ESCOBAR_LAT = -34.3486, ESCOBAR_LNG = -58.8100;

  function calcDistanciaKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function formatDistancia(km) {
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
  }

  function cargarGoogleMapsAPI() {
    const key = PRONET_CONFIG.MAPS_KEY;
    if (!key) return Promise.resolve(false);
    if (window.google?.maps) return Promise.resolve(true);
    return new Promise((resolve) => {
      window._initGoogleMaps = () => { delete window._initGoogleMaps; resolve(true); };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&callback=_initGoogleMaps&loading=async';
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function initMapaGoogle() {
    if (mapaGoogle) return true;
    const loaded = await cargarGoogleMapsAPI();
    if (!loaded) return false;
    const container = document.getElementById('google-map');
    if (!container) return false;
    container.style.display = 'block';
    document.getElementById('mapa-pins')?.style.setProperty('display', 'none');
    document.querySelector('#s-mapa .map-bg')?.classList.add('maps-activo');
    const center = userLat ? { lat: userLat, lng: userLng } : { lat: ESCOBAR_LAT, lng: ESCOBAR_LNG };
    mapaGoogle = new google.maps.Map(container, {
      center,
      zoom: 14,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
      ],
    });
    return true;
  }

  function renderPinesGoogle(prestadores) {
    mapaPrestMarkers.forEach(m => m.setMap(null));
    mapaPrestMarkers = [];
    const bounds = new google.maps.LatLngBounds();
    if (userLat) bounds.extend({ lat: userLat, lng: userLng });
    prestadores.forEach((p, i) => {
      if (!p.lat || !p.lng) return;
      const rubro = p.rubro || '';
      const icono = rubro.includes('lectric') ? '⚡'
                  : rubro.includes('impieza') ? '🧹'
                  : rubro.includes('uidado') ? '👶'
                  : rubro.includes('ascotas') ? '🐕'
                  : rubro.includes('ardineria') || rubro.includes('ardinería') ? '🌿'
                  : rubro.includes('lomeria') || rubro.includes('lomería') ? '🚰'
                  : rubro.includes('intura') ? '🎨'
                  : '🔧';
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: mapaGoogle,
        title: (p.nombre || 'Prestador') + ' · ' + icono,
      });
      marker.addListener('click', () => {
        const cards = document.querySelectorAll('.sheet-card');
        cards.forEach((c, j) => c.classList.toggle('selected', j === i));
        cards[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      });
      mapaPrestMarkers.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });
    if (!bounds.isEmpty() && mapaPrestMarkers.length > 0) mapaGoogle.fitBounds(bounds, 60);
  }

  async function geocodificarDireccion(direccion) {
    const key = PRONET_CONFIG.MAPS_KEY;
    if (!key || !direccion) return null;
    try {
      const resp = await fetch(
        'https://maps.googleapis.com/maps/api/geocode/json?address='
        + encodeURIComponent(direccion + ', Escobar, Buenos Aires, Argentina')
        + '&key=' + key
      );
      const data = await resp.json();
      if (data.status !== 'OK' || !data.results[0]) return null;
      return data.results[0].geometry.location;
    } catch (e) { return null; }
  }
  // ── /Google Maps ─────────────────────────────────────────────────────────

  // Genera una posición pseudo-aleatoria pero consistente para un prestador
  // basada en su ID — siempre el mismo pin en el mismo lugar
  function posicionPin(id, index) {
    // Usar los primeros 8 chars del UUID para derivar x,y
    const hash = id ? parseInt(id.replace(/-/g,'').slice(0,8), 16) : index * 12345;
    // Distribuir en una grilla evitando los bordes y el centro (donde está "mi ubicación")
    const zonas = [
      {x:[15,35], y:[20,45]},  // izquierda arriba
      {x:[55,75], y:[20,40]},  // derecha arriba
      {x:[65,82], y:[45,65]},  // derecha abajo
      {x:[15,35], y:[55,75]},  // izquierda abajo
      {x:[35,48], y:[20,38]},  // centro arriba
      {x:[60,78], y:[22,38]},  // derecha arriba 2
      {x:[20,38], y:[40,55]},  // izquierda centro
      {x:[68,82], y:[55,70]},  // derecha abajo 2
    ];
    const zona = zonas[Math.abs(hash) % zonas.length];
    const x = zona.x[0] + (Math.abs(hash >> 4) % (zona.x[1] - zona.x[0]));
    const y = zona.y[0] + (Math.abs(hash >> 8) % (zona.y[1] - zona.y[0]));
    return { x, y };
  }

  // Separa pines que quedaron demasiado cerca (evita burbujas superpuestas).
  // La burbuja es ~110px ancho x ~46px alto sobre ~340x280px → ~32% x 16%.
  function separarPines(posiciones) {
    const MIN_X = 32, MIN_Y = 18;
    for (let pasada = 0; pasada < 12; pasada++) {
      let huboChoque = false;
      for (let a = 0; a < posiciones.length; a++) {
        for (let b = a + 1; b < posiciones.length; b++) {
          const dx = posiciones[b].x - posiciones[a].x;
          const dy = posiciones[b].y - posiciones[a].y;
          if (Math.abs(dx) >= MIN_X || Math.abs(dy) >= MIN_Y) continue;
          huboChoque = true;
          const gapX = MIN_X - Math.abs(dx);
          const gapY = MIN_Y - Math.abs(dy);
          if (gapY <= gapX) {
            const empuje = gapY / 2 + 1;
            posiciones[a].y -= (dy >= 0 ? empuje : -empuje);
            posiciones[b].y += (dy >= 0 ? empuje : -empuje);
          } else {
            const empuje = gapX / 2 + 1;
            posiciones[a].x -= (dx >= 0 ? empuje : -empuje);
            posiciones[b].x += (dx >= 0 ? empuje : -empuje);
          }
        }
      }
      if (!huboChoque) break;
    }
    posiciones.forEach(p => {
      p.x = Math.min(80, Math.max(10, p.x));
      p.y = Math.min(76, Math.max(12, p.y));
    });
    return posiciones;
  }

  // Escapa texto para insertarlo seguro dentro de innerHTML
  function escHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Contenido de un avatar: foto real si el prestador subió una, iniciales si no
  function avatarInner(p) {
    if (p && p.foto_url) return '<img src="'+escHTML(p.foto_url)+'" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block">';
    return escHTML((p && p.iniciales) || '?');
  }

  function renderPinesMapa(prestadores) {
    const wrap = document.getElementById('mapa-pins');
    if (!wrap) return;
    wrap.innerHTML = '';
    // Máximo 8 pines para no saturar el mapa
    const visibles = prestadores.slice(0, PRONET_CONFIG.MAPA_PRESTADORES_MAX);
    // Calcular todas las posiciones primero y separar las que chocan
    const posiciones = separarPines(visibles.map((p, i) => posicionPin(p.id, i)));
    visibles.forEach((p, i) => {
      const pos = posiciones[i];
      const disponible = p.activo !== false;
      const rubro = p.rubro || '';
      const icono = rubro.includes('lectric') ? '⚡'
                  : rubro.includes('impieza') ? '🧹'
                  : rubro.includes('uidado') ? '👶'
                  : rubro.includes('ascotas') ? '🐕'
                  : rubro.includes('ardineria') || rubro.includes('ardinería') ? '🌿'
                  : rubro.includes('lomeria') || rubro.includes('lomería') ? '🚰'
                  : rubro.includes('intura') ? '🎨'
                  : '🔧';
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.style.cssText = 'left:'+pos.x+'%;top:'+pos.y+'%';
      if(disponible) {
        pin.innerHTML = '<div class="pin-bubble disp">'
          +'<div class="pin-av" style="background:'+escHTML(p.color_bg||'#EEF2FF')+';color:'+escHTML(p.color_text||'#2B5BFF')+'">'+escHTML(p.iniciales||'?')+'</div>'
          +'<div class="pin-info">'
          +'<div class="pin-name">'+escHTML((p.nombre||'').split(' ')[0]+' '+(((p.nombre||'').split(' ')[1]||'').charAt(0)))+'.</div>'
          +'<div class="pin-price">$'+(p.precio||0).toLocaleString('es-AR')+' · '+icono+'</div>'
          +'</div></div>'
          +'<div class="pin-dot disp"></div>';
        pin.style.cursor = 'pointer';
        pin.dataset.idx = i;
        pin.addEventListener('click', () => {
          // Seleccionar la card correspondiente en el sheet y llevarla a la vista
          const cards = document.querySelectorAll('.sheet-card');
          cards.forEach((c,j)=>c.classList.toggle('selected', j===i));
          const card = cards[i];
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          // Resaltar este pin y atenuar levemente el resto
          document.querySelectorAll('#mapa-pins .pin').forEach(el => {
            el.classList.toggle('pin-activo', el === pin);
          });
          prestadorActual = p;
        });
      } else {
        pin.innerHTML = '<div class="pin-bubble norm" style="opacity:.5">'
          +'<div class="pin-av" style="background:'+(p.color_bg||'#F5F5F5')+';color:'+(p.color_text||'#999')+'">'+(p.iniciales||'?')+'</div>'
          +'<div class="pin-info">'
          +'<div class="pin-name">'+(p.nombre||'').split(' ')[0]+'</div>'
          +'<div class="pin-price" style="color:#D1D5DB">No disp.</div>'
          +'</div></div>'
          +'<div class="pin-dot norm" style="opacity:.4"></div>';
      }
      wrap.appendChild(pin);
    });
  }

  // Toggle de chip del mapa: activa/desactiva el filtro y recarga el mapa
  function toggleMapChip(chip) {
    const filtro = chip.dataset.filtro;
    // "Disponibles ahora" es siempre activo (no se puede desactivar)
    if (filtro === 'disponible') return;
    // Los chips de rubro son mutuamente excluyentes entre sí
    if (filtro === 'rubro') {
      const estaActivo = chip.classList.contains('on');
      document.querySelectorAll('.map-chip[data-filtro="rubro"]').forEach(c => c.classList.remove('on'));
      if (!estaActivo) chip.classList.add('on');
    } else {
      chip.classList.toggle('on');
    }
    renderMapa();
  }

  // Flag para registrar los listeners del mapa solo una vez (evita acumulación)
  let mapaListenersOk = false;
  let mapaScrollTimer = null;
  let mapaIsDown = false, mapaStartX, mapaScrollLeft;

  async function renderMapa() {
    const wrap = document.getElementById('sheet-cards');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando prestadores cercanos...</div>';

    // Intentar inicializar Google Maps (no bloquea si no hay key)
    const mapsActivo = await initMapaGoogle();

    // Leer filtros activos de los chips
    const filtros = {};
    if (zonaActual) filtros.zona = zonaParaFiltro();
    const chipRubro = document.querySelector('.map-chip[data-filtro="rubro"].on');
    if (chipRubro) filtros.rubro = chipRubro.dataset.valor;
    const chipPrem = document.getElementById('mchip-prem');
    if (chipPrem && chipPrem.classList.contains('on')) filtros.premium = true;
    const prestadores = await PronetDB.listarPrestadores(filtros);
    wrap.innerHTML = '';
    const count = document.getElementById('sheet-count');
    if (count) count.textContent = prestadores.length + ' disponible' + (prestadores.length !== 1 ? 's' : '') + ' ahora';
    if (prestadores.length === 0) {
      wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">No hay prestadores en ' + (zonaActual || 'tu zona') + '.</div>';
      return;
    }

    // Distancias reales si el usuario dio GPS y el prestador tiene coords; fake si no
    const distanciasFake = ['300 m', '600 m', '800 m', '1.2 km', '1.5 km', '2 km', '2.4 km', '3 km'];
    prestadores.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'sheet-card' + (i === 0 ? ' selected' : '');
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => { prestadorActual = p; openChat(p.id || 'x'); });
      const badgeVerif = p.verificado ? ' <svg class="verified-badge" viewBox="0 0 18 20" fill="none"><path d="M9 1L2 4v6c0 4.4 3 8.5 7 9.5C13 18.5 16 14.4 16 10V4L9 1z" fill="#39FF14"/><path d="M5.5 10l2.5 2.5 4.5-4.5" stroke="#0D0F1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
      const badgePrem = p.premium ? ' · ⭐ Premium' : (p.verificado ? ' · ✓ Verif.' : '');
      let distTxt;
      if (userLat && p.lat && p.lng) {
        distTxt = formatDistancia(calcDistanciaKm(userLat, userLng, p.lat, p.lng));
      } else {
        distTxt = '';
      }
      card.innerHTML = `
        <div class="sc-top">
          <div class="sc-av" style="background:${escHTML(p.color_bg||'#EEF2FF')};color:${escHTML(p.color_text||'#2B5BFF')}">${avatarInner(p)}</div>
          <div>
            <div class="sc-name">${escHTML(p.nombre)} ${badgeVerif}</div>
            <div class="sc-role">${escHTML(p.rubro||'')}</div>
          </div>
        </div>
        <div class="sc-disp"><div class="sc-disp-dot"></div><div class="sc-disp-txt">Disponible ahora${distTxt ? ' · ' + distTxt : ''}</div></div>
        <div class="sc-price">$${(p.precio||0).toLocaleString('es-AR')} <span style="font-size:9px;color:var(--ink3)">/ ${escHTML(p.precio_unidad||'visita')}</span></div>
        <div class="sc-dist">${(p.resenas || 0) > 0 ? '⭐ ' + (p.rating || 5).toFixed(1) + ' · ' : ''}${escHTML(p.zona||'Escobar')}${badgePrem}</div>
        <button class="sc-btn">💬 Solicitar servicio</button>`;
      card.querySelector('.sc-btn').addEventListener('click', (e) => { e.stopPropagation(); prestadorActual = p; openChat(p.id || 'x'); });
      wrap.appendChild(card);
    });

    // Pines: Google Maps markers si la API está cargada, CSS pins si no
    if (mapsActivo) {
      renderPinesGoogle(prestadores);
    } else {
      renderPinesMapa(prestadores);
    }

    // Registrar listeners una sola vez — renderMapa() se llama en cada visita al mapa
    if (!mapaListenersOk) {
      mapaListenersOk = true;

      // Sincronización inversa: scrollear sheet resalta el pin correspondiente
      wrap.addEventListener('scroll', () => {
        clearTimeout(mapaScrollTimer);
        mapaScrollTimer = setTimeout(() => {
          const cards = wrap.querySelectorAll('.sheet-card');
          if (!cards.length) return;
          const centro = wrap.scrollLeft + wrap.clientWidth / 2;
          let mejor = 0, mejorDist = Infinity;
          cards.forEach((c, j) => {
            const d = Math.abs((c.offsetLeft + c.offsetWidth / 2) - centro);
            if (d < mejorDist) { mejorDist = d; mejor = j; }
          });
          cards.forEach((c, j) => c.classList.toggle('selected', j === mejor));
          document.querySelectorAll('#mapa-pins .pin').forEach(el => {
            el.classList.toggle('pin-activo', Number(el.dataset.idx) === mejor);
          });
        }, 120);
      }, { passive: true });

      // Drag-to-scroll y wheel-scroll en desktop
      wrap.addEventListener('mousedown', e => { mapaIsDown = true; mapaStartX = e.pageX - wrap.offsetLeft; mapaScrollLeft = wrap.scrollLeft; wrap.style.cursor = 'grabbing'; });
      wrap.addEventListener('mouseleave', () => { mapaIsDown = false; wrap.style.cursor = 'grab'; });
      wrap.addEventListener('mouseup',    () => { mapaIsDown = false; wrap.style.cursor = 'grab'; });
      wrap.addEventListener('mousemove',  e  => { if (!mapaIsDown) return; e.preventDefault(); wrap.scrollLeft = mapaScrollLeft - (e.pageX - wrap.offsetLeft - mapaStartX); });
      wrap.addEventListener('wheel',      e  => { e.preventDefault(); wrap.scrollLeft += e.deltaY; }, { passive: false });
    }
  }

  // Los interruptores por feature viven en "Funcionalidades para todos"
  // (s-param-features), que guarda en config_app.features_off y alcanza a
  // todos los usuarios. Acá hubo una copia que escribía en localStorage:
  // renderizaba en un contenedor `#dev-flags` que no existe en el HTML, así
  // que hacía años que no dibujaba nada, y su rastro en localStorage podía
  // dejar una feature apagada en un dispositivo sin que el admin lo viera
  // (features_off sólo lista las APAGADAS: nunca vuelve a prender lo que el
  // snapshot local bajó). Se borró entera — ver restaurarEstado().

  // ── Persistencia de estado (Punto 2 del plan) ────────────────────────
  // Guarda nivel de features, zona y tipo de usuario para que sobrevivan
  // a la recarga. Protegido con try/catch: en entornos que bloquean
  // localStorage (sandbox, artifacts, cookies deshabilitadas) la app
  // sigue funcionando solo en memoria, sin romper nada.
  const STORAGE_KEY = 'pronet-estado-v1';
  let nivelActual = 3;

  // Los feature flags NO se guardan acá: su fuente de verdad es
  // config_app.features_off, que se aplica en restaurarSesion() y vale para
  // todos los usuarios. Persistirlos por dispositivo hacía que un preset de
  // Nivel probado una vez sobreviviera para siempre en ese navegador, por
  // debajo de la configuración real y sin forma de notarlo.
  function guardarEstado() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        zona:  zonaActual,
        tipo:  userTipo,
      }));
    } catch (e) { /* sin almacenamiento disponible: estado solo en memoria */ }
  }

  function leerEstadoGuardado() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function restaurarEstado() {
    const est = leerEstadoGuardado();
    if (!est) return;
    // `nivel`, `flags` y `personalizado` pueden venir en snapshots viejos:
    // se ignoran a propósito. Los presets de Nivel siguen sirviendo para
    // mostrar la app en una etapa, pero duran lo que dura la sesión — al
    // recargar manda config_app, que es lo que ven todos los usuarios.
    // Tipo de usuario (actualiza también el selector demo del login)
    if (est.tipo === 'cliente' || est.tipo === 'prestador') setUserTipo(est.tipo);
    // Zona: restaurar valor, marcar la opción en el modal y no volver a mostrarlo
    if (est.zona && typeof est.zona === 'string') {
      zonaActual = est.zona;
      zonaModalFirstTime = false;
      actualizarZonaLabel(zonaActual);
      document.querySelectorAll('.zona-option').forEach(o => {
        const name = o.querySelector('.zo-name');
        o.classList.toggle('active', !!name && name.textContent.trim() === est.zona);
      });
    }
  }

  function reiniciarDemo() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    if (typeof PronetDB !== 'undefined') PronetDB.vaciarTodo(); // pedidos y mensajes guardados
    location.reload();
  }

  function setNivel(n) {
    if (n === 1) {
      // Nivel 1: core transaccional + onboarding
      FEATURES.bolsaTrabajo = true;
      FEATURES.tutorialOnboarding = true;
      FEATURES.badgeVerificado = false;
      FEATURES.suscripcionPro = false;
      FEATURES.catalogoPrecios = false;
      FEATURES.editarPerfilPro = false;
      FEATURES.denuncias = false;
      FEATURES.loyalty = false;
      FEATURES.analyticsAvanzado = false;
    } else if (n === 2) {
      // Nivel 2: + profesionalización, monetización, denuncias
      FEATURES.bolsaTrabajo = true;
      FEATURES.tutorialOnboarding = true;
      FEATURES.badgeVerificado = true;
      FEATURES.suscripcionPro = true;
      FEATURES.catalogoPrecios = true;
      FEATURES.editarPerfilPro = true;
      FEATURES.denuncias = true;
      FEATURES.loyalty = false;
      FEATURES.analyticsAvanzado = false;
    } else if (n === 3) {
      // Nivel 3: todo activo
      Object.keys(FEATURES).forEach(k => { if (k !== 'mostrarSelectorDemo' && k !== 'panelConfiguracion') FEATURES[k] = true; });
    }
    aplicarFeatureFlags();
    nivelActual = n;
    // No se persiste: el preset vale para esta sesión. Ver guardarEstado().
    const status = document.getElementById('dev-panel-status');
    if (status) status.textContent = `Nivel actual: ${n}`;
    // Si la pantalla activa quedó deshabilitada, volver a Home
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && !isScreenEnabled(activeScreen.id)) {
      goTo('s-home');
    }
  }

  // ── Zona modal ───────────────────────────────────────────────────────
  let zonaActual = 'Escobar';
  let zonaModalFirstTime = true;

  // Mapeo: sub-zonas del selector → zona del prestador en la base de datos
  const ZONA_DB = {
    'Puertos del Lago': 'Escobar',
    'El Cantón':        'Escobar',
    'San Matías':       'Escobar',
    'El Naudir':        'Escobar',
    'CUBE':             'Escobar',
    'El Cazador':       'Escobar',
    'Nordelta':         'Escobar',
    'Escobar Centro':   'Escobar',
    'Matheu / Garín':   'Garín',
    'Escobar':          'Escobar',
    'Garín':            'Garín',
  };
  function zonaParaFiltro() { return ZONA_DB[zonaActual] || zonaActual; }

  /** Trae los niveles de loyalty desde la base a PRONET_CONFIG.
   *
   *  Los mismos umbrales estaban en config.js, dentro de
   *  `acreditar_puntos()` y en un ternario para el emoji. La pantalla podía
   *  mostrar una barra de progreso hacia "Oro" mientras la base ya había
   *  guardado otro nivel, sin que nada fallara.
   *
   *  El `max` de cada nivel se DERIVA del mínimo del siguiente, no se
   *  guarda: tenerlo aparte es justamente lo que permitía el desfase. */
  async function cargarNivelesLoyalty() {
    const filas = await PronetDB.listarLoyaltyNiveles().catch(() => []);
    if (!filas.length || !window.PRONET_CONFIG) return false;
    window.PRONET_CONFIG.LOYALTY_NIVELES = filas.map((n, i) => ({
      nombre: n.nombre,
      emoji:  n.emoji,
      min:    n.min_puntos,
      // El último nivel no tiene techo: se le da margen para que la barra
      // de progreso no quede clavada en 100% apenas se entra.
      max:    filas[i + 1] ? filas[i + 1].min_puntos : Math.round(n.min_puntos * 2.5) || 1000,
    }));
    return true;
  }

  /** Emoji de un nivel, desde el catálogo.
   *  Antes era un ternario que no contemplaba Élite, así que el nivel más
   *  alto se mostraba con la medalla de bronce. */
  function emojiNivel(nombre) {
    const n = (window.PRONET_CONFIG?.LOYALTY_NIVELES || []).find(x => x.nombre === nombre);
    return n?.emoji || '🥉';
  }

  /** Reemplaza el catálogo de zonas con el de la base y repinta el selector.
   *
   *  Barrio → zona madre y barrio → coordenada vivían en DOS objetos
   *  distintos indexados por nombre (`ZONA_DB` y `MKT_ZONA_COORD`), más las
   *  opciones escritas a mano en el modal. Agregar un barrio pedía tocar
   *  los tres: olvidarse de uno lo dejaba sin coordenada (invisible en el
   *  mapa) o sin zona madre (fuera de los filtros), sin que nada fallara.
   *
   *  Igual que con los rubros, lo del código queda como respaldo. */
  async function cargarZonasDeLaBase() {
    const filas = await PronetDB.listarZonas(true).catch(() => []);
    if (!filas.length) return false;

    Object.keys(ZONA_DB).forEach(k => delete ZONA_DB[k]);
    Object.keys(MKT_ZONA_COORD).forEach(k => delete MKT_ZONA_COORD[k]);
    filas.forEach(z => {
      ZONA_DB[z.nombre] = z.madre;
      if (z.lat != null && z.lng != null) {
        MKT_ZONA_COORD[z.nombre] = { lat: Number(z.lat), lng: Number(z.lng) };
      }
    });
    pintarZonas(filas);
    return true;
  }

  /** Dibuja las opciones del selector de zona desde el catálogo. */
  function pintarZonas(filas) {
    const lista = document.getElementById('zona-list');
    if (!lista) return;
    lista.innerHTML = filas.map(z => {
      // "Barrio privado" sólo si el barrio no ES la zona madre: "Escobar"
      // dentro de Escobar es la ciudad, no un country.
      const sub = z.nombre === z.madre ? 'Ciudad' : escHTML(z.madre) + ' · Barrio privado';
      return '<div class="zona-option' + (z.nombre === zonaActual ? ' active' : '') +
             '" onclick="selectZona(this,\'' + escHTML(z.nombre).replace(/'/g, '&#39;') + '\')">' +
             '<div class="zo-icon">' + (z.nombre === z.madre ? '🏙️' : '🏘️') + '</div>' +
             '<div style="flex:1"><div class="zo-name">' + escHTML(z.nombre) + '</div>' +
             '<div class="zo-sub">' + sub + '</div></div>' +
             '<div class="zo-check"></div></div>';
    }).join('');
  }

  /** Las zonas CONCRETAS que cuelgan de la zona-madre activa.
   *
   *  El filtro por zona comparaba zona-madre en JS, y para eso había que
   *  traerse la tabla entera. Con la lista de hijas se filtra en el servidor
   *  con `.in('zona', ...)` y viaja sólo lo que se usa. */
  function zonasDelFiltro() {
    const raiz = zonaParaFiltro();
    if (!raiz) return null;
    // Camina TODOS los niveles, no uno. Desde que las zonas tienen tres
    // (Escobar → Puertos del Lago → Araucarias), quedarse en el primer salto
    // dejaba al prestador de Puertos sin ver los pedidos de sus barrios: el
    // pedido dice "Araucarias", cuya madre es "Puertos del Lago" y no
    // "Escobar", así que no entraba en la lista.
    const resultado = new Set([raiz]);
    let creció = true;
    while (creció) {
      creció = false;
      Object.keys(ZONA_DB).forEach(z => {
        if (!resultado.has(z) && resultado.has(ZONA_DB[z])) { resultado.add(z); creció = true; }
      });
    }
    return [...resultado];
  }

  function abrirZonaModal() {
    document.getElementById('zona-modal').classList.add('show');
  }
  function cerrarZonaModal() {
    document.getElementById('zona-modal').classList.remove('show');
    actualizarZonaLabel(zonaActual);
    // Re-renderizar con la nueva zona
    renderHomeFeed('todos');
    renderBusqueda('', filtroActivo);
  }
  function selectZona(el, nombre) {
    document.querySelectorAll('.zona-option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    zonaActual = nombre;
    guardarEstado(); // persistir zona elegida
    cerrarZonaModal();
  }
  function usarGPS() {
    const lbl = document.querySelector('#zona-modal .btn-p + div div');
    if (lbl) lbl.innerHTML = '⏳ Detectando ubicación...';

    if (!navigator.geolocation) {
      if (lbl) lbl.innerHTML = '❌ Tu navegador no soporta geolocalización. Elegí tu zona manualmente.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;

        // Centrar el mapa real si está activo
        if (mapaGoogle) {
          mapaGoogle.setCenter({ lat: userLat, lng: userLng });
          if (mapaUserMarker) mapaUserMarker.setMap(null);
          mapaUserMarker = new google.maps.Marker({
            position: { lat: userLat, lng: userLng },
            map: mapaGoogle,
            title: 'Tu ubicación',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#2B5BFF',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 3,
            },
            zIndex: 100,
          });
        }

        // Detectar zona via Geocoder si Google Maps está disponible
        const _aplicarZona = (zonaDetectada) => {
          zonaActual = zonaDetectada;
          document.querySelectorAll('.zona-option').forEach(o => {
            const nombre = o.querySelector('.zo-name')?.textContent.trim();
            o.classList.toggle('active', nombre === zonaDetectada);
          });
          guardarEstado();
          if (lbl) lbl.innerHTML = '✅ Ubicación detectada: ' + zonaDetectada;
          setTimeout(() => cerrarZonaModal(), 800);
        };
        if (typeof google !== 'undefined' && google.maps?.Geocoder) {
          new google.maps.Geocoder().geocode(
            { location: { lat: userLat, lng: userLng } },
            (results, status) => {
              let zonaDetectada = 'Escobar';
              if (status === 'OK' && results.length) {
                const knownZonas = Object.keys(ZONA_DB);
                outer: for (const r of results) {
                  for (const comp of r.address_components) {
                    const n = comp.long_name;
                    const match = knownZonas.find(z =>
                      n.toLowerCase().includes(z.toLowerCase()) ||
                      z.toLowerCase().includes(n.toLowerCase())
                    );
                    if (match) { zonaDetectada = match; break outer; }
                  }
                }
              }
              _aplicarZona(zonaDetectada);
            }
          );
        } else {
          _aplicarZona('Escobar');
        }
      },
      function(err) {
        const msgs = {
          1: '🔒 Permiso denegado. Activá la ubicación en Ajustes del navegador.',
          2: '📡 No pudimos detectar tu ubicación. Elegí tu zona manualmente.',
          3: '⏱️ La detección tardó demasiado. Elegí tu zona manualmente.',
        };
        if (lbl) lbl.innerHTML = msgs[err.code] || msgs[2];
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }
  function actualizarZonaLabel(nombre) {
    const lbl = document.getElementById('zona-label');
    if (lbl) lbl.textContent = nombre;
  }
  function filterZonas(val) {
    document.querySelectorAll('.zona-option').forEach(o => {
      const name = o.querySelector('.zo-name').textContent.toLowerCase();
      o.style.display = name.includes(val.toLowerCase()) ? 'flex' : 'none';
    });
  }
  // Mostrar modal de zona al primer login
  function mostrarZonaAlLogin() {
    if (zonaModalFirstTime) {
      zonaModalFirstTime = false;
      setTimeout(() => abrirZonaModal(), 600);
    }
  }

  // ── Filtro de categorías en Home ────────────────────────────────────
  async function filtrarCategoria(cat, el) {
    // Actualizar rubro activo
    document.querySelectorAll('.rubro').forEach(r => r.classList.remove('on'));
    el.classList.add('on');
    catActiva = cat;
    actualizarBannerUrgencias(cat);
    await renderHomeFeed(cat);
  }

  const URG_LABELS = {
    limpieza:{t:'🧹 Urgencias de limpieza',s:'Limpieza disponible hoy en tu zona'},
    cuidado:{t:'👶 Cuidado urgente',s:'Cuidadores disponibles ahora en tu zona'},
    electricista:{t:'⚡ Urgencias eléctricas',s:'Electricistas disponibles ahora en tu zona'},
    electricistas:{t:'⚡ Urgencias eléctricas',s:'Electricistas disponibles ahora en tu zona'},
    plomeria:{t:'🚰 Urgencias de plomería',s:'Plomeros disponibles ahora en tu zona'},
    jardineria:{t:'🌿 Jardinería urgente',s:'Jardineros disponibles hoy en tu zona'},
    mascotas:{t:'🐕 Urgencias con mascotas',s:'Paseadores y cuidadores disponibles hoy'},
    gasista:{t:'🔥 Urgencias de gas',s:'Gasistas matriculados disponibles ahora'},
  };
  function actualizarBannerUrgencias(cat) {
    const t=document.getElementById('urg-title'), s=document.getElementById('urg-sub');
    if(!t||!s) return;
    const info=URG_LABELS[(cat||'todos').toLowerCase()];
    if(info){t.textContent=info.t;s.textContent=info.s;}
    else{t.textContent='⚡ Urgencias';s.textContent='Prestadores con atención inmediata en tu zona';}
  }
  function verUrgencias() {
    goTo('s-buscar');
    const chip=document.querySelector(".filter-row .chip[onclick*='urgencias']");
    const inp=document.querySelector('.search-input');
    if(inp&&catActiva&&catActiva!=='todos') inp.value=catActiva;
    if(chip) filterSearch(chip,'urgencias');
    else renderBusqueda(inp?inp.value:'',' urgencias');
  }

  // ── Búsqueda con filtros ─────────────────────────────────────────────
  let filtroActivo = 'todos';

  function filterSearch(chip, filtro) {
    document.querySelectorAll('.filter-row .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    filtroActivo = filtro;
    // Leer el texto del buscador si existe
    const inp = document.querySelector('.search-input');
    renderBusqueda(inp ? inp.value : '', filtro);
  }

  // ── ProMarket — feed real ──────────────────────────────────────────
  // ══ SECCIONES DE PROMARKET ═════════════════════════════════════════
  //
  // Servicios del Barrio y Mercado del Barrio. Se compran distinto —un
  // producto se elige por la foto y el precio, un servicio por la persona—
  // así que mezclarlos obligaba a la tarjeta y a los filtros a servir a los
  // dos y servían mal a ambos.
  //
  // OJO con la confusión que esto invita: el "Servicios" de acá NO es el
  // servicio del prestador. La diferencia no es la categoría sino la
  // mecánica — el prestador se contrata con un pedido y propuestas que se
  // comparan; esto es un vecino ofreciendo algo que se contrata directo
  // (el caso testigo: alguien que ofrece masajes a sus vecinos).
  //
  // El catálogo vive en `mkt_categorias` y se edita desde Parametrías. Esto
  // es sólo el respaldo para el arranque y el modo offline.
  let MKT_CATEGORIAS = [
    { slug: 'belleza',         nombre: 'Belleza',           emoji: '💇', tipo: 'servicio' },
    { slug: 'eventos',         nombre: 'Eventos',           emoji: '🎉', tipo: 'servicio' },
    { slug: 'exterior',        nombre: 'Exterior',          emoji: '🌳', tipo: 'servicio' },
    { slug: 'fotografia',      nombre: 'Fotografía',        emoji: '📷', tipo: 'servicio' },
    { slug: 'hogar',           nombre: 'Hogar',             emoji: '🏠', tipo: 'servicio' },
    { slug: 'mascotas',        nombre: 'Mascotas',          emoji: '🐾', tipo: 'servicio' },
    { slug: 'salud-bienestar', nombre: 'Salud y bienestar', emoji: '💆', tipo: 'servicio' },
    { slug: 'profesionales',   nombre: 'Profesionales',     emoji: '💼', tipo: 'servicio' },
    { slug: 'talleres-clases', nombre: 'Talleres y clases', emoji: '🎓', tipo: 'servicio' },
    { slug: 'vehiculos',       nombre: 'Vehículos',         emoji: '🚗', tipo: 'servicio' },
    { slug: 'otros-servicios', nombre: 'Otros servicios',   emoji: '✨', tipo: 'servicio' },
    { slug: 'comidas-bebidas', nombre: 'Comidas y bebidas', emoji: '🍕', tipo: 'producto' },
    { slug: 'cocina-bazar',    nombre: 'Cocina y bazar',    emoji: '🍳', tipo: 'producto' },
    { slug: 'decoracion',      nombre: 'Decoración',        emoji: '🖼️', tipo: 'producto' },
    { slug: 'indumentaria',    nombre: 'Indumentaria',      emoji: '👕', tipo: 'producto' },
    { slug: 'otros-productos', nombre: 'Otros productos',   emoji: '📦', tipo: 'producto' },
  ];

  const catsDeTipo = (tipo) => MKT_CATEGORIAS.filter(c => c.tipo === tipo);
  const slugsDeTipo = (tipo) => catsDeTipo(tipo).map(c => c.slug);
  const catPorSlug = (slug) => MKT_CATEGORIAS.find(c => c.slug === slug);

  /** Etiqueta con emoji para la tarjeta. Si la categoría no está en el
   *  catálogo se muestra el slug crudo: es feo, pero delata el problema en
   *  vez de mostrar una tarjeta sin categoría. */
  function mktCatLabel(slug) {
    const c = catPorSlug(slug);
    return c ? c.emoji + ' ' + c.nombre : (slug || '');
  }

  // Se carga una vez por sesión: el catálogo cambia poco y lo piden el feed,
  // la pantalla de publicar y el panel.
  let mktCatsCargadas = false;

  /** Reemplaza el catálogo con el de la base, como hacen rubros y zonas. */
  async function cargarMktCategorias() {
    const filas = await PronetDB.listarMktCategorias().catch(() => []);
    if (filas.length) MKT_CATEGORIAS = filas;
  }

  let mktFiltroActivo   = 'todos';
  let mktBusqueda       = '';
  let mktZonaActiva     = null;
  let mktDebounceTimer  = null;
  let mktOffset         = 0;
  let mktCargando       = false;
  let mktHayMas         = true;
  let mktAlertaActiva   = false;
  let mktUltimoResultCount = 0;
  // Cache de publicaciones ya renderizadas, por id — permite que los onclick
  // de la card pasen solo el id (uuid, no controlado por el usuario) en vez
  // de interpolar título/nombre (texto libre) directo en el atributo onclick.
  const mktPostsCache = new Map();
  // Lote por publicación, sólo de las que el servidor autorizó a ver.
  const mktLotesCache = new Map();

  // Sección activa. El prestador arranca —y se queda— en 'servicio'.
  let mktTipoActivo = 'servicio';

  // Formato del feed, con un default distinto por sección: en Mercado se
  // navega buscando qué hay (grilla de fichas); en Servicios importa más el
  // texto que la foto (tarjeta grande). El usuario puede cambiarlo con el
  // botón y esa elección se recuerda por sección mientras dure la sesión.
  let mktFormatoServicio = 'grande'; // 'grande' | 'grid'
  let mktFormatoProducto = 'grid';
  // Orden actual del feed (ids), para poder repintar sin volver a pedir al
  // servidor cuando el usuario sólo cambia de formato.
  let mktFeedIds = [];

  function mktFormatoActual() {
    return mktTipoActivo === 'servicio' ? mktFormatoServicio : mktFormatoProducto;
  }

  function mktAplicarFormatoUI() {
    const cont = document.getElementById('mkt-feed');
    if (cont) cont.classList.toggle('mkt-feed-grid', mktFormatoActual() === 'grid');
    const lbl = document.getElementById('mkt-formato-lbl');
    // El label nombra el destino, no el estado actual — mismo patrón que el toggle de Mapa/Lista.
    if (lbl) lbl.textContent = mktFormatoActual() === 'grid' ? 'Tarjetas' : 'Fichas';
  }

  function mktRepintarFeed() {
    const cont = document.getElementById('mkt-feed');
    if (!cont) return;
    mktAplicarFormatoUI();
    cont.innerHTML = mktFeedIds.map(id => mktPostsCache.get(id)).filter(Boolean).map(mktCardHTML).join('');
  }

  function mktToggleFormato() {
    const nuevo = mktFormatoActual() === 'grid' ? 'grande' : 'grid';
    if (mktTipoActivo === 'servicio') mktFormatoServicio = nuevo; else mktFormatoProducto = nuevo;
    mktRepintarFeed();
  }
  window.mktToggleFormato = mktToggleFormato;

  // Tocar una ficha de la grilla la expande a tarjeta grande, en el lugar:
  // no hay pantalla de detalle propia, el feed mismo hace de detalle.
  function mktVerCompleta(pubId) {
    if (mktTipoActivo === 'servicio') mktFormatoServicio = 'grande'; else mktFormatoProducto = 'grande';
    mktRepintarFeed();
    requestAnimationFrame(() => {
      document.getElementById('mkt-post-' + pubId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  window.mktVerCompleta = mktVerCompleta;

  /** Muestra u oculta el selector de sección y pinta los chips de la
   *  sección activa.
   *
   *  Al prestador no se le muestra el selector: para él ProMarket es sólo
   *  Servicios del Barrio. */
  function mktPintarSecciones() {
    const soloServicios = esPrestador();
    if (soloServicios) mktTipoActivo = 'servicio';

    // El toggle de origen vive sólo en Servicios, con el flag prendido y
    // para quien NO es prestador: el prestador publica hacia este espacio,
    // no lo navega — su ventana es la vista previa de su panel.
    const origenSel = document.getElementById('mkt-origen');
    const verOrigen = !soloServicios && mktTipoActivo === 'servicio' && pubsPrestadorActivo();
    if (!verOrigen) mktOrigen = 'vecino';
    if (origenSel) {
      origenSel.style.display = verOrigen ? 'flex' : 'none';
      origenSel.querySelectorAll('.mkt-sec').forEach((b, i) => {
        const suyo = i === 0 ? 'vecino' : 'prestador';
        b.classList.toggle('on', suyo === mktOrigen);
        b.setAttribute('aria-selected', suyo === mktOrigen ? 'true' : 'false');
      });
    }

    const sel = document.getElementById('mkt-secciones');
    if (sel) {
      sel.style.display = soloServicios ? 'none' : 'flex';
      sel.querySelectorAll('.mkt-sec').forEach((b, i) => {
        const suyo = i === 0 ? 'servicio' : 'producto';
        b.classList.toggle('on', suyo === mktTipoActivo);
        b.setAttribute('aria-selected', suyo === mktTipoActivo ? 'true' : 'false');
      });
    }

    const chips = document.getElementById('mkt-chips');
    if (chips) {
      // Los dos orígenes usan catálogos DISTINTOS y no son intercambiables:
      // las publicaciones de vecinos se clasifican con las categorías de
      // Entre Vecinos, y los avisos de prestadores con RUBROS, el catálogo
      // de oficios (el mismo que usa el alta de pedido, y por eso se puede
      // prefijar el rubro al contactar). Pintar los chips del catálogo
      // equivocado da un feed vacío sin explicar por qué.
      const cats = mktOrigen === 'prestador'
        ? RUBROS.map(r => ({ slug: r.slug, nombre: r.n, emoji: r.emoji }))
        : catsDeTipo(mktTipoActivo);
      chips.innerHTML =
        '<div class="chip' + (mktFiltroActivo === 'todos' ? ' on' : '') +
        '" onclick="filtrarMercado(this,\'todos\')">Todos</div>' +
        cats.map(c =>
          '<div class="chip' + (mktFiltroActivo === c.slug ? ' on' : '') +
          '" onclick="filtrarMercado(this,\'' + escHTML(c.slug) + '\')">' +
          escHTML(c.emoji + ' ' + c.nombre) + '</div>').join('');
    }

    // El buscador nombra lo que hay en la sección: buscar "productos" en
    // Servicios pide algo que ahí no existe.
    const busc = document.getElementById('mkt-buscador');
    if (busc) busc.placeholder = mktTipoActivo === 'servicio'
      ? 'Buscá un servicio de tu barrio…'
      : 'Buscá productos de tu barrio…';

    // Controles que son del feed de vecinos y no aplican a los avisos de
    // prestadores: el mapa (un prestador tiene zona de cobertura, no un lote
    // en el barrio), el toggle de formato (no hay grilla de fichas) y el
    // "Ver más" (esta fuente no pagina). Dejarlos visibles prometería cosas
    // que este origen no hace.
    const soloVecinos = mktOrigen === 'vecino';
    ['mkt-toggle-mapa', 'mkt-toggle-formato', 'mkt-ver-mas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = soloVecinos ? '' : 'none';
    });

    // El carrito depende de la sección, así que se repinta con ella.
    pintarBadgeCarrito();
  }

  // ── Feed de avisos de prestadores (lo que ve el vecino) ─────────────
  const _pubPrestCache = new Map();
  let _pubPrestLikes = { mios: new Set(), conteo: {} };

  async function renderFeedPrestadores(cont) {
    const posts = await PronetDB.listarPubsPrestadorActivas({
      rubro: mktFiltroActivo, busqueda: mktBusqueda,
    }).catch(() => []);

    if (!posts.length) {
      cont.innerHTML = '<div style="padding:40px 24px;text-align:center">' +
        '<div style="font-size:34px">🛠️</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-top:10px">Todavía no hay avisos de profesionales acá</div>' +
        '<div style="font-size:12.5px;color:var(--ink3);margin-top:6px;line-height:1.5">Mirá lo que publicaron los vecinos, o contá qué necesitás y que te manden propuestas.</div>' +
        '<button class="btn-p" style="margin-top:14px;padding:10px 18px" onclick="mktSetOrigen(\'vecino\')">Ver avisos de vecinos</button>' +
      '</div>';
      return;
    }

    _pubPrestCache.clear();
    posts.forEach(p => _pubPrestCache.set(p.id, p));
    _pubPrestLikes = await PronetDB.likesDePubsPrestador(posts.map(p => p.id)).catch(
      () => ({ mios: new Set(), conteo: {} }));

    cont.innerHTML = posts.map(p => pubPrestadorCardHTML(p, p.prestadores, false, {
      liked: _pubPrestLikes.mios.has(p.id),
      likes: _pubPrestLikes.conteo[p.id] || 0,
    })).join('');

    // Una vista por aviso mostrado. El RPC decide si cuenta: si quien mira
    // es una cuenta prestador, no suma (la conversión que ve el dueño tiene
    // que estar calculada sobre vecinos de verdad).
    posts.forEach(p => PronetDB.registrarEventoPub(p.id, 'vista'));
  }

  async function pubPrestLike(pubId) {
    if (!usuarioActual) { showToast('Entrá para dar me gusta'); return; }
    const res = await PronetDB.toggleLikePubPrestador(pubId);
    if (!res.ok) { showToast('⚠️ No se pudo registrar tu me gusta.'); return; }
    if (res.liked) _pubPrestLikes.mios.add(pubId); else _pubPrestLikes.mios.delete(pubId);
    _pubPrestLikes.conteo[pubId] = Math.max(0, (_pubPrestLikes.conteo[pubId] || 0) + (res.liked ? 1 : -1));
    const btn = document.getElementById('pplike-' + pubId);
    if (btn) {
      btn.textContent = (res.liked ? '❤️ ' : '🤍 ') + _pubPrestLikes.conteo[pubId];
      btn.style.color = res.liked ? '#E11D48' : 'var(--ink3)';
    }
  }
  window.pubPrestLike = pubPrestLike;

  /** Contactar: NO abre un chat suelto — arma un pedido dirigido a ese
   *  prestador, que él responde con una propuesta normal. Así el contacto
   *  entra al circuito que ya tiene cierre y reseña, en vez de abrir un
   *  canal paralelo que no alimenta la reputación de nadie.
   *  Reusa la maquinaria de recontratación, que ya hacía exactamente esto. */
  function pubPrestContactar(pubId) {
    const p = _pubPrestCache.get(pubId);
    if (!p) return;
    if (!usuarioActual) { showToast('Entrá para pedir un presupuesto'); return; }
    PronetDB.registrarEventoPub(pubId, 'clic_contacto');
    // Mismo gate que publicar un pedido: esto TERMINA en un pedido, así que
    // pedir el teléfono en otro momento sería incoherente.
    if (!tieneTelefono()) return abrirTelefonoGate(() => pubPrestContactar(pubId));

    const nombre = p.prestadores?.nombre || 'este profesional';
    dirigirPedidoA(p.prestador_id, nombre, pubId);
    // Prefijar el rubro del aviso: el vecino ya eligió qué necesita al
    // tocar esa tarjeta, volver a preguntárselo es un paso de más.
    // Las opciones no tienen id — se generan desde RUBROS con el nombre en
    // .opt-lbl, así que se busca por ese texto.
    const nombreRubro = rubroDeCat(p.rubro);
    document.querySelectorAll('#np-rubro-opts .form-opt').forEach(o => {
      if (o.querySelector('.opt-lbl')?.textContent.trim() === nombreRubro) o.click();
    });
    showToast('Contale a ' + nombre + ' qué necesitás');
  }
  window.pubPrestContactar = pubPrestContactar;

  // ── Origen del aviso dentro de Servicios: vecino o prestador ────────
  //
  // Arranca en 'vecino' a propósito: Entre Vecinos es comunidad, y lo pago
  // no puede ser lo primero que ve alguien al entrar. Se recuerda la última
  // elección mientras dura la sesión, igual que el formato del feed.
  let mktOrigen = 'vecino';

  function mktSetOrigen(origen) {
    if (origen === mktOrigen) return;
    mktOrigen = origen;
    // El chip puntual no sobrevive al cambio de origen: los dos catálogos
    // son distintos (ver la nota en mktPintarSecciones), así que arrastrar
    // el slug de uno al otro deja el feed vacío sin motivo visible.
    mktFiltroActivo = 'todos';
    mktPintarSecciones();
    renderMercado(true);
  }
  window.mktSetOrigen = mktSetOrigen;

  function mktSetTipo(tipo) {
    if (tipo === mktTipoActivo) return;
    mktTipoActivo = tipo;
    // El chip puntual no sobrevive al cambio: pertenecía a la otra sección
    // y dejarlo puesto daría un feed vacío sin explicación.
    mktFiltroActivo = 'todos';
    mktPintarSecciones();
    renderMercado(true);
  }
  window.mktSetTipo = mktSetTipo;

  // ══ CARRITO DE MERCADO ═════════════════════════════════════════════
  //
  // El vecino suma productos y termina mandándole el pedido al vendedor por
  // el chat que ya existe. NO hay tabla de órdenes ni pago en la app: la
  // venta se cierra hablando, igual que hoy. Es la opción A de las tres que
  // se evaluaron el 2026-08-09 — la que no toca plata ajena y sirve para
  // medir si la gente arma pedidos antes de invertir en lo demás.
  //
  // Vive en localStorage y no en la base: un carrito abandonado en una
  // tabla es basura que después hay que salir a limpiar, y acá no aporta
  // nada — nadie retoma un carrito desde otro teléfono.
  //
  // Se agrupa por vendedor desde el principio, aunque hoy sólo se use para
  // mostrar: si mañana esto guarda órdenes, cada vendedor es una orden con
  // su entrega, y rehacer la estructura después sería peor.

  const CARRITO_KEY = 'pronet_carrito_v1';
  let carrito = [];   // [{ id, titulo, precio, foto_url, autor_id, autor_nombre, cant }]

  function cargarCarrito() {
    try { carrito = JSON.parse(localStorage.getItem(CARRITO_KEY) || '[]'); }
    catch (e) { carrito = []; }
    if (!Array.isArray(carrito)) carrito = [];
  }

  function guardarCarrito() {
    try { localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito)); } catch (e) { /* sin espacio */ }
    pintarBadgeCarrito();
  }

  const carritoTotal = () => carrito.reduce((s, i) => s + (i.precio || 0) * i.cant, 0);
  const carritoUnidades = () => carrito.reduce((s, i) => s + i.cant, 0);

  /** Agrupa por vendedor: cada uno es un pedido aparte, con su propia
   *  entrega y su propio chat. */
  function carritoPorVendedor() {
    const mapa = new Map();
    carrito.forEach(i => {
      if (!mapa.has(i.autor_id)) mapa.set(i.autor_id, { autor_id: i.autor_id, nombre: i.autor_nombre, items: [] });
      mapa.get(i.autor_id).items.push(i);
    });
    return [...mapa.values()];
  }

  function pintarBadgeCarrito() {
    const b = document.getElementById('mkt-carrito-badge');
    const btn = document.getElementById('mkt-carrito-btn');
    const n = carritoUnidades();
    // 'flex' explícito y no '': el badge centra su número con flexbox, y
    // dejarlo vacío lo devolvería a `inline`, que descoloca el dígito.
    if (b) { b.textContent = n; b.style.display = n ? 'flex' : 'none'; }

    // El carrito se muestra SIEMPRE en Mercado, tenga o no algo adentro.
    //
    // Al principio se ocultaba vacío para no dejar un ícono de adorno. Fue
    // un error: la primera pregunta del primer usuario que lo probó fue
    // "¿dónde está el carrito?". Un acceso que aparece recién después de
    // usarlo no se puede descubrir — hay que saber que existe para hacer lo
    // que lo hace aparecer.
    //
    // En Servicios sigue oculto: ahí no se suma nada al carrito, y mostrarlo
    // prometería algo que esa sección no hace.
    if (btn) btn.style.display = (mktTipoActivo === 'producto') ? '' : 'none';
  }

  function agregarAlCarrito(pubId) {
    if (!usuarioActual) {
      mostrarGate && mostrarGate({ titulo: 'Sumar al carrito', sub: 'Necesitás una cuenta para pedir.' });
      return;
    }
    const p = mktPostsCache.get(pubId);
    if (!p) return;
    if (p.autor_id === usuarioActual.id) { showToast && showToast('Es tu propia publicación'); return; }
    if (p.disponible === false) { showToast && showToast('Ese producto está sin stock'); return; }

    const yaEsta = carrito.find(i => i.id === pubId);
    if (yaEsta) yaEsta.cant += 1;
    else carrito.push({
      id: pubId, titulo: p.titulo, precio: p.precio_convenir ? 0 : (p.precio || 0),
      convenir: !!p.precio_convenir, foto_url: p.foto_url || null,
      autor_id: p.autor_id, autor_nombre: p.perfiles?.nombre || 'Vendedor', cant: 1,
    });
    guardarCarrito();
    showToast && showToast('🛒 Agregado al carrito');
  }
  window.agregarAlCarrito = agregarAlCarrito;

  function cambiarCantidad(pubId, delta) {
    const it = carrito.find(i => i.id === pubId);
    if (!it) return;
    it.cant += delta;
    if (it.cant < 1) carrito = carrito.filter(i => i.id !== pubId);
    guardarCarrito();
    renderCarrito();
  }
  window.cambiarCantidad = cambiarCantidad;

  function vaciarCarrito() {
    if (!confirm('¿Vaciar el carrito?')) return;
    carrito = [];
    guardarCarrito();
    renderCarrito();
  }
  window.vaciarCarrito = vaciarCarrito;

  const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

  /** Vuelve a leer las publicaciones del carrito y sincroniza lo que cambió
   *  desde que se agregaron.
   *
   *  El carrito guarda una FOTO del producto al momento de sumarlo: precio,
   *  título, stock. Entre eso y el envío del pedido pueden pasar días, y sin
   *  esto el vecino manda un pedido con el precio viejo o de algo que ya no
   *  hay — y el vendedor recibe un pedido que no puede cumplir.
   *
   *  Devuelve null si no se pudo consultar: en ese caso NO se toca nada. Sin
   *  conexión, vaciar el carrito sería el peor comportamiento posible. */
  async function revalidarCarrito() {
    if (!carrito.length) return { quitados: [], sinStock: [], cambios: [] };
    const filas = await PronetDB.obtenerVarios('publicaciones', carrito.map(i => i.id)).catch(() => null);
    if (!filas) return null;

    const porId = new Map(filas.map(f => [f.id, f]));
    const quitados = [], sinStock = [], cambios = [];

    carrito = carrito.filter(i => {
      const f = porId.get(i.id);
      // Borrada o dada de baja: no hay forma de pedirla, se saca.
      if (!f || !f.activa) { quitados.push(i.titulo); return false; }

      const precioNuevo = f.precio_convenir ? 0 : (f.precio || 0);
      if (precioNuevo !== i.precio || !!f.precio_convenir !== !!i.convenir) {
        cambios.push({ titulo: f.titulo, antes: i.precio, ahora: precioNuevo, convenir: !!f.precio_convenir });
        i.precio = precioNuevo;
        i.convenir = !!f.precio_convenir;
      }
      i.titulo = f.titulo;          // el vendedor pudo renombrarla
      i.foto_url = f.foto_url || null;
      // Sin stock NO se saca: se muestra marcado. Que desaparezca sin más
      // deja al vecino sin entender qué pasó con lo que había elegido.
      i.sinStock = f.disponible === false;
      if (i.sinStock) sinStock.push(i.titulo);
      return true;
    });

    guardarCarrito();
    return { quitados, sinStock, cambios };
  }

  /** El aviso de lo que cambió. Sin esto la revalidación sería silenciosa y
   *  el vecino vería números distintos sin explicación. */
  function avisoCambiosHTML(r) {
    if (!r) {
      return '<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;margin-bottom:12px;font-size:12px;color:#92400E;line-height:1.5">' +
             'No pudimos confirmar precios ni stock. Revisá con el vendedor antes de pedir.</div>';
    }
    const partes = [];
    if (r.quitados.length) partes.push('Se sacaron del carrito porque ya no están publicados: <b>' + r.quitados.map(escHTML).join(', ') + '</b>.');
    if (r.sinStock.length) partes.push('Sin stock por ahora: <b>' + r.sinStock.map(escHTML).join(', ') + '</b>. No van en el pedido.');
    if (r.cambios.length) partes.push('Cambió el precio de <b>' + r.cambios.map(c => escHTML(c.titulo)).join(', ') + '</b>.');
    if (!partes.length) return '';
    return '<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;margin-bottom:12px;font-size:12px;color:#92400E;line-height:1.55">' +
           partes.join('<br>') + '</div>';
  }

  async function renderCarrito() {
    const wrap = document.getElementById('carrito-lista');
    if (!wrap) return;
    const vaciarBtn = document.getElementById('carrito-vaciar');

    if (!carrito.length) {
      if (vaciarBtn) vaciarBtn.style.display = 'none';
      wrap.innerHTML =
        '<div style="padding:60px 24px;text-align:center;color:var(--ink3);line-height:1.6">' +
          '<div style="font-size:38px;margin-bottom:10px">🛒</div>' +
          '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:4px">Tu carrito está vacío</div>' +
          '<div style="font-size:12.5px">Sumá productos del Mercado y pedíselos a tus vecinos.</div>' +
          '<button onclick="goTo(\'s-mercado\')" style="margin-top:16px;background:var(--blue);color:#fff;border:none;border-radius:11px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Ver el Mercado</button>' +
        '</div>';
      return;
    }
    if (vaciarBtn) vaciarBtn.style.display = '';

    // Se revalida ANTES de dibujar: mostrar el precio viejo y corregirlo un
    // segundo después sería peor que esperar.
    wrap.innerHTML = '<div style="padding:40px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Revisando precios y stock…</div>';
    const revision = await revalidarCarrito();

    // La revalidación pudo dejarlo vacío (todo dado de baja).
    if (!carrito.length) { renderCarrito(); return; }

    // Un bloque por vendedor: cada uno es un pedido con su propia entrega y
    // su propio chat. Mezclarlos en un total único prometería una compra
    // conjunta que no existe — son personas distintas.
    wrap.innerHTML = avisoCambiosHTML(revision) + carritoPorVendedor().map(v => {
      const pedibles = v.items.filter(i => !i.sinStock);
      // El subtotal cuenta sólo lo que se puede pedir: sumar algo agotado
      // sería prometer un precio por algo que no va a llegar.
      const sub = pedibles.reduce((s, i) => s + (i.precio || 0) * i.cant, 0);
      const hayAConvenir = pedibles.some(i => i.convenir);

      const items = v.items.map(i =>
        '<div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border)' +
          (i.sinStock ? ';opacity:.55' : '') + '">' +
          (i.foto_url
            ? '<img src="' + escHTML(i.foto_url) + '" alt="" style="width:52px;height:52px;border-radius:9px;object-fit:cover;flex-shrink:0">'
            : '<div style="width:52px;height:52px;border-radius:9px;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🛍️</div>') +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:var(--ink);line-height:1.3">' + escHTML(i.titulo) + '</div>' +
            '<div style="font-size:12px;color:var(--ink2);margin-top:2px">' +
              (i.sinStock ? '<span style="color:#92400E;font-weight:700">Sin stock</span>'
                          : (i.convenir ? 'A convenir' : pesos(i.precio))) + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">' +
            '<button onclick="cambiarCantidad(\'' + escHTML(i.id) + '\',-1)" aria-label="Quitar uno" style="width:28px;height:28px;border:1px solid var(--border);background:var(--white);border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit;color:var(--ink2)">−</button>' +
            '<span style="font-size:13px;font-weight:700;min-width:18px;text-align:center">' + i.cant + '</span>' +
            '<button onclick="cambiarCantidad(\'' + escHTML(i.id) + '\',1)" aria-label="Agregar uno" style="width:28px;height:28px;border:1px solid var(--border);background:var(--white);border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit;color:var(--ink2)">+</button>' +
          '</div>' +
        '</div>').join('');

      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:13px 14px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:7px;padding-bottom:9px">' +
          '<span style="font-size:15px">🏪</span>' +
          '<div style="flex:1;font-size:13.5px;font-weight:800;color:var(--ink)">' + escHTML(v.nombre) + '</div>' +
        '</div>' +
        items +
        '<div style="display:flex;align-items:center;padding-top:11px;margin-top:4px;border-top:1px solid var(--border)">' +
          '<span style="flex:1;font-size:12.5px;color:var(--ink3)">Subtotal</span>' +
          '<span style="font-size:15px;font-weight:800;color:var(--ink)">' + pesos(sub) +
            (hayAConvenir ? ' <span style="font-size:11px;font-weight:600;color:var(--ink3)">+ a convenir</span>' : '') +
          '</span>' +
        '</div>' +
        (pedibles.length
          ? '<button onclick="pedirAVendedor(\'' + escHTML(v.autor_id) + '\')" style="width:100%;margin-top:11px;background:var(--blue);color:#fff;border:none;border-radius:11px;padding:11px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit">' +
            'Pedir a ' + escHTML((v.nombre || '').split(' ')[0]) + ' →</button>'
          // Sin nada pedible el botón se deshabilita en vez de desaparecer:
          // así queda claro POR QUÉ no se puede, que es la pregunta que se
          // hace el vecino.
          : '<button disabled style="width:100%;margin-top:11px;background:var(--surface);color:var(--ink3);border:1px solid var(--border);border-radius:11px;padding:11px;font-size:13px;font-weight:700;font-family:inherit;cursor:not-allowed">' +
            'Sin stock por ahora</button>') +
      '</div>';
    }).join('') +
    '<div style="background:var(--blue-s);border:1px solid #C7D5FF;border-radius:12px;padding:11px 13px;font-size:11.5px;color:var(--ink2);line-height:1.55">' +
      'Cada vendedor recibe su pedido por separado en el chat. <b>El precio final, la entrega y el pago los arreglás con cada uno ahí</b> — PRONET no cobra ni gestiona el envío.' +
    '</div>';
  }

  /** Manda el pedido de UN vendedor a su chat y saca sus items del carrito.
   *
   *  No crea una orden en la base a propósito: en este circuito la venta se
   *  cierra hablando, y una tabla de órdenes que nadie actualiza al entregar
   *  sería un registro que miente. Si mañana se quiere historial de ventas,
   *  el paso es guardar la orden acá y darle estados. */
  async function pedirAVendedor(autorId) {
    const grupo = carritoPorVendedor().find(v => v.autor_id === autorId);
    if (!grupo) return;

    // Se revalida otra vez acá y no sólo al abrir la pantalla: entre que se
    // dibujó y se tocó el botón pueden pasar minutos, y el pedido es lo que
    // el vendedor va a leer como compromiso.
    await revalidarCarrito();
    const grupoFresco = carritoPorVendedor().find(v => v.autor_id === autorId);
    const items = (grupoFresco?.items || []).filter(i => !i.sinStock);
    if (!items.length) {
      showToast && showToast('⚠️ Ese vendedor se quedó sin stock');
      renderCarrito();
      return;
    }

    const lineas = items.map(i =>
      '• ' + i.cant + '× ' + i.titulo + ' — ' + (i.convenir ? 'a convenir' : pesos(i.precio * i.cant))
    ).join('\n');
    const sub = items.reduce((s, i) => s + (i.precio || 0) * i.cant, 0);
    const texto = '🛒 *Pedido*\n' + lineas +
      (sub ? '\n\nTotal: ' + pesos(sub) : '') +
      '\n\n¿Cómo coordinamos la entrega?';

    // Se abre el chat sobre la primera publicación PEDIBLE: el chat de
    // mercado cuelga de una publicación, y el resto del pedido viaja en el
    // texto. Usar la primera del grupo sin filtrar abriría el chat sobre
    // algo que quedó afuera del pedido por falta de stock.
    await mktConsultar(items[0].id, { silencioso: true });
    if (!chatMercadoActualId) { showToast && showToast('⚠️ No se pudo abrir el chat'); return; }

    const r = await PronetDB.enviarMensajeMercado(chatMercadoActualId, texto);
    if (!r.ok) { showToast && showToast('⚠️ No se pudo enviar el pedido'); return; }
    await cargarMensajesMercado();

    // Aviso propio: el genérico decía "quiere consultarte", igual que una
    // pregunta suelta, y el vendedor no podía distinguir un pedido sin
    // abrirlo. Acá se le dice qué es y cuánto, que es lo que necesita para
    // decidir si lo atiende ahora.
    const unidades = items.reduce((s, i) => s + i.cant, 0);
    PronetDB.notificar({
      destino: 'usuario',
      usuario_id: autorId,
      tipo: 'pedido_mercado',
      titulo: '🛒 ' + (usuarioActual.nombre || 'Un vecino') + ' te hizo un pedido',
      cuerpo: unidades + (unidades === 1 ? ' producto' : ' productos') +
              (sub ? ' · ' + pesos(sub) : '') + ' · Coordinen la entrega por el chat',
      url: '#s-mis-consultas-mkt',
    }).catch(() => {});

    // Sólo se vacía lo de ESE vendedor: lo de los demás sigue esperando.
    carrito = carrito.filter(i => i.autor_id !== autorId);
    guardarCarrito();
    showToast && showToast('✅ Pedido enviado');
  }
  window.pedirAVendedor = pedirAVendedor;

  function mktIniciales(nombre) {
    if (!nombre) return '?';
    return nombre.trim().split(' ').slice(0,2).map(w => w[0].toUpperCase()).join('');
  }

  function mktTiempoRelativo(fechaStr) {
    const diff = Date.now() - new Date(fechaStr).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 60)  return `hace ${min || 1} min`;
    const hs = Math.floor(min / 60);
    if (hs < 24)   return `hace ${hs}h`;
    const dias = Math.floor(hs / 24);
    if (dias === 1) return 'ayer';
    return `hace ${dias} días`;
  }

  let mktMisLikes = new Set(); // IDs de publicaciones likeadas por el usuario actual

  function mktDistanciaLabel(zona) {
    if (!userLat || !zona) return '';
    const coord = MKT_ZONA_COORD[zona];
    if (!coord) return '';
    const km = calcDistanciaKm(userLat, userLng, coord.lat, coord.lng);
    // Más de 1km: solo distancia (caminar deja de ser un dato útil).
    // Es el mismo criterio que usan apps de delivery (Rappi/PedidosYa muestran
    // tiempo estimado solo en el rango "cerca").
    if (km > 1) return `📍 A ${km.toFixed(1).replace('.', ',')} km`;
    const minutos = Math.max(1, Math.round(km / 5 * 60)); // 5 km/h caminando
    const distStr = Math.round(km * 1000) + ' m';
    return `📍 A ${minutos} min caminando · ${distStr}`;
  }

  // Recomendaciones por publicación, cargadas junto con cada página del feed.
  const mktRecosCache = new Map();

  // El promedio recién se muestra a partir de acá. Con menos, un número como
  // "5.0" sale de uno o dos votos y aparenta una precisión que no tiene.
  const MKT_MIN_PARA_PROMEDIO = 5;

  /** "⭐ 3 vecinos lo recomiendan". Con cero no devuelve nada: un
   *  "0 recomendaciones" se lee como una advertencia sobre algo que
   *  simplemente es nuevo. */
  function mktRecomiendanHTML(pubId) {
    const r = mktRecosCache.get(pubId);
    if (!r || !r.recomiendan) return '';
    const txt = r.recomiendan === 1
      ? '1 vecino lo recomienda'
      : r.recomiendan + ' vecinos lo recomiendan';
    const prom = r.puntajes >= MKT_MIN_PARA_PROMEDIO ? ' · ' + r.promedio + ' de 5' : '';
    return '<div style="display:flex;align-items:center;gap:5px;margin:6px 0 0;font-size:12px;color:var(--green);font-weight:600">' +
           '<span style="color:#F5A623">★</span>' + escHTML(txt + prom) + '</div>';
  }

  /** El botón de carrito sólo en PRODUCTOS: un servicio no se suma a un
   *  carrito, se conversa. Y no en las propias, que no tiene sentido
   *  comprarse a uno mismo. Sin stock, el botón lo dice en vez de
   *  desaparecer — que desaparezca deja al comprador sin saber por qué. */
  function botonCarritoHTML(p) {
    const cat = catPorSlug(p.categoria);
    if (cat?.tipo !== 'producto') return '';
    if (usuarioActual && p.autor_id === usuarioActual.id) return '';
    if (p.disponible === false) {
      return '<span style="font-size:12px;font-weight:700;color:var(--ink3);background:var(--surface);border-radius:9px;padding:8px 12px">Sin stock</span>';
    }
    return '<button onclick="agregarAlCarrito(\'' + escHTML(p.id) + '\')" aria-label="Sumar al carrito"' +
           ' style="background:var(--blue-s);border:1px solid #C7D5FF;border-radius:9px;padding:8px 12px;font-size:14px;cursor:pointer;font-family:inherit;margin-right:8px">🛒</button>';
  }

  /** Botón principal de la tarjeta.
   *
   *  En una publicación PROPIA no se ofrece "Consultar": antes se mostraba
   *  igual y al tocarlo saltaba "No podés consultar tu propia publicación",
   *  que es una puerta que se abre para cerrarse en la cara. Peor todavía
   *  cuando alguien tiene varias publicaciones mezcladas con las ajenas en
   *  el mismo feed — es fácil tocar la equivocada y no entender el mensaje.
   *  El botón de carrito ya se ocultaba así; esto los empareja. */
  function accionPrincipalHTML(p) {
    const esMia = usuarioActual && p.autor_id === usuarioActual.id;
    if (esMia) {
      return '<button class="btn-p" style="margin:0;padding:8px 16px;font-size:13px;background:var(--surface);color:var(--ink2);border:1px solid var(--border)"' +
             ' onclick="goTo(\'s-mis-publicaciones\')">Tu publicación</button>';
    }
    return '<button class="btn-p" style="margin:0;padding:8px 16px;font-size:13px" onclick="mktConsultar(\'' + escHTML(p.id) + '\')">💬 Consultar</button>';
  }

  function mktCardHTML(p) {
    const nombre    = p.perfiles?.nombre || 'Vecino';
    const iniciales = mktIniciales(nombre);
    const catLabel  = mktCatLabel(p.categoria);
    const tiempo    = mktTiempoRelativo(p.creado);
    const liked     = mktMisLikes.has(p.id);
    const likes     = p.likes_count || 0;
    const comentarios = p.comentarios_count || 0;
    const distLabel = mktDistanciaLabel(p.zona);
    const foto = p.foto_url
      ? `<img src="${escHTML(p.foto_url)}" alt="${escHTML(p.titulo)}" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">`
      : `<div class="mkt-post-photo" style="background:var(--surface);font-size:48px">🛍️</div>`;
    const precio = p.precio_convenir ? 'A convenir' : (p.precio ? '$' + Number(p.precio).toLocaleString('es-AR') : 'Consultar');

    // Ficha compacta: sólo foto, título, precio y lugar. Sin estrellas a
    // propósito — casi ninguna publicación tiene reseñas todavía y una ficha
    // con el rating vacío se lee como si el vecino fuera malo.
    if (mktFormatoActual() === 'grid') {
      return `
        <div class="mkt-ficha" id="mkt-post-${escHTML(p.id)}" onclick="mktVerCompleta('${escHTML(p.id)}')">
          <div class="mkt-ficha-foto">${foto}</div>
          <div class="mkt-ficha-body">
            <div class="mkt-ficha-title">${escHTML(p.titulo)}</div>
            <div class="mkt-ficha-price">${precio}</div>
            <div class="mkt-ficha-meta">${escHTML(p.barrio || p.zona || nombre)}</div>
          </div>
        </div>`;
    }

    return `
      <div class="mkt-post" id="mkt-post-${escHTML(p.id)}">
        <div class="mkt-post-head">
          <div class="c-av" style="width:38px;height:38px;font-size:14px;background:var(--blue-s);color:var(--blue)">${escHTML(iniciales)}</div>
          <div class="c-info">
            <div class="c-name">${escHTML(nombre)}</div>
            <div class="c-role">${escHTML(tiempo)} · ${escHTML(catLabel)}</div>
          </div>
        </div>
        ${foto}
        <div class="mkt-post-body">
          <div class="mkt-post-title-row">
            <div class="mkt-post-title">${escHTML(p.titulo)}</div>
            <div class="mkt-post-price">${precio}</div>
          </div>
          ${mktRecomiendanHTML(p.id)}
          ${p.descripcion ? `<div class="c-desc">${escHTML(p.descripcion)}</div>` : ''}
          ${p.detalles && p.detalles.length ? `<details style="margin:8px 0 0">
            <summary style="font-size:12px;color:var(--blue);font-weight:600;cursor:pointer">Ver detalles</summary>
            <ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--ink2)">${p.detalles.map(d => `<li>${escHTML(d)}</li>`).join('')}</ul>
          </details>` : ''}
          ${(p.barrio || p.zona) ? `<div style="font-size:12px;color:var(--ink3);margin:6px 0 2px">📍 ${escHTML(p.barrio || p.zona)}${mktLotesCache.get(p.id) ? ' · ' + escHTML(mktLotesCache.get(p.id)) : ''}${distLabel ? ' · ' + distLabel.replace('📍 ', '') : ''}</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;margin:10px 0 8px">
            <button id="like-btn-${escHTML(p.id)}" onclick="mktToggleLike('${escHTML(p.id)}')"
              data-liked="${liked ? '1' : '0'}"
              style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;padding:0;font-family:'Inter',sans-serif">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="${liked ? '#EF4444' : 'none'}" stroke="${liked ? '#EF4444' : 'var(--ink3)'}" stroke-width="2" style="transition:all .15s"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span id="like-cnt-${escHTML(p.id)}" style="font-size:13px;font-weight:600;color:${liked ? '#EF4444' : 'var(--ink3)'}">${likes > 0 ? likes : ''}</span>
            </button>
            <button onclick="mktAbrirComentarios('${escHTML(p.id)}')"
              style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;padding:0;font-family:'Inter',sans-serif">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span style="font-size:13px;font-weight:600;color:var(--ink3)">${comentarios > 0 ? comentarios : ''}</span>
            </button>
            <div style="flex:1"></div>
            ${botonCarritoHTML(p)}
            ${accionPrincipalHTML(p)}
          </div>
          <div style="text-align:right"><span onclick="abrirReportarPub('${escHTML(p.id)}','${escHTML(p.autor_id)}')" style="font-size:11px;color:var(--ink3);cursor:pointer">⚑ Reportar</span></div>
        </div>
      </div>`;
  }

  async function mktToggleLike(pubId) {
    if (!usuarioActual) { showToast('Iniciá sesión para dar me gusta'); return; }
    const btn = document.getElementById('like-btn-' + pubId);
    const cntEl = document.getElementById('like-cnt-' + pubId);
    const wasLiked = btn?.dataset.liked === '1';
    // Optimistic update
    const newLiked = !wasLiked;
    const newCount = parseInt(cntEl?.textContent || '0') + (newLiked ? 1 : -1);
    if (btn) {
      btn.dataset.liked = newLiked ? '1' : '0';
      const svg = btn.querySelector('svg');
      if (svg) { svg.setAttribute('fill', newLiked ? '#EF4444' : 'none'); svg.setAttribute('stroke', newLiked ? '#EF4444' : 'var(--ink3)'); }
      if (cntEl) { cntEl.textContent = newCount > 0 ? newCount : ''; cntEl.style.color = newLiked ? '#EF4444' : 'var(--ink3)'; }
    }
    if (newLiked) mktMisLikes.add(pubId); else mktMisLikes.delete(pubId);
    const res = await PronetDB.toggleLike(pubId);
    if (!res.ok) {
      // Revertir si falló
      if (btn) {
        btn.dataset.liked = wasLiked ? '1' : '0';
        const svg = btn.querySelector('svg');
        if (svg) { svg.setAttribute('fill', wasLiked ? '#EF4444' : 'none'); svg.setAttribute('stroke', wasLiked ? '#EF4444' : 'var(--ink3)'); }
        if (cntEl) { cntEl.textContent = (newCount + (newLiked ? -1 : 1)) > 0 ? (newCount + (newLiked ? -1 : 1)) : ''; }
      }
      if (wasLiked) mktMisLikes.add(pubId); else mktMisLikes.delete(pubId);
    }
  }
  window.mktToggleLike = mktToggleLike;

  let mktComentariosPubId = null;

  async function mktAbrirComentarios(pubId) {
    mktComentariosPubId = pubId;
    const tit = document.getElementById('com-pub-titulo');
    // El título sale del cache (ya cargado por el feed), nunca de un
    // parámetro interpolado en el onclick — ver mktCardHTML: escHTML() no
    // alcanza para neutralizar contenido de usuario dentro de un atributo
    // onclick (el parser HTML decodifica las entidades antes de que el JS
    // las lea), así que un título con comillas podía romper el string e
    // inyectar JS que corría en el navegador de cualquiera que viera el feed.
    if (tit) tit.textContent = mktPostsCache.get(pubId)?.titulo || '';
    const inp = document.getElementById('com-input');
    if (inp) inp.value = '';
    mktSetPuntaje(0);   // que no herede la nota de la publicación anterior
    goTo('s-comentarios-pub');
    await mktCargarComentarios();
  }
  window.mktAbrirComentarios = mktAbrirComentarios;

  // Puntaje del comentario que se está escribiendo. 0 = sin puntuar, que es
  // el estado inicial y un valor válido: puntuar es opcional.
  let mktPuntajeNuevo = 0;

  function mktSetPuntaje(n) {
    // Tocar la misma estrella dos veces la apaga: es la forma de arrepentirse
    // sin buscar un botón.
    mktPuntajeNuevo = (n === mktPuntajeNuevo) ? 0 : n;
    document.querySelectorAll('#com-estrellas .com-star').forEach(b => {
      b.classList.toggle('on', Number(b.dataset.n) <= mktPuntajeNuevo);
      b.setAttribute('aria-pressed', Number(b.dataset.n) === mktPuntajeNuevo ? 'true' : 'false');
    });
    const lbl = document.getElementById('com-estrellas-lbl');
    if (lbl) lbl.textContent = mktPuntajeNuevo
      ? mktPuntajeNuevo + ' de 5'
      : 'Puntuar es opcional';
    const quitar = document.getElementById('com-estrellas-limpiar');
    if (quitar) quitar.style.display = mktPuntajeNuevo ? '' : 'none';
  }
  window.mktSetPuntaje = mktSetPuntaje;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#com-estrellas .com-star').forEach(b => {
      b.addEventListener('click', () => mktSetPuntaje(Number(b.dataset.n)));
    });
  });

  async function mktCargarComentarios() {
    const lista = document.getElementById('com-lista');
    if (!lista || !mktComentariosPubId) return;
    lista.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink3);font-size:13px">⏳ Cargando...</div>';
    const items = await PronetDB.listarComentarios(mktComentariosPubId).catch(() => []);
    if (!items.length) {
      lista.innerHTML = '<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">Todavía no hay comentarios.<br>¡Sé el primero!</div>';
      return;
    }
    // Tarjeta y no fila con separador: el comentario de un vecino sobre algo
    // que compró es contenido con peso propio —es lo que decide a otro a
    // comprar— y una lista con líneas divisorias lo hace ver como un log.
    lista.innerHTML = items.map(c => {
      const nombre = c.perfiles?.nombre || 'Vecino';
      const ini    = mktIniciales(nombre);
      const tiempo = mktTiempoRelativo(c.creado);
      const esPropio = c.autor_id === usuarioActual?.id || esAdmin();
      return `<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:13px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="c-av" style="width:40px;height:40px;flex-shrink:0;font-size:13px;border-radius:50%;background:var(--blue-s);color:var(--blue)">${escHTML(ini)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.3">${escHTML(nombre)}</div>
            <div style="font-size:11.5px;color:var(--ink3);margin-top:2px">${escHTML(tiempo)}</div>
          </div>
          ${c.puntaje ? `<div class="stars" style="flex-shrink:0" aria-label="${c.puntaje} de 5">${estrellasHTML(c.puntaje, '13px')}</div>` : ''}
          ${esPropio ? `<button onclick="mktBorrarComentario('${escHTML(c.id)}')" aria-label="Borrar comentario" style="background:none;border:none;font-size:13px;color:var(--ink3);cursor:pointer;padding:4px;font-family:inherit;flex-shrink:0">✕</button>` : ''}
        </div>
        <div style="font-size:13.5px;color:var(--ink);line-height:1.55;word-break:break-word;margin-top:10px">${escHTML(c.texto)}</div>
      </div>`;
    }).join('');
  }
  window.mktCargarComentarios = mktCargarComentarios;

  async function mktEnviarComentario() {
    if (!usuarioActual) { showToast('Iniciá sesión para comentar'); return; }
    const inp = document.getElementById('com-input');
    const texto = inp?.value.trim();
    if (!texto) return;
    const btn = document.getElementById('com-enviar-btn');
    if (btn) btn.disabled = true;
    const res = await PronetDB.crearComentario(mktComentariosPubId, texto, mktPuntajeNuevo || null);
    if (btn) btn.disabled = false;
    if (!res.ok) { showToast('⚠️ No se pudo enviar el comentario'); return; }
    if (inp) inp.value = '';
    // El puntaje también se limpia: si quedara puesto, el próximo comentario
    // saldría con la nota del anterior sin que nadie la haya elegido.
    mktSetPuntaje(0);
    // Y se refresca el agregado, para que al volver al feed la tarjeta no
    // siga mostrando el conteo de antes de este comentario.
    const frescas = await PronetDB.listarRecomendaciones([mktComentariosPubId]).catch(() => null);
    if (frescas?.has(mktComentariosPubId)) mktRecosCache.set(mktComentariosPubId, frescas.get(mktComentariosPubId));
    // Actualizar contador en el card del feed
    const cntEl = document.querySelector(`[onclick*="${mktComentariosPubId}"] span`);
    // Recargar lista
    await mktCargarComentarios();
  }
  window.mktEnviarComentario = mktEnviarComentario;

  async function mktBorrarComentario(comentarioId) {
    const res = await PronetDB.borrarComentario(comentarioId);
    if (res.ok) await mktCargarComentarios();
  }
  window.mktBorrarComentario = mktBorrarComentario;

  async function renderMercado(reset = true) {
    const cont = document.getElementById('mkt-feed');
    if (!cont || mktCargando) return;
    const btnPub = document.getElementById('mkt-btn-publicar');
    if (btnPub) btnPub.style.display = usuarioActual ? '' : 'none';
    // Antes de traer nada: el catálogo puede haber cambiado desde el panel, y
    // las pestañas y chips salen de él.
    if (!mktCatsCargadas) { await cargarMktCategorias(); mktCatsCargadas = true; }
    mktPintarSecciones();
    mktAplicarFormatoUI();
    if (reset) {
      mktOffset  = 0;
      mktHayMas  = true;
      mktFeedIds = [];
      cont.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    }
    // Avisos de prestadores: otra fuente, otro render, mismo lugar. No
    // pasan por el filtro de comunidad ni por el mapa — un prestador trabaja
    // en una zona de cobertura, no vive en un lote del barrio.
    if (mktOrigen === 'prestador') {
      mktCargando = true;
      mktHayMas = false;   // sin paginado: el "Ver más" no aplica a esta fuente
      await renderFeedPrestadores(cont);
      mktCargando = false;
      return;
    }

    mktCargando = true;
    // Mercado cerrado por comunidad: por defecto se ve lo de la propia. Un
    // mercado abierto a toda la zona te trae empanadas de Garín que nadie va
    // a ir a buscar. `mktAmpliado` lo abre a pedido — sin esa salida, el
    // vecino de una comunidad chica ve un feed vacío y no vuelve.
    const comunidad = await comunidadDelUsuario();
    const barrios = mktBarrioFiltro
      ? [mktBarrioFiltro]
      : ((comunidad && !mktAmpliado) ? await barriosDeComunidad(comunidad) : null);
    // `categorias` acota a la sección activa: sin eso, "Todos" en Servicios
    // mostraría también los productos.
    const posts = await PronetDB.listarPublicaciones({
      categoria: mktFiltroActivo, categorias: slugsDeTipo(mktTipoActivo),
      busqueda: mktBusqueda, zona: mktZonaActiva, offset: mktOffset,
      barrios,
      // Un barrio elegido en el mapa es una pregunta concreta: mostrar
      // también las que no dicen dónde están contradiría el número del pin.
      incluirSinBarrio: !mktBarrioFiltro,
    }).catch(() => []);
    mktCargando = false;
    if (reset) mktPintarAmbito(comunidad);
    if (reset) { cont.innerHTML = ''; mktUltimoResultCount = posts.length; }
    posts.forEach(p => mktPostsCache.set(p.id, p));
    // Cargar qué publicaciones likeó el usuario actual (merge con el Set existente)
    if (posts.length && usuarioActual) {
      const ids = posts.map(p => p.id);
      const nuevos = await PronetDB.listarMisLikes(ids).catch(() => new Set());
      nuevos.forEach(id => mktMisLikes.add(id));
    }
    if (!posts.length && mktOffset === 0) {
      // Con el mercado acotado a la comunidad, "no hay nada" casi siempre
      // significa "no hay nada ACÁ". Ofrecer primero ampliar y después
      // publicar: mandar a publicar a alguien que entró a comprar es pedirle
      // que resuelva él el problema de que el mercado esté vacío.
      cont.innerHTML = (comunidad && !mktAmpliado)
        ? '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no hay nada en ' + escHTML(comunidad) + '.<br>' +
          '<span style="color:var(--blue);font-weight:600;cursor:pointer" onclick="mktToggleAmbito()">Ver también otros barrios</span>' +
          '<div style="margin-top:10px;font-size:12px">o <span style="color:var(--blue);font-weight:600;cursor:pointer" onclick="abrirPublicarMercado()">publicá el primero</span></div></div>'
        : '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no hay publicaciones en esta categoría.<br><span style="color:var(--blue);font-weight:600;cursor:pointer" onclick="abrirPublicarMercado()">¡Publicá el primero!</span></div>';
      mktHayMas = false;
      return;
    }
    // Las recomendaciones se traen para toda la página de una vez, antes de
    // dibujar: una consulta por tarjeta serían diez por scroll.
    const recos = await PronetDB.listarRecomendaciones(posts.map(p => p.id)).catch(() => new Map());
    recos.forEach((v, k) => mktRecosCache.set(k, v));
    // Los lotes que este usuario puede ver. El servidor decide cuáles: acá
    // sólo llegan los que corresponden, así que no hay nada que filtrar.
    const lotes = await PronetDB.listarLotesVisibles(posts.map(p => p.id)).catch(() => new Map());
    lotes.forEach((v, k) => mktLotesCache.set(k, v));
    cont.insertAdjacentHTML('beforeend', posts.map(mktCardHTML).join(''));
    mktFeedIds.push(...posts.map(p => p.id));
    mktOffset  += posts.length;
    mktHayMas   = posts.length === 10;
    const verMas = document.getElementById('mkt-ver-mas');
    if (verMas) verMas.style.display = mktHayMas ? 'block' : 'none';
  }

  // ¿El feed está abierto a toda la zona o acotado a mi comunidad?
  let mktAmpliado = false;
  // Barrio puntual elegido desde un pin del mapa. Manda sobre el ámbito de
  // comunidad: si tocaste "Araucarias" querés ver Araucarias, no tu barrio.
  let mktBarrioFiltro = null;

  /** La barrita que dice de qué mercado estás viendo y ofrece salir de él.
   *
   *  Va visible siempre que haya comunidad: un mercado cerrado sin cartel es
   *  indistinguible de un mercado vacío, y el vecino concluye que no hay
   *  nada en vez de que está mirando poquito. */
  function mktPintarAmbito(comunidad) {
    const cont = document.getElementById('mkt-ambito');
    if (!cont) return;
    const txt = document.getElementById('mkt-ambito-txt');
    const btn = document.getElementById('mkt-ambito-btn');
    // El barrio elegido en el mapa se muestra aunque el vecino no tenga
    // comunidad: si no, el feed quedaría filtrado sin que nada lo diga.
    if (mktBarrioFiltro) {
      cont.style.display = 'flex';
      if (txt) txt.textContent = 'Publicaciones en ' + mktBarrioFiltro;
      if (btn) { btn.textContent = 'Quitar filtro'; btn.setAttribute('onclick', 'mktQuitarBarrioFiltro()'); }
      return;
    }
    if (btn) btn.setAttribute('onclick', 'mktToggleAmbito()');
    if (!comunidad) { cont.style.display = 'none'; return; }
    cont.style.display = 'flex';
    if (txt) txt.textContent = mktAmpliado ? 'Viendo toda la zona' : 'Mercado de ' + comunidad;
    if (btn) btn.textContent = mktAmpliado ? 'Volver a mi comunidad' : 'Ver también otros barrios';
  }

  function mktToggleAmbito() {
    mktAmpliado = !mktAmpliado;
    renderMercado(true);
  }
  window.mktToggleAmbito = mktToggleAmbito;

  function filtrarMercado(chip, categoria) {
    document.querySelectorAll('#s-mercado .filter-row .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    mktFiltroActivo = categoria;
    renderMercado(true);
  }

  function mktBuscar(valor) {
    clearTimeout(mktDebounceTimer);
    mktDebounceTimer = setTimeout(async () => {
      mktBusqueda = valor || '';
      const termino = mktBusqueda.trim();
      await renderMercado(true);
      // Registrar la búsqueda (best-effort) para detectar demanda sin oferta.
      // La zona relevante es la del que busca (usuarioActual.zona), no el
      // filtro de zona del feed — la mayoría busca sin filtrar por zona.
      if (termino.length >= 2 && usuarioActual?.zona) {
        PronetDB.registrarBusquedaMercado(termino, usuarioActual.zona, mktFiltroActivo, mktUltimoResultCount).catch(() => {});
      }
      // Mostrar/ocultar chip de alerta
      const row = document.getElementById('mkt-alerta-row');
      if (!row) return;
      if (!termino || termino.length < 2 || !usuarioActual) {
        row.style.display = 'none';
        return;
      }
      row.style.display = 'block';
      mktAlertaActiva = await PronetDB.verificarAlertaBusqueda(termino).catch(() => false);
      mktActualizarChipAlerta();
    }, 400);
  }
  window.mktBuscar = mktBuscar;

  function mktActualizarChipAlerta() {
    const btn  = document.getElementById('mkt-alerta-btn');
    const icon = document.getElementById('mkt-alerta-icon');
    const lbl  = document.getElementById('mkt-alerta-lbl');
    if (!btn || !icon || !lbl) return;
    if (mktAlertaActiva) {
      btn.style.borderColor  = 'var(--blue)';
      btn.style.color        = 'var(--blue)';
      btn.style.background   = 'var(--blue-s, #EEF2FF)';
      icon.textContent       = '🔔';
      lbl.textContent        = 'Siguiendo "' + mktBusqueda.trim() + '" · Dejar de seguir';
    } else {
      btn.style.borderColor  = 'var(--border)';
      btn.style.color        = 'var(--ink3)';
      btn.style.background   = 'none';
      icon.textContent       = '🔔';
      lbl.textContent        = 'Avisame cuando haya "' + mktBusqueda.trim() + '"';
    }
  }

  async function mktToggleAlerta() {
    if (!usuarioActual) {
      mostrarGate && mostrarGate({ titulo: 'Alertas', sub: 'Necesitás una cuenta para guardar búsquedas.' });
      return;
    }
    const termino = mktBusqueda.trim();
    if (!termino) return;
    const btn = document.getElementById('mkt-alerta-btn');
    if (btn) btn.style.opacity = '0.5';
    if (mktAlertaActiva) {
      await PronetDB.eliminarAlertaBusqueda(termino).catch(() => {});
      mktAlertaActiva = false;
      showToast && showToast('Alerta eliminada');
    } else {
      const res = await PronetDB.crearAlertaBusqueda(termino).catch(() => ({ ok: false }));
      if (res.ok) {
        mktAlertaActiva = true;
        showToast && showToast('🔔 ¡Listo! Te avisamos cuando haya algo nuevo de "' + termino + '"');
      } else {
        showToast && showToast('⚠️ No se pudo guardar la alerta');
      }
    }
    if (btn) btn.style.opacity = '1';
    mktActualizarChipAlerta();
  }
  window.mktToggleAlerta = mktToggleAlerta;

  function mktFiltrarZona(valor) {
    mktZonaActiva = valor || null;
    const sel = document.getElementById('mkt-zona-select');
    if (sel) sel.value = mktZonaActiva || '';
    renderMercado(true);
  }
  window.mktFiltrarZona = mktFiltrarZona;

  // ═══ Portada de Entre Vecinos ═══════════════════════════════════════════
  // Se muestra la primera vez del día que se entra a la sección.
  //
  // Sigue en localStorage y no en la base —es una decisión de presentación, no
  // un dato del usuario— pero la clave lleva el id de la cuenta. Con una clave
  // única por dispositivo, cambiar de perfil en el mismo teléfono heredaba el
  // "ya la vio" del perfil anterior y la portada no aparecía nunca para el
  // segundo. Es el caso normal de quien prueba con varias cuentas, y sería el
  // de cualquier teléfono compartido en una casa.
  const PORTADA_VECINOS_BASE = 'pronet_portada_vecinos_v1';

  /** Clave de la portada para la cuenta activa.
   *
   *  Sin sesión cae en 'anon', que es su propio cajón: lo que vio un invitado
   *  no debe darse por visto cuando después inicie sesión. */
  function portadaKey() {
    return `${PORTADA_VECINOS_BASE}:${usuarioActual?.id || 'anon'}`;
  }

  /** Fecha local en formato YYYY-MM-DD.
   *
   *  A mano y no con toISOString(): ese convierte a UTC, así que entre las
   *  21hs y la medianoche de Argentina ya devuelve el día siguiente y la
   *  portada se daría por vista una noche antes de tiempo. */
  function hoyLocal() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** Punto de entrada a la sección desde el nav y el menú.
   *
   *  Los "volver" de las sub-pantallas siguen yendo a s-mercado directo: se
   *  entra a Entre Vecinos por acá, pero se REGRESA al feed. Una portada al
   *  volver de un chat sería un peaje. */
  function entrarAVecinos() {
    // La comunidad se pregunta ANTES de mostrar nada: es lo que decide qué
    // mercado ve. Si ya la tiene, o la omitió hoy, sigue de largo.
    pedirComunidadSiFalta(_entrarAVecinosReal);
  }
  window.entrarAVecinos = entrarAVecinos;

  function _entrarAVecinosReal() {
    let visto = null;
    try { visto = localStorage.getItem(portadaKey()); } catch (e) {}
    if (visto === hoyLocal()) return goTo('s-mercado');
    goTo('s-vecinos-portada');
    // Sólo se rellena si el goTo prosperó. Con el flag de Entre Vecinos
    // apagado, goTo corta antes de activar nada, y seguir adelante haría una
    // consulta a la base para pintar una pantalla que nadie va a ver.
    const el = document.getElementById('s-vecinos-portada');
    if (el && el.classList.contains('active')) renderPortadaVecinos();
  }

  // ── Comunidad del vecino (perfiles.zona) ─────────────────────────────
  //
  // `zonaActual` (el modal de zona) es un filtro de navegación y vive en
  // localStorage: hoy miro Puertos, mañana Escobar Centro. La comunidad es
  // otra cosa —dónde vivo— y tiene que estar en la cuenta, porque define de
  // qué mercado formo parte y quién puede ver mi lote. Eran lo mismo y por
  // eso los 12 perfiles tenían zona='Escobar': el modal nunca escribía en
  // la base. Mismo patrón que los T&C por dispositivo.
  let zonasArbolCache = null;

  async function cargarZonasArbol() {
    if (zonasArbolCache) return zonasArbolCache;
    zonasArbolCache = await PronetDB.listarZonasArbol().catch(() => []);
    return zonasArbolCache;
  }

  /** La comunidad y sus barrios: el conjunto de valores de
   *  `publicaciones.barrio` que cuentan como "de mi comunidad". */
  async function barriosDeComunidad(comunidad) {
    if (!comunidad) return null;
    const arbol = await cargarZonasArbol();
    return [comunidad, ...arbol.filter(z => z.nivel === 3 && z.comunidad === comunidad).map(z => z.nombre)];
  }

  /** Las comunidades (nivel 2) son las unidades de mercado. */
  async function listarComunidades() {
    return (await cargarZonasArbol()).filter(z => z.nivel === 2);
  }

  /** La comunidad del usuario, o null si su zona todavía es de nivel 1.
   *
   *  Un vecino que eligió un barrio (nivel 3) igual pertenece a la comunidad
   *  de ese barrio: se resuelve por la columna `comunidad` de zonas_arbol. */
  async function comunidadDelUsuario() {
    if (!usuarioActual?.zona) return null;
    const fila = (await cargarZonasArbol()).find(z => z.nombre === usuarioActual.zona);
    if (!fila) return null;
    if (fila.nivel === 2) return fila.nombre;
    if (fila.nivel === 3) return fila.comunidad || null;
    return null; // nivel 1: es la zona entera, no una comunidad
  }

  function comunidadOmitidaKey() {
    return `pronet_comunidad_omitida:${usuarioActual?.id || 'anon'}`;
  }

  /** Pide la comunidad si falta y recién entonces sigue. Omitir vale por hoy:
   *  ni bloquea la sección ni vuelve a preguntar en el mismo día. */
  async function pedirComunidadSiFalta(continuar) {
    if (!usuarioActual) return continuar();
    let omitida = null;
    try { omitida = localStorage.getItem(comunidadOmitidaKey()); } catch (e) {}
    if (omitida === hoyLocal()) return continuar();
    const yaTiene = await comunidadDelUsuario();
    if (yaTiene) return continuar();
    _comunidadContinuar = continuar;
    await abrirModalComunidad();
  }

  let _comunidadContinuar = null;

  async function abrirModalComunidad() {
    const lista = document.getElementById('comunidad-list');
    const modal = document.getElementById('modal-comunidad');
    if (!lista || !modal) return _cerrarComunidadYSeguir();
    const err = document.getElementById('comunidad-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    lista.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';
    modal.classList.add('show');
    const comunidades = await listarComunidades();
    if (!comunidades.length) return _cerrarComunidadYSeguir();
    // El nombre va en un data-attribute y no interpolado en el onclick: el
    // catálogo de zonas lo edita el admin y "Matheu / Garín" ya trae una
    // barra. Ver la nota de escHTML() en mktCardHTML.
    lista.innerHTML = comunidades.map(c =>
      '<div class="zona-option" data-comunidad="' + escHTML(c.nombre) + '">' +
        '<div class="zo-icon">🏘️</div>' +
        '<div style="flex:1"><div class="zo-name">' + escHTML(c.nombre) + '</div>' +
        '<div class="zo-sub">' + escHTML(c.zona || '') + '</div></div>' +
        '<div class="zo-check"></div>' +
      '</div>').join('');
    lista.querySelectorAll('.zona-option').forEach(el => {
      el.addEventListener('click', () => confirmarComunidad(el.dataset.comunidad, el));
    });
  }

  async function confirmarComunidad(nombre, el) {
    if (!nombre) return;
    const lista = document.getElementById('comunidad-list');
    const err   = document.getElementById('comunidad-error');
    if (lista) lista.style.opacity = '0.5';
    if (el) el.classList.add('active');
    const res = await PronetDB.actualizarMiPerfilBasico({ zona: nombre }).catch(() => ({ ok: false }));
    if (lista) lista.style.opacity = '1';
    if (!res.ok) {
      // Sin esto el modal se cerraba igual y el vecino creía que había
      // quedado guardado. Que falle y no se note es peor que el error.
      if (el) el.classList.remove('active');
      if (err) { err.textContent = 'No se pudo guardar. Probá de nuevo.'; err.style.display = 'block'; }
      return;
    }
    usuarioActual.zona = nombre;
    // El filtro de navegación acompaña a la comunidad recién elegida: sería
    // raro decir "vivo en Puertos" y seguir viendo el feed de otra zona.
    zonaActual = nombre;
    guardarEstado();
    actualizarZonaLabel(zonaActual);
    showToast && showToast('🏘️ Listo, tu comunidad es ' + nombre);
    _cerrarComunidadYSeguir();
  }
  window.confirmarComunidad = confirmarComunidad;

  function omitirComunidad() {
    try { localStorage.setItem(comunidadOmitidaKey(), hoyLocal()); } catch (e) {}
    _cerrarComunidadYSeguir();
  }
  window.omitirComunidad = omitirComunidad;

  function _cerrarComunidadYSeguir() {
    document.getElementById('modal-comunidad')?.classList.remove('show');
    const seguir = _comunidadContinuar;
    _comunidadContinuar = null;
    if (seguir) seguir();
  }

  function cerrarPortadaVecinos() {
    // Se marca al SALIR, no al entrar: si la marcáramos al mostrarla y el
    // usuario cerrara la app en esa pantalla, se habría gastado la portada
    // del día sin haberla usado.
    try { localStorage.setItem(portadaKey(), hoyLocal()); } catch (e) {}
    goTo('s-mercado');
  }
  window.cerrarPortadaVecinos = cerrarPortadaVecinos;

  /** Rellena lo que la portada tiene de real: la zona y el conteo.
   *
   *  El diseño traía "24 vecinos activos hoy" fijo. Acá se cuentan
   *  publicaciones activas del área del usuario — un número que puede
   *  contrastar entrando al feed. Si da cero la línea no se muestra: anunciar
   *  que no hay nada es peor que no decir nada. */
  async function renderPortadaVecinos() {
    const pill = document.getElementById('pv-zona');
    if (pill) pill.textContent = (zonaParaFiltro() || 'Escobar').toUpperCase();

    const cont = document.getElementById('pv-actividad');
    const txt  = document.getElementById('pv-actividad-txt');
    if (!cont || !txt) return;
    cont.style.display = 'none';   // hasta saber que hay algo que mostrar

    const zonas = zonasDelFiltro();
    const n = await PronetDB.contarPublicacionesActivas(zonas).catch(() => 0);
    if (!n) return;
    txt.textContent = n === 1 ? '1 publicación en tu zona' : `${n} publicaciones en tu zona`;
    cont.style.display = 'flex';
  }

  function toggleMapaMercado() {
    mktModo = mktModo === 'lista' ? 'mapa' : 'lista';
    const feedEls = ['mkt-feed', 'mkt-ver-mas'];
    const filterEls = ['mkt-buscador', 'mkt-zona-select', 'mkt-mapa-cont'];
    // Los controles de filtro (chips, buscador, select zona) son comunes a ambos modos
    document.getElementById('mkt-mapa-cont').style.display = mktModo === 'mapa' ? 'block' : 'none';
    document.getElementById('mkt-feed').style.display       = mktModo === 'lista' ? '' : 'none';
    document.getElementById('mkt-ver-mas').style.display    = mktModo === 'lista' && mktHayMas ? 'block' : 'none';
    const lbl = document.getElementById('mkt-toggle-lbl');
    if (lbl) lbl.textContent = mktModo === 'mapa' ? 'Lista' : 'Mapa';
    // El formato es del feed: en el mapa no tiene nada que cambiar.
    const btnFmt = document.getElementById('mkt-toggle-formato');
    if (btnFmt) btnFmt.style.display = mktModo === 'lista' ? '' : 'none';
    if (mktModo === 'mapa') renderMapaMercado();
  }
  window.toggleMapaMercado = toggleMapaMercado;

  async function renderMapaMercado() {
    const loading = document.getElementById('mkt-mapa-loading');
    if (loading) loading.style.display = 'flex';

    const ok = await cargarGoogleMapsAPI();
    if (!ok) {
      if (loading) loading.textContent = '⚠️ El mapa no está disponible en este momento';
      return;
    }

    // Un pin por BARRIO, no por zona: un solo pin para todo Escobar no
    // contesta "¿dónde hay empanadas?", que es la pregunta que originó el
    // mapa. El mapa respeta el mismo ámbito que el feed — sería raro decir
    // "Mercado de San Matías" y mostrar pines de otra comunidad.
    const comunidadMapa = await comunidadDelUsuario();
    const barriosMapa = (comunidadMapa && !mktAmpliado) ? await barriosDeComunidad(comunidadMapa) : null;
    const counts = await PronetDB.contarPublicacionesPorBarrio({
      categoria: mktFiltroActivo, busqueda: mktBusqueda, barrios: barriosMapa,
      // El desplegable de zona acota el feed; sin esto el mapa mostraba
      // pines de publicaciones que la lista no tenía.
      zona: mktZonaActiva,
    }).catch(() => ({}));
    const container = document.getElementById('mkt-mapa-div');
    if (!container) return;

    if (!mapaGoogleMkt) {
      mapaGoogleMkt = new google.maps.Map(container, {
        center: { lat: ESCOBAR_LAT, lng: ESCOBAR_LNG },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
      });
    }

    // Limpiar marcadores anteriores
    mktMarcadores.forEach(m => m.setMap(null));
    mktMarcadores = [];

    const bounds = new google.maps.LatLngBounds();
    let hayPins = false;

    _mktPins.length = 0;
    Object.entries(counts).forEach(([lugar, count]) => {
      const coord = MKT_ZONA_COORD[lugar];
      if (!coord) return;
      const pos = new google.maps.LatLng(coord.lat, coord.lng);
      bounds.extend(pos);
      hayPins = true;
      // Sólo el índice (un número) viaja en el onclick. El nombre sale del
      // array: los nombres de barrio los edita el admin y escHTML() no
      // protege adentro de un handler inline — el parser decodifica las
      // entidades antes de que el JS las lea.
      const idx = _mktPins.push(lugar) - 1;
      const label = count > 9 ? '9+' : String(count);
      const marker = new google.maps.Marker({
        position: pos,
        map: mapaGoogleMkt,
        title: lugar + ' — ' + count + ' ' + (count === 1 ? 'publicación' : 'publicaciones'),
        label: { text: label, color: 'white', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 22,
          fillColor: '#2B5BFF',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      });
      const info = new google.maps.InfoWindow({
        content: `<div style="font-family:'Inter',sans-serif;min-width:160px;padding:4px 0">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escHTML(lugar)}</div>
          <div style="font-size:12px;color:#555;margin-bottom:8px">${count} ${count === 1 ? 'publicación' : 'publicaciones'}</div>
          <button onclick="mktVerBarrioDelMapa(${idx})"
            style="background:#2B5BFF;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;width:100%">Ver publicaciones</button>
        </div>`,
      });
      marker.addListener('click', () => {
        mktMarcadores.forEach(m => m._info && m._info.close());
        info.open(mapaGoogleMkt, marker);
      });
      marker._info = info;
      mktMarcadores.push(marker);
    });

    if (hayPins) mapaGoogleMkt.fitBounds(bounds, 60);
    if (loading) loading.style.display = 'none';
  }
  window.renderMapaMercado = renderMapaMercado;

  // Nombre de cada pin dibujado. El onclick del globo manda el índice.
  const _mktPins = [];

  /** Tocar "Ver publicaciones" en un pin: vuelve a la lista, acotada a ese
   *  barrio. Filtra por BARRIO y no por zona — antes usaba mktFiltrarZona,
   *  que compara contra `publicaciones.zona` ('Escobar') y con un pin de
   *  barrio habría devuelto un feed vacío. */
  function mktVerBarrioDelMapa(idx) {
    const lugar = _mktPins[idx];
    if (!lugar) return;
    mktBarrioFiltro = lugar;
    if (mktModo === 'mapa') toggleMapaMercado();
    renderMercado(true);
  }
  window.mktVerBarrioDelMapa = mktVerBarrioDelMapa;

  function mktQuitarBarrioFiltro() {
    mktBarrioFiltro = null;
    renderMercado(true);
  }
  window.mktQuitarBarrioFiltro = mktQuitarBarrioFiltro;

  /** Abre (o crea) el chat de mercado con el autor de una publicación.
   *
   *  `silencioso` evita el aviso genérico de "quiere consultarte": lo usa el
   *  carrito, que después manda uno propio diciendo que es un PEDIDO. Sin
   *  esto el vendedor recibiría dos notificaciones y la primera diría algo
   *  que no es. */
  async function mktConsultar(pubId, { silencioso = false } = {}) {
    // nombre/autorId/título salen del cache del feed, no de parámetros
    // interpolados en el onclick — ver nota de seguridad en mktAbrirComentarios.
    const pubCache = mktPostsCache.get(pubId) || {};
    const autorNombre = pubCache.perfiles?.nombre || 'Vendedor';
    const autorId = pubCache.autor_id;
    const pubTitulo = pubCache.titulo || '';
    if (!usuarioActual) { mostrarGate && mostrarGate({ titulo: 'Consultar', sub: 'Necesitás una cuenta para enviar mensajes.' }); return; }
    if (usuarioActual.id === autorId) { showToast && showToast('No podés consultar tu propia publicación'); return; }
    chatMercadoOrigen = 's-mercado';
    chatMercadoContraparteId = autorId;
    chatMercadoContraparteNombre = autorNombre || 'Vendedor';
    chatMercadoContraparteTelefono = null;
    // Set up header immediately
    const avEl = document.getElementById('cmk-av');
    const nameEl = document.getElementById('cmk-name');
    const subEl = document.getElementById('cmk-sub');
    if (nameEl) nameEl.textContent = autorNombre || 'Vendedor';
    if (avEl) {
      const ini = (autorNombre || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      avEl.textContent = ini;
      avEl.style.background = '#EEF2FF'; avEl.style.color = '#2B5BFF';
    }
    if (subEl) subEl.textContent = 'ProMarket';
    const contactBtn1 = document.getElementById('cmk-contactar-btn');
    if (contactBtn1) contactBtn1.style.display = 'none';
    cargarTelefonoContraparte(autorId);
    goTo('s-chat-mercado');
    const body = document.getElementById('cmk-body');
    if (body) body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Abriendo chat...</div>';
    const res = await PronetDB.abrirChatMercado(pubId);
    if (!res.ok) {
      if (body) body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⚠️ ' + escHTML(res.error) + '</div>';
      return;
    }
    chatMercadoActualId = res.chat_id;
    await cargarMensajesMercado();
    if (chatMercadoSuscripcion) chatMercadoSuscripcion();
    chatMercadoSuscripcion = PronetDB.suscribir('mensajes_mercado', (payload) => {
      if (!payload.new || payload.new.chat_id !== chatMercadoActualId) return;
      if (payload.eventType === 'UPDATE' || payload.new.tipo === 'reserva') {
        cargarMensajesMercado();
      } else if (payload.new.autor_id !== usuarioActual.id) {
        agregarBurbujaMercado(payload.new, false);
        PronetDB.marcarLeidosMercado(chatMercadoActualId);
      }
    });
    PronetDB.marcarLeidosMercado(chatMercadoActualId);
    if (silencioso) return;
    // Notificar al autor que alguien abrió una consulta
    const nombreConsultante = usuarioActual.nombre || 'Un vecino';
    PronetDB.notificar({
      destino: 'usuario',
      usuario_id: autorId,
      tipo: 'consulta_mercado',
      titulo: `💬 ${nombreConsultante} quiere consultarte`,
      cuerpo: pubTitulo ? pubTitulo.slice(0, 80) : 'Nueva consulta en Entre Vecinos',
    }).catch(() => {});
  }
  window.mktConsultar = mktConsultar;

  async function cargarMensajesMercado() {
    if (!chatMercadoActualId) return;
    const body = document.getElementById('cmk-body');
    const mensajes = await PronetDB.listarMensajesMercado(chatMercadoActualId);
    body.innerHTML = '';
    if (!mensajes.length) {
      body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">👋 ¡Primer mensaje! Preguntá lo que quieras.</div>';
      sincronizarBotonReserva(mensajes);
      return;
    }
    mensajes.forEach(m => agregarBurbujaMercado(m, m.autor_id === usuarioActual.id));
    body.scrollTop = body.scrollHeight;
    sincronizarBotonReserva(mensajes);
  }

  function sincronizarBotonReserva(mensajes) {
    const btn = document.getElementById('cmk-reservar-btn');
    if (!btn) return;
    const reservaActiva = mensajes.find(m => m.tipo === 'reserva' && (m.metadata?.estado === 'pendiente' || m.metadata?.estado === 'confirmada'));
    btn.style.display = reservaActiva ? 'none' : '';
  }

  function formatearFechaReserva(fecha, hora) {
    if (!fecha) return '';
    const [y, mo, d] = fecha.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const label = `${parseInt(d)} ${meses[parseInt(mo)-1]} ${y}`;
    return hora ? `${label} · ${hora} hs` : label;
  }

  function agregarBurbujaMercado(msg, esPropio) {
    // Compatibilidad con llamadas antiguas (texto, creado, esPropio, msgId)
    if (typeof msg === 'string') {
      const [texto, creado, _esPropio, msgId] = [msg, arguments[1], arguments[2], arguments[3]];
      msg = { texto, creado, tipo: 'texto', id: msgId };
      esPropio = _esPropio;
    }
    const body = document.getElementById('cmk-body');
    if (!body) return;
    if (msg.id && body.querySelector('[data-msg-id="' + msg.id + '"]')) return;
    const placeholder = body.querySelector('div[style*="text-align:center"]');
    if (placeholder) placeholder.remove();

    if (msg.tipo === 'reserva') {
      const meta   = msg.metadata || {};
      const estado = meta.estado || 'pendiente';
      const fechaStr = formatearFechaReserva(meta.fecha, meta.hora);
      const esPropioReserva = esPropio;

      const colores = { pendiente: '#2B5BFF', confirmada: '#16a34a', cancelada: '#9ca3af' };
      const color = colores[estado] || '#2B5BFF';

      let acciones = '';
      if (estado === 'pendiente' && !esPropioReserva) {
        acciones = `<div style="display:flex;gap:8px;margin-top:10px">
          <button onclick="responderReserva('${msg.id}','confirmada')"
            style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:8px;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button>
          <button onclick="responderReserva('${msg.id}','cancelada')"
            style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:8px;font-size:13px;font-weight:600;cursor:pointer">Rechazar</button>
        </div>`;
      } else if (estado === 'pendiente' && esPropioReserva) {
        acciones = `<div style="margin-top:8px;font-size:12px;color:var(--ink3)">Esperando respuesta...</div>`;
      } else if (estado === 'confirmada') {
        acciones = `<button onclick="cancelarReserva('${msg.id}')"
          style="margin-top:10px;width:100%;background:none;border:1.5px solid #dc2626;color:#dc2626;border-radius:8px;padding:7px;font-size:13px;font-weight:600;cursor:pointer">Cancelar reserva</button>`;
      }

      const etiquetas = { pendiente: '📅 Propuesta de reserva', confirmada: '✅ Reserva confirmada', cancelada: '❌ Reserva cancelada' };

      const div = document.createElement('div');
      div.style.cssText = 'margin:8px 14px';
      if (msg.id) div.dataset.msgId = msg.id;
      div.innerHTML = `<div style="border:1.5px solid ${color};border-radius:12px;padding:14px 14px 12px;background:var(--surface)">
        <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:6px">${etiquetas[estado] || etiquetas.pendiente}</div>
        <div style="font-size:15px;font-weight:700;color:var(--ink)">${escHTML(fechaStr)}</div>
        ${acciones}
      </div>`;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return;
    }

    const hora = new Date(msg.creado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
    const div = document.createElement('div');
    div.className = 'msg ' + (esPropio ? 'out' : 'in');
    if (msg.id) div.dataset.msgId = msg.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.texto;
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = hora;
    div.appendChild(bubble);
    div.appendChild(timeEl);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  async function enviarMsgMercado() {
    const inp = document.getElementById('cmk-msg');
    const txt = (inp.value || '').trim();
    if (!txt || !chatMercadoActualId) return;
    inp.value = '';
    agregarBurbujaMercado(txt, new Date().toISOString(), true, null);
    const res = await PronetDB.enviarMensajeMercado(chatMercadoActualId, txt);
    if (!res.ok) { showToast && showToast('⚠️ No se pudo enviar: ' + res.error); return; }
    // Notificar al otro participante (best-effort, no bloquea UX)
    if (chatMercadoContraparteId) {
      PronetDB.notificar({
        destino: 'usuario',
        usuario_id: chatMercadoContraparteId,
        tipo: 'mensaje_mercado',
        titulo: '💬 Nueva consulta en Entre Vecinos',
        cuerpo: txt.slice(0, 100),
      }).catch(() => {});
    }
  }
  window.enviarMsgMercado = enviarMsgMercado;

  function abrirModalReserva() {
    const modal = document.getElementById('modal-reserva');
    if (!modal) return;
    // Poner fecha mínima = hoy
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaInp = document.getElementById('reserva-fecha');
    if (fechaInp) { fechaInp.min = hoy; fechaInp.value = ''; }
    const horaInp = document.getElementById('reserva-hora');
    if (horaInp) horaInp.value = '';
    modal.style.display = '';
  }
  window.abrirModalReserva = abrirModalReserva;

  function cerrarModalReserva() {
    const modal = document.getElementById('modal-reserva');
    if (modal) modal.style.display = 'none';
  }
  window.cerrarModalReserva = cerrarModalReserva;

  async function confirmarEnvioReserva() {
    const fecha = document.getElementById('reserva-fecha')?.value;
    const hora  = document.getElementById('reserva-hora')?.value;
    if (!fecha) { showToast('⚠️ Elegí una fecha'); return; }
    if (!hora)  { showToast('⚠️ Elegí una hora'); return; }
    cerrarModalReserva();
    const res = await PronetDB.enviarReservaMercado(chatMercadoActualId, fecha, hora);
    if (!res.ok) { showToast('⚠️ No se pudo enviar la reserva'); return; }
    await cargarMensajesMercado();
    if (chatMercadoContraparteId) {
      PronetDB.notificar({
        destino: 'usuario',
        usuario_id: chatMercadoContraparteId,
        tipo: 'reserva_mercado',
        titulo: '📅 Propuesta de reserva',
        cuerpo: formatearFechaReserva(fecha, hora),
      }).catch(() => {});
    }
  }
  window.confirmarEnvioReserva = confirmarEnvioReserva;

  async function responderReserva(mensajeId, accion) {
    const res = await PronetDB.actualizarEstadoReserva(mensajeId, accion);
    if (!res.ok) { showToast('⚠️ No se pudo actualizar la reserva'); return; }
    await cargarMensajesMercado();
  }
  window.responderReserva = responderReserva;

  async function cancelarReserva(mensajeId) {
    const res = await PronetDB.actualizarEstadoReserva(mensajeId, 'cancelada');
    if (!res.ok) { showToast('⚠️ No se pudo cancelar la reserva'); return; }
    await cargarMensajesMercado();
  }
  window.cancelarReserva = cancelarReserva;

  function cerrarChatMercado() {
    if (chatMercadoSuscripcion) { chatMercadoSuscripcion(); chatMercadoSuscripcion = null; }
    chatMercadoActualId = null;
    chatMercadoContraparteId = null;
    chatMercadoContraparteNombre = null;
    chatMercadoContraparteTelefono = null;
    goTo(chatMercadoOrigen || 's-mercado');
  }
  window.cerrarChatMercado = cerrarChatMercado;

  // Trae el teléfono de la contraparte (si lo cargó) y muestra el botón de contacto.
  async function cargarTelefonoContraparte(userId) {
    const tel = await PronetDB.obtenerTelefonoUsuario(userId).catch(() => null);
    // El usuario pudo haber cambiado de chat mientras esto resolvía
    if (chatMercadoContraparteId !== userId) return;
    chatMercadoContraparteTelefono = tel;
    const btn = document.getElementById('cmk-contactar-btn');
    if (btn) btn.style.display = tel ? '' : 'none';
  }

  function abrirModalContacto() {
    if (!chatMercadoContraparteTelefono) return;
    const modal = document.getElementById('modal-contacto');
    if (!modal) return;
    const tel = chatMercadoContraparteTelefono.replace(/[^\d+]/g, '');
    const nombre = chatMercadoContraparteNombre || 'este vecino';
    const titEl = document.getElementById('contacto-titulo');
    if (titEl) titEl.textContent = `Contactar a ${nombre}`;
    const telLbl = document.getElementById('contacto-tel-label');
    if (telLbl) telLbl.textContent = chatMercadoContraparteTelefono;
    const llamarEl = document.getElementById('contacto-llamar');
    if (llamarEl) llamarEl.href = 'tel:' + tel;
    const waEl = document.getElementById('contacto-whatsapp');
    if (waEl) waEl.href = 'https://wa.me/' + tel.replace('+', '') + '?text=' + encodeURIComponent('Hola! Te escribo por tu publicación en Entre Vecinos');
    modal.style.display = 'flex';
  }
  window.abrirModalContacto = abrirModalContacto;

  function cerrarModalContacto() {
    const modal = document.getElementById('modal-contacto');
    if (modal) modal.style.display = 'none';
  }
  window.cerrarModalContacto = cerrarModalContacto;

  function copiarNumeroContacto() {
    if (!chatMercadoContraparteTelefono) return;
    navigator.clipboard?.writeText(chatMercadoContraparteTelefono).then(() => {
      showToast('📋 Número copiado');
      cerrarModalContacto();
    }).catch(() => showToast('⚠️ No se pudo copiar'));
  }
  window.copiarNumeroContacto = copiarNumeroContacto;

  // Abre un hilo de chat existente. origen controla a dónde vuelve el back.
  // Cache de las cards de "Mis consultas" (recibidas/enviadas), por chatId —
  // mismo motivo que mktPostsCache: evita interpolar nombre/título (texto
  // libre) directo en el onclick, donde escHTML() no protege.
  const mktConsultasCache = new Map();

  async function mktAbrirHilo(chatId, contraparteId, origen) {
    const cache = mktConsultasCache.get(chatId) || {};
    const contraNombre = cache.nombre || 'Vecino';
    const pubTitulo = cache.titulo || '';
    chatMercadoOrigen = origen || 's-mis-consultas-mkt';
    chatMercadoContraparteId = contraparteId;
    chatMercadoContraparteNombre = contraNombre;
    chatMercadoContraparteTelefono = null;
    const avEl = document.getElementById('cmk-av');
    const nameEl = document.getElementById('cmk-name');
    const subEl = document.getElementById('cmk-sub');
    if (nameEl) nameEl.textContent = contraNombre || 'Vecino';
    if (avEl) {
      const ini = (contraNombre || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      avEl.textContent = ini;
      avEl.style.background = '#EEF2FF'; avEl.style.color = '#2B5BFF';
    }
    if (subEl) subEl.textContent = pubTitulo || 'ProMarket';
    const contactBtn2 = document.getElementById('cmk-contactar-btn');
    if (contactBtn2) contactBtn2.style.display = 'none';
    cargarTelefonoContraparte(contraparteId);
    goTo('s-chat-mercado');
    const body = document.getElementById('cmk-body');
    if (body) body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    chatMercadoActualId = chatId;
    await cargarMensajesMercado();
    if (chatMercadoSuscripcion) chatMercadoSuscripcion();
    chatMercadoSuscripcion = PronetDB.suscribir('mensajes_mercado', (payload) => {
      if (!payload.new || payload.new.chat_id !== chatMercadoActualId) return;
      if (payload.eventType === 'UPDATE' || payload.new.tipo === 'reserva') {
        cargarMensajesMercado();
      } else if (payload.new.autor_id !== usuarioActual.id) {
        agregarBurbujaMercado(payload.new, false);
        PronetDB.marcarLeidosMercado(chatMercadoActualId);
      }
    });
    PronetDB.marcarLeidosMercado(chatMercadoActualId);
  }
  window.mktAbrirHilo = mktAbrirHilo;

  function mktAbrirHiloEnviado(chatId, contraparteId) {
    return mktAbrirHilo(chatId, contraparteId, 's-mis-consultas-enviadas');
  }
  window.mktAbrirHiloEnviado = mktAbrirHiloEnviado;

  // ── Mis publicaciones ProMarket ──────────────────────────────────────
  let mktMisPubs = [];

  async function renderMisPublicaciones() {
    const lista = document.getElementById('mis-pubs-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:32px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    mktMisPubs = await PronetDB.listarMisPublicaciones().catch(() => []);
    const pubs = mktMisPubs;
    if (!pubs.length) {
      lista.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:13px;color:var(--ink3)">Todavía no publicaste nada.<br><span style="color:var(--blue);font-weight:600;cursor:pointer" onclick="abrirPublicarMercado()">¡Publicá ahora!</span></div>';
      return;
    }
    lista.innerHTML = pubs.map(misPubsCardHTML).join('');
    // Actualizar subtítulo del menu item
    const activas = pubs.filter(p => p.activa).length;
    const subEl = document.getElementById('mp-mis-pubs-sub');
    if (subEl) subEl.textContent = activas + ' ' + (activas === 1 ? 'publicación' : 'publicaciones') + ' activa' + (activas !== 1 ? 's' : '');
    renderTendenciasMercado();
  }

  // Tendencias de búsqueda sin resultado en la zona del publicador — "se
  // busca esto y no lo encuentran", señal de oportunidad para nuevos rubros.
  async function renderTendenciasMercado() {
    const card = document.getElementById('mkt-tendencias-card');
    const lista = document.getElementById('mkt-tendencias-lista');
    if (!card || !lista || !usuarioActual?.zona) { if (card) card.style.display = 'none'; return; }
    const tendencias = await PronetDB.listarTendenciasBusqueda(usuarioActual.zona).catch(() => []);
    if (!tendencias.length) { card.style.display = 'none'; return; }
    lista.innerHTML = tendencias.map(t =>
      `<div style="font-size:13px;color:#3730A3;line-height:1.7">"${escHTML(t.termino)}" <span style="opacity:.7">· ${t.cantidad} búsqueda${t.cantidad !== 1 ? 's' : ''}</span></div>`
    ).join('');
    card.style.display = '';
  }

  function misPubsCardHTML(p) {
    // mktCatLabel y no MKT_CAT_LABELS: ese objeto se borró al dividir Entre
    // Vecinos y quedó esta referencia suelta, que reventaba la pantalla
    // entera con un ReferenceError. `node --check` no lo ve — es un error
    // de ejecución, no de sintaxis.
    const cat = mktCatLabel(p.categoria);
    const precio = p.precio_convenir ? 'A convenir' : (p.precio ? '$' + Number(p.precio).toLocaleString('es-AR') : 'Consultar');
    const foto = p.foto_url
      ? `<img src="${escHTML(p.foto_url)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0">`
      : `<div style="width:72px;height:72px;border-radius:10px;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">🛍️</div>`;
    const estadoBadge = p.activa
      ? `<span style="background:#DCFCE7;color:#16A34A;border-radius:99px;padding:2px 8px;font-size:11px;font-weight:700">● Activa</span>`
      : `<span style="background:var(--surface);color:var(--ink3);border-radius:99px;padding:2px 8px;font-size:11px;font-weight:600">Inactiva</span>`;
    const accionBtn = p.activa
      ? `<button onclick="toggleMiPublicacion('${p.id}',false)" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:'Inter',sans-serif">Desactivar</button>`
      : `<button onclick="toggleMiPublicacion('${p.id}',true)" style="background:var(--blue);border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;color:white;cursor:pointer;font-family:'Inter',sans-serif">Reactivar</button>`;

    // Stock: sólo tiene sentido en productos —un servicio no se agota— y
    // sólo si la publicación está activa. Va acá, de un toque, porque
    // marcar "se acabó" es algo que pasa de golpe y en el momento: mandar
    // al vendedor a la pantalla de edición para eso es demasiado camino.
    const esProducto = catPorSlug(p.categoria)?.tipo === 'producto';
    const stockBtn = (!esProducto || !p.activa) ? '' : (p.disponible === false
      ? `<button onclick="toggleStockPublicacion('${p.id}',true)" style="background:#FEF3C7;border:1.5px solid #FDE68A;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;color:#92400E;cursor:pointer;font-family:'Inter',sans-serif">Sin stock · Reponer</button>`
      : `<button onclick="toggleStockPublicacion('${p.id}',false)" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:'Inter',sans-serif">Marcar sin stock</button>`);
    return `
      <div id="mispub-${escHTML(p.id)}" style="display:flex;gap:12px;padding:12px;background:white;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        ${foto}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHTML(p.titulo)}</div>
          <div style="font-size:11px;color:var(--ink3);margin-bottom:6px">${escHTML(cat)} · ${escHTML(precio)}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${estadoBadge}
            ${accionBtn}
            ${stockBtn}
            <button onclick="editarMiPublicacion('${p.id}')" style="background:none;border:1.5px solid var(--blue);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Inter',sans-serif">Editar</button>
          </div>
        </div>
      </div>`;
  }

  async function toggleMiPublicacion(id, activar) {
    const card = document.getElementById('mispub-' + id);
    if (card) card.style.opacity = '0.5';
    const res = activar
      ? await PronetDB.reactivarPublicacion(id)
      : await PronetDB.desactivarPublicacion(id);
    if (!res.ok) {
      if (card) card.style.opacity = '';
      showToast && showToast('⚠️ No se pudo actualizar: ' + res.error);
      return;
    }
    renderMisPublicaciones();
  }
  window.toggleMiPublicacion = toggleMiPublicacion;

  async function toggleStockPublicacion(id, disponible) {
    const card = document.getElementById('mispub-' + id);
    if (card) card.style.opacity = '0.5';
    const res = await PronetDB.cambiarDisponibilidad(id, disponible);
    if (!res.ok) {
      if (card) card.style.opacity = '';
      showToast && showToast('⚠️ No se pudo actualizar: ' + (res.error || ''));
      return;
    }
    showToast && showToast(disponible ? '✅ Marcada con stock' : '📦 Marcada sin stock');
    renderMisPublicaciones();
  }
  window.toggleStockPublicacion = toggleStockPublicacion;

  // ── Consultas recibidas ProMarket (vista autor) ───────────────────────

  async function renderMisConsultasMkt() {
    const lista = document.getElementById('mis-consultas-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:32px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    const consultas = await PronetDB.listarConsultasRecibidas();
    if (!consultas.length) {
      lista.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:13px;color:var(--ink3)">Todavía no recibiste consultas.<br>Cuando alguien te escriba aparecerá acá.</div>';
      return;
    }
    lista.innerHTML = consultas.map(misConsultaCardHTML).join('');
    const subEl = document.getElementById('mp-mis-consultas-sub');
    if (subEl) subEl.textContent = consultas.length + ' consulta' + (consultas.length !== 1 ? 's' : '');
  }

  function misConsultaCardHTML(c) {
    const nombre = escHTML(c.consultante.nombre || 'Vecino');
    const ini = (c.consultante.nombre || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const pubTitulo = escHTML((c.publicaciones && c.publicaciones.titulo) || '');
    const ultimo = escHTML(c.ultimo_mensaje || '—');
    const hora = c.hora_ultimo ? new Date(c.hora_ultimo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
    const chatId = escHTML(c.id);
    const contraId = escHTML(c.consultante_id);
    mktConsultasCache.set(c.id, { nombre: c.consultante.nombre || 'Vecino', titulo: (c.publicaciones && c.publicaciones.titulo) || '' });
    return `
      <div onclick="mktAbrirHilo('${chatId}','${contraId}')"
           style="display:flex;gap:12px;align-items:center;padding:12px;background:white;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);cursor:pointer">
        <div style="width:44px;height:44px;border-radius:50%;background:#EEF2FF;color:#2B5BFF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0">${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${nombre}</div>
          ${pubTitulo ? `<div style="font-size:11px;color:var(--blue);font-weight:600;margin-bottom:2px">${pubTitulo}</div>` : ''}
          <div style="font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ultimo}</div>
        </div>
        ${hora ? `<div style="font-size:11px;color:var(--ink3);flex-shrink:0">${hora}</div>` : ''}
      </div>`;
  }

  // ── Mis consultas enviadas ProMarket (vista consultante) ─────────────

  async function renderMisConsultasEnviadas() {
    const lista = document.getElementById('mis-consultas-env-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:32px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    const consultas = await PronetDB.listarMisConsultasEnviadas().catch(() => []);
    if (!consultas.length) {
      lista.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:13px;color:var(--ink3)">Todavía no consultaste ninguna publicación.<br><span style="color:var(--blue);font-weight:600;cursor:pointer" onclick="goTo(\'s-mercado\')">Ver el feed</span></div>';
      return;
    }
    lista.innerHTML = consultas.map(misConsultaEnviadaCardHTML).join('');
  }

  function misConsultaEnviadaCardHTML(c) {
    const autorNombre = escHTML(c.autor.nombre || 'Vendedor');
    const ini = (c.autor.nombre || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const pubTitulo = escHTML((c.publicaciones && c.publicaciones.titulo) || '');
    const pubFoto = c.publicaciones && c.publicaciones.foto_url;
    const ultimo = escHTML(c.ultimo_mensaje || '—');
    const hora = c.hora_ultimo ? new Date(c.hora_ultimo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
    const chatId = escHTML(c.id);
    const contraId = escHTML(c.autor_id);
    const avatar = pubFoto
      ? `<img src="${escHTML(pubFoto)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0" alt="">`
      : `<div style="width:44px;height:44px;border-radius:10px;background:#EEF2FF;color:#2B5BFF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0">${ini}</div>`;
    mktConsultasCache.set(c.id, { nombre: c.autor.nombre || 'Vendedor', titulo: (c.publicaciones && c.publicaciones.titulo) || '' });
    return `
      <div onclick="mktAbrirHiloEnviado('${chatId}','${contraId}')"
           style="display:flex;gap:12px;align-items:center;padding:12px;background:white;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);cursor:pointer">
        ${avatar}
        <div style="flex:1;min-width:0">
          ${pubTitulo ? `<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pubTitulo}</div>` : ''}
          <div style="font-size:11px;color:var(--ink3);margin-bottom:3px">${autorNombre}</div>
          <div style="font-size:12px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ultimo}</div>
        </div>
        ${hora ? `<div style="font-size:11px;color:var(--ink3);flex-shrink:0">${hora}</div>` : ''}
      </div>`;
  }

  // ── Mis alertas de búsqueda (ProMarket) ────────────────────────────
  async function renderMisAlertas() {
    const lista = document.getElementById('mis-alertas-lista');
    if (!lista) return;
    lista.innerHTML = '<div style="padding:32px 0;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    const alertas = await PronetDB.listarMisAlertas().catch(() => []);
    if (!alertas.length) {
      lista.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:13px;color:var(--ink3)">Todavía no guardaste ninguna alerta.<br>Buscá algo en Entre Vecinos y tocá "🔔 Avisame" si no hay resultados.</div>';
      return;
    }
    lista.innerHTML = alertas.map(mktAlertaCardHTML).join('');
  }
  window.renderMisAlertas = renderMisAlertas;

  function mktAlertaCardHTML(a) {
    const termino = escHTML(a.termino);
    const fecha = a.creado ? new Date(a.creado).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
    return `
      <div style="display:flex;gap:10px;align-items:center;padding:12px 14px;background:white;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="font-size:18px">🔔</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${termino}</div>
          ${fecha ? `<div style="font-size:11px;color:var(--ink3);margin-top:1px">Desde el ${fecha}</div>` : ''}
        </div>
        <button onclick="mktBorrarAlerta('${escHTML(a.id)}')"
          style="background:none;border:none;color:var(--ink3);font-size:13px;font-weight:600;cursor:pointer;padding:6px">Eliminar</button>
      </div>`;
  }

  async function mktBorrarAlerta(id) {
    const res = await PronetDB.eliminarAlertaBusquedaPorId(id);
    if (!res.ok) { showToast('⚠️ No se pudo eliminar la alerta'); return; }
    showToast('🔕 Alerta eliminada');
    renderMisAlertas();
  }
  window.mktBorrarAlerta = mktBorrarAlerta;

  // ── Pantalla publicar en ProMarket ────────────────────────────────
  let pmFotoArchivo = null;
  let pmFotoUrlActual = null; // foto existente al editar
  let pmEditandoId = null;   // null = nueva pub, string = editar

  function pmCerrar() {
    goTo(pmEditandoId ? 's-mis-publicaciones' : 's-mercado');
    pmEditandoId = null;
    pmFotoUrlActual = null;
  }
  window.pmCerrar = pmCerrar;

  /** ¿Le queda cupo para publicar en ProMarket? Base/vecino: 3 gratis por
   *  año + créditos comprados. Plus: 10/mes. Pro: ilimitado. */
  async function puedePublicarMercado() {
    if (!usuarioActual) return { ok: false, motivo: 'sin_sesion' };
    const legacyHasta = usuarioActual.pro_marketplace_hasta ? new Date(usuarioActual.pro_marketplace_hasta) : null;
    if (usuarioActual.es_pro_marketplace && (!legacyHasta || legacyHasta > new Date())) {
      return { ok: true }; // legacy: suscriptor de la vieja ProMarket, ilimitado hasta que venza
    }
    const plan = planParaLimites(planActual);
    if (plan === 'pro') return { ok: true };
    const planes = window.PRONET_CONFIG?.PLANES || [];
    if (plan === 'plus') {
      const limite = planes.find(p => p.id === 'plus')?.mkt_publicaciones_mes ?? 10;
      const usadas = await PronetDB.contarPublicacionesMercadoMes(usuarioActual.id).catch(() => 0);
      return { ok: usadas < limite, motivo: 'limite_mes', usadas, limite };
    }
    const limite = planes.find(p => p.id === 'base')?.mkt_publicaciones_anio ?? 3;
    const usadas = await PronetDB.contarPublicacionesMercadoAnio(usuarioActual.id).catch(() => 0);
    if (usadas < limite) return { ok: true };
    if ((usuarioActual.promarket_creditos || 0) > 0) return { ok: true };
    return { ok: false, motivo: 'sin_creditos', usadas, limite };
  }

  /** Llena el selector de categoría desde el catálogo, agrupado por sección.
   *
   *  Al prestador sólo se le ofrecen las de Servicios: el mismo criterio que
   *  en el feed. Si pudiera publicar un producto tendría en Entre Vecinos una
   *  sección que después no ve. */
  // Sección elegida en el formulario de publicar. El prestador sólo publica
  // servicios, así que para él no cambia nunca.
  let pmTipo = 'servicio';

  /** Deja las pestañas mostrando la sección activa. Se llama siempre desde
   *  pmPintarCategorias para que el botón marcado y la lista de categorías
   *  no puedan quedar desfasados. */
  function pmSincronizarTabs() {
    document.querySelectorAll('#pm-tipo .mkt-sec').forEach((b, i) => {
      const suyo = i === 0 ? 'servicio' : 'producto';
      b.classList.toggle('on', suyo === pmTipo);
      b.setAttribute('aria-selected', suyo === pmTipo ? 'true' : 'false');
    });
  }

  function pmSetTipo(tipo) {
    if (tipo === pmTipo) return;
    pmTipo = tipo;
    // La categoría elegida era de la otra sección: dejarla puesta guardaría
    // la publicación en el lado que no es.
    const sel = document.getElementById('pm-categoria');
    if (sel) sel.value = '';
    pmPintarCategorias();
  }
  window.pmSetTipo = pmSetTipo;

  /** Llena el selector con las categorías de la sección activa.
   *
   *  Antes traía las 16 juntas en dos optgroups: elegir dónde se publica
   *  quedaba escondido dentro de una lista larga, y era fácil terminar
   *  publicando un producto entre los servicios sin darse cuenta. */
  async function pmPintarCategorias() {
    if (!mktCatsCargadas) { await cargarMktCategorias(); mktCatsCargadas = true; }
    const sel = document.getElementById('pm-categoria');
    if (!sel) return;
    const anterior = sel.value;

    // El prestador no elige: para él Entre Vecinos es sólo Servicios.
    const wrap = document.getElementById('pm-tipo-wrap');
    if (esPrestador()) { pmTipo = 'servicio'; if (wrap) wrap.style.display = 'none'; }
    else if (wrap) wrap.style.display = '';

    pmSincronizarTabs();
    sel.innerHTML = '<option value="">Seleccioná una categoría…</option>' +
      catsDeTipo(pmTipo).map(c =>
        '<option value="' + escHTML(c.slug) + '">' +
        escHTML(c.emoji + ' ' + c.nombre) + '</option>').join('');

    // Al editar, la categoría ya elegida tiene que seguir seleccionada.
    if (anterior && sel.querySelector('option[value="' + anterior + '"]')) sel.value = anterior;
  }

  /** Zona → Barrio, encadenados y sacados del catálogo `zonas`.
   *
   *  Antes era un único desplegable con zonas y barrios mezclados, y por eso
   *  en la base convivían publicaciones que decían "Escobar" con otras que
   *  decían "Nordelta": no se podía saber cuál era cuál ni filtrar bien. */
  async function pmPintarZonas(zonaSel, barrioSel) {
    const zonas = await PronetDB.listarZonasArbol().catch(() => []);
    const selZ = document.getElementById('pm-zona');
    const selB = document.getElementById('pm-barrio');
    if (!selZ || !selB) return;

    // Nivel 1 y no "los valores distintos de madre": con tres niveles,
    // Puertos del Lago es madre de sus barrios y aparecería como zona.
    const zonasRaiz = zonas.filter(z => z.nivel === 1);
    selZ.innerHTML = '<option value="">Seleccioná tu zona…</option>' +
      zonasRaiz.map(z => '<option value="' + escHTML(z.nombre) + '">' + escHTML(z.nombre) + '</option>').join('');
    if (zonaSel && zonasRaiz.some(z => z.nombre === zonaSel)) selZ.value = zonaSel;

    pmZonasCache = zonas;
    pmPintarBarrios(zonas, selZ.value, barrioSel);
  }

  let pmZonasCache = [];

  /** Los lugares de una zona, agrupados por comunidad.
   *
   *  Una lista plana con las 9 comunidades y los 13 barrios de Puertos
   *  mezclados serían 22 opciones sin jerarquía, donde "Araucarias" no dice
   *  nada por sí sola. Agrupadas, el vecino ve "Puertos del Lago" como
   *  encabezado y sus barrios adentro.
   *
   *  Las comunidades sin barrios (Nordelta, CUBE…) van como opción suelta:
   *  ahí la comunidad ES el lugar. */
  function pmPintarBarrios(zonas, zona, barrioSel) {
    const selB = document.getElementById('pm-barrio');
    if (!selB) return;
    if (!zona) {
      selB.innerHTML = '<option value="">Elegí primero la zona…</option>';
      return;
    }
    const deLaZona = zonas.filter(z => z.zona === zona);
    const comunidades = deLaZona.filter(z => z.nivel === 2);

    const opcion = (n) => '<option value="' + escHTML(n) + '">' + escHTML(n) + '</option>';
    const html = comunidades.map(c => {
      const barrios = deLaZona.filter(z => z.nivel === 3 && z.comunidad === c.nombre);
      if (!barrios.length) return opcion(c.nombre);
      // La comunidad también se ofrece: alguien puede estar en Puertos sin
      // querer decir en qué barrio.
      return '<optgroup label="' + escHTML(c.nombre) + '">' +
             opcion(c.nombre) + barrios.map(b => opcion(b.nombre)).join('') +
             '</optgroup>';
    }).join('');

    selB.innerHTML = '<option value="">Seleccioná tu barrio…</option>' + html;
    if (barrioSel && selB.querySelector('option[value="' + barrioSel.replace(/"/g, '\\"') + '"]')) {
      selB.value = barrioSel;
    }
  }

  function pmCambioZona() {
    pmPintarBarrios(pmZonasCache, document.getElementById('pm-zona')?.value, null);
  }
  window.pmCambioZona = pmCambioZona;

  async function abrirPublicarMercado() {
    if (!usuarioActual) {
      mostrarGate && mostrarGate({ titulo: 'Publicar en Entre Vecinos', sub: 'Necesitás una cuenta para publicar.' });
      return;
    }
    const cupo = await puedePublicarMercado();
    if (!cupo.ok) {
      if (cupo.motivo === 'limite_mes') {
        showToast && showToast(`⚠️ Ya usaste tus ${cupo.limite} publicaciones de este mes con tu plan Plus. Se renueva el mes que viene.`);
      } else {
        abrirModalComprarPublicacion();
      }
      return;
    }
    pmEditandoId = null;
    pmFotoUrlActual = null;
    pmTipo = 'servicio';   // toda publicación nueva arranca en Servicios
    await pmPintarCategorias();
    // Limpiar el form antes de abrir
    pmFotoArchivo = null;
    const prev = document.getElementById('pm-foto-preview');
    if (prev) {
      prev.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <div style="font-size:13px;font-weight:600;color:var(--blue)">Tocá para agregar foto</div>
        <div style="font-size:11px;color:var(--ink3)">Formato 4:5 · máx 5 MB</div>`;
    }
    const inp = document.getElementById('pm-foto-input');
    if (inp) inp.value = '';
    ['pm-titulo','pm-desc','pm-precio'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const convenirChk = document.getElementById('pm-precio-convenir');
    if (convenirChk) { convenirChk.checked = false; pmTogglePrecioConvenir(convenirChk); }
    pmResetDetalles();
    // La zona activa del usuario suele ser su barrio, así que se propone
    // como barrio y su madre como zona — el caso normal queda precargado.
    const suZona = zonaActual || '';
    const suMadre = (await PronetDB.listarZonas().catch(() => []))
      .find(z => z.nombre === suZona)?.madre || '';
    await pmPintarZonas(suMadre, suZona);
    const loteEl = document.getElementById('pm-lote'); if (loteEl) loteEl.value = '';
    const mlEl = document.getElementById('pm-mostrar-lote'); if (mlEl) mlEl.checked = false;
    const catSel = document.getElementById('pm-categoria');
    if (catSel) catSel.value = '';
    const tit = document.getElementById('pm-screen-titulo'); if (tit) tit.textContent = 'Nueva publicación';
    const btn = document.getElementById('pm-submit-btn'); if (btn) btn.textContent = 'Publicar';
    goTo('s-pub-mercado');
  }
  window.abrirPublicarMercado = abrirPublicarMercado;

  function pmTogglePrecioConvenir(chk) {
    const precioEl = document.getElementById('pm-precio');
    if (!precioEl) return;
    precioEl.disabled = chk.checked;
    if (chk.checked) precioEl.value = '';
  }
  window.pmTogglePrecioConvenir = pmTogglePrecioConvenir;

  // ── Detalles adicionales del formulario de publicar: líneas libres, máx 5 ──
  const PM_DETALLES_MAX = 5;

  function pmDetallesLineaHTML(valor) {
    return `<div class="pm-detalle-row" style="display:flex;gap:8px;margin-bottom:8px">
      <input class="ob-input" type="text" maxlength="80" placeholder="Ej: Sabores: chocolate, vainilla" value="${escHTML(valor || '')}" style="flex:1">
      <button type="button" onclick="this.closest('.pm-detalle-row').remove(); pmActualizarBotonDetalle()"
        style="background:none;border:1.5px solid var(--border);border-radius:10px;width:40px;flex-shrink:0;color:var(--ink3);font-size:16px;cursor:pointer">×</button>
    </div>`;
  }

  function pmActualizarBotonDetalle() {
    const lista = document.getElementById('pm-detalles-lista');
    const addRow = document.getElementById('pm-detalles-add-row');
    if (!lista || !addRow) return;
    const cantidad = lista.querySelectorAll('.pm-detalle-row').length;
    addRow.style.display = cantidad >= PM_DETALLES_MAX ? 'none' : '';
  }

  function pmAgregarLineaDetalle(valor) {
    const lista = document.getElementById('pm-detalles-lista');
    if (!lista) return;
    if (lista.querySelectorAll('.pm-detalle-row').length >= PM_DETALLES_MAX) return;
    lista.insertAdjacentHTML('beforeend', pmDetallesLineaHTML(valor));
    pmActualizarBotonDetalle();
  }
  window.pmAgregarLineaDetalle = pmAgregarLineaDetalle;
  window.pmActualizarBotonDetalle = pmActualizarBotonDetalle;

  function pmResetDetalles(valores) {
    const lista = document.getElementById('pm-detalles-lista');
    if (!lista) return;
    lista.innerHTML = '';
    (valores && valores.length ? valores : []).forEach(v => pmAgregarLineaDetalle(v));
    pmActualizarBotonDetalle();
  }

  function pmLeerDetalles() {
    const lista = document.getElementById('pm-detalles-lista');
    if (!lista) return [];
    return [...lista.querySelectorAll('.pm-detalle-row input')]
      .map(inp => inp.value.trim())
      .filter(Boolean)
      .slice(0, PM_DETALLES_MAX);
  }

  async function editarMiPublicacion(id) {
    const pub = mktMisPubs.find(p => p.id === id);
    if (!pub) return;
    pmEditandoId = id;
    pmFotoUrlActual = pub.foto_url || null;
    pmFotoArchivo = null;
    // Precargar form
    const inp = document.getElementById('pm-foto-input');
    if (inp) inp.value = '';
    const prev = document.getElementById('pm-foto-preview');
    if (prev) {
      if (pub.foto_url) {
        prev.innerHTML = `<img src="${escHTML(pub.foto_url)}" style="width:100%;height:100%;object-fit:cover">`;
      } else {
        prev.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <div style="font-size:13px;font-weight:600;color:var(--blue)">Tocá para cambiar foto</div>
          <div style="font-size:11px;color:var(--ink3)">Formato 4:5 · máx 5 MB</div>`;
      }
    }
    ['pm-titulo','pm-desc','pm-precio'].forEach(fid => {
      const el = document.getElementById(fid);
      if (!el) return;
      if (fid === 'pm-titulo') el.value = pub.titulo || '';
      else if (fid === 'pm-desc') el.value = pub.descripcion || '';
      else if (fid === 'pm-precio') el.value = pub.precio != null ? pub.precio : '';
    });
    const convenirChk = document.getElementById('pm-precio-convenir');
    if (convenirChk) {
      convenirChk.checked = !!pub.precio_convenir;
      pmTogglePrecioConvenir(convenirChk);
    }
    pmResetDetalles(pub.detalles);
    // Los barrios dependen de la zona, así que se pintan juntos: asignar el
    // barrio antes de que su lista exista lo dejaría vacío.
    await pmPintarZonas(pub.zona || '', pub.barrio || '');
    const loteEl = document.getElementById('pm-lote'); if (loteEl) loteEl.value = pub.lote || '';
    const mlEl = document.getElementById('pm-mostrar-lote'); if (mlEl) mlEl.checked = !!pub.mostrar_lote;
    // La sección sale de la categoría guardada: si la publicación es de
    // Mercado, el formulario tiene que abrir en Mercado. Va ANTES de pintar,
    // porque pmPintarCategorias sólo lista las de la sección activa y si no
    // la opción guardada no existiría y el campo quedaría vacío.
    pmTipo = catPorSlug(pub.categoria)?.tipo || 'servicio';
    await pmPintarCategorias();
    const catSelEdit = document.getElementById('pm-categoria');
    if (catSelEdit) catSelEdit.value = pub.categoria || '';
    const tit = document.getElementById('pm-screen-titulo'); if (tit) tit.textContent = 'Editar publicación';
    const btn = document.getElementById('pm-submit-btn'); if (btn) btn.textContent = 'Guardar';
    goTo('s-pub-mercado');
  }
  window.editarMiPublicacion = editarMiPublicacion;

  function abrirModalComprarPublicacion() {
    const m = document.getElementById('modal-promarket-sub');
    if (m) { m.style.display = 'flex'; }
  }
  function cerrarModalProMarketSub() {
    const m = document.getElementById('modal-promarket-sub');
    if (m) m.style.display = 'none';
  }
  window.cerrarModalProMarketSub = cerrarModalProMarketSub;

  async function comprarPublicacionExtra() {
    const btn = document.getElementById('btn-contratar-promarket');
    if (btn) { btn.disabled = true; btn.textContent = 'Redirigiendo a MercadoPago…'; }
    // Marca qué se está comprando para que el retorno de MP sepa qué activar
    // (ver capturarRetornoMP / restaurarSesion) — es un pago único, no una
    // suscripción, así que no encaja en el flujo viejo de es_pro_marketplace.
    localStorage.setItem('pronet_compra_credito_pendiente', '1');
    const res = await PronetDB.crearPreferenciaMP('promarket_credito', 'mes');
    if (!res.ok) {
      localStorage.removeItem('pronet_compra_credito_pendiente');
      if (btn) { btn.disabled = false; btn.textContent = 'Comprar — pago seguro 🔒'; }
      showToast && showToast('⚠️ No se pudo iniciar el pago. ' + (res.error || ''));
      return;
    }
    window.location.href = res.init_point;
  }
  window.comprarPublicacionExtra = comprarPublicacionExtra;

  // ── Reportar publicación ─────────────────────────────────────────────
  let reportarPubId = null;
  let reportarAutorId = null;

  function abrirReportarPub(pubId, autorId) {
    if (!usuarioActual) { mostrarGate && mostrarGate({ titulo: 'Reportar', sub: 'Necesitás una cuenta para reportar.' }); return; }
    reportarPubId = pubId;
    reportarAutorId = autorId;
    const tit = document.getElementById('reportar-pub-titulo');
    if (tit) tit.textContent = mktPostsCache.get(pubId)?.titulo || 'Publicación';
    // Reset form
    document.querySelectorAll('#modal-reportar-pub .rep-opt').forEach(o => o.classList.remove('on'));
    const det = document.getElementById('rep-detalle');
    if (det) det.value = '';
    const m = document.getElementById('modal-reportar-pub');
    if (m) m.style.display = 'flex';
  }
  window.abrirReportarPub = abrirReportarPub;

  function cerrarReportarPub() {
    const m = document.getElementById('modal-reportar-pub');
    if (m) m.style.display = 'none';
    reportarPubId = null; reportarAutorId = null;
  }
  window.cerrarReportarPub = cerrarReportarPub;

  function selRepOpt(el) {
    document.querySelectorAll('#modal-reportar-pub .rep-opt').forEach(o => o.classList.remove('on'));
    el.classList.add('on');
  }
  window.selRepOpt = selRepOpt;

  async function enviarReportePub() {
    const motivoEl = document.querySelector('#modal-reportar-pub .rep-opt.on');
    if (!motivoEl) { showToast && showToast('⚠️ Elegí el motivo del reporte'); return; }
    const motivo = motivoEl.dataset.motivo;
    const detalle = (document.getElementById('rep-detalle')?.value || '').trim() || null;
    const btn = document.getElementById('btn-enviar-reporte');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      await PronetDB.crear('denuncias', {
        denunciante_id: usuarioActual.id,
        denunciado_id: reportarAutorId || null,
        publicacion_id: reportarPubId,
        tipo: 'publicacion',
        motivo,
        detalle,
        estado: 'pendiente',
      });
      cerrarReportarPub();
      showToast && showToast('✅ Reporte enviado. Lo revisaremos en 72 hs.');
    } catch(e) {
      showToast && showToast('⚠️ No se pudo enviar el reporte.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
    }
  }
  window.enviarReportePub = enviarReportePub;

  function pmSelCat(chip) {
    document.querySelectorAll('#pm-cat-row .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
  }
  window.pmSelCat = pmSelCat;

  function pmPrevisualizarFoto(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast && showToast('⚠️ La foto no puede superar 5 MB');
      input.value = '';
      return;
    }
    pmFotoArchivo = file;
    const reader = new FileReader();
    reader.onload = e => {
      const prev = document.getElementById('pm-foto-preview');
      if (prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;display:block">`;
    };
    reader.readAsDataURL(file);
  }
  window.pmPrevisualizarFoto = pmPrevisualizarFoto;

  async function pmPublicar() {
    const btn    = document.getElementById('pm-submit-btn');
    const titulo = document.getElementById('pm-titulo')?.value.trim();
    const desc   = document.getElementById('pm-desc')?.value.trim();
    const precio = document.getElementById('pm-precio')?.value;
    const precioConvenir = !!document.getElementById('pm-precio-convenir')?.checked;
    const detalles = pmLeerDetalles();
    const zona   = document.getElementById('pm-zona')?.value;
    const barrio = document.getElementById('pm-barrio')?.value;
    const lote   = (document.getElementById('pm-lote')?.value || '').trim();
    const mostrarLote = !!document.getElementById('pm-mostrar-lote')?.checked && !!lote;
    const categoria = document.getElementById('pm-categoria')?.value;
    const editando = !!pmEditandoId;

    if (!titulo)    { showToast && showToast('⚠️ Escribí un título para tu publicación'); return; }
    if (!zona)      { showToast && showToast('⚠️ Seleccioná tu zona para publicar'); return; }
    if (!barrio)    { showToast && showToast('⚠️ Elegí tu barrio: es lo que le dice al comprador si le queda cerca'); return; }
    if (!categoria) { showToast && showToast('⚠️ Seleccioná una categoría'); return; }

    btn.disabled = true;
    btn.textContent = editando ? 'Guardando...' : 'Publicando...';

    let foto_url = editando ? pmFotoUrlActual : null;
    if (pmFotoArchivo) {
      const res = await PronetDB.subirFotoMercado(pmFotoArchivo, usuarioActual.id);
      if (!res.ok) {
        showToast && showToast('⚠️ No se pudo subir la foto: ' + res.error);
        btn.disabled = false;
        btn.textContent = editando ? 'Guardar' : 'Publicar';
        return;
      }
      foto_url = res.url;
    }

    let res;
    if (editando) {
      res = await PronetDB.editarPublicacion(pmEditandoId, { categoria, titulo, descripcion: desc || null,
                                                              precio: precio ? Number(precio) : null, precio_convenir: precioConvenir, detalles, foto_url, zona, barrio, lote: lote || null, mostrar_lote: mostrarLote });
    } else {
      res = await PronetDB.crearPublicacion({ categoria, titulo, descripcion: desc || null,
                                             precio: precio ? Number(precio) : null, precio_convenir: precioConvenir, detalles, foto_url, zona, barrio, lote: lote || null, mostrar_lote: mostrarLote });
    }

    btn.disabled = false;
    btn.textContent = editando ? 'Guardar' : 'Publicar';

    if (!res.ok) {
      // Red de seguridad: si el chequeo de cupo del cliente quedó desactualizado
      // (otra pestaña, otra publicación mientras tanto), el trigger del servidor
      // rechaza igual — acá se traduce a algo accionable en vez del error crudo.
      if (res.error?.includes('sin_creditos_publicacion')) {
        showToast && showToast('⚠️ Ya usaste tus publicaciones gratis de este año.');
        abrirModalComprarPublicacion();
        return;
      }
      if (res.error?.includes('limite_publicaciones_mes')) {
        const m = res.error.match(/permite (\d+)/);
        const lim = m ? m[1] : (window.PRONET_CONFIG?.PLANES?.find(p => p.id === 'plus')?.mkt_publicaciones_mes ?? 10);
        showToast && showToast(`⚠️ Ya usaste tus ${lim} publicaciones de este mes con tu plan Plus.`);
        return;
      }
      showToast && showToast('⚠️ No se pudo ' + (editando ? 'guardar' : 'publicar') + ': ' + res.error);
      return;
    }
    showToast && showToast(editando ? '✅ ¡Publicación actualizada!' : '✅ ¡Publicación creada!');
    const destino = editando ? 's-mis-publicaciones' : 's-mercado';
    pmEditandoId = null;
    pmFotoUrlActual = null;
    goTo(destino);
  }
  window.pmPublicar = pmPublicar;

  function getLabelFiltro(f) {
    const labels = { todos:'ordenados por ranking zonal', premium:'solo Premium', top:'calificación +4.5', cercano:'menos de 5 km', urgencias:'con urgencias 24h', economico:'menor precio primero' };
    return labels[f] || 'ranking zonal';
  }

  function resetSearch() {
    filtroActivo = 'todos';
    document.querySelectorAll('.filter-row .chip').forEach((c,i) => c.classList.toggle('on', i===0));
    renderBusqueda('', 'todos');
  }

  // ── Editar perfil ────────────────────────────────────────────────────
  function guardarPerfil() { guardarPerfilReal(); }

  // ══ Notificaciones push: toggle en Mi perfil ═══════════════════════
  async function refrescarMenuPush() {
    const item = document.getElementById('menu-push');
    if (!item) return;
    if (!usuarioActual || !PronetDB.puedePush()) { item.style.display = 'none'; return; }
    item.style.display = '';
    const estado = await PronetDB.estadoPush();
    const sub = document.getElementById('menu-push-sub');
    const chev = document.getElementById('menu-push-estado');
    const TXT = {
      'activas':    ['Activadas en este dispositivo · tocá para apagar', '🟢'],
      'inactivas':  ['Enterate al instante de propuestas y pedidos', '›'],
      'bloqueadas': ['Bloqueadas: habilitalas en Ajustes del navegador', '🚫'],
    };
    const [t, c] = TXT[estado] || TXT['inactivas'];
    if (sub) sub.textContent = t;
    if (chev) chev.textContent = c;
  }

  async function togglePushNotif() {
    const estado = await PronetDB.estadoPush();
    if (estado === 'bloqueadas') {
      alert('Las notificaciones están bloqueadas para PRONET.\n\nHabilitalas desde Ajustes → Safari/Chrome → Notificaciones y volvé a intentar.');
      return;
    }
    if (estado === 'activas') {
      await PronetDB.desactivarPush();
      showToast && showToast('🔕 Notificaciones desactivadas en este dispositivo');
    } else {
      const r = await PronetDB.activarPush();
      if (r.ok) showToast && showToast('🔔 ¡Listo! Vas a recibir notificaciones acá');
      else if (r.error === 'Permiso denegado') showToast && showToast('Permiso denegado — podés activarlas cuando quieras');
      else alert('No se pudo activar: ' + (r.error || 'error desconocido'));
    }
    refrescarMenuPush();
  }

  // ══ Perfil de prestador: edición real ═══════════════════════════════
  // Subrubros disponibles por rubro (mismo catálogo que el wizard)
  /** Alterna un rubro y refresca las especialidades del principal.
   *  El PRIMERO marcado es el principal (lo sincroniza el trigger
   *  trg_sync_rubro_principal en la base), así que al cambiarlo hay que
   *  volver a ofrecer las especialidades correspondientes. */
  function toggleRubroEdit(el) {
    el.classList.toggle('on');
    const err = document.getElementById('edit-rubros-error');
    if (err) err.style.display = 'none';
    const marcados = Array.from(document.querySelectorAll('#edit-rubros .sub-opt.on'))
      .map(e => e.dataset.rubro);
    const wrap = document.getElementById('edit-especialidades');
    if (!wrap) return;
    const principal = marcados[0];
    const opciones = ESPECIALIDADES_POR_RUBRO[principal] || [];
    // Se conservan las ya marcadas que sigan existiendo en el rubro nuevo.
    const activas = Array.from(wrap.querySelectorAll('.sub-opt.on')).map(e => e.dataset.esp);
    wrap.innerHTML = opciones.map(s =>
      '<div class="sub-opt' + (activas.includes(s) ? ' on' : '') + '" data-esp="' + escHTML(s) + '"' +
      ' onclick="this.classList.toggle(\'on\')">' + escHTML(s) + '</div>'
    ).join('') || '<div style="font-size:12px;color:var(--ink3)">Elegí un rubro para ver sus especialidades.</div>';
    if (typeof habilitarAccesibilidadTeclado === 'function') habilitarAccesibilidadTeclado(wrap);
  }
  window.toggleRubroEdit = toggleRubroEdit;

  const ESPECIALIDADES_POR_RUBRO = {
    'Limpieza':      ['Limpieza','Planchado','Post-obra','Vidrios'],
    'Electricistas': ['Instalaciones','Reparaciones','Tableros','Urgencias 24h','Certificación ENRE','Eficiencia energética'],
    'Jardinería':    ['Poda','Mantenimiento','Diseño','Riego'],
    'Mascotas':      ['Paseador','Cuidador','Peluquería canina'],
    'Cuidado':       ['Niñera','Adultos mayores','Acompañante'],
    'Plomería':      ['Destapaciones','Instalaciones','Termotanques','Urgencias 24h'],
    'Pintura':       ['Interior','Exterior','Impermeabilización','Trabajos en altura'],
    'Chef':          ['Chef a domicilio','Catering','Eventos'],
  };
  let fotoPerfilNueva = null; // URL subida pendiente de guardar

  // ══ VERIFICACIÓN DE IDENTIDAD ════════════════════════════════════════
  //
  // Etapa 1: datos declarados (nombre completo, DNI, dirección). Sin foto
  // del documento — se descartó a propósito el 2026-08-09 por fricción y
  // por las obligaciones de custodia que traen las imágenes de documentos.
  //
  // Un DNI que escribe el propio prestador no prueba identidad. Lo que
  // aporta es que el índice único impide abrir cinco fichas con el mismo
  // documento, y que ante una denuncia hay a quién identificar. Por eso el
  // sello lo enciende el ADMIN, no el formulario.

  const ESTADO_VERIF = {
    pendiente:  { txt: 'En revisión', bg: '#FEF3C7', color: '#92400E' },
    verificado: { txt: '✓ Verificado', bg: 'var(--green-s)', color: 'var(--green)' },
    rechazado:  { txt: 'Rechazado',   bg: '#FFF1F2', color: '#BE123C' },
  };

  async function pintarVerificacion() {
    const sol = await PronetDB.obtenerVerificacion().catch(() => null);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
    set('edit-verif-nombre', sol?.nombre_completo);
    set('edit-verif-dni',    sol?.dni);
    set('edit-verif-dir',    sol?.direccion);

    const chip   = document.getElementById('edit-verif-estado');
    const btn    = document.getElementById('edit-verif-btn');
    const motivo = document.getElementById('edit-verif-motivo');
    const ayuda  = document.getElementById('edit-verif-ayuda');
    if (motivo) motivo.style.display = 'none';

    const est = ESTADO_VERIF[sol?.estado];
    if (chip) {
      chip.textContent = est ? est.txt : '';
      chip.style.display = est ? '' : 'none';
      if (est) { chip.style.background = est.bg; chip.style.color = est.color; }
    }

    // Ya resuelta: los campos quedan de sólo lectura. La policy de la base
    // tampoco deja editarlos, así que un input habilitado sólo prometería
    // algo que el servidor va a rechazar.
    const resuelta = sol && sol.estado !== 'pendiente';
    ['edit-verif-nombre','edit-verif-dni','edit-verif-dir'].forEach(id => {
      const e = document.getElementById(id); if (e) e.readOnly = !!resuelta;
    });
    if (btn) {
      btn.style.display = resuelta ? 'none' : '';
      btn.textContent = sol ? 'Actualizar datos' : 'Enviar para verificar';
    }
    if (sol?.estado === 'rechazado' && motivo) {
      motivo.textContent = sol.motivo_rechazo
        ? 'Rechazado: ' + sol.motivo_rechazo
        : 'Los datos no pudieron validarse. Escribinos a soporte.';
      motivo.style.display = 'block';
    }
    if (ayuda && sol?.estado === 'verificado') {
      ayuda.textContent = 'Tu identidad está verificada. Los vecinos ven el sello en tu perfil.';
    }
  }

  async function guardarVerificacionUI() {
    const err = document.getElementById('edit-verif-error');
    const fallar = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };
    if (err) err.style.display = 'none';

    const nombre = (document.getElementById('edit-verif-nombre')?.value || '').trim();
    const dni    = (document.getElementById('edit-verif-dni')?.value || '').replace(/\D/g, '');
    const dir    = (document.getElementById('edit-verif-dir')?.value || '').trim();

    if (nombre.split(/\s+/).filter(Boolean).length < 2) return fallar('Escribí nombre y apellido, como figuran en el DNI.');
    // 7 a 8 dígitos cubre los DNI argentinos vigentes; el rango evita el
    // typo de tipear el CUIT (11 dígitos) en este campo.
    if (dni.length < 7 || dni.length > 8) return fallar('El DNI tiene que tener 7 u 8 dígitos, sin puntos.');
    if (dir.length < 6) return fallar('Completá tu dirección.');

    const btn = document.getElementById('edit-verif-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

    const r = await PronetDB.guardarVerificacion(usuarioActual.prestador_id, {
      nombre_completo: nombre, direccion: dir, dni,
    });
    if (btn) btn.disabled = false;

    if (!r.ok) { await pintarVerificacion(); return fallar(r.error); }
    showToast && showToast('✅ Datos enviados. Te avisamos cuando estén revisados.');
    await pintarVerificacion();
  }
  window.guardarVerificacionUI = guardarVerificacionUI;

  async function cargarEdicionPrestador() {
    const esPrestador = usuarioActual && usuarioActual.prestador_id;
    // Las secciones de prestador se ocultan para clientes
    ['edit-desc-field','edit-esp-field','edit-pagos-field','edit-verif-field'].forEach(fid => {
      const f = document.getElementById(fid); if (f) f.style.display = esPrestador ? '' : 'none';
    });
    if (esPrestador) pintarVerificacion();
    fotoPerfilNueva = null;
    const av = document.getElementById('edit-avatar');
    if (av) {
      const ini = (usuarioActual.nombre||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      av.style.backgroundImage = ''; av.childNodes[0].textContent = ini;
    }
    if (!esPrestador) return;
    try {
      const p = await PronetDB.obtener('prestadores', usuarioActual.prestador_id);
      if (!p) return;
      const desc = document.getElementById('edit-desc');
      if (desc) desc.value = p.descripcion || '';
      // Foto actual
      if (p.foto_url && av) { av.style.backgroundImage = 'url("'+p.foto_url+'")'; av.childNodes[0].textContent = ''; }
      // Rubros: multiselección. El array manda; si está vacío (los que
      // quedaron en 'General' por defecto) se cae al rubro suelto, salvo
      // que ése también sea 'General' — ahí no se marca nada y el
      // prestador tiene que elegir.
      const wrapR = document.getElementById('edit-rubros');
      if (wrapR) {
        const guardados = (p.rubros && p.rubros.length)
          ? p.rubros
          : (p.rubro && !/^general$/i.test(p.rubro) ? [p.rubro] : []);
        wrapR.innerHTML = Object.keys(ESPECIALIDADES_POR_RUBRO).map(r =>
          '<div class="sub-opt' + (guardados.includes(r) ? ' on' : '') + '" data-rubro="' + escHTML(r) + '"' +
          ' onclick="toggleRubroEdit(this)">' + escHTML(r) + '</div>'
        ).join('');
        if (typeof habilitarAccesibilidadTeclado === 'function') habilitarAccesibilidadTeclado(wrapR);
      }

      // Especialidades del rubro, marcando las guardadas
      const wrap = document.getElementById('edit-especialidades');
      if (wrap) {
        const opciones = ESPECIALIDADES_POR_RUBRO[p.rubro] || [];
        const activas = p.especialidades || [];
        wrap.innerHTML = opciones.map(s =>
          '<div class="sub-opt'+(activas.includes(s)?' on':'')+'" data-esp="'+escHTML(s)+'" onclick="this.classList.toggle(\'on\')">'+escHTML(s)+'</div>'
        ).join('') || '<div style="font-size:12px;color:var(--ink3)">Sin especialidades para este rubro todavía.</div>';
        if (typeof habilitarAccesibilidadTeclado === 'function') habilitarAccesibilidadTeclado(wrap);
      }
      // Medios de pago guardados
      const pagos = p.medios_pago || ['Efectivo'];
      document.querySelectorAll('#edit-pagos .pago-opt').forEach(el => {
        el.classList.toggle('on', pagos.includes(el.dataset.pago));
      });
    } catch(e) { console.warn('cargarEdicionPrestador', e); }
  }

  // Cambio de foto: redimensiona a 512px máx y sube a Supabase Storage
  async function cambiarFotoPerfil(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const lbl = document.getElementById('edit-foto-lbl');
    if (lbl) lbl.textContent = '⏳ Subiendo foto...';
    try {
      const blob = await redimensionarImagen(file, 512);
      const res = await PronetDB.subirFotoPerfil(blob);
      if (!res.ok) { if (lbl) lbl.textContent = '⚠️ ' + (res.error || 'No se pudo subir'); return; }
      fotoPerfilNueva = res.url;
      const av = document.getElementById('edit-avatar');
      if (av) { av.style.backgroundImage = 'url("'+res.url+'")'; av.childNodes[0].textContent = ''; }
      if (lbl) lbl.textContent = '✓ Foto lista — tocá Guardar para confirmar';
    } catch(e) {
      if (lbl) lbl.textContent = '⚠️ Error al procesar la imagen';
    } finally { input.value = ''; }
  }

  // Redimensiona una imagen del input a JPEG de lado máximo dado
  function redimensionarImagen(file, maxLado) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falló')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
      img.src = url;
    });
  }

  async function guardarPerfilReal() {
    if (!usuarioActual) return;
    const btn = document.querySelector('#s-edit-perfil .edit-save');
    if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const nombre = (val('edit-nombre') + ' ' + val('edit-apellido')).trim();
    const telefono = val('edit-tel');
    let ok = true;
    try {
      // 1. Perfil del usuario (nombre + teléfono)
      const perfilCambios = { nombre, telefono };
      if (fotoPerfilNueva) perfilCambios.foto_url = fotoPerfilNueva;
      const perfilGuardado = await PronetDB.actualizarMiPerfilBasico(perfilCambios);
      // Un teléfono ya usado por otra cuenta es el único error de acá que el
      // usuario puede resolver, así que se corta con un mensaje concreto en
      // vez de dejarlo dentro del "no se pudo guardar" genérico.
      if (perfilGuardado.codigo === 'telefono_duplicado') {
        showToast && showToast('⚠️ Ese teléfono ya está registrado en otra cuenta');
        document.getElementById('edit-tel')?.focus();
        if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
        return;
      }
      if (perfilGuardado.ok) { usuarioActual.nombre = nombre; usuarioActual.telefono = telefono; if (fotoPerfilNueva) usuarioActual.foto_url = fotoPerfilNueva; }
      // 2. Fila del prestador (si lo es)
      if (usuarioActual.prestador_id) {
        const especialidades = Array.from(document.querySelectorAll('#edit-especialidades .sub-opt.on')).map(e => e.dataset.esp);
        const medios_pago = Array.from(document.querySelectorAll('#edit-pagos .pago-opt.on')).map(e => e.dataset.pago);
        const rubros = Array.from(document.querySelectorAll('#edit-rubros .sub-opt.on')).map(e => e.dataset.rubro);
        // Sin rubro el prestador queda invisible: no entra en el push de
        // notificar_rubro ni aparece cuando el vecino filtra. Por eso se
        // exige al menos uno, en vez de dejarlo caer en 'General'.
        if (rubros.length === 0) {
          const err = document.getElementById('edit-rubros-error');
          if (err) err.style.display = 'block';
          document.getElementById('edit-rubros')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
          return;
        }
        const iniciales = nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const cambios = {
          nombre, iniciales,
          descripcion: val('edit-desc'),
          especialidades,
          rubros,   // el trigger de la base sincroniza `rubro` = rubros[1]
          medios_pago: medios_pago.length ? medios_pago : ['Efectivo'],
          subrubro: especialidades[0] || null,
        };
        if (fotoPerfilNueva) cambios.foto_url = fotoPerfilNueva;
        // Geocodificar zona para actualizar coordenadas en el mapa
        if (PRONET_CONFIG.MAPS_KEY && usuarioActual.zona) {
          const coords = await geocodificarDireccion(usuarioActual.zona);
          if (coords) { cambios.lat = coords.lat; cambios.lng = coords.lng; }
        }
        const r = await PronetDB.actualizar('prestadores', usuarioActual.prestador_id, cambios);
        ok = !!r;
      }
    } catch(e) { ok = false; }
    if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
    const saved = document.getElementById('edit-saved');
    if (saved) {
      saved.querySelector('div').textContent = ok ? '✓ Perfil actualizado correctamente' : '⚠️ No se pudo guardar. Probá de nuevo.';
      saved.style.borderColor = ok ? 'var(--green)' : '#BE123C';
      saved.style.display = 'block';
      if (ok) setTimeout(() => { saved.style.display = 'none'; reflejarUsuario && reflejarUsuario(); goTo('s-miperfil'); }, 1400);
      else setTimeout(() => { saved.style.display = 'none'; }, 3000);
    }
  }

  // ── Login ────────────────────────────────────────────────────────────
  // ── Tipo de usuario activo (simulado — en prod viene del perfil guardado) ──
  let userTipo = 'cliente'; // 'cliente' | 'prestador'

  // ══════════════════════════════════════════════════════════════════
  // SESIÓN Y GATING (Opción C: invitado + registro en puntos de conversión)
  // ══════════════════════════════════════════════════════════════════
  let usuarioActual = null; // null = invitado
  let planActual         = 'base'; // 'base' | 'plus' | 'pro'
  let periodoActual      = 'anual'; // 'mensual' | 'anual'
  let venceActual        = null;   // ISO string o null
  let esFundadorActual   = false;  // true si el prestador tiene grandfathering activo

  // Acciones que requieren cuenta y su mensaje
  const ACCIONES_PROTEGIDAS = {
    contactar:   'Creá tu cuenta para contactar a este prestador',
    publicar:    'Creá tu cuenta para publicar un pedido',
    misPedidos:  'Creá tu cuenta para ver tus pedidos',
    pedidosZona: 'Creá tu cuenta para ver los pedidos de tu zona',
    resena:      'Creá tu cuenta para dejar una reseña',
    mapa:        'Creá tu cuenta para ver prestadores en el mapa',
    miPerfil:    'Creá tu cuenta para ver tu perfil',
  };

  /** Verifica si el usuario puede hacer una acción. Si no, muestra el gate.
   *  Devuelve true si puede continuar, false si se bloqueó. */
  function requiereCuenta(accion) {
    if (usuarioActual) return true; // logueado: pasa
    mostrarGate(ACCIONES_PROTEGIDAS[accion] || 'Creá tu cuenta para continuar');
    return false;
  }

  function mostrarGate(mensaje) {
    const modal = document.getElementById('gate-modal');
    const msg = document.getElementById('gate-msg');
    if (msg) msg.textContent = mensaje;
    if (modal) modal.style.display = 'flex';
  }
  function cerrarGate(ev) {
    if (ev && ev.target && ev.target.id !== 'gate-modal') return;
    const modal=document.getElementById('gate-modal');
    if(modal) modal.style.display='none';
    const activa=document.querySelector('.screen.active');
    if(activa&&['s-perfil','s-miperfil','s-pedidos','s-chat','s-notificaciones'].includes(activa.id)) goTo('s-home');
  }
  // Desde el gate, ir a registro
  function gateARegistro() {
    cerrarGate();
    document.getElementById('login-screen').classList.remove('hidden');
    mostrarFormRegistro();
  }

  // CTA "Quiero ofrecer mis servicios": maneja invitados y vecinos logueados
  function quieroSerPrestador() {
    if (!usuarioActual) {
      // Invitado → registro con tipo prestador pre-seleccionado
      const radioP = document.querySelector('input[name="reg-tipo"][value="prestador"]');
      if (radioP) radioP.checked = true;
      document.getElementById('login-screen').classList.remove('hidden');
      mostrarFormRegistro();
      return;
    }
    // Vecino logueado → mostrar confirmación antes de habilitar doble perfil
    abrirModalConfirmPrestador();
  }

  function abrirModalConfirmPrestador() {
    let m = document.getElementById('modal-confirm-prestador');
    if (!m) {
      m = document.createElement('div');
      m.id = 'modal-confirm-prestador';
      m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;align-items:flex-end;justify-content:center';
      m.innerHTML = `
        <div style="background:white;border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;box-shadow:0 -4px 24px rgba(0,0,0,.15)">
          <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>
          <div style="font-size:22px;margin-bottom:10px;text-align:center">🔧</div>
          <div style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:var(--ink);text-align:center;margin-bottom:8px">Activar perfil de prestador</div>
          <div style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:20px;text-align:center">
            Se habilitará el <strong>doble perfil</strong>: vas a poder alternar entre tu rol de vecino y el de prestador desde Mi Perfil.<br><br>
            Como prestador podés recibir pedidos de servicio, publicar tu disponibilidad y aparecer en el mapa del barrio.
          </div>
          <button onclick="confirmarActivarPrestador()" style="width:100%;padding:14px;background:var(--blue);color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-bottom:10px">Activar doble perfil</button>
          <button onclick="cerrarModalConfirmPrestador()" style="width:100%;padding:12px;background:none;color:var(--ink3);border:none;font-size:14px;cursor:pointer;font-family:'Inter',sans-serif">Cancelar</button>
        </div>`;
      document.body.appendChild(m);
    }
    m.style.display = 'flex';
  }
  function cerrarModalConfirmPrestador() {
    const m = document.getElementById('modal-confirm-prestador');
    if (m) m.style.display = 'none';
  }
  window.cerrarModalConfirmPrestador = cerrarModalConfirmPrestador;

  async function confirmarActivarPrestador() {
    cerrarModalConfirmPrestador();
    if (!window._sb) { showToast('Sin conexión'); return; }
    // Vecino logueado sin perfil prestador → sumar el rol de prestador.
    // NO se toca `tipo`: antes esto hacía update({tipo:'prestador'}) y como
    // tieneDoblePerfil() exige tipo!=='prestador', el vecino perdía su vista
    // de vecino para siempre — no podía volver a publicar pedidos ni le
    // aparecía el toggle. El rol de prestador lo habilita `prestador_id`,
    // que es lo que esPrestador() mira, así que queda con doble perfil.
    const res = await PronetDB.asegurarFichaPrestador();
    if (!res.ok) {
      showToast('No se pudo activar el perfil de prestador' + (res.error ? ': ' + res.error : ''));
      return;
    }
    usuarioActual = await PronetDB.usuarioActual();
    reflejarUsuario();
    showToast('Perfil de prestador activado. Podés alternar entre vecino y prestador desde Mi Perfil.');
    goTo('s-edit-perfil');
  }
  window.confirmarActivarPrestador = confirmarActivarPrestador;

  // ── Aceptación de Términos/Privacidad previa al login ──────────────────
  const TYC_LOGIN_KEY = 'pronet_tyc_aceptado';
  let tycAccionPendiente   = null; // { method, ev } — flujo pre-login (legacy)
  let _tycPostLoginCallback = null; // función async — flujo post-login para cuentas sin tyc_aceptado_en

  /** Ejecuta la acción de login. Ya NO muestra el modal de T&C.
   *
   *  Ese modal aparecía antes de CADA login y guardaba en localStorage, o
   *  sea por dispositivo: se repetía en cada teléfono nuevo y dos personas
   *  que compartían uno compartían el consentimiento de la primera.
   *
   *  El consentimiento ahora se pide UNA vez, al crear la cuenta, y queda
   *  en `perfiles.tyc_aceptado_en`. Pedirlo de nuevo a quien ya se registró
   *  sería pedirle dos veces lo mismo.
   *
   *  La función se conserva —la llaman los botones de login del HTML y los
   *  tests— pero ahora sólo delega. */
  function gateLogin(method, ev) {
    ejecutarAccionLogin(method, ev);
  }
  window.gateLogin = gateLogin;

  function ejecutarAccionLogin(method, ev) {
    if (method === 'invitado') entrarInvitado();
    else loginWith(method, ev);
  }

  function actualizarBotonTyc() {
    const c1 = document.getElementById('tyc-check-terminos');
    const c2 = document.getElementById('tyc-check-edad');
    const btn = document.getElementById('tyc-continuar-btn');
    if (!btn) return;
    const listo = c1?.checked && c2?.checked;
    btn.disabled = !listo;
    btn.style.opacity = listo ? '1' : '.4';
  }
  window.actualizarBotonTyc = actualizarBotonTyc;

  function confirmarTyc() {
    const c1 = document.getElementById('tyc-check-terminos');
    const c2 = document.getElementById('tyc-check-edad');
    if (!c1?.checked || !c2?.checked) return;
    const now = new Date().toISOString();
    localStorage.setItem(TYC_LOGIN_KEY, now);
    const modal = document.getElementById('modal-tyc-login');
    if (modal) modal.style.display = 'none';
    if (_tycPostLoginCallback) {
      // El flujo post-login tuvo que volver a mostrar #login-screen para que
      // este modal se viera (vive adentro). Ya aceptado, hay que esconderlo
      // de nuevo o la app queda tapada por la pantalla de login.
      const loginEl = document.getElementById('login-screen');
      if (loginEl) loginEl.classList.add('hidden');
      PronetDB.registrarAceptacionTyc(now).catch(() => {});
      if (usuarioActual) usuarioActual.tyc_aceptado_en = now;
      const cb = _tycPostLoginCallback;
      _tycPostLoginCallback = null;
      cb();
    } else {
      const accion = tycAccionPendiente;
      tycAccionPendiente = null;
      if (accion) ejecutarAccionLogin(accion.method, accion.ev);
    }
  }
  window.confirmarTyc = confirmarTyc;

  function cancelarTyc() {
    const modal = document.getElementById('modal-tyc-login');
    if (modal) modal.style.display = 'none';
    if (_tycPostLoginCallback) {
      _tycPostLoginCallback = null;
      PronetDB.logout().catch(() => {});
      const loginEl = document.getElementById('login-screen');
      if (loginEl) loginEl.classList.remove('hidden');
    } else {
      tycAccionPendiente = null;
    }
  }
  window.cancelarTyc = cancelarTyc;

  // Abre T&C o Privacidad desde dentro del modal (login-screen tiene z-index
  // por encima de .screen, hay que ocultarlo para que se vea la pantalla).
  function guardarAccionPendienteYVer(pantalla) {
    const modal = document.getElementById('modal-tyc-login');
    if (modal) modal.style.display = 'none';
    const login = document.getElementById('login-screen');
    if (login) login.classList.add('hidden');
    goTo(pantalla);
  }
  window.guardarAccionPendienteYVer = guardarAccionPendienteYVer;

  async function loginWith(method, ev) {
    const btn = ev && ev.target ? ev.target.closest('button') : null;
    // Google / Apple: OAuth — redirige al proveedor y vuelve via restaurarSesion()
    if (method === 'google' || method === 'apple') {
      if (btn) btn.innerHTML = 'Redirigiendo…';
      const res = await PronetDB.loginConOAuth(method);
      if (!res.ok) {
        if (btn) btn.innerHTML = method === 'google' ? '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:18px;height:18px;margin-right:8px;vertical-align:middle">Continuar con Google' : 'Continuar con Apple';
        mostrarErrorLogin('No se pudo conectar con ' + (method === 'google' ? 'Google' : 'Apple') + '. Intentá de nuevo.');
      }
      // Si ok: el browser está redirigiendo al proveedor OAuth — no continuar
      return;
    }
    // Email
    if (!reportarInvalidos('login-email', 'login-pw')) return;
    const email = (document.getElementById('login-email')?.value || '').trim();
    const pw    = (document.getElementById('login-pw')?.value || '').trim();
    if (!email || !pw) {
      mostrarErrorLogin('Completá email y contraseña');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostrarErrorLogin('El email no tiene un formato válido');
      return;
    }
    if (btn) btn.innerHTML = '<span style="opacity:.7">Ingresando...</span>';
    const res = await PronetDB.login(email, pw);
    if (btn) btn.innerHTML = 'Ingresar →';
    if (!res.ok) {
      const msgLogin = typeof res.error === 'string' ? res.error : (res.error?.message || 'Error al ingresar');
      mostrarErrorLogin(msgLogin === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : msgLogin);
      return;
    }
    // Verificar confirmación de email directo desde Auth (no desde el perfil mezclado)
    const { data: { user: authUser } } = await window._sb.auth.getUser();
    if (authUser && !authUser.email_confirmed_at) {
      mostrarErrorLogin('Confirmá tu email antes de ingresar. Revisá tu casilla de correo.');
      return;
    }

    usuarioActual = await PronetDB.usuarioActual();
    entrarApp();
  }

  /** Dispara validación nativa del browser en una lista de IDs de inputs.
   *  Devuelve false (y muestra tooltip) si alguno falla. */
  function reportarInvalidos(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !el.reportValidity()) return false;
    }
    return true;
  }

  function mostrarErrorLogin(txt) {
    let err = document.getElementById('login-error');
    if (err) { err.textContent = txt; err.style.display = 'block'; }
  }

  function inicialesDe(nombre) {
    if (!nombre) return '👤';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  /** Refleja el usuario logueado en la UI (avatar, nombre, subtítulo) */
  // ══ Roles y permisos ════════════════════════════════════════════════
  function esAdmin() {
    return usuarioActual?.roles?.includes('admin') === true;
  }

  // modoRol: null = auto-detect, 'vecino' = forzar modo vecino aunque tenga prestador_id
  let modoRol = localStorage.getItem('pronet-modo-rol') || null;

  function esPrestador() {
    if (modoRol === 'vecino') return false;
    return !!(usuarioActual?.tipo === 'prestador' || usuarioActual?.prestador_id);
  }

  function tieneDoblePerfil() {
    // Solo vecinos que TAMBIÉN tienen un perfil de prestador (no prestadores puros)
    return !!(usuarioActual?.prestador_id && usuarioActual?.tipo !== 'prestador');
  }

  function toggleModoRol() {
    modoRol = modoRol === 'vecino' ? null : 'vecino';
    localStorage.setItem('pronet-modo-rol', modoRol || '');
    // Actualizar nav inferior inmediatamente según el nuevo modo
    const nbBuscar = document.getElementById('nb-buscar');
    const nbMapa   = document.getElementById('nb-mercado');
    const btnPub   = document.getElementById('btn-publicar-pedido');
    const esPresta = esPrestador();
    if (nbBuscar) nbBuscar.style.display = esPresta ? 'none' : '';
    // El tab de ProMarket depende del rol Y del feature flag: mostrarlo solo
    // por no ser prestador pisaba lo que aplicarFeatureFlags() había ocultado
    // y dejaba el tab visible con la feature apagada por el admin.
    if (nbMapa)   nbMapa.style.display   = (esPresta || !FEATURES.mercadoPlaza) ? 'none' : '';
    if (btnPub)   btnPub.style.display   = esPresta ? 'none' : '';
    reflejarUsuario();
    goTo('s-home');
  }
  window.toggleModoRol = toggleModoRol;

  function esPro() {
    return planActual === 'plus' || planActual === 'pro';
  }

  function getPlanConfig(id) {
    const planes = (window.PRONET_CONFIG || {}).PLANES || [];
    return planes.find(p => p.id === (id || planActual)) || planes[0] || {};
  }

  /** Badge del plan de un prestador para las cards de búsqueda.
   *  Sólo los planes con badge_busqueda lo muestran (hoy Pro).
   *  Recibe el plan del prestador, no el del usuario que mira. */
  function badgePlanPrestador(plan) {
    if (!plan) return '';
    const planes = (window.PRONET_CONFIG || {}).PLANES || [];
    const cfg = planes.find(p => p.id === plan);
    if (!cfg || !cfg.badge_busqueda) return '';
    return `<span class="badge b-pro">${cfg.emoji} ${escHTML(cfg.badge_label)}</span>`;
  }

  // Config global de la app (tabla config_app). Se carga al iniciar.
  let configApp = {};
  let configCargada = false;

  /** ¿Los planes pagos están habilitados? Lo controla el admin. */
  function planesPagosActivos() {
    return configApp.planes_pagos_activos === 'true';
  }

  /** ¿El checkout redirige a MercadoPago? Si es false, activa el plan gratis (modo test). */
  function mpCheckoutActivo() {
    return configApp.mp_checkout_activo === 'true';
  }

  /** ¿El tab ProMarket está habilitado? Lo controla el admin.
   *  Default ON si la clave no está definida en config_app — mismo criterio
   *  que FEATURES.mercadoPlaza (línea ~9274), que es el que realmente
   *  oculta o muestra el tab. Antes usaban criterios opuestos (=== 'true'
   *  acá vs. !== 'false' allá): con la clave sin definir, este toggle
   *  mostraba "Desactivado" mientras ProMarket estaba activo para todos. */
  function promarketActivo() {
    return configApp.promarket_activo !== 'false';
  }

  /** Plan cuyos límites aplican realmente.
   *  En prelanzamiento (pagos desactivados) Base recibe los límites de Plus:
   *  el número no es arbitrario, es el mismo que después se vende. Los planes
   *  superiores nunca se degradan. Misma regla que plan_para_limites() en SQL. */
  function planParaLimites(plan) {
    // Con pagos desactivados: etapa fundadora global → Base recibe límites de Plus.
    if (!planesPagosActivos()) return plan === 'base' ? 'plus' : plan;
    // Con pagos activos: solo los fundadores marcados conservan límites de Plus.
    if (plan === 'base' && esFundadorActual) return 'plus';
    return plan;
  }

  // Jerarquía de tiers de analítica. `export` incluye todo lo de `completas`,
  // que a su vez incluye lo de `basicas`.
  const TIERS_STATS = { false: 0, basicas: 1, completas: 2, export: 3 };

  /** Tier de estadísticas que le corresponde al usuario.
   *  Usa planParaLimites() para respetar la etapa fundadora: con los pagos
   *  desactivados, Base recibe el tier de Plus igual que los límites. */
  function tierEstadisticas() {
    return getPlanConfig(planParaLimites(planActual)).estadisticas || false;
  }

  /** Muestra u oculta cada sección de analítica según el tier del plan.
   *  Las bloqueadas no se esconden en silencio: se reemplazan por un aviso
   *  que dice qué plan las incluye, porque una sección que desaparece sin
   *  explicación se lee como un bug. */
  function aplicarTierEstadisticas() {
    const actual = TIERS_STATS[tierEstadisticas()] ?? 0;
    document.querySelectorAll('#s-analytics .an-section[data-tier]').forEach(sec => {
      const requerido = TIERS_STATS[sec.dataset.tier] ?? 0;
      const permitido = actual >= requerido;
      sec.style.display = permitido ? '' : 'none';
    });
    // Aviso único al final, en vez de uno por sección bloqueada.
    const aviso = document.getElementById('an-upsell');
    if (aviso) {
      const bloqueadas = [...document.querySelectorAll('#s-analytics .an-section[data-tier]')]
        .filter(s => s.style.display === 'none').length;
      aviso.style.display = bloqueadas > 0 ? '' : 'none';
      const txt = document.getElementById('an-upsell-txt');
      if (txt) {
        // El mensaje nombra el plan que desbloquea lo que le falta a ESTE
        // usuario: a un Pro no le sirve que le ofrezcan lo que ya tiene.
        txt.textContent =
          actual === 0 ? 'Tu plan no incluye analítica. Con Plus ves tus vistas al perfil y tu reputación del mes.'
        :                'Con Pro sumás ranking por zona, embudo de contacto, de dónde vienen tus visitas y exportar tu historial en CSV.';
      }
    }
  }

  /** Escapa un valor para CSV: comillas dobles duplicadas y el campo entre
   *  comillas si contiene separador, comillas o saltos de línea. */
  function csvCampo(v) {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Exporta el historial de trabajos del prestador a CSV.
   *  Sirve para contabilidad y para mostrar trayectoria, que es lo que un
   *  prestador necesita de verdad — no las métricas de visitas. */
  async function exportarHistorialCSV() {
    if (tierEstadisticas() !== 'export') {
      showToast && showToast('⚠️ La exportación está disponible en el plan Pro.');
      return;
    }
    const btn = document.getElementById('an-export-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando...'; }
    try {
      const items = await PronetDB.listarHistorialPrestador().catch(() => []);
      if (!items.length) {
        showToast && showToast('Todavía no tenés trabajos para exportar.');
        return;
      }
      const cols = ['Fecha', 'Trabajo', 'Rubro', 'Zona', 'Cliente', 'Modalidad', 'Monto', 'Monto máximo', 'Estrellas', 'Comentario'];
      // Separador ';' y BOM: Excel en es-AR usa ';' y sin BOM rompe los acentos.
      const filas = items.map(t => [
        t.creado ? new Date(t.creado).toLocaleDateString('es-AR') : '',
        t.titulo, t.rubro, t.zona, t.vecino_nombre,
        t.modalidad || 'fijo',
        t.precio || 0,
        t.modalidad === 'rango' ? (t.precio_max || 0) : '',
        t.resena?.estrellas ?? '',
        t.resena?.comentario ?? '',
      ].map(csvCampo).join(';'));

      const total = items.reduce((s, t) => s + (t.precio || 0), 0);
      filas.push('');
      filas.push([csvCampo('TOTAL'), '', '', '', '', '', total].join(';'));

      const csv = '﻿' + [cols.join(';'), ...filas].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pronet-trabajos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast && showToast(`✅ ${items.length} trabajo${items.length === 1 ? '' : 's'} exportado${items.length === 1 ? '' : 's'}.`);
    } catch (e) {
      console.warn('[exportarHistorialCSV]', e.message);
      showToast && showToast('⚠️ No se pudo generar el archivo.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬇️ Descargar historial (CSV)'; }
    }
  }
  window.exportarHistorialCSV = exportarHistorialCSV;

  /** Límite del plan activo para un recurso. null = ilimitado. */
  function limitePlan(campo) {
    const v = getPlanConfig(planParaLimites(planActual))[campo];
    return v == null ? null : v;
  }

  /** ¿Le queda cupo de propuestas al prestador este mes?
   *  Devuelve { ok, usadas, limite }. */
  async function puedeEnviarPropuesta() {
    const limite = limitePlan('propuestas_mes');
    if (limite == null) return { ok: true };
    const pid = usuarioActual?.prestador_id;
    if (!pid) return { ok: true };
    const usadas = await PronetDB.contarPropuestasMes(pid).catch(() => 0);
    return { ok: usadas < limite, usadas, limite };
  }

  /** Pinta el estado de los interruptores de config en el panel admin. */
  // ══ PARAMETRÍAS · PLANES ═══════════════════════════════════════════
  //
  // La tabla `planes_limites` ya era la fuente de verdad —la usan el
  // trigger de límites y `crear-preferencia` para el cobro real— pero sólo
  // se podía editar por SQL. Esto es la pantalla que faltaba.
  //
  // `config.js` sigue teniendo los mismos valores como respaldo offline;
  // al iniciar, restaurarSesion() los pisa con estos. Editar acá cambia lo
  // que se cobra y lo que se limita, sin deploy.
  async function renderParamPlanes() {
    const wrap = document.getElementById('param-planes-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando planes…</div>';

    const filas = await PronetDB.listarPlanesLimites().catch(() => []);
    // Sólo los planes de prestador: `promarket_credito` es un pago único,
    // no un plan, y mezclarlo acá invitaría a editarlo como si lo fuera.
    const planes = filas.filter(f => ['base', 'plus', 'pro'].includes(f.plan));
    if (!planes.length) {
      wrap.innerHTML = '<div style="padding:32px 18px;text-align:center;font-size:13px;color:#BE123C">⚠️ No se pudieron cargar los planes.</div>';
      return;
    }
    const orden = { base: 0, plus: 1, pro: 2 };
    planes.sort((a, b) => orden[a.plan] - orden[b.plan]);

    const campo = (plan, clave, etiqueta, valor, ayuda) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:12.5px;color:var(--ink)">${escHTML(etiqueta)}</div>
          ${ayuda ? `<div style="font-size:10.5px;color:var(--ink3);margin-top:1px">${escHTML(ayuda)}</div>` : ''}
        </div>
        <input id="pp-${escHTML(plan)}-${escHTML(clave)}" value="${escHTML(valor === null || valor === undefined ? '' : String(valor))}"
               inputmode="decimal" autocomplete="off"
               placeholder="${clave === 'propuestas_mes' ? '∞' : ''}"
               style="width:96px;text-align:right;font-size:13px;font-weight:600;padding:7px 9px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;color:var(--ink)">
      </div>`;

    wrap.innerHTML = planes.map(p => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:18px">${p.plan === 'pro' ? '⭐' : p.plan === 'plus' ? '⚡' : '🆓'}</span>
          <div style="flex:1;font-size:14px;font-weight:800;color:var(--ink)">${escHTML(p.nombre || p.plan)}</div>
          <span style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px">${escHTML(p.plan)}</span>
        </div>
        ${campo(p.plan, 'precio_mes',              'Precio mensual',                   p.precio_mes,              'En pesos. 0 = gratuito')}
        ${campo(p.plan, 'precio_anual',            'Precio anual',                     p.precio_anual,            'En pesos')}
        ${campo(p.plan, 'propuestas_mes',          'Propuestas por mes',               p.propuestas_mes,          'Vacío = ilimitado')}
        ${campo(p.plan, 'fotos_portfolio',         'Fotos de portfolio',               p.fotos_portfolio,         '')}
        ${campo(p.plan, 'mkt_publicaciones_mes',   'Publicaciones EV por mes',         p.mkt_publicaciones_mes,   'Solo plan Plus. Vacío = no aplica')}
        ${campo(p.plan, 'mkt_publicaciones_anio',  'Publicaciones EV por año (gratis)', p.mkt_publicaciones_anio, 'Solo plan Base. Vacío = no aplica')}
        ${campo(p.plan, 'loyalty_boost',           'Multiplicador de puntos',          p.loyalty_boost,           '1 = sin boost. 1.5 = 50% más puntos')}
        <div id="pp-${escHTML(p.plan)}-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin-top:8px"></div>
        <button onclick="guardarParamPlan('${escHTML(p.plan)}')"
                style="width:100%;background:var(--blue);color:white;border:none;border-radius:10px;padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
          Guardar ${escHTML(p.nombre || p.plan)}
        </button>
      </div>`).join('') + `
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">
        Estos valores son los que se cobran y los que limitan de verdad: los usa el trigger que bloquea propuestas y la función que crea el pago en MercadoPago. Un cambio acá impacta de inmediato.
      </div>`;
  }

  /** Guarda un plan. Valida ANTES de mandar: un precio negativo o un cupo
   *  en 0 no rompen nada visible pero dejan a alguien sin poder ofertar. */
  async function guardarParamPlan(plan) {
    const msg = document.getElementById('pp-' + plan + '-msg');
    const leer = c => (document.getElementById('pp-' + plan + '-' + c)?.value || '').trim();
    const decir = (t, color) => { if (msg) { msg.textContent = t; msg.style.color = color; } };

    const num = (txt, { permitirVacio = false } = {}) => {
      if (txt === '' ) return permitirVacio ? null : NaN;
      const n = Number(txt.replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    };

    const cambios = {
      precio_mes:             num(leer('precio_mes')),
      precio_anual:           num(leer('precio_anual')),
      propuestas_mes:         num(leer('propuestas_mes'),         { permitirVacio: true }),
      fotos_portfolio:        num(leer('fotos_portfolio')),
      mkt_publicaciones_mes:  num(leer('mkt_publicaciones_mes'),  { permitirVacio: true }),
      mkt_publicaciones_anio: num(leer('mkt_publicaciones_anio'), { permitirVacio: true }),
      loyalty_boost:          num(leer('loyalty_boost')),
    };

    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) continue;
      if (Number.isNaN(v)) { decir('⚠️ "' + k.replace(/_/g, ' ') + '" no es un número válido', '#BE123C'); return; }
      if (v < 0)           { decir('⚠️ "' + k.replace(/_/g, ' ') + '" no puede ser negativo', '#BE123C'); return; }
    }
    if (cambios.loyalty_boost < 1) { decir('⚠️ El multiplicador no puede ser menor a 1 — restaría puntos', '#BE123C'); return; }
    if (cambios.fotos_portfolio < 1) { decir('⚠️ Al menos 1 foto de portfolio', '#BE123C'); return; }
    if (cambios.propuestas_mes !== null && cambios.propuestas_mes < 1) {
      decir('⚠️ Con 0 propuestas nadie podría ofertar. Dejalo vacío para ilimitado.', '#BE123C'); return;
    }

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarPlanLimites(plan, cambios);
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error desconocido'), '#BE123C'); return; }

    // Reflejar el cambio en PRONET_CONFIG sin esperar a la próxima sesión:
    // si no, el admin guarda y la app sigue mostrando lo viejo.
    const cfg = (window.PRONET_CONFIG?.PLANES || []).find(p => p.id === plan);
    if (cfg) {
      cfg.precio_mes             = cambios.precio_mes;
      cfg.precio_anual           = cambios.precio_anual;
      cfg.propuestas_mes         = cambios.propuestas_mes;
      cfg.fotos_portfolio        = cambios.fotos_portfolio;
      cfg.mkt_publicaciones_mes  = cambios.mkt_publicaciones_mes;
      cfg.mkt_publicaciones_anio = cambios.mkt_publicaciones_anio;
      cfg.loyalty_boost          = cambios.loyalty_boost;
    }
    decir('✅ Guardado', 'var(--green)');
    setTimeout(() => decir('', ''), 2500);
  }
  window.guardarParamPlan = guardarParamPlan;

  // ══ PARAMETRÍAS · RUBROS ═══════════════════════════════════════════
  //
  // Se puede editar el nombre, el rango de precio y la baja lógica.
  // El emoji, el color y el SVG NO se editan acá a propósito: un ícono mal
  // pegado rompe el render de los chips en todas las pantallas, y no hay
  // forma razonable de validar un path SVG desde un input de texto. Para
  // un rubro nuevo se usa un ícono genérico y se ajusta por SQL.
  async function renderParamRubros() {
    const wrap = document.getElementById('param-rubros-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando rubros…</div>';

    const filas = await PronetDB.listarRubros(false).catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:32px 18px;text-align:center;font-size:13px;color:#BE123C">⚠️ No se pudieron cargar los rubros.</div>';
      return;
    }

    // Cuántos pedidos usa cada rubro: es lo que decide si dar de baja duele.
    let uso = {};
    try {
      const peds = await PronetDB.listar('pedidos');
      peds.forEach(p => { if (p.rubro) uso[p.rubro] = (uso[p.rubro] || 0) + 1; });
    } catch (e) { /* el conteo es informativo, no bloquea la pantalla */ }

    wrap.innerHTML = filas.map(r => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:11px${r.activo ? '' : ';opacity:.6'}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <span style="font-size:20px">${r.emoji || '📋'}</span>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:var(--ink)">${escHTML(r.nombre)}</div>
            <div style="font-size:10.5px;color:var(--ink3);margin-top:1px">
              ${escHTML(r.slug)}${uso[r.nombre] ? ' · ' + uso[r.nombre] + ' pedido' + (uso[r.nombre] > 1 ? 's' : '') : ' · sin pedidos'}
            </div>
          </div>
          ${r.activo ? '' : '<span style="font-size:10px;font-weight:700;background:var(--surface);color:var(--ink3);border-radius:6px;padding:3px 7px">Inactivo</span>'}
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border)">
          <span style="flex:1;font-size:12.5px;color:var(--ink)">Precio de referencia</span>
          <input id="rb-${escHTML(r.slug)}-min" value="${escHTML(String(r.precio_min))}" inputmode="numeric"
                 style="width:82px;text-align:right;font-size:13px;font-weight:600;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink)">
          <span style="font-size:12px;color:var(--ink3)">a</span>
          <input id="rb-${escHTML(r.slug)}-max" value="${escHTML(String(r.precio_max))}" inputmode="numeric"
                 style="width:82px;text-align:right;font-size:13px;font-weight:600;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink)">
        </div>
        <div style="padding:7px 0;border-top:1px solid var(--border)">
          <div style="font-size:12.5px;color:var(--ink);margin-bottom:4px">Especialidades</div>
          <input id="rb-${escHTML(r.slug)}-esp" value="${escHTML((r.especialidades || []).join(', '))}"
                 placeholder="Separadas por coma"
                 style="width:100%;font-size:12.5px;padding:7px 9px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink);box-sizing:border-box">
          <div style="font-size:10.5px;color:var(--ink3);margin-top:3px">Las opciones que el prestador marca en su perfil</div>
        </div>
        <div id="rb-${escHTML(r.slug)}-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>
        <div style="display:flex;gap:8px">
          <button onclick="guardarParamRubro('${escHTML(r.slug)}')"
                  style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>
          <button onclick="toggleRubroActivo('${escHTML(r.slug)}', ${r.activo ? 'false' : 'true'})"
                  style="flex:1;background:${r.activo ? 'var(--surface)' : 'var(--green-s)'};color:${r.activo ? 'var(--ink2)' : 'var(--green)'};border:1px solid var(--border);border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
            ${r.activo ? 'Dar de baja' : 'Reactivar'}
          </button>
        </div>
      </div>`).join('') + `
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">
        Dar de baja un rubro lo saca de los listados pero <b>no toca los pedidos ya publicados</b>: siguen mostrando su nombre e ícono. No se borran porque los pedidos guardan el rubro como texto, sin vínculo con esta tabla.
      </div>`;
  }

  async function guardarParamRubro(slug) {
    const msg = document.getElementById('rb-' + slug + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const min = Number((document.getElementById('rb-' + slug + '-min')?.value || '').trim());
    const max = Number((document.getElementById('rb-' + slug + '-max')?.value || '').trim());

    if (!Number.isFinite(min) || !Number.isFinite(max)) { decir('⚠️ Los precios tienen que ser números', '#BE123C'); return; }
    if (min < 0 || max < 0) { decir('⚠️ Los precios no pueden ser negativos', '#BE123C'); return; }
    // Invertidos, el slider de "Publicar pedido" queda sin recorrido válido.
    if (min >= max) { decir('⚠️ El mínimo tiene que ser menor que el máximo', '#BE123C'); return; }

    // Especialidades: texto separado por comas. Se deduplican y se limpian
    // los vacíos que deja escribir "a,,b" o terminar con una coma suelta.
    const espTxt = (document.getElementById('rb-' + slug + '-esp')?.value || '');
    const especialidades = [...new Set(espTxt.split(',').map(s => s.trim()).filter(Boolean))];

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarRubro(slug, { precio_min: min, precio_max: max, especialidades });
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error'), '#BE123C'); return; }
    await cargarRubrosDeLaBase();
    decir('✅ Guardado', 'var(--green)');
    setTimeout(() => decir('', ''), 2500);
  }
  window.guardarParamRubro = guardarParamRubro;

  async function toggleRubroActivo(slug, activar) {
    const r = await PronetDB.guardarRubro(slug, { activo: activar });
    if (!r?.ok) { alert('No se pudo cambiar el estado: ' + (r?.error || 'error')); return; }
    await cargarRubrosDeLaBase();
    renderParamRubros();
  }
  window.toggleRubroActivo = toggleRubroActivo;

  // ══ SERVICIOS FIJOS ════════════════════════════════════════════════
  //
  // El mismo registro se llama distinto según quién lo mire: el vecino ve
  // "mis servicios fijos" y el prestador "mis clientes fijos". Para el
  // prestador no es una lista de acuerdos, es su base de ingreso previsible
  // — algo que hoy no ve en ningún lado.
  //
  // No administra fechas ni visitas a propósito: es el registro de QUÉ se
  // acordó con quién, no la ejecución. Eso sigue pasando por el chat.
  function frecuenciaTexto(veces, periodo) {
    const n = Number(veces) || 1;
    return (n === 1 ? '1 vez' : n + ' veces') + ' por ' + (periodo === 'mes' ? 'mes' : 'semana');
  }

  async function renderServiciosFijos() {
    const wrap = document.getElementById('sf-lista');
    const tit  = document.getElementById('sf-titulo');
    if (!wrap) return;
    const soyPrestador = !!usuarioActual?.prestador_id && modoRol !== 'vecino';
    if (tit) tit.textContent = soyPrestador ? 'Mis clientes fijos' : 'Mis servicios fijos';
    wrap.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const filas = await PronetDB.listarServiciosFijos(true).catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = `
        <div style="padding:40px 24px;text-align:center">
          <div style="font-size:38px;margin-bottom:10px">🔁</div>
          <div style="font-size:15px;font-weight:700;color:var(--ink)">${soyPrestador ? 'Todavía no tenés clientes fijos' : 'Todavía no tenés servicios fijos'}</div>
          <div style="font-size:13px;color:var(--ink3);margin-top:6px;line-height:1.5">
            ${soyPrestador
              ? 'Cuando un vecino te elija para un trabajo que se repite, va a aparecer acá.'
              : 'Al publicar un pedido elegí <b>Servicio fijo</b> — como el jardinero o el piletero — y cuando elijas a alguien queda registrado acá.'}
          </div>
        </div>`;
      return;
    }

    wrap.innerHTML = filas.map(s => {
      const otro = soyPrestador ? (s.vecino_nombre || 'Vecino') : (s.prestadores?.nombre || 'Prestador');
      const ini  = otro.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const precio = s.precio
        ? '$' + Number(s.precio).toLocaleString('es-AR') + ' por ' + (s.precio_unidad === 'mes' ? 'mes' : 'visita')
        : 'Precio a convenir';
      return `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:11px">
        <div style="display:flex;align-items:center;gap:11px">
          <div style="width:42px;height:42px;border-radius:50%;background:var(--blue-s);color:var(--blue);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${escHTML(ini)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:800;color:var(--ink)">${escHTML(otro)}</div>
            <div style="font-size:11.5px;color:var(--ink3);margin-top:2px">${escHTML(s.rubro || 'Servicio')}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:11px">
          <div style="flex:1;background:var(--surface);border-radius:10px;padding:9px 11px">
            <div style="font-size:10.5px;color:var(--ink3)">Frecuencia</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--ink);margin-top:2px">${escHTML(frecuenciaTexto(s.frecuencia_veces, s.frecuencia_periodo))}</div>
          </div>
          <div style="flex:1;background:var(--surface);border-radius:10px;padding:9px 11px">
            <div style="font-size:10.5px;color:var(--ink3)">Precio</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--ink);margin-top:2px">${escHTML(precio)}</div>
          </div>
        </div>
        <button onclick="terminarServicioFijoUI('${escHTML(s.id)}', '${escHTML(otro).replace(/'/g, '&#39;')}')"
                style="width:100%;margin-top:10px;background:var(--surface);color:var(--ink2);border:1px solid var(--border);border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
          Dar de baja
        </button>
      </div>`;
    }).join('') + `
      <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;padding:4px 2px">
        Esto es el registro de lo que acordaron. Las fechas y los cambios se siguen coordinando por chat.
      </div>`;
  }

  async function terminarServicioFijoUI(id, nombre) {
    if (!confirm('¿Dar de baja el servicio fijo con ' + nombre + '?\n\nDeja de figurar en la lista. No afecta los trabajos ya hechos.')) return;
    const r = await PronetDB.terminarServicioFijo(id);
    if (!r?.ok) { showToast && showToast('⚠️ ' + (r?.error || 'No se pudo dar de baja')); return; }
    renderServiciosFijos();
  }
  window.terminarServicioFijoUI = terminarServicioFijoUI;

  // ══ PARAMETRÍAS · AJUSTES NUMÉRICOS ════════════════════════════════
  //
  // Valores sueltos de config_app. La lista es EXPLÍCITA y no un volcado de
  // la tabla: `config_app` también guarda `admin_pin` en texto plano, y una
  // pantalla genérica clave/valor lo pondría en pantalla.
  //
  // `min`/`max` no son decoración: un 0 en "sugeridos" o en "reseñas antes
  // de ver todas" deja secciones enteras vacías sin que nada falle.
  const AJUSTES_CONFIG = [
    { k: 'pedido_vencimiento_hs',   n: 'Vida de un pedido',        u: 'horas',       min: 24, max: 2160, d: 'Cuánto dura publicado antes de vencer. 168 = 7 días' },
    { k: 'inactividad_cierre_dias', n: 'Cierre por inactividad',   u: 'días',        min: 1,  max: 90,   d: 'Días sin actividad para que el vecino pueda cerrar' },
    { k: 'pedido_fotos_max',        n: 'Fotos por pedido',         u: 'fotos',       min: 1,  max: 10,   d: '' },
    { k: 'adjunto_max_mb',          n: 'Adjunto máximo en chat',   u: 'MB',          min: 1,  max: 25,   d: '' },
    { k: 'rating_top',              n: 'Nota para el filtro Top',  u: '★',           min: 1,  max: 5,    d: 'Calificación mínima para aparecer en "Top"' },
    { k: 'sugeridos_pedido',        n: 'Prestadores sugeridos',    u: 'prestadores', min: 1,  max: 10,   d: 'Cuántos se ofrecen al publicar un pedido' },
    { k: 'mapa_prestadores_max',    n: 'Pines en el mapa',         u: 'pines',       min: 1,  max: 50,   d: 'Más pines saturan el mapa y lo vuelven ilegible' },
    { k: 'resenas_preview',         n: 'Reseñas antes de "ver todas"', u: 'reseñas', min: 1,  max: 20,   d: '' },
    { k: 'rate_limit_pedidos_max',  n: 'Pedidos por ventana',      u: 'pedidos',     min: 1,  max: 50,   d: 'Tope anti-spam de publicaciones' },
    { k: 'rate_limit_pedidos_ventana_min', n: 'Ventana del tope',  u: 'minutos',     min: 1,  max: 1440, d: '' },
  ];

  async function renderParamAjustes() {
    const wrap = document.getElementById('param-ajustes-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando ajustes…</div>';

    const vals = await PronetDB.leerConfigApp(AJUSTES_CONFIG.map(a => a.k)).catch(() => ({}));

    wrap.innerHTML = AJUSTES_CONFIG.map(a => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:9px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:var(--ink)">${escHTML(a.n)}</div>
            ${a.d ? `<div style="font-size:11px;color:var(--ink3);margin-top:2px;line-height:1.4">${escHTML(a.d)}</div>` : ''}
          </div>
          <input id="aj-${escHTML(a.k)}" value="${escHTML(vals[a.k] ?? '')}" inputmode="decimal"
                 style="width:78px;text-align:right;font-size:13px;font-weight:600;padding:7px 9px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;color:var(--ink)">
          <span style="font-size:11px;color:var(--ink3);width:64px">${escHTML(a.u)}</span>
        </div>
        <div id="aj-${escHTML(a.k)}-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin-top:6px"></div>
        <button onclick="guardarParamAjuste('${escHTML(a.k)}')"
                style="width:100%;background:var(--blue);color:white;border:none;border-radius:10px;padding:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>
      </div>`).join('') + `
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">
        Los cambios impactan en la próxima apertura de cada usuario, cuando la app vuelve a leer la configuración.
      </div>`;
  }

  async function guardarParamAjuste(clave) {
    const def = AJUSTES_CONFIG.find(a => a.k === clave);
    const msg = document.getElementById('aj-' + clave + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const v = Number((document.getElementById('aj-' + clave)?.value || '').trim().replace(',', '.'));

    if (!Number.isFinite(v)) { decir('⚠️ Tiene que ser un número', '#BE123C'); return; }
    if (def && (v < def.min || v > def.max)) {
      decir('⚠️ Tiene que estar entre ' + def.min + ' y ' + def.max + ' ' + def.u, '#BE123C'); return;
    }

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarConfigApp(clave, v);
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error'), '#BE123C'); return; }

    // Reflejarlo en memoria para que el admin vea el efecto sin recargar.
    const mapa = { pedido_vencimiento_hs: 'PROPUESTA_EXPIRACION_HS', inactividad_cierre_dias: 'INACTIVIDAD_CIERRE_DIAS',
                   pedido_fotos_max: 'PEDIDO_FOTOS_MAX', adjunto_max_mb: 'ADJUNTO_MAX_MB', rating_top: 'RATING_TOP',
                   sugeridos_pedido: 'SUGERIDOS_PEDIDO', mapa_prestadores_max: 'MAPA_PRESTADORES_MAX', resenas_preview: 'RESENAS_PREVIEW' };
    if (mapa[clave] && window.PRONET_CONFIG) window.PRONET_CONFIG[mapa[clave]] = v;

    decir('✅ Guardado', 'var(--green)');
    setTimeout(() => decir('', ''), 2500);
  }
  window.guardarParamAjuste = guardarParamAjuste;

  // ══ PARAMETRÍAS · NIVELES DE LOYALTY ═══════════════════════════════
  async function renderParamNiveles() {
    const wrap = document.getElementById('param-niveles-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando niveles…</div>';

    const filas = await PronetDB.listarLoyaltyNiveles().catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:32px 18px;text-align:center;font-size:13px;color:#BE123C">⚠️ No se pudieron cargar los niveles.</div>';
      return;
    }

    // Cuánta gente hay en cada nivel: mover un umbral los reclasifica a todos.
    let porNivel = {};
    try {
      const { data } = await window._sb.from('loyalty').select('nivel');
      (data || []).forEach(l => { porNivel[l.nivel] = (porNivel[l.nivel] || 0) + 1; });
    } catch (e) { /* informativo */ }

    wrap.innerHTML = filas.map((n, i) => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:13px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <span style="font-size:20px">${n.emoji}</span>
          <div style="flex:1">
            <div style="font-size:13.5px;font-weight:800;color:var(--ink)">${escHTML(n.nombre)}</div>
            <div style="font-size:10.5px;color:var(--ink3);margin-top:1px">
              ${porNivel[n.nombre] ? porNivel[n.nombre] + ' usuario' + (porNivel[n.nombre] > 1 ? 's' : '') : 'sin usuarios'}
              ${filas[i + 1] ? ' · hasta ' + (filas[i + 1].min_puntos - 1).toLocaleString('es-AR') + ' pts' : ' · sin techo'}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border)">
          <span style="flex:1;font-size:12.5px;color:var(--ink)">Desde</span>
          <input id="nv-${escHTML(n.nombre)}-min" value="${escHTML(String(n.min_puntos))}" inputmode="numeric"
                 ${i === 0 ? 'disabled' : ''}
                 style="width:100px;text-align:right;font-size:13px;font-weight:600;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink)${i === 0 ? ';background:var(--surface);color:var(--ink3)' : ''}">
          <span style="font-size:12px;color:var(--ink3)">pts</span>
        </div>
        <div id="nv-${escHTML(n.nombre)}-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>
        ${i === 0 ? '' : `<button onclick="guardarParamNivel('${escHTML(n.nombre)}')"
                  style="width:100%;background:var(--blue);color:white;border:none;border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>`}
      </div>`).join('') + `
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">
        Mover un umbral <b>reclasifica a todos</b> de inmediato: alguien que estaba en Oro puede volver a Plata. El primer nivel arranca siempre en 0 y por eso no se edita.
      </div>`;
  }

  async function guardarParamNivel(nombre) {
    const msg = document.getElementById('nv-' + nombre + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const min = Number((document.getElementById('nv-' + nombre + '-min')?.value || '').trim());
    if (!Number.isFinite(min) || min < 0) { decir('⚠️ Tiene que ser un número mayor o igual a 0', '#BE123C'); return; }

    // Los umbrales tienen que quedar en orden estricto: si dos niveles
    // empatan o se cruzan, nivel_para_puntos() elige por min_puntos desc y
    // uno de los dos se vuelve inalcanzable, sin que nada falle.
    const filas = await PronetDB.listarLoyaltyNiveles().catch(() => []);
    const i = filas.findIndex(f => f.nombre === nombre);
    const anterior = filas[i - 1], siguiente = filas[i + 1];
    if (anterior && min <= anterior.min_puntos) {
      decir('⚠️ Tiene que ser mayor que ' + anterior.nombre + ' (' + anterior.min_puntos + ')', '#BE123C'); return;
    }
    if (siguiente && min >= siguiente.min_puntos) {
      decir('⚠️ Tiene que ser menor que ' + siguiente.nombre + ' (' + siguiente.min_puntos + ')', '#BE123C'); return;
    }

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarLoyaltyNivel(nombre, { min_puntos: min });
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error'), '#BE123C'); return; }
    await cargarNivelesLoyalty();
    renderParamNiveles();
  }
  window.guardarParamNivel = guardarParamNivel;

  // ══ PARAMETRÍAS · BANNERS PUBLICITARIOS ════════════════════════════

  /** Un banner vencido o futuro sigue existiendo, pero no se muestra. Que
   *  el panel lo diga evita el "lo cargué y no aparece". */
  function estadoBanner(b) {
    const ahora = Date.now();
    if (!b.activo)                                 return { txt: 'Apagado',  bg: 'var(--surface)', color: 'var(--ink3)' };
    if (b.hasta && new Date(b.hasta) < ahora)      return { txt: 'Vencido',  bg: '#FFF1F2', color: '#BE123C' };
    if (b.desde && new Date(b.desde) > ahora)      return { txt: 'Programado', bg: '#FEF3C7', color: '#92400E' };
    return { txt: 'Al aire', bg: 'var(--green-s)', color: 'var(--green)' };
  }

  const soloFecha = (iso) => iso ? iso.slice(0, 10) : '';

  async function renderParamBanners() {
    const wrap = document.getElementById('param-banners-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const filas = await PronetDB.listarBanners().catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:40px 18px;text-align:center;font-size:13px;color:var(--ink3);line-height:1.6">' +
        'Todavía no hay publicidad cargada.<br>El carrusel no se muestra hasta que haya al menos una.</div>';
      return;
    }

    wrap.innerHTML = filas.map(b => {
      const est = estadoBanner(b);
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:11px">' +
        '<img src="' + escHTML(b.imagen_url) + '" alt="" style="display:block;width:100%;aspect-ratio:16/7;object-fit:cover;background:var(--surface)">' +
        '<div style="padding:12px 13px">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
            '<div style="flex:1;font-size:13.5px;font-weight:800;color:var(--ink)">' + escHTML(b.nombre) + '</div>' +
            '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:' + est.bg + ';color:' + est.color + '">' + est.txt + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--ink3);margin-bottom:8px">' +
            '👆 ' + (b.clicks || 0) + ' click' + (b.clicks === 1 ? '' : 's') +
            (b.enlace ? ' · ' + escHTML(b.enlace) : ' · sin enlace') +
          '</div>' +
          '<div class="pa-row"><span class="pa-lbl">Orden</span>' +
            '<input id="bn-' + b.id + '-orden" class="pa-in" style="width:70px;text-align:right" inputmode="numeric" value="' + escHTML(String(b.orden)) + '"></div>' +
          '<div class="pa-row"><span class="pa-lbl">Desde</span>' +
            '<input id="bn-' + b.id + '-desde" class="pa-in" style="width:140px" type="date" value="' + soloFecha(b.desde) + '"></div>' +
          '<div class="pa-row"><span class="pa-lbl">Hasta</span>' +
            '<input id="bn-' + b.id + '-hasta" class="pa-in" style="width:140px" type="date" value="' + soloFecha(b.hasta) + '"></div>' +
          '<div id="bn-' + b.id + '-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>' +
          '<div style="display:flex;gap:8px">' +
            '<button onclick="guardarBannerUI(\'' + b.id + '\')" style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>' +
            '<button onclick="toggleBannerUI(\'' + b.id + '\',' + (b.activo ? 'false' : 'true') + ')" style="flex:1;background:' + (b.activo ? 'var(--surface)' : 'var(--green-s)') + ';color:' + (b.activo ? 'var(--ink2)' : 'var(--green)') + ';border:1px solid var(--border);border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">' + (b.activo ? 'Apagar' : 'Prender') + '</button>' +
            '<button onclick="borrarBannerUI(\'' + b.id + '\')" aria-label="Borrar" style="background:white;color:#BE123C;border:1.5px solid #FECDD3;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">🗑</button>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  /** Las fechas del <input type="date"> vienen sin hora. "Hasta el 31" tiene
   *  que incluir el 31 entero, no cortar a las 00:00 de ese día. */
  function fechaDesde(v) { return v ? new Date(v + 'T00:00:00').toISOString() : null; }
  function fechaHasta(v) { return v ? new Date(v + 'T23:59:59').toISOString() : null; }

  async function guardarBannerUI(id) {
    const msg = document.getElementById('bn-' + id + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const orden = Number((document.getElementById('bn-' + id + '-orden')?.value || '').trim());
    if (!Number.isFinite(orden)) { decir('⚠️ El orden tiene que ser un número', '#BE123C'); return; }
    const desde = document.getElementById('bn-' + id + '-desde')?.value || '';
    const hasta = document.getElementById('bn-' + id + '-hasta')?.value || '';
    if (desde && hasta && desde > hasta) { decir('⚠️ "Desde" no puede ser posterior a "Hasta"', '#BE123C'); return; }

    const r = await PronetDB.guardarBanner(id, {
      orden, desde: fechaDesde(desde), hasta: fechaHasta(hasta),
    });
    if (!r.ok) { decir('⚠️ ' + r.error, '#BE123C'); return; }
    decir('✅ Guardado', 'var(--green)');
    renderParamBanners();
  }
  window.guardarBannerUI = guardarBannerUI;

  async function toggleBannerUI(id, activo) {
    const r = await PronetDB.guardarBanner(id, { activo });
    if (!r.ok) { showToast && showToast('⚠️ ' + r.error); return; }
    renderParamBanners();
  }
  window.toggleBannerUI = toggleBannerUI;

  async function borrarBannerUI(id) {
    if (!confirm('¿Borrar esta publicidad? No se puede deshacer.')) return;
    const r = await PronetDB.borrarBanner(id);
    if (!r.ok) { showToast && showToast('⚠️ ' + r.error); return; }
    showToast && showToast('🗑 Publicidad borrada');
    renderParamBanners();
  }
  window.borrarBannerUI = borrarBannerUI;

  function abrirAltaBanner() {
    const cont = document.getElementById('param-banner-alta');
    if (!cont) return;
    if (cont.style.display !== 'none') { cont.style.display = 'none'; cont.innerHTML = ''; return; }
    cont.innerHTML =
      '<div class="param-alta-card">' +
        '<div style="font-size:13.5px;font-weight:800;color:var(--ink);margin-bottom:4px">Nueva publicidad</div>' +
        '<div class="pa-row"><span class="pa-lbl">Nombre (interno)</span>' +
          '<input id="nb-nombre" class="pa-in" style="width:150px" placeholder="Coffee House marzo"></div>' +
        '<div class="pa-row"><span class="pa-lbl">Enlace al tocar</span>' +
          '<input id="nb-enlace" class="pa-in" style="width:150px" placeholder="https://… o #s-mercado"></div>' +
        '<div class="pa-row"><span class="pa-lbl">Desde</span>' +
          '<input id="nb-desde" class="pa-in" style="width:140px" type="date"></div>' +
        '<div class="pa-row"><span class="pa-lbl">Hasta</span>' +
          '<input id="nb-hasta" class="pa-in" style="width:140px" type="date"></div>' +
        '<div style="padding:7px 0">' +
          '<div style="font-size:12.5px;color:var(--ink);margin-bottom:5px">Imagen</div>' +
          '<input id="nb-img" type="file" accept="image/*" style="font-size:12px;width:100%">' +
          '<div style="font-size:10.5px;color:var(--ink3);margin-top:4px;line-height:1.5">Se recorta a 16:7, así que lo importante tiene que estar centrado. Ideal 1200×525.</div>' +
        '</div>' +
        '<div id="nb-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button id="nb-crear" onclick="crearBannerUI()" style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Crear</button>' +
          '<button onclick="abrirAltaBanner()" style="flex:1;background:var(--surface);color:var(--ink2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Cancelar</button>' +
        '</div>' +
      '</div>';
    cont.style.display = 'block';
  }
  window.abrirAltaBanner = abrirAltaBanner;

  async function crearBannerUI() {
    const msg = document.getElementById('nb-msg');
    const btn = document.getElementById('nb-crear');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };

    const nombre = (document.getElementById('nb-nombre')?.value || '').trim();
    const enlace = (document.getElementById('nb-enlace')?.value || '').trim();
    const desde  = document.getElementById('nb-desde')?.value || '';
    const hasta  = document.getElementById('nb-hasta')?.value || '';
    const file   = document.getElementById('nb-img')?.files?.[0];

    if (!nombre) return decir('⚠️ Poné un nombre para reconocerla acá', '#BE123C');
    if (!file)   return decir('⚠️ Falta la imagen', '#BE123C');
    // 3 MB: más que eso tarda en cargar justo arriba de todo, que es donde
    // más se nota.
    if (file.size > 3 * 1024 * 1024) return decir('⚠️ La imagen no puede pesar más de 3 MB', '#BE123C');
    if (desde && hasta && desde > hasta) return decir('⚠️ "Desde" no puede ser posterior a "Hasta"', '#BE123C');

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Subiendo…'; }
    const sub = await PronetDB.subirImagenBanner(file);
    if (!sub.ok) { if (btn) { btn.disabled = false; btn.textContent = 'Crear'; } return decir('⚠️ ' + sub.error, '#BE123C'); }

    const r = await PronetDB.crearBanner({
      nombre, imagen_url: sub.url, enlace: enlace || null,
      desde: fechaDesde(desde), hasta: fechaHasta(hasta),
      orden: 100, activo: true,
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Crear'; }
    if (!r.ok) return decir('⚠️ ' + r.error, '#BE123C');

    showToast && showToast('✅ Publicidad creada');
    abrirAltaBanner();          // cierra el formulario
    renderParamBanners();
  }
  window.crearBannerUI = crearBannerUI;

  // ══ PARAMETRÍAS · CATEGORÍAS DE ENTRE VECINOS ══════════════════════

  async function renderParamMktCats() {
    const wrap = document.getElementById('param-mktcats-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const filas = await PronetDB.listarMktCategorias(false).catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:32px 18px;text-align:center;font-size:13px;color:#BE123C">⚠️ No se pudieron cargar las categorías.</div>';
      return;
    }

    // Cuántas publicaciones usa cada una: es lo que decide si darla de baja
    // molesta a alguien. La FK impide borrarla si tiene publicaciones, así
    // que el conteo también explica por qué el borrado fallaría.
    let uso = {};
    try {
      const { data } = await window._sb.from('publicaciones').select('categoria');
      (data || []).forEach(p => { uso[p.categoria] = (uso[p.categoria] || 0) + 1; });
    } catch (e) { /* informativo */ }

    const bloque = (tipo, titulo) => {
      const cats = filas.filter(c => c.tipo === tipo);
      if (!cats.length) return '';
      return '<div style="font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 8px">' +
        escHTML(titulo) + '</div>' +
        cats.map(c => {
          const n = uso[c.slug] || 0;
          return '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:12px 13px;margin-bottom:9px' +
            (c.activo ? '' : ';opacity:.6') + '">' +
            '<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">' +
              '<span style="font-size:19px">' + escHTML(c.emoji) + '</span>' +
              '<div style="flex:1">' +
                '<div style="font-size:13.5px;font-weight:800;color:var(--ink)">' + escHTML(c.nombre) + '</div>' +
                '<div style="font-size:10.5px;color:var(--ink3);margin-top:1px">' + escHTML(c.slug) +
                  ' · ' + (n ? n + ' ' + (n === 1 ? 'publicación' : 'publicaciones') : 'sin publicaciones') + '</div>' +
              '</div>' +
              (c.activo ? '' : '<span style="font-size:10px;font-weight:700;background:var(--surface);color:var(--ink3);border-radius:6px;padding:3px 7px">Inactiva</span>') +
            '</div>' +
            '<div class="pa-row"><span class="pa-lbl">Orden</span>' +
              '<input id="mc-' + escHTML(c.slug) + '-orden" class="pa-in" style="width:70px;text-align:right" inputmode="numeric" value="' + escHTML(String(c.orden)) + '"></div>' +
            '<div id="mc-' + escHTML(c.slug) + '-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:4px 0"></div>' +
            '<div style="display:flex;gap:8px">' +
              '<button onclick="guardarMktCatUI(\'' + escHTML(c.slug) + '\')" style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>' +
              '<button onclick="toggleMktCatUI(\'' + escHTML(c.slug) + '\',' + (c.activo ? 'false' : 'true') + ')" style="flex:1;background:' + (c.activo ? 'var(--surface)' : 'var(--green-s)') + ';color:' + (c.activo ? 'var(--ink2)' : 'var(--green)') + ';border:1px solid var(--border);border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">' +
                (c.activo ? 'Dar de baja' : 'Reactivar') + '</button>' +
            '</div></div>';
        }).join('');
    };

    wrap.innerHTML =
      bloque('servicio', '🛠️ Servicios del Barrio') +
      bloque('producto', '🛒 Mercado del Barrio') +
      '<div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">' +
      'Dar de baja una categoría la saca de los chips y del selector al publicar, pero <b>no toca las publicaciones que ya la usan</b>: siguen visibles con su nombre. Para moverlas hay que editarlas una por una.</div>';
  }

  async function guardarMktCatUI(slug) {
    const msg = document.getElementById('mc-' + slug + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const orden = Number((document.getElementById('mc-' + slug + '-orden')?.value || '').trim());
    if (!Number.isFinite(orden)) { decir('⚠️ El orden tiene que ser un número', '#BE123C'); return; }
    const r = await PronetDB.guardarMktCategoria(slug, { orden });
    if (!r.ok) { decir('⚠️ ' + r.error, '#BE123C'); return; }
    decir('✅ Guardado', 'var(--green)');
    mktCatsCargadas = false;
    await cargarMktCategorias();
    renderParamMktCats();
  }
  window.guardarMktCatUI = guardarMktCatUI;

  async function toggleMktCatUI(slug, activo) {
    const r = await PronetDB.guardarMktCategoria(slug, { activo });
    if (!r.ok) { showToast && showToast('⚠️ ' + r.error); return; }
    mktCatsCargadas = false;
    await cargarMktCategorias();
    renderParamMktCats();
  }
  window.toggleMktCatUI = toggleMktCatUI;

  // ══ PARAMETRÍAS · ALTA DE FILAS ════════════════════════════════════
  //
  // Hasta acá las tres pantallas sólo editaban lo que ya existía: sumar un
  // rubro, un barrio o un nivel pedía SQL. Esto cierra el ABM.
  //
  // Planes quedó AFUERA a propósito. `planes_limites` guarda precios y
  // límites, pero el comportamiento del plan —badge en la búsqueda,
  // desempate en el ranking, acceso a estadísticas— vive en el array fijo
  // `PRONET_CONFIG.PLANES` de config.js, y la pantalla de suscripción se
  // arma desde ahí. Una fila nueva en la tabla no la mostraría el checkout,
  // no la vendería MercadoPago, y esta misma pantalla la filtraría. Un plan
  // nuevo es un cambio de código, no un alta de datos: un botón acá sería
  // un botón que miente.

  /** Pasa "Puertos del Lago" → "puertos-del-lago". El slug es la clave con
   *  la que se cruzan rubro de pedido y rubro de prestador. */
  function slugificar(txt) {
    return (txt || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca tildes
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const ALTA_FORMS = {
    rubro: {
      contenedor: 'param-rubro-alta',
      titulo: 'Nuevo rubro',
      // El SVG y los colores no se piden: un path inválido rompe el render
      // de los chips en todas las pantallas y no hay forma razonable de
      // validarlo desde un input. Con emoji alcanza para que se vea bien.
      campos: [
        { id: 'nombre', lbl: 'Nombre',  tipo: 'text', ancho: '150px', ph: 'Cerrajería' },
        { id: 'emoji',  lbl: 'Ícono',   tipo: 'text', ancho: '60px',  ph: '🔑' },
        { id: 'min',    lbl: 'Precio de referencia · desde', tipo: 'num', ancho: '96px', ph: '30000' },
        { id: 'max',    lbl: 'Precio de referencia · hasta', tipo: 'num', ancho: '96px', ph: '500000' },
        { id: 'esp',    lbl: 'Especialidades', tipo: 'text', ancho: '150px', ph: 'Separadas por coma' },
      ],
      nota: 'El slug se arma solo con el nombre. El ícono de color se ajusta después por SQL.',
      async guardar(v) {
        if (!v.nombre) return { ok: false, error: 'Falta el nombre' };
        const min = Number(v.min || 30000), max = Number(v.max || 500000);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return { ok: false, error: 'Los precios tienen que ser números' };
        if (min >= max) return { ok: false, error: 'El mínimo tiene que ser menor que el máximo' };
        return PronetDB.crearRubro({
          slug: slugificar(v.nombre), nombre: v.nombre,
          emoji: v.emoji || '📋', precio_min: min, precio_max: max,
          especialidades: (v.esp || '').split(',').map(s => s.trim()).filter(Boolean),
          activo: true,
        });
      },
      refrescar: () => { cargarRubrosDeLaBase?.(); renderParamRubros(); },
    },

    zona: {
      contenedor: 'param-zona-alta',
      titulo: 'Nueva zona o barrio',
      campos: [
        { id: 'nombre', lbl: 'Nombre',    tipo: 'text', ancho: '150px', ph: 'Puertos · Acacias' },
        { id: 'madre',  lbl: 'Agrupa con', tipo: 'madre', ancho: '150px' },
        { id: 'lat',    lbl: 'Latitud',   tipo: 'text', ancho: '110px', ph: '-34.3521' },
        { id: 'lng',    lbl: 'Longitud',  tipo: 'text', ancho: '110px', ph: '-58.7935' },
      ],
      nota: 'Sin coordenadas la zona funciona igual, pero no se dibuja en el mapa de ProMarket.',
      async guardar(v) {
        if (!v.nombre) return { ok: false, error: 'Falta el nombre' };
        if (!v.madre)  return { ok: false, error: 'Elegí con qué zona se agrupa' };
        const num = (s) => { const n = Number(s); return s && Number.isFinite(n) ? n : null; };
        return PronetDB.crearZona({
          nombre: v.nombre, madre: v.madre,
          lat: num(v.lat), lng: num(v.lng),
          orden: 500,           // al final; el orden fino se ajusta después
          activo: true,
        });
      },
      refrescar: () => { cargarZonasDeLaBase?.(); renderParamZonas(); },
    },

    mktcat: {
      contenedor: 'param-mktcat-alta',
      titulo: 'Nueva categoría',
      campos: [
        { id: 'nombre', lbl: 'Nombre', tipo: 'text', ancho: '150px', ph: 'Costura y arreglos' },
        { id: 'emoji',  lbl: 'Ícono',  tipo: 'text', ancho: '60px',  ph: '🧵' },
        { id: 'tipo',   lbl: 'Sección', tipo: 'select', ancho: '150px',
          opciones: [{ v: 'servicio', t: '🛠️ Servicios del Barrio' },
                     { v: 'producto', t: '🛒 Mercado del Barrio' }] },
      ],
      nota: 'La sección decide en cuál de las dos pestañas aparece. El prestador sólo ve las de Servicios.',
      async guardar(v) {
        if (!v.nombre) return { ok: false, error: 'Falta el nombre' };
        return PronetDB.crearMktCategoria({
          slug: slugificar(v.nombre), nombre: v.nombre,
          emoji: v.emoji || '📦', tipo: v.tipo || 'servicio',
          orden: 500, activo: true,
        });
      },
      refrescar: async () => { mktCatsCargadas = false; await cargarMktCategorias(); renderParamMktCats(); },
    },

    nivel: {
      contenedor: 'param-nivel-alta',
      titulo: 'Nuevo nivel',
      campos: [
        { id: 'nombre', lbl: 'Nombre', tipo: 'text', ancho: '150px', ph: 'Diamante' },
        { id: 'emoji',  lbl: 'Ícono',  tipo: 'text', ancho: '60px',  ph: '💎' },
        { id: 'min',    lbl: 'Desde (puntos)', tipo: 'num', ancho: '110px', ph: '10000' },
      ],
      nota: 'El orden se calcula por los puntos: el nivel se ubica solo donde corresponde.',
      async guardar(v) {
        if (!v.nombre) return { ok: false, error: 'Falta el nombre' };
        const min = Number(v.min);
        if (!Number.isFinite(min) || min < 0) return { ok: false, error: 'Los puntos tienen que ser un número positivo' };
        // Dos niveles con el mismo umbral dejarían la clasificación
        // indefinida: no habría forma de decir a cuál pertenece alguien.
        const actuales = await PronetDB.listarLoyaltyNiveles().catch(() => []);
        if (actuales.some(n => n.min_puntos === min)) {
          return { ok: false, error: 'Ya hay un nivel que arranca en esos puntos' };
        }
        // `orden` va provisorio: crearLoyaltyNivel() renumera todo por puntos.
        return PronetDB.crearLoyaltyNivel({
          nombre: v.nombre, emoji: v.emoji || '🏅', min_puntos: min, orden: 999,
        });
      },
      refrescar: () => { cargarNivelesLoyalty?.(); renderParamNiveles(); },
    },
  };

  function abrirAltaParam(tipo) {
    const cfg = ALTA_FORMS[tipo];
    const cont = document.getElementById(cfg?.contenedor);
    if (!cfg || !cont) return;
    // Segundo toque: cierra. Evita tener que buscar el botón Cancelar.
    if (cont.style.display !== 'none') { cont.style.display = 'none'; cont.innerHTML = ''; return; }

    const fila = (c) => {
      if (c.tipo === 'select') {
        return '<div class="pa-row"><span class="pa-lbl">' + escHTML(c.lbl) + '</span>' +
          '<select id="alta-' + tipo + '-' + c.id + '" class="pa-in" style="width:' + c.ancho + '">' +
          c.opciones.map(o => '<option value="' + escHTML(o.v) + '">' + escHTML(o.t) + '</option>').join('') +
          '</select></div>';
      }
      if (c.tipo === 'madre') {
        // Las madres salen de las zonas que ya hay: escribirlas a mano es
        // como se generan los grupos huérfanos que no filtran nada.
        const madres = [...new Set(Object.values(ZONA_DB || {}))].sort();
        return '<div class="pa-row"><span class="pa-lbl">' + escHTML(c.lbl) + '</span>' +
          '<select id="alta-' + tipo + '-' + c.id + '" class="pa-in" style="width:' + c.ancho + '">' +
          '<option value="">Elegir…</option>' +
          madres.map(m => '<option value="' + escHTML(m) + '">' + escHTML(m) + '</option>').join('') +
          '</select></div>';
      }
      return '<div class="pa-row"><span class="pa-lbl">' + escHTML(c.lbl) + '</span>' +
        '<input id="alta-' + tipo + '-' + c.id + '" class="pa-in" style="width:' + c.ancho + '"' +
        (c.tipo === 'num' ? ' inputmode="numeric"' : '') +
        ' placeholder="' + escHTML(c.ph || '') + '" autocomplete="off"></div>';
    };

    cont.innerHTML =
      '<div class="param-alta-card">' +
        '<div style="font-size:13.5px;font-weight:800;color:var(--ink);margin-bottom:4px">' + escHTML(cfg.titulo) + '</div>' +
        cfg.campos.map(fila).join('') +
        '<div style="font-size:10.5px;color:var(--ink3);margin-top:6px;line-height:1.5">' + escHTML(cfg.nota) + '</div>' +
        '<div id="alta-' + tipo + '-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="guardarAltaParam(\'' + tipo + '\')" style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Crear</button>' +
          '<button onclick="abrirAltaParam(\'' + tipo + '\')" style="flex:1;background:var(--surface);color:var(--ink2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Cancelar</button>' +
        '</div>' +
      '</div>';
    cont.style.display = 'block';
    document.getElementById('alta-' + tipo + '-' + cfg.campos[0].id)?.focus();
  }
  window.abrirAltaParam = abrirAltaParam;

  async function guardarAltaParam(tipo) {
    const cfg = ALTA_FORMS[tipo];
    const msg = document.getElementById('alta-' + tipo + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    decir('', '');

    const v = {};
    cfg.campos.forEach(c => {
      v[c.id] = (document.getElementById('alta-' + tipo + '-' + c.id)?.value || '').trim();
    });

    const r = await cfg.guardar(v);
    if (!r?.ok) { decir('⚠️ ' + (r?.error || 'No se pudo crear'), '#BE123C'); return; }

    decir('✅ Creado', 'var(--green)');
    // El catálogo en memoria también se recarga: si no, la fila nueva existe
    // en la base pero no aparece en los selectores hasta recargar la app.
    await cfg.refrescar();
    const cont = document.getElementById(cfg.contenedor);
    if (cont) { cont.style.display = 'none'; cont.innerHTML = ''; }
    showToast && showToast('✅ ' + cfg.titulo.replace('Nuevo ', '').replace('Nueva ', '') + ' creado');
  }
  window.guardarAltaParam = guardarAltaParam;

  // ══ ADMIN · VERIFICACIÓN DE PRESTADORES ════════════════════════════
  //
  // Es la mitad que le da sentido al formulario del prestador: sin alguien
  // que mire, el sello seguiría significando "completó campos".

  let filtroVerif = 'pendiente';

  function filtrarVerif(estado, el) {
    filtroVerif = estado;
    el?.parentElement?.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    el?.classList.add('on');
    renderVerificaciones();
  }
  window.filtrarVerif = filtrarVerif;

  async function renderVerificaciones() {
    const wrap = document.getElementById('verif-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const filas = await PronetDB.listarVerificaciones(filtroVerif).catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:40px 14px;text-align:center;font-size:13px;color:var(--ink3)">' +
        (filtroVerif === 'pendiente' ? 'No hay solicitudes esperando.' : 'Nada por acá.') + '</div>';
      actualizarBadgeVerif();
      return;
    }

    wrap.innerHTML = filas.map(f => {
      const p = f.prestadores || {};
      const fecha = f.creado ? new Date(f.creado).toLocaleDateString('es-AR') : '';
      const dato = (lbl, val) =>
        '<div style="display:flex;gap:8px;margin-top:5px">' +
          '<div style="font-size:11px;color:var(--ink3);min-width:74px">' + lbl + '</div>' +
          '<div style="font-size:12.5px;color:var(--ink);font-weight:600;flex:1">' + escHTML(val || '—') + '</div>' +
        '</div>';

      // Los botones sólo tienen sentido sobre lo pendiente: una vez resuelta,
      // la fila queda como registro de quién revisó y cuándo.
      const acciones = f.estado !== 'pendiente' ? '' :
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button onclick="resolverVerifUI(\'' + f.prestador_id + '\',true)" style="flex:1;padding:10px;background:var(--green);color:white;border:none;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">✓ Verificar</button>' +
          '<button onclick="resolverVerifUI(\'' + f.prestador_id + '\',false)" style="flex:1;padding:10px;background:white;color:#BE123C;border:1.5px solid #FECDD3;border-radius:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Rechazar</button>' +
        '</div>';

      return '<div style="background:white;border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="flex:1;font-size:14px;font-weight:700;color:var(--ink)">' + escHTML(p.nombre || 'Prestador') + '</div>' +
          '<div style="font-size:10.5px;color:var(--ink3)">' + fecha + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--ink3);margin-top:2px">' +
          escHTML(p.rubro || 'Sin rubro') + ' · ' + escHTML(p.zona || 'Sin zona') + '</div>' +
        '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">' +
          dato('Nombre', f.nombre_completo) + dato('DNI', f.dni) + dato('Dirección', f.direccion) +
        '</div>' +
        (f.motivo_rechazo ? '<div style="margin-top:8px;font-size:11.5px;color:#BE123C">Motivo: ' + escHTML(f.motivo_rechazo) + '</div>' : '') +
        acciones +
      '</div>';
    }).join('');
    actualizarBadgeVerif();
  }

  /** Cuántas esperan. Se pinta en la fila del panel para que no haya que
   *  entrar a la pantalla para saber si hay trabajo pendiente. */
  async function actualizarBadgeVerif() {
    const badge = document.getElementById('verif-badge');
    if (!badge) return;
    const pend = await PronetDB.listarVerificaciones('pendiente').catch(() => []);
    badge.textContent = pend.length;
    badge.style.display = pend.length ? '' : 'none';
  }

  async function resolverVerifUI(prestadorId, aprobar) {
    let motivo = null;
    if (!aprobar) {
      motivo = prompt('¿Por qué se rechaza? (lo va a leer el prestador)');
      if (motivo === null) return;   // canceló
    }
    const r = await PronetDB.resolverVerificacion(prestadorId, aprobar, motivo);
    if (!r?.ok) { showToast && showToast('⚠️ ' + (r?.error || 'No se pudo resolver')); return; }
    showToast && showToast(aprobar ? '✅ Prestador verificado' : '❌ Solicitud rechazada');
    renderVerificaciones();
  }
  window.resolverVerifUI = resolverVerifUI;

  // ══ PARAMETRÍAS · ZONAS Y BARRIOS ══════════════════════════════════
  async function renderParamZonas() {
    const wrap = document.getElementById('param-zonas-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando zonas…</div>';

    const filas = await PronetDB.listarZonas(false).catch(() => []);
    if (!filas.length) {
      wrap.innerHTML = '<div style="padding:32px 18px;text-align:center;font-size:13px;color:#BE123C">⚠️ No se pudieron cargar las zonas.</div>';
      return;
    }

    // Cuánto se usa cada zona: decide si dar de baja duele.
    const uso = {};
    try {
      const peds = await PronetDB.listar('pedidos');
      peds.forEach(p => { if (p.zona) uso[p.zona] = (uso[p.zona] || 0) + 1; });
    } catch (e) { /* informativo */ }

    const madres = [...new Set(filas.map(z => z.madre))];

    wrap.innerHTML = filas.map(z => `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:13px 14px;margin-bottom:10px${z.activo ? '' : ';opacity:.6'}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <span style="font-size:18px">${z.nombre === z.madre ? '🏙️' : '🏘️'}</span>
          <div style="flex:1">
            <div style="font-size:13.5px;font-weight:800;color:var(--ink)">${escHTML(z.nombre)}</div>
            <div style="font-size:10.5px;color:var(--ink3);margin-top:1px">${uso[z.nombre] ? uso[z.nombre] + ' pedido' + (uso[z.nombre] > 1 ? 's' : '') : 'sin pedidos'}</div>
          </div>
          ${z.activo ? '' : '<span style="font-size:10px;font-weight:700;background:var(--surface);color:var(--ink3);border-radius:6px;padding:3px 7px">Inactiva</span>'}
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border)">
          <span style="flex:1;font-size:12.5px;color:var(--ink)">Se agrupa en</span>
          <select id="zn-${escHTML(z.nombre)}-madre"
                  style="font-size:12.5px;font-weight:600;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink);background:white">
            ${madres.map(m => `<option value="${escHTML(m)}"${m === z.madre ? ' selected' : ''}>${escHTML(m)}</option>`).join('')}
          </select>
        </div>
        <div id="zn-${escHTML(z.nombre)}-msg" style="font-size:11.5px;font-weight:600;min-height:16px;margin:6px 0"></div>
        <div style="display:flex;gap:8px">
          <button onclick="guardarParamZona('${escHTML(z.nombre).replace(/'/g, '&#39;')}')"
                  style="flex:1;background:var(--blue);color:white;border:none;border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>
          <button onclick="toggleZonaActiva('${escHTML(z.nombre).replace(/'/g, '&#39;')}', ${z.activo ? 'false' : 'true'})"
                  style="flex:1;background:${z.activo ? 'var(--surface)' : 'var(--green-s)'};color:${z.activo ? 'var(--ink2)' : 'var(--green)'};border:1px solid var(--border);border-radius:10px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">
            ${z.activo ? 'Dar de baja' : 'Reactivar'}
          </button>
        </div>
      </div>`).join('') + `
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5">
        La <b>zona madre</b> es con la que se agrupa al filtrar: un pedido de Puertos del Lago le aparece a un prestador que cubre Escobar. Las coordenadas del mapa se editan por SQL — un valor mal puesto manda el pin a otra provincia.
      </div>`;
  }

  async function guardarParamZona(nombre) {
    const msg = document.getElementById('zn-' + nombre + '-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };
    const madre = document.getElementById('zn-' + nombre + '-madre')?.value;
    if (!madre) { decir('⚠️ Elegí una zona madre', '#BE123C'); return; }

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarZona(nombre, { madre });
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error'), '#BE123C'); return; }
    await cargarZonasDeLaBase();
    decir('✅ Guardado', 'var(--green)');
    setTimeout(() => decir('', ''), 2500);
  }
  window.guardarParamZona = guardarParamZona;

  async function toggleZonaActiva(nombre, activar) {
    const r = await PronetDB.guardarZona(nombre, { activo: activar });
    if (!r?.ok) { alert('No se pudo cambiar el estado: ' + (r?.error || 'error')); return; }
    await cargarZonasDeLaBase();
    renderParamZonas();
  }
  window.toggleZonaActiva = toggleZonaActiva;

  // ══ FUNCIONALIDADES · prender y apagar ═════════════════════════════
  //
  // Separado de las parametrías a propósito: esto no configura datos del
  // negocio, prende y apaga partes de la app.
  //
  // Los de NIVEL 1 no se exponen. Apagar `home`, `chat` o `bolsaTrabajo`
  // deja la app inutilizable, y como el panel vive dentro de la app, el
  // admin podría quedarse sin forma de volver a prenderlos.
  const FEATURES_EDITABLES = [
    { k: 'badgeVerificado',   n: 'Badge de verificado',    d: 'Escudo verde en los prestadores verificados' },
    { k: 'suscripcionPro',    n: 'Planes y suscripciones', d: 'Pantalla de planes y todo el circuito de pago' },
    { k: 'catalogoPrecios',   n: 'Catálogo de precios',    d: 'Precios referenciales en las fichas' },
    { k: 'editarPerfilPro',   n: 'Perfil profesional',     d: 'Edición completa e historial de trabajos' },
    { k: 'denuncias',         n: 'Denuncias y moderación', d: 'Reportar usuarios y panel de moderación' },
    { k: 'loyalty',           n: 'PRONET Points',          d: 'Programa de puntos y canjes' },
    { k: 'analyticsAvanzado', n: 'Analítica avanzada',     d: 'Métricas detalladas para el prestador' },
    { k: 'tutorialOnboarding', n: 'Tutorial de bienvenida', d: 'Guía de 4 pasos en el primer ingreso' },
    // `mercadoPlaza` NO va acá: ya tiene su propio interruptor en
    // "Configuración de la app", que escribe en config_app.promarket_activo.
    // Ponerlo también en esta lista daría dos switches para lo mismo
    // guardando en claves distintas, y el que se aplicara último ganaría.
  ];

  async function renderParamFeatures() {
    const wrap = document.getElementById('param-features-lista');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    const apagadas = await PronetDB.listarFeaturesApagadas().catch(() => []);
    const off = new Set(apagadas);

    wrap.innerHTML = `
      <div style="background:var(--blue-s);border:1px solid rgba(43,91,255,.15);border-radius:12px;padding:11px 13px;font-size:11.5px;color:var(--blue);line-height:1.5;margin-bottom:12px">
        Estos interruptores afectan a <b>todos los usuarios</b>. Antes esta configuración se guardaba sólo en este dispositivo.
      </div>
      ${FEATURES_EDITABLES.map(f => `
        <div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:13px 14px;margin-bottom:9px;display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:var(--ink)">${escHTML(f.n)}</div>
            <div style="font-size:11px;color:var(--ink3);margin-top:2px;line-height:1.4">${escHTML(f.d)}</div>
          </div>
          <div role="switch" tabindex="0" aria-checked="${off.has(f.k) ? 'false' : 'true'}"
               aria-label="${escHTML(f.n)}"
               id="ft-${escHTML(f.k)}" onclick="toggleParamFeature('${escHTML(f.k)}')"
               style="width:46px;height:27px;border-radius:99px;flex-shrink:0;cursor:pointer;position:relative;transition:background .18s;background:${off.has(f.k) ? 'var(--border)' : 'var(--green)'}">
            <div style="position:absolute;top:3px;left:${off.has(f.k) ? '3px' : '22px'};width:21px;height:21px;border-radius:50%;background:white;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>
          </div>
        </div>`).join('')}
      <div id="ft-msg" style="font-size:12px;font-weight:600;text-align:center;min-height:18px;margin-top:6px"></div>
      <div style="background:var(--gold-s);border:1px solid #FDE68A;border-radius:12px;padding:11px 13px;font-size:11.5px;color:#92400E;line-height:1.5;margin-top:10px">
        Las funciones del núcleo (inicio, buscar, chat, pedidos, perfil) no se pueden apagar desde acá: sin ellas la app no funciona y no habría forma de volver a prenderlas.
      </div>`;
  }

  async function toggleParamFeature(clave) {
    const msg = document.getElementById('ft-msg');
    const decir = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c; } };

    const apagadas = new Set(await PronetDB.listarFeaturesApagadas().catch(() => []));
    const estabaApagada = apagadas.has(clave);
    if (estabaApagada) apagadas.delete(clave); else apagadas.add(clave);

    decir('Guardando…', 'var(--ink3)');
    const r = await PronetDB.guardarFeaturesApagadas([...apagadas]);
    if (!r?.ok) { decir('⚠️ No se pudo guardar: ' + (r?.error || 'error'), '#BE123C'); return; }

    // Aplicar en vivo: sin esto el admin apaga algo y lo sigue viendo hasta
    // recargar, y no sabe si guardó o no.
    if (clave in FEATURES) FEATURES[clave] = estabaApagada;
    aplicarFeatureFlags();
    // El await importa: renderParamFeatures() reescribe el contenedor
    // entero, así que poner el mensaje antes lo borraría.
    await renderParamFeatures();
    const msg2 = document.getElementById('ft-msg');
    if (msg2) {
      msg2.textContent = estabaApagada ? '✅ Activada para todos' : '✅ Desactivada para todos';
      msg2.style.color = 'var(--green)';
      setTimeout(() => { const m = document.getElementById('ft-msg'); if (m) m.textContent = ''; }, 2500);
    }
  }
  window.toggleParamFeature = toggleParamFeature;

  function renderConfigAdmin() {
    const chk = document.getElementById('cfg-planes-pagos');
    const est = document.getElementById('cfg-planes-estado');
    const on  = planesPagosActivos();
    if (chk) chk.checked = on;
    if (est) {
      est.textContent = on
        ? 'Activados · los usuarios pueden contratar Plus y Pro'
        : 'Desactivados · etapa fundadora, solo Base con límites de Plus';
      est.style.color = on ? 'var(--green)' : 'var(--ink3)';
    }

    const chkMp = document.getElementById('cfg-mp-checkout');
    const estMp = document.getElementById('cfg-mp-estado');
    const mpOn  = mpCheckoutActivo();
    if (chkMp) chkMp.checked = mpOn;
    if (estMp) {
      estMp.textContent = mpOn
        ? 'Activo · el botón de pago redirige a MercadoPago'
        : 'Modo test · el pago se simula sin cobrar';
      estMp.style.color = mpOn ? 'var(--green)' : 'var(--ink3)';
    }

    const chkPm = document.getElementById('cfg-promarket');
    const estPm = document.getElementById('cfg-promarket-estado');
    const pmOn  = promarketActivo();
    if (chkPm) chkPm.checked = pmOn;
    if (estPm) {
      estPm.textContent = pmOn
        ? 'Activo · el tab ProMarket es visible para todos'
        : 'Desactivado · el tab ProMarket está oculto';
      estPm.style.color = pmOn ? 'var(--green)' : 'var(--ink3)';
    }

    const chkBn = document.getElementById('cfg-banners');
    const estBn = document.getElementById('cfg-banners-estado');
    const bnOn  = bannersPagosActivos();
    if (chkBn) chkBn.checked = bnOn;
    if (estBn) {
      estBn.textContent = bnOn ? 'Activa · los vecinos pueden comprar un espacio'
                               : 'Desactivada · el carrusel es sólo editorial';
      estBn.style.color = bnOn ? 'var(--green)' : 'var(--ink3)';
    }
    const chkPp = document.getElementById('cfg-pubs-prestador');
    const estPp = document.getElementById('cfg-pubs-prestador-estado');
    const ppOn  = pubsPrestadorActivo();
    if (chkPp) chkPp.checked = ppOn;
    if (estPp) {
      estPp.textContent = ppOn
        ? 'Activo · los prestadores pueden armar avisos (pasan por Moderación)'
        : 'Desactivado · sin rastros en la app';
      estPp.style.color = ppOn ? 'var(--green)' : 'var(--ink3)';
    }

    const chkIm = document.getElementById('cfg-impulsos');
    const estIm = document.getElementById('cfg-impulsos-estado');
    const imOn  = impulsosActivos();
    if (chkIm) { chkIm.checked = imOn; chkIm.disabled = !ppOn; }
    if (estIm) {
      estIm.textContent = !ppOn
        ? 'Requiere los avisos de prestadores activados'
        : (imOn ? 'Activa · el prestador puede pagar para aparecer primero'
                : 'Desactivada · nadie puede comprar impulsos');
      estIm.style.color = (ppOn && imOn) ? 'var(--green)' : 'var(--ink3)';
    }

    // El conteo de espacios se pide aparte: es una consulta, no un flag.
    if (bnOn && estBn) {
      PronetDB.bannersEspaciosLibres().then(n => {
        const e = document.getElementById('cfg-banners-estado');
        if (e) e.textContent = 'Activa · quedan ' + n + ' espacio' + (n === 1 ? '' : 's') + ' de ' + (PRONET_CONFIG.BANNERS_MAX || 6);
      }).catch(() => {});
    }
  }

  /** ¿Se pueden comprar espacios del carrusel? Default apagado: mientras la
   *  clave no exista, el carrusel es editorial y nada cambia. Criterio
   *  opuesto a promarketActivo(), que viene de una época en que ProMarket ya
   *  estaba en uso — acá el default seguro es NO vender. */
  function bannersPagosActivos() {
    return configApp.banners_pagos_activos === 'true';
  }

  async function togglePlanesPagos(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('planes_pagos_activos', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo; // revertir: el cambio no se guardó
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.planes_pagos_activos = nuevo ? 'true' : 'false';
    renderConfigAdmin();
    reflejarPlan();
    showToast && showToast(nuevo
      ? '💳 Planes pagos activados. Base baja a 3 propuestas/mes.'
      : '🎉 Planes pagos desactivados. Todos vuelven a límites de Plus.');
  }

  window.togglePlanesPagos = togglePlanesPagos;

  async function toggleMpCheckout(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('mp_checkout_activo', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo;
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.mp_checkout_activo = nuevo ? 'true' : 'false';
    renderConfigAdmin();
    showToast && showToast(nuevo
      ? '💳 Checkout MP activo. El botón de pago ahora redirige a MercadoPago.'
      : '🧪 Modo test activado. Los pagos se simulan sin cobrar.');
  }

  window.toggleMpCheckout = toggleMpCheckout;

  async function toggleBannersPagos(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('banners_pagos_activos', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo;
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.banners_pagos_activos = nuevo ? 'true' : 'false';
    // La fila de Mi Perfil aparece o desaparece sin recargar.
    reflejarUsuario();
    renderConfigAdmin();
    showToast && showToast(nuevo
      ? '📣 Venta de espacios activa. Los vecinos ya pueden comprar un banner.'
      : '🔒 Venta de espacios desactivada. El carrusel vuelve a ser sólo tuyo.');
  }
  window.toggleBannersPagos = toggleBannersPagos;

  async function togglePubsPrestador(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('publicaciones_prestador', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo;
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.publicaciones_prestador = nuevo ? 'true' : 'false';
    // La fila de Mi Perfil del prestador aparece o desaparece sin recargar.
    reflejarUsuario();
    renderConfigAdmin();
    showToast && showToast(nuevo
      ? '🛠️ Avisos de prestadores activos. Lo que envíen te llega a Moderación.'
      : '🔒 Avisos de prestadores desactivados. Sin rastros en la app.');
  }
  window.togglePubsPrestador = togglePubsPrestador;

  async function toggleImpulsos(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('impulsos_activos', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo;
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.impulsos_activos = nuevo ? 'true' : 'false';
    renderConfigAdmin();
    showToast && showToast(nuevo
      ? '⚡ Venta de impulsos activa.'
      : '🔒 Venta de impulsos desactivada.');
  }
  window.toggleImpulsos = toggleImpulsos;

  async function togglePromarket(el) {
    const nuevo = !!el.checked;
    el.disabled = true;
    const res = await PronetDB.guardarConfigApp('promarket_activo', nuevo ? 'true' : 'false');
    el.disabled = false;
    if (!res.ok) {
      el.checked = !nuevo;
      showToast && showToast('⚠️ No se pudo guardar. ' + (res.error || ''));
      return;
    }
    configApp.promarket_activo = nuevo ? 'true' : 'false';
    // Mostrar u ocultar el tab y la pantalla según el nuevo estado
    const tab = document.getElementById('nb-mercado');
    if (tab) tab.style.display = nuevo ? '' : 'none';
    renderConfigAdmin();
    showToast && showToast(nuevo
      ? '🛍️ ProMarket activado. El tab ya es visible para todos.'
      : '🔒 ProMarket desactivado. El tab quedó oculto.');
  }

  window.togglePromarket = togglePromarket;

  // Superficie de test: funciones puras del sistema de planes, para que los
  // specs de Playwright puedan verificarlas sin depender del estado de la DB.
  window._planesAPI = {
    getPlanConfig,
    planParaLimites,
    planesPagosActivos,
    limitePlan,
    badgePlanPrestador,
    planActual:       () => planActual,
    esFundador:       () => esFundadorActual,
    configApp:        () => ({ ...configApp }),
    configCargada:    () => configCargada,
    sesionLista:      () => !!usuarioActual,
  };

  // Superficie de test de ProMarket: funciones de cupo y formato que los
  // specs verifican sin tener que publicar de verdad (los tests corren contra
  // producción y publicar consumiría cupo real del año de la cuenta de prueba).
  window._marketAPI = {
    puedePublicarMercado,
    mktDistanciaLabel,
    formatearFechaReserva,
    mktIniciales,
    mktTiempoRelativo,
    zonaCoords:  () => ({ ...MKT_ZONA_COORD }),
    creditos:    () => usuarioActual?.promarket_creditos ?? null,
    legacyActivo: () => !!usuarioActual?.es_pro_marketplace,
  };

  /** Aviso de límite alcanzado, con el nombre del plan actual. */
  function avisarLimitePlan(texto) {
    const cfg = getPlanConfig(planActual);
    showToast && showToast('⚠️ ' + texto + ' en tu Plan ' + cfg.nombre + '. Mejorá tu plan en Mi Perfil → Suscripción.');
  }

  // Re-verifica el rol admin contra Supabase (no confía en la memoria del cliente).
  // Llaman las funciones que renderizan datos admin antes de mostrar nada.
  async function verificarAdminServidor() {
    try {
      const u = await PronetDB.usuarioActual();
      if (u?.roles?.includes('admin')) return true;
    } catch (e) { /* red error */ }
    goTo('s-home');
    showToast && showToast('🛡 Esta sección es solo para administradores');
    return false;
  }

  function reflejarPlan() {
    const cfg = getPlanConfig(planActual);
    const ids = ['base','plus','pro'];
    const pagosOn = planesPagosActivos();

    // Prelanzamiento: ocultar los planes pagos y el acceso a Suscripción.
    // Sin MercadoPago integrado, dejarlos visibles permitiría activarlos gratis.
    ids.filter(id => id !== 'base').forEach(id => {
      const card = document.getElementById('subs-card-' + id);
      if (card) card.style.display = pagosOn ? '' : 'none';
    });
    const avisoPre = document.getElementById('subs-aviso-prelanzamiento');
    if (avisoPre) avisoPre.style.display = pagosOn ? 'none' : '';
    // Los accesos a Suscripción se ocultan por clase en <body>, NO tocando los
    // elementos [data-feature] directamente: aplicarFeatureFlags() les reescribe
    // el display y el último en correr ganaba, haciendo reaparecer el menú.
    document.body.classList.toggle('planes-pagos-off', !pagosOn);

    // Pantalla de suscripción: marcar plan activo en cada card
    ids.forEach(id => {
      const btn  = document.getElementById('subs-btn-' + id);
      const card = document.getElementById('subs-card-' + id);
      if (!btn) return;
      const esActual = planActual === id;
      if (esActual) {
        btn.className   = 'pc-cta active-plan';
        btn.textContent = '✓ Tu plan actual';
        btn.onclick     = null;
        btn.style.cssText = '';
        if (card) card.classList.add('current');
      } else {
        if (card) card.classList.remove('current');
        if (id === 'base') {
          btn.className   = 'pc-cta ghost';
          btn.textContent = 'Cambiar a Base';
          btn.onclick     = () => showToast('Para cancelar tu suscripción contactá a soporte.');
          btn.style.cssText = '';
        } else {
          const pCfg = getPlanConfig(id);
          btn.className   = 'pc-cta primary';
          btn.style.cssText = '';
          btn.textContent = 'Activar Plan ' + pCfg.nombre + ' →';
          btn.onclick     = () => abrirCheckout(id);
        }
      }
    });

    // Badge plan en Mi Perfil
    const badgePlan = document.getElementById('perfil-plan-badge');
    if (badgePlan) {
      badgePlan.textContent   = cfg.emoji + ' Plan ' + cfg.nombre;
      badgePlan.style.display = planActual !== 'base' ? 'inline-block' : 'none';
    }
    // Tile y menú "Suscripción" en Mi Perfil
    const subTile = document.getElementById('perfil-suscripcion-sub');
    if (subTile) subTile.textContent = 'Plan ' + cfg.nombre + ' · Activo';
    const subMenuSub = document.getElementById('perfil-suscripcion-menu-sub');
    if (subMenuSub) subMenuSub.textContent = 'Plan ' + cfg.nombre + ' · MercadoPago';
    // Card plan en Mi Perfil — nombre y boost
    const planNombreEl = document.getElementById('perfil-plan-nombre');
    if (planNombreEl) {
      if (planActual === 'base') {
        planNombreEl.textContent = 'Plan Base · Gratis';
      } else {
        const precio = periodoActual === 'anual'
          ? '$' + (cfg.precio_anual || 0).toLocaleString('es-AR')
          : '$' + (cfg.precio_mes  || 0).toLocaleString('es-AR');
        planNombreEl.textContent = 'Plan ' + cfg.nombre + ' ' + (periodoActual === 'anual' ? 'Anual' : 'Mensual') + ' · ' + precio + ' ARS';
      }
    }
    // Fecha de renovación / badge fundador en la card de plan
    const planRenewEl = document.getElementById('perfil-plan-renew');
    if (planRenewEl) {
      if (planActual !== 'base' && venceActual) {
        const d = new Date(venceActual);
        planRenewEl.textContent = 'Renueva ' + d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
        planRenewEl.style.display = '';
      } else if (planActual === 'base' && esFundadorActual) {
        planRenewEl.textContent = '⭐ Fundador · límites de Plus';
        planRenewEl.style.display = '';
      } else {
        planRenewEl.style.display = 'none';
      }
    }
    // El tier de analítica depende del plan: recalcularlo cuando el plan cambia
    // (activación, vencimiento, o el interruptor de planes pagos).
    aplicarTierEstadisticas();
    const boostTextoEl = document.getElementById('perfil-boost-texto');
    if (boostTextoEl) {
      boostTextoEl.textContent = cfg.loyalty_boost > 1 ? 'boost ×' + cfg.loyalty_boost : 'sin boost';
    }
    const serviciosMaxEl = document.getElementById('perfil-servicios-max');
    if (serviciosMaxEl) {
      serviciosMaxEl.textContent = cfg.propuestas_mes ? cfg.propuestas_mes : '∞';
    }
    const usadasEl = document.getElementById('perfil-propuestas-usadas');
    if (usadasEl && usuarioActual?.prestador_id) {
      PronetDB.contarPropuestasMes(usuarioActual.prestador_id)
        .then(n => { usadasEl.textContent = n; })
        .catch(() => {});
    }
  }

  function reflejarUsuario() {
    // CTA "Quiero ofrecer mis servicios": visible para invitados y vecinos sin prestador_id
    const ctaPrestador = document.getElementById('cta-ser-prestador');
    if (ctaPrestador) {
      const ocultar = esPrestador() || esAdmin();
      ctaPrestador.style.display = ocultar ? 'none' : '';
      if (!ocultar) {
        const sub = document.getElementById('cta-prestador-sub');
        if (sub) sub.textContent = usuarioActual
          ? 'Agregá un perfil de prestador a tu cuenta'
          : 'Registrate como prestador — es gratis';
      }
    }
    // Ocultar/mostrar todos los elementos admin-only según el rol del usuario
    const admin = esAdmin();
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
      el.style.display = admin ? '' : 'none';
    });
    // Ocultar secciones exclusivas de prestador si no tiene prestador_id
    const tienePrestadorId = !!(usuarioActual && usuarioActual.prestador_id);
    document.querySelectorAll('[data-solo-prestador="true"]').forEach(el => {
      const feat = el.dataset.feature;
      if (feat && !FEATURES[feat]) return; // deja que aplicarFeatureFlags controle este elemento
      el.style.display = tienePrestadorId ? '' : 'none';
    });
    // Con CSS grid 2x2, el Catálogo Admin ocupa su celda cuando está visible
    // y la grilla se reordena automáticamente cuando está oculto (display:none)
    // El contenedor de tiles hereda data-solo-prestador así que ya se oculta para clientes/admin sin prestador_id
    // Placeholder de grilla: oculto siempre (ya no necesario con grid)
    const placeholder = document.getElementById('tile-placeholder-grid');
    if (placeholder) placeholder.style.display = 'none';
    // Nav inferior y botón publicar: Buscar/Cerca/Publicar solo para clientes
    const nbBuscar = document.getElementById('nb-buscar');
    const nbMapa   = document.getElementById('nb-mercado');
    const btnPub   = document.getElementById('btn-publicar-pedido');
    if (esPrestador()) {
      if (nbBuscar) nbBuscar.style.display = 'none';
      if (nbMapa)   nbMapa.style.display   = 'none';
      if (btnPub)   btnPub.style.display   = 'none';
    } else {
      if (nbBuscar) nbBuscar.style.display = '';
      // Igual que en toggleModoRol(): el tab de ProMarket necesita rol Y
      // feature flag. Sin el segundo chequeo, esto reaparecía el tab que
      // aplicarFeatureFlags() ya había ocultado por config del admin.
      if (nbMapa)   nbMapa.style.display   = FEATURES.mercadoPlaza ? '' : 'none';
      if (btnPub)   btnPub.style.display   = '';
    }
    if (!usuarioActual) return;
    // Aviso para cargar teléfono (habilita el botón de contacto directo en ProMarket)
    const bannerTel = document.getElementById('banner-cargar-telefono');
    if (bannerTel) bannerTel.style.display = usuarioActual.telefono ? 'none' : 'flex';
    const nombre = usuarioActual.nombre || 'Usuario';
    const inic = inicialesDe(nombre);
    const tipo = admin ? 'Administrador' : (esPrestador() ? 'Prestador' : 'Cliente');
    const zona = usuarioActual.zona || 'Escobar';

    // Ocultar PRONET Points para admin o si el feature está desactivado
    const loyaltyTile = document.querySelector('[data-feature="loyalty"]');
    if (loyaltyTile) loyaltyTile.style.display = (esAdmin() || !FEATURES.loyalty) ? 'none' : '';
    // La venta de espacios del carrusel se ofrece sólo si el admin la
    // habilitó. Con el interruptor apagado la fila no existe.
    const menuPromo = document.getElementById('menu-promocionar');
    if (menuPromo) menuPromo.style.display = bannersPagosActivos() ? '' : 'none';
    // Mis avisos en Servicios: sólo prestadores, y con el flag prendido.
    const menuPubs = document.getElementById('menu-pubs-prestador');
    if (menuPubs) menuPubs.style.display =
      (esPrestador() && pubsPrestadorActivo()) ? '' : 'none';

    const loyaltyMenu = document.querySelector('.menu-item[data-feature="loyalty"]');
    if (loyaltyMenu) loyaltyMenu.style.display = (esAdmin() || !FEATURES.loyalty) ? 'none' : '';

    // Para admin: botón Pedidos del nav lleva al Panel de Moderación
    const nbPedidos = document.getElementById('nb-pedidos');
    if (nbPedidos) {
      if (esAdmin()) {
        nbPedidos.onclick = () => goTo('s-moderacion');
      } else {
        nbPedidos.onclick = () => goTo('s-pedidos');
      }
    }

    // Sincronizar el toggle de disponibilidad y la foto de perfil desde prestadores
    if (usuarioActual.prestador_id) {
      PronetDB.obtener('prestadores', usuarioActual.prestador_id).then(p => {
        if (!p) return;
        const cb = document.getElementById('campo-4');
        const sub = document.getElementById('toggle-sub');
        const icon = document.querySelector('.toggle-row .toggle-icon');
        if (cb) cb.checked = p.activo !== false;
        if (sub) sub.textContent = p.activo !== false
          ? 'Tu ubicación es visible en el mapa · Activo'
          : 'No aparecés en el mapa de búsqueda · Inactivo';
        if (icon) icon.style.background = p.activo !== false ? '#DCFCE7' : '#F3F4F6';
        // Reflejar foto de perfil en el avatar de Mi Perfil
        if (p.foto_url) {
          const av = document.getElementById('perfil-avatar');
          if (av) {
            av.style.backgroundImage = 'url("' + p.foto_url + '")';
            av.style.backgroundSize = 'cover';
            av.style.backgroundPosition = 'center';
            av.textContent = '';
          }
        }
      }).catch(() => {});
    }

    const homeAv = document.getElementById('home-avatar');
    if (homeAv) homeAv.textContent = inic;
    const pAv = document.getElementById('perfil-avatar');
    if (pAv) {
      if (usuarioActual.foto_url) {
        pAv.style.backgroundImage = 'url("' + usuarioActual.foto_url + '")';
        pAv.style.backgroundSize = 'cover';
        pAv.style.backgroundPosition = 'center';
        pAv.textContent = '';
      } else {
        pAv.style.backgroundImage = '';
        pAv.textContent = inic;
      }
    }
    const pNom = document.getElementById('perfil-nombre');
    if (pNom) pNom.textContent = nombre;
    const pEmail = document.getElementById('perfil-email');
    if (pEmail) pEmail.textContent = usuarioActual?.email || '';
    const pSub = document.getElementById('perfil-sub');
    if (pSub) pSub.textContent = zona + ' · ' + tipo;

    // ── Toggle doble perfil ──
    const toggleCard = document.getElementById('doble-perfil-toggle');
    if (toggleCard) {
      toggleCard.style.display = tieneDoblePerfil() ? '' : 'none';
      const lbl = document.getElementById('modo-actual-lbl');
      const btn = document.getElementById('modo-cambiar-btn');
      if (lbl) lbl.textContent = modoRol === 'vecino' ? 'Vecino' : 'Prestador';
      if (btn) btn.textContent = modoRol === 'vecino' ? 'Cambiar a Prestador →' : 'Cambiar a Vecino →';
    }
    // ── DINÁMICO: badge de mensajes no leídos ──
    cargarBadgeMensajes();
    // ── DINÁMICO: PRONET Points ──
    cargarLoyalty();
    // ── DINÁMICO: denuncias pendientes (solo admin) ──
    if (admin) cargarBadgeDenuncias();
    // ── DINÁMICO: rankings del prestador ──
    if (tienePrestadorId) cargarRankingsPerfil();
    // ── ProMarket: sección completa visible si el feature está activo y el usuario está logueado ──
    const secPM = document.getElementById('seccion-promarket-perfil');
    if (secPM) secPM.style.display = (FEATURES.mercadoPlaza && usuarioActual) ? '' : 'none';
    // Cualquier usuario logueado puede publicar (hasta su cupo) — ya no
    // depende de una suscripción, así que estos menús quedan visibles siempre.
    const menuMisPubs = document.getElementById('menu-mis-pubs-mkt');
    if (menuMisPubs) menuMisPubs.style.display = usuarioActual ? '' : 'none';
    const menuMisConsultas = document.getElementById('menu-mis-consultas-mkt');
    if (menuMisConsultas) menuMisConsultas.style.display = usuarioActual ? '' : 'none';
    actualizarEstadoProMarketPerfil();
  }

  // Sub-label de la sección ProMarket en Mi Perfil: cupo restante según el
  // plan (Base=3/año gratis + créditos comprados, Plus=10/mes, Pro=ilimitado).
  async function actualizarEstadoProMarketPerfil() {
    const pmEstadoLbl = document.getElementById('pm-perfil-estado-lbl');
    if (!pmEstadoLbl || !usuarioActual) return;

    // Legacy: quien pagó la vieja suscripción de $10.000/mes sigue ilimitado
    // hasta que venza lo que ya pagó.
    const legacyHasta = usuarioActual.pro_marketplace_hasta ? new Date(usuarioActual.pro_marketplace_hasta) : null;
    if (usuarioActual.es_pro_marketplace && (!legacyHasta || legacyHasta > new Date())) {
      const hasta = legacyHasta ? ' · hasta ' + legacyHasta.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
      pmEstadoLbl.textContent = 'Ilimitado' + hasta;
      pmEstadoLbl.style.color = '#10B981';
      return;
    }

    const plan = planParaLimites(planActual);
    if (plan === 'pro') {
      pmEstadoLbl.textContent = 'Ilimitado con tu plan Pro';
      pmEstadoLbl.style.color = '#10B981';
      return;
    }
    if (plan === 'plus') {
      const usadas = await PronetDB.contarPublicacionesMercadoMes(usuarioActual.id).catch(() => 0);
      pmEstadoLbl.textContent = usadas + '/10 este mes';
      pmEstadoLbl.style.color = usadas >= 10 ? '#EF4444' : 'var(--ink3)';
      return;
    }
    const usadas = await PronetDB.contarPublicacionesMercadoAnio(usuarioActual.id).catch(() => 0);
    const creditos = usuarioActual.promarket_creditos || 0;
    if (usadas < 3) {
      pmEstadoLbl.textContent = usadas + '/3 gratis este año';
      pmEstadoLbl.style.color = 'var(--ink3)';
    } else if (creditos > 0) {
      pmEstadoLbl.textContent = creditos + ' ' + (creditos === 1 ? 'publicación' : 'publicaciones') + ' extra disponible' + (creditos !== 1 ? 's' : '');
      pmEstadoLbl.style.color = 'var(--blue)';
    } else {
      pmEstadoLbl.textContent = 'Sin cupo — $5.000 por publicación extra';
      pmEstadoLbl.style.color = '#EF4444';
    }
  }

  // ── Mensajes no leídos (dinámico) ──────────────────────────────────
  async function cargarBadgeMensajes() {
    const subEl = document.getElementById('mp-mensajes-sub');
    const dotEl = document.getElementById('mp-mensajes-dot');
    if (!subEl) return;
    try {
      // Conversaciones, no mensajes: es la unidad que el usuario atiende.
      // Tiene que dar el mismo número que el tablero de Inicio.
      const porChat = await PronetDB.noLeidosPorChat();
      const count = Object.values(porChat).filter(n => n > 0).length;
      if (count > 0) {
        subEl.textContent = count === 1 ? '1 conversación sin leer' : count + ' conversaciones sin leer';
        if (dotEl) dotEl.style.display = '';
      } else {
        subEl.textContent = 'Sin mensajes nuevos';
        if (dotEl) dotEl.style.display = 'none';
      }
    } catch (e) {
      subEl.textContent = 'Mensajes';
      if (dotEl) dotEl.style.display = 'none';
    }
  }

  // ── PRONET Points (dinámico) ───────────────────────────────────────
  async function cargarLoyalty() {
    const tileEl = document.getElementById('mp-points-tile');
    const menuEl = document.getElementById('mp-points-menu');
    try {
      const loy = await PronetDB.obtenerLoyalty();
      const pts = (loy.puntos || 0).toLocaleString('es-AR');
      const niv = loy.nivel || 'Bronce';
      // Antes era un ternario sin caso para Élite: el nivel más alto salía
      // con la medalla de bronce. Ahora sale del catálogo.
      const emoji = emojiNivel(niv);
      if (tileEl) tileEl.textContent = pts + ' pts · Nivel ' + niv;
      if (menuEl) menuEl.textContent = pts + ' pts disponibles · Nivel ' + niv + ' ' + emoji;
    } catch (e) {
      if (tileEl) tileEl.textContent = '0 pts · Bronce';
      if (menuEl) menuEl.textContent = '0 pts disponibles · Bronce 🥉';
    }
  }

  // ── Celebración primer trabajo ───────────────────────────────────────
  async function verificarCelebracionPrimerTrabajo() {
    if (!PronetDB.esRemoto() || !usuarioActual?.id) return;
    const storageKey = 'pronet_celebracion_primer_trabajo_' + usuarioActual.id;
    if (localStorage.getItem(storageKey)) return;
    // Buscar notificación pendiente de primer trabajo
    const { data } = await window._sb
      .from('notificaciones')
      .select('id')
      .eq('usuario_id', usuarioActual.id)
      .eq('tipo', 'celebracion_primer_trabajo')
      .eq('leida', false)
      .maybeSingle();
    if (!data) return;
    // Marcar como leída para no volver a mostrar
    await window._sb.from('notificaciones').update({ leida: true }).eq('id', data.id);
    localStorage.setItem(storageKey, '1');
    const loy = await PronetDB.obtenerLoyalty().catch(() => ({ puntos: 500, nivel: 'Bronce' }));
    setTimeout(() => mostrarModalPrimerTrabajo(loy.puntos || 500, loy.nivel || 'Bronce'), 800);
  }

  function mostrarModalPrimerTrabajo(puntos, nivel) {
    const META = { Bronce: 1000, Plata: 3000, Oro: 99999 };
    const SIGUIENTE = { Bronce: 'Plata', Plata: 'Oro', Oro: 'Oro' };
    const meta = META[nivel] || 1000;
    const siguiente = SIGUIENTE[nivel] || 'Plata';
    const pct = Math.min(100, Math.round((puntos / meta) * 100));
    const modal = document.getElementById('modal-primer-trabajo');
    if (!modal) return;
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('mpt-puntos', puntos.toLocaleString('es-AR'));
    el('mpt-nivel', nivel);
    el('mpt-meta-txt', puntos.toLocaleString('es-AR') + ' / ' + meta.toLocaleString('es-AR') + ' pts → ' + siguiente);
    const bar = document.getElementById('mpt-barra');
    if (bar) bar.style.width = pct + '%';
    modal.style.display = 'flex';
  }
  window.cerrarModalPrimerTrabajo = () => {
    const m = document.getElementById('modal-primer-trabajo');
    if (m) m.style.display = 'none';
  };

  // ── Pantalla completa de Loyalty (dinámico) ─────────────────────────
  async function renderLoyaltyScreen() {
    try {
      const loy = await PronetDB.obtenerLoyalty();
      const pts = loy.puntos || 0;
      const niv = loy.nivel || 'Bronce';
      ptsDisponibles = pts; // sincroniza el balance local con la DB real (evita drift)

      const niveles = PRONET_CONFIG.LOYALTY_NIVELES;
      const actual = niveles.find(n => n.nombre === niv) || niveles[0];
      const siguiente = niveles[niveles.indexOf(actual) + 1] || null;
      const progreso = actual.max > actual.min
        ? Math.min(100, ((pts - actual.min) / (actual.max - actual.min)) * 100)
        : 100;

      // Badge del hero
      const badge = document.getElementById('loy-nivel-badge');
      if (badge) {
        badge.textContent = actual.emoji + ' Nivel ' + niv + ' · ' + pts.toLocaleString('es-AR') + ' puntos';
        badge.className = 'nivel-badge nivel-' + niv.toLowerCase();
      }

      const setT = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setT('loy-total', pts.toLocaleString('es-AR'));
      setT('loy-disponibles', pts.toLocaleString('es-AR'));
      setT('loy-mes', '0'); // se actualiza más abajo con el historial real

      // Campos adicionales
      setT('loy-canjear-pts', 'Tenés ' + pts.toLocaleString('es-AR') + ' puntos disponibles');

      // Progreso
      setT('loy-nivel-actual', actual.emoji + ' Nivel ' + niv);
      if (siguiente) {
        setT('loy-nivel-next', 'Faltan ' + (actual.max - pts).toLocaleString('es-AR') + ' pts para ' + siguiente.nombre);
      } else {
        setT('loy-nivel-next', '¡Nivel máximo alcanzado!');
      }
      const fill = document.getElementById('loy-nivel-fill');
      if (fill) {
        fill.style.width = progreso + '%';
        fill.className = 'np-fill fill-' + niv.toLowerCase();
      }
      const meta = document.getElementById('loy-nivel-meta');
      if (meta) {
        meta.innerHTML = '<span>' + actual.min.toLocaleString('es-AR') + ' pts</span>'
          + '<span>' + pts.toLocaleString('es-AR') + ' pts actuales</span>'
          + '<span>' + actual.max.toLocaleString('es-AR') + ' pts</span>';
      }
      // Marcar nivel activo en el tab Niveles
      const nivelIdMap = { 'Bronce': 'nc-bronce', 'Plata': 'nc-plata', 'Oro': 'nc-oro', 'Élite': 'nc-elite' };
      Object.entries(nivelIdMap).forEach(([nombre, id]) => {
        const nc = document.getElementById(id);
        if (!nc) return;
        const esActual = nombre === niv;
        nc.classList.toggle('active', esActual);
        const nameEl = nc.querySelector('.nivel-name');
        if (nameEl) nameEl.textContent = nombre + (esActual ? ' ← Vos' : '');
      });

      // Ordenar secciones ganar-pts según rol: vecinos ven su sección primero
      const secPrest  = document.getElementById('lv-ganar-sec-prestador');
      const secCliente = document.getElementById('lv-ganar-sec-cliente');
      const ganarCont  = document.getElementById('lv-ganar');
      if (secPrest && secCliente && ganarCont) {
        if (!esPrestador()) {
          ganarCont.insertBefore(secCliente, secPrest);
        } else {
          ganarCont.insertBefore(secPrest, secCliente);
        }
      }

      // Cards dinámicas de "Ganar puntos" desde loyalty_reglas
      const ganarDiv = document.getElementById('lv-ganar-prestador');
      if (ganarDiv) {
        const reglas = await PronetDB.listarLoyaltyReglas().catch(() => []);
        if (reglas.length) {
          ganarDiv.innerHTML = reglas.map(r => `
            <div class="acc-card">
              <div class="acc-ico" style="background:#EEF2FF">${escHTML(r.icono || '🔔')}</div>
              <div class="acc-body">
                <div class="acc-name">${escHTML(r.descripcion)}</div>
              </div>
              <div class="acc-pts">+${r.puntos.toLocaleString('es-AR')} pts</div>
            </div>`).join('');
        } else {
          ganarDiv.innerHTML = '';
        }
      }

      // Catálogo de canjes dinámico desde loyalty_canjes
      const canjesDiv = document.getElementById('lv-canjear-lista');
      if (canjesDiv) {
        const tipoUsuario = esPrestador() ? 'prestador' : 'vecino';
        const items = await PronetDB.listarCatalogoCanje(tipoUsuario).catch(() => []);
        items.forEach(i => _canjesCatalogoCache.set(i.id, i));
        if (!items.length) {
          canjesDiv.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">No hay beneficios disponibles por ahora.</div>';
        } else {
          // Agrupar por tipo para mostrar cabeceras
          const prestItems = items.filter(i => i.tipo === 'prestador' || i.tipo === 'ambos');
          const vecItems   = items.filter(i => i.tipo === 'vecino'    || i.tipo === 'ambos');
          const renderItem = i => `
            <div class="canje-card">
              <div class="canje-ico">${escHTML(i.icono || '🎁')}</div>
              <div class="canje-body">
                <div class="canje-name">${escHTML(i.nombre)}</div>
                ${i.descripcion ? `<div class="canje-sub">${escHTML(i.descripcion)}</div>` : ''}
                <div class="canje-costo">💜 ${i.costo_puntos.toLocaleString('es-AR')} puntos</div>
              </div>
              <button class="canje-btn" onclick="canjear(this,${i.costo_puntos},'${i.id}')">Canjear</button>
            </div>`;
          let html = '';
          if (esPrestador() && prestItems.length) {
            html += '<div style="padding:0 14px 8px;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px">Para prestadores</div>';
            html += prestItems.map(renderItem).join('');
          }
          if (!esPrestador() && vecItems.length) {
            html += '<div style="padding:0 14px 8px;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px">Para vecinos</div>';
            html += vecItems.map(renderItem).join('');
          }
          canjesDiv.innerHTML = html;
        }
      }

      // Historial dinámico — también recalcula los KPIs de totales
      const histDiv = document.getElementById('lv-historial');
      if (histDiv) {
        const items = await PronetDB.listarLoyaltyHistorial(30).catch(() => []);
        const header = document.getElementById('loy-historial-header');

        // Recalcular totales desde el historial (más confiable que la tabla loyalty)
        const ptsTotal = items.reduce((s, i) => s + i.puntos, 0);
        const ahora = new Date();
        const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const ptsMes = items
          .filter(i => new Date(i.creado) >= inicioMes && i.puntos > 0)
          .reduce((s, i) => s + i.puntos, 0);

        // Si el historial tiene datos, sobreescribir los KPIs con valores reales
        if (items.length) {
          setT('loy-total', ptsTotal.toLocaleString('es-AR'));
          setT('loy-disponibles', ptsTotal.toLocaleString('es-AR'));
          ptsDisponibles = ptsTotal; // mantiene sincronizado el balance usado en canjear()
        }
        setT('loy-mes', ptsMes.toLocaleString('es-AR'));

        if (!items.length) {
          const spacer = histDiv.querySelector('div[style="height:16px"]');
          if (header) header.textContent = 'Aún no tenés movimientos de puntos';
          // Limpiar items hardcodeados dejando solo el spacer
          [...histDiv.children].forEach(c => {
            if (!c.style?.height) c.remove();
          });
        } else {
          if (header) header.textContent = 'Últimos ' + items.length + ' movimientos';
          const iconos = {
            resena: '⭐', trabajo: '✅', canje: '🚀',
            respuesta_rapida: '⚡', disponibilidad: '📍',
            referido: '🤝', aniversario: '🎂', manual: '🎁', general: '🔔'
          };
          const html = items.map(it => {
            const ganado = it.puntos > 0;
            const hace = tiempoRelativo(new Date(it.creado));
            const icono = iconos[it.tipo] || '🔔';
            const ptsStr = (ganado ? '+' : '') + it.puntos.toLocaleString('es-AR');
            return `<div class="hist-pts-item${ganado ? '' : '" style="background:var(--surface)'}">
              <div class="hpi-ico">${icono}</div>
              <div class="hpi-body">
                <div class="hpi-desc">${escHTML(it.descripcion)}</div>
                <div class="hpi-date">${hace}</div>
              </div>
              <div class="hpi-pts ${ganado ? 'ganado' : 'canjeado'}">${ptsStr}</div>
            </div>`;
          }).join('');
          // Reemplazar items hardcodeados manteniendo el spacer al final
          const spacer = histDiv.querySelector('div[style="height:16px"]');
          [...histDiv.children].forEach(c => { if (!c.style?.height) c.remove(); });
          if (spacer) histDiv.insertBefore(document.createRange().createContextualFragment(html), spacer);
          else histDiv.insertAdjacentHTML('afterbegin', html);
        }
      }
    } catch (e) {
      console.warn('[renderLoyaltyScreen]', e);
    }
  }

  // ── Denuncias pendientes (dinámico, solo admin) ────────────────────
  async function cargarBadgeDenuncias() {
    const subEl = document.getElementById('mp-denuncias-sub');
    if (!subEl) return;
    try {
      const count = await PronetDB.contarDenunciasPendientes();
      subEl.textContent = count > 0
        ? count + ' denuncia' + (count > 1 ? 's' : '') + ' pendiente' + (count > 1 ? 's' : '') + ' · Admin'
        : 'Sin denuncias pendientes · Admin';
    } catch (e) {
      subEl.textContent = 'Panel de moderación · Admin';
    }
  }

  async function mostrarBannerPrimerTrabajoPro() {
    const banner = document.getElementById('banner-primer-trabajo-pro');
    if (!banner || !esPrestador() || !PronetDB.esRemoto()) return;
    // Sin ficha no hay nada que contar. esPrestador() puede ser true con
    // prestador_id en null, y en ese caso .eq('prestador_id', null) genera
    // `prestador_id=eq.` — malformado — y PostgREST devuelve 400.
    if (!usuarioActual?.prestador_id) { banner.style.display = 'none'; return; }
    if (esPro()) { banner.style.display = 'none'; return; }
    // Con head:true no viene cuerpo: el total llega en `count`, no en `data`.
    // Antes se leía data.length, que siempre era 0, así que el banner nunca
    // se mostraba.
    const { count } = await window._sb
      .from('chats_trabajo')
      .select('id', { count: 'exact', head: true })
      .eq('prestador_id', usuarioActual.prestador_id)
      .eq('estado', 'calificado');
    banner.style.display = (count ?? 0) >= 1 ? '' : 'none';
  }

  // ── Rankings del prestador (dinámico) ──────────────────────────────
  async function cargarRankingsPerfil() {
    const wrap = document.getElementById('mp-rankings');
    if (!wrap || !usuarioActual || !usuarioActual.prestador_id) return;
    try {
      // Traer datos del prestador actual
      const miPerfil = await PronetDB.obtener('prestadores', usuarioActual.prestador_id);
      if (!miPerfil) { wrap.innerHTML = '<div style="font-size:12px;color:var(--ink3)">Sin datos de ranking</div>'; return; }
      const miZona = miPerfil.zona || 'Escobar';
      // Las dos posiciones salen de un solo RPC que las calcula con rank().
      // Antes se traían todos los prestadores del rubro y todos los de la
      // zona —dos consultas de tabla casi entera— para después buscarse a
      // uno mismo en el array.
      const r = await PronetDB.obtenerPosicionPrestador(usuarioActual.prestador_id);
      wrap.innerHTML = '';
      const tarjeta = (pos, total, cat) => {
        const card = document.createElement('div');
        card.className = 'my-rank-card';
        card.innerHTML = '<div class="mr-pos">#' + pos + '</div>'
          + '<div class="mr-cat">' + escHTML(cat) + '</div>'
          // El total no se mostraba porque calcularlo costaba otra pasada.
          // "#3 de 18" dice mucho más que "#3" solo.
          + '<div class="mr-zona">' + escHTML('de ' + total + ' · ' + miZona) + '</div>';
        wrap.appendChild(card);
      };
      if (r?.pos_rubro && r.rubro) tarjeta(r.pos_rubro, r.total_rubro, r.rubro);
      if (r?.pos_zona)             tarjeta(r.pos_zona,  r.total_zona,  'General');
      if (!wrap.children.length) {
        wrap.innerHTML = '<div style="font-size:12px;color:var(--ink3)">Sin ranking disponible</div>';
      }
    } catch (e) {
      wrap.innerHTML = '<div style="font-size:12px;color:var(--ink3)">Error al cargar ranking</div>';
    }
  }

  /** Entra a la app después de login/registro exitoso */
  function entrarApp() {
    document.getElementById('login-screen').classList.add('hidden');
    reflejarUsuario();
    iniciarRealtime();
    updateBellCount(); // badge inicial al entrar a la app
    cargarSliderRangosDesdeDB();
    // Verificar si hay una celebración de primer trabajo pendiente (solo prestadores)
    if (esPrestador()) verificarCelebracionPrimerTrabajo().catch(() => {});

    // Cargar KPIs de analítica para los tiles de Mi perfil (solo para prestadores)
    if (esPrestador()) {
      PronetDB.obtenerAnalitica('30d').then(data => {
        if (!data) return;
        const vistas = data.vistas_mes || 0;
        const contactos = data.contactos_mes || 0;
        const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        set('perfil-vistas-mes', vistas.toLocaleString('es-AR') + ' vistas este mes');
        set('analitic-menu-sub', vistas.toLocaleString('es-AR') + ' vistas · ' + contactos.toLocaleString('es-AR') + ' contactos este mes');
      }).catch(() => {});
    } // sincroniza SLIDER_RANGOS desde la tabla catalogo_servicios
    // Sincronizar zona del usuario con la zona activa de la app
    if (usuarioActual?.zona) { zonaActual = usuarioActual.zona; actualizarZonaLabel(zonaActual); }
    const tipo = usuarioActual?.tipo || userTipo || 'cliente';
    if (esPrestador()) {
      goTo('s-home');
      activarHomePrestador();
      setTimeout(() => mostrarTutorial(), 1000);
    } else {
      goTo('s-home');
      if (!usuarioActual?.zona) mostrarZonaAlLogin();
      setTimeout(() => mostrarTutorial(), 1000);
    }
    // Render explícito del feed (por si activarHomePrestador pisó el estado)
    setTimeout(() => renderHomeFeed(catActiva || 'todos'), 50);
  }

  /** Entra como invitado (sin cuenta) */
  function entrarInvitado() {
    usuarioActual = null;
    document.getElementById('login-screen').classList.add('hidden');
    reflejarUsuario();
    goTo('s-home');
  }

  // ── Registro ────────────────────────────────────────────────────────
  /** Muestra u oculta el selector de rubros según el tipo de cuenta. */
  function mostrarRubrosRegistro(esPrestador) {
    const wrap = document.getElementById('reg-rubro-wrap');
    if (wrap) wrap.style.display = esPrestador ? 'block' : 'none';
  }
  window.mostrarRubrosRegistro = mostrarRubrosRegistro;

  function mostrarFormRegistro() {
    const modal = document.getElementById('registro-modal');
    if (modal) modal.style.display = 'flex';
    // Los rubros se pintan al abrir, para que salgan del mismo catálogo
    // que usa Editar perfil y no haya dos listas que se desincronicen.
    const cont = document.getElementById('reg-rubros');
    if (cont && !cont.children.length) {
      cont.innerHTML = Object.keys(ESPECIALIDADES_POR_RUBRO).map(r =>
        '<div class="sub-opt" data-rubro="' + escHTML(r) + '"' +
        ' onclick="this.classList.toggle(\'on\')">' + escHTML(r) + '</div>'
      ).join('');
      if (typeof habilitarAccesibilidadTeclado === 'function') habilitarAccesibilidadTeclado(cont);
    }
    // Refleja el tipo que esté marcado al abrir.
    mostrarRubrosRegistro(document.querySelector('input[name="reg-tipo"]:checked')?.value === 'prestador');
  }
  function cerrarRegistro(ev) {
    if (ev && ev.target && ev.target.id !== 'registro-modal') return;
    const modal = document.getElementById('registro-modal');
    if (modal) modal.style.display = 'none';
  }
  async function hacerRegistro() {
    if (!reportarInvalidos('reg-nombre', 'reg-email', 'reg-pw')) return;
    const nombre = (document.getElementById('reg-nombre')?.value || '').trim();
    const email  = (document.getElementById('reg-email')?.value || '').trim();
    const pw     = (document.getElementById('reg-pw')?.value || '').trim();
    const tipo   = document.querySelector('input[name="reg-tipo"]:checked')?.value || 'cliente';
    const err    = document.getElementById('reg-error');

    if (!nombre || !email || !pw) { if (err) { err.textContent = 'Completá todos los campos'; err.style.display='block'; } return; }

    // Un prestador sin rubro queda invisible: no entra en el push de
    // notificar_rubro ni aparece cuando el vecino filtra por categoría.
    // Antes se caía en 'General' por defecto y el problema no se veía
    // hasta que el prestador se preguntaba por qué no le llega nada.
    const rubros = Array.from(document.querySelectorAll('#reg-rubros .sub-opt.on')).map(e => e.dataset.rubro);
    if (tipo === 'prestador' && rubros.length === 0) {
      if (err) { err.textContent = 'Elegí al menos un rubro para trabajar'; err.style.display = 'block'; }
      document.getElementById('reg-rubro-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) { err.textContent = 'El email no tiene un formato válido'; err.style.display='block'; } return; }
    if (pw.length < 8) { if (err) { err.textContent = 'La contraseña debe tener al menos 8 caracteres'; err.style.display='block'; } return; }
    if (nombre.trim().split(/\s+/).length < 2) { if (err) { err.textContent = 'Ingresá nombre y apellido'; err.style.display='block'; } return; }

    // El consentimiento se pide acá y en ningún otro lado. Se guarda contra
    // la CUENTA (perfiles.tyc_aceptado_en), no contra el dispositivo.
    const okTyc  = document.getElementById('reg-tyc')?.checked;
    const okEdad = document.getElementById('reg-edad')?.checked;
    if (!okTyc || !okEdad) {
      if (err) {
        err.textContent = !okTyc
          ? 'Tenés que aceptar los Términos y Condiciones'
          : 'Tenés que declarar que sos mayor de 18 años';
        err.style.display = 'block';
      }
      document.getElementById(!okTyc ? 'reg-tyc' : 'reg-edad')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Se toma ANTES de crear la cuenta: es el momento real del clic, no el
    // de la respuesta del servidor.
    const tycEn = new Date().toISOString();

    const btn = document.getElementById('reg-submit');
    if (btn) btn.innerHTML = 'Creando cuenta...';
    const res = await PronetDB.registrar(email, pw, nombre, tipo, zonaActual, rubros, tycEn);
    if (btn) btn.innerHTML = 'Crear cuenta';

    if (!res.ok) {
      const msgError = typeof res.error === 'string' ? res.error : (res.error?.message || 'Error al crear la cuenta');
      if (err) { err.textContent = msgError === 'User already registered' ? 'Ese email ya está registrado' : msgError; err.style.display='block'; }
      return;
    }

    // Si el email no está confirmado, mostrar aviso y no dejar entrar
    if (res.user && !res.user.email_confirmed_at) {
      cerrarRegistro();
      showToast('📧 Revisá tu email y confirmá tu cuenta para ingresar', 8000);
      return;
    }

    usuarioActual = await PronetDB.usuarioActual();

    // El trigger de alta sólo crea la fila de `perfiles`. La de
    // `prestadores` la crea `asegurar_ficha_prestador()`, que es idempotente
    // y el único lugar del sistema que inserta ahí — por eso se la llama en
    // vez de repetir la lógica en el trigger, que abriría la puerta a filas
    // dobles.
    //
    // Sin esto, quien se registraba como prestador quedaba con
    // prestador_id en null: esPrestador() daba false y la app lo trataba
    // como vecino, sin que nada fallara.
    // El trigger de alta sólo crea la fila de `perfiles`. La de
    // `prestadores` la crea este RPC, que es idempotente y el único lugar
    // del sistema que inserta ahí.
    //
    // Los rubros NO se mandan desde acá: el RPC los lee del metadata del
    // signup. Corregirlos con un UPDATE posterior no funcionaba —medido en
    // tres altas seguidas, la ficha quedaba en 'General'— porque depende de
    // que la sesión y el perfil ya estén resueltos en el instante justo.
    if (tipo === 'prestador') {
      const ficha = await PronetDB.asegurarFichaPrestador().catch(() => ({ ok: false }));
      if (ficha?.ok) usuarioActual = await PronetDB.usuarioActual();
    }

    // Venía de un link de alta: la pre-alta se convierte en su ficha, con los
    // rubros y la zona ya cargados, y arrastra el teléfono si no puso uno.
    // Va DESPUÉS de asegurarFichaPrestador para no depender del orden: el RPC
    // es idempotente y devuelve la ficha existente si ya está.
    if (window._reclamarPrealta) {
      const r = await PronetDB.reclamarPrealta(window._reclamarPrealta).catch(() => ({ ok: false }));
      window._reclamarPrealta = null;
      if (r?.ok) usuarioActual = await PronetDB.usuarioActual();
      else console.warn('[prealta] no se pudo reclamar:', r?.error);
    }

    cerrarRegistro();
    entrarApp();
  }

  // ══ SOPORTE WHATSAPP ══════════════════════════════════════════════
  function abrirSoporteWhatsapp() {
    const popup = document.getElementById('wa-popup');
    if (!popup) return;
    const isOpen = popup.style.display !== 'none';
    if (isOpen) { popup.style.display = 'none'; return; }
    const num = window.PRONET_CONFIG?.WHATSAPP_SOPORTE || '5491140618983';
    const msg = encodeURIComponent('Hola, necesito ayuda con PRONET 👋');
    const link = document.getElementById('wa-popup-link');
    if (link) link.href = 'https://wa.me/' + num + '?text=' + msg;
    popup.style.display = 'block';
  }
  function cerrarWaPopup() {
    const popup = document.getElementById('wa-popup');
    if (popup) popup.style.display = 'none';
  }
  window.abrirSoporteWhatsapp = abrirSoporteWhatsapp;
  window.cerrarWaPopup = cerrarWaPopup;

  // ══ COMPARTIR APP ═════════════════════════════════════════════════
  async function compartirApp() {
    const shareData = {
      title: 'PRONET — Servicios de confianza en tu barrio',
      text: '¡Encontrá electricistas, plomeros, niñeras y más en tu zona! Precio referencial, ranking zonal y contratá directo. Probalo gratis 👇',
      url: window.location.origin
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('[Compartir] error:', e);
      }
    } else {
      // Fallback: copiar link al portapapeles
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast && showToast('📋 Link copiado al portapapeles');
      } catch (e) {
        // Último fallback: prompt con el link
        prompt('Copiá este link para compartir PRONET:', shareData.url);
      }
    }
  }
  window.compartirApp = compartirApp;

  async function cerrarSesion() {
    await PronetDB.logout();
    usuarioActual = null;
    location.reload();
  }

  function togglePw(btn) {
    // FIX: el botón llega como parámetro (this) en vez de depender del global 'event'
    const inp = document.getElementById('login-pw');
    if (inp.type === 'password') {
      inp.type = 'text'; btn.textContent = 'Ocultar';
    } else {
      inp.type = 'password'; btn.textContent = 'Mostrar';
    }
  }

  function showRecover() {
    document.getElementById('recover-panel').classList.add('show');
  }
  function hideRecover() {
    document.getElementById('recover-panel').classList.remove('show');
    document.getElementById('recover-sent').style.display = 'none';
    const errEl = document.getElementById('recover-error');
    if (errEl) errEl.style.display = 'none';
    const btn = document.querySelector('#recover-panel .btn-p');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar link de recuperación'; btn.style.display = ''; }
    const inp = document.getElementById('pub-email');
    if (inp) inp.value = '';
  }
  async function sendRecover() {
    const email = (document.getElementById('pub-email')?.value || '').trim();
    const errEl = document.getElementById('recover-error');
    if (!email) {
      if (errEl) { errEl.textContent = 'Ingresá tu email'; errEl.style.display = 'block'; }
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) { errEl.textContent = 'El email no tiene un formato válido'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';
    const btn = document.querySelector('#recover-panel .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      const { error } = await window._sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/?reset=1',
      });
      if (error) throw error;
      document.getElementById('recover-sent').style.display = 'block';
      if (btn) btn.style.display = 'none';
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar link de recuperación'; }
      if (errEl) { errEl.textContent = 'No pudimos enviar el email. Intentá de nuevo.'; errEl.style.display = 'block'; }
    }
  }

  async function showBiometric() {
    const ov = document.getElementById('bio-overlay');
    ov.classList.add('show');
    // Verificar que existe una sesión activa en Supabase (no simular)
    const { data } = await (window._sb?.auth?.getSession().catch(() => ({ data: {} })) || Promise.resolve({ data: {} }));
    ov.classList.remove('show');
    if (data?.session) {
      document.getElementById('login-screen').classList.add('hidden');
      restaurarSesion();
    } else {
      showToast && showToast('⚠️ Sesión expirada. Iniciá sesión con tu cuenta.');
    }
  }
  function hideBiometric() {
    document.getElementById('bio-overlay').classList.remove('show');
  }

  // ── Notificaciones ──────────────────────────────────────────────────

  /** Actualiza el badge de la campanita consultando la BD */
  async function updateBellCount() {
    const badge = document.getElementById('bell-count');
    if (!badge) return;
    const count = await PronetDB.contarNotisNoLeidas().catch(() => 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  /** Renderiza la lista de notificaciones desde la BD */
  async function renderNotificaciones() {
    const lista = document.getElementById('notif-list');
    if (!lista) return;
    lista.innerHTML = '<div style="text-align:center;padding:32px;color:#999;font-size:13px">Cargando...</div>';
    const notis = await PronetDB.listarNotificaciones(50).catch(() => []);
    if (!notis.length) {
      lista.innerHTML = '<div style="text-align:center;padding:48px 16px;color:#999;font-size:13px">No tenés notificaciones aún</div>';
      return;
    }
    lista.innerHTML = notis.map(n => {
      const hace = tiempoRelativo(new Date(n.creado));
      const leida = n.leida;
      const icono = { pedido:'📋', propuesta:'📬', mensaje:'💬', cancelacion:'❌', terminado:'✅', resena:'⭐', verificacion:'🪪', pedido_mercado:'🛒', general:'🔔' }[n.tipo] || '🔔';
      return '<div class="notif-item' + (leida ? '' : ' unread') + '" data-id="' + n.id + '" data-url="' + escHTML(n.url||'')+'" data-type="'+n.tipo+'" style="cursor:' + (n.url?'pointer':'default') + '">' +
        (leida ? '' : '<div class="notif-unread-dot"></div>') +
        '<div class="notif-avatar" style="background:#EEF2FF;color:#2B5BFF">' + icono + '</div>' +
        '<div class="notif-body">' +
          '<div class="notif-title">' + escHTML(n.titulo) + '</div>' +
          (n.cuerpo ? '<div class="notif-time" style="color:#555;margin-bottom:2px">' + escHTML(n.cuerpo) + '</div>' : '') +
          '<div class="notif-time">' + hace + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    updateBellCount();
  }

  /** Marcar todas como leídas */
  async function markAllRead() {
    const items = document.querySelectorAll('#s-notif .notif-item.unread');
    for (const el of items) {
      const id = el.dataset.id;
      if (id) await PronetDB.marcarNotificacionLeida(id).catch(() => {});
      el.classList.remove('unread');
      el.querySelector('.notif-unread-dot')?.remove();
    }
    updateBellCount();
  }

  /** Filtro por tipo */
  function filterNotif(chip, type) {
    document.querySelectorAll('.notif-filter-row .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    document.querySelectorAll('#s-notif .notif-item').forEach(item => {
      item.style.display = (type === 'all' || item.dataset.type === type) ? 'flex' : 'none';
    });
    document.querySelectorAll('#s-notif .notif-group-label').forEach(lbl => {
      let next = lbl.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains('notif-group-label')) {
        if (next.style.display !== 'none') hasVisible = true;
        next = next.nextElementSibling;
      }
      lbl.style.display = hasVisible ? '' : 'none';
    });
  }

  // Marcar como leída individualmente al hacer click + navegar si tiene url
  document.addEventListener('click', async e => {
    const item = e.target.closest('.notif-item');
    if (!item) return;
    const id = item.dataset.id;
    const url = item.dataset.url;
    if (item.classList.contains('unread')) {
      item.classList.remove('unread');
      item.querySelector('.notif-unread-dot')?.remove();
      if (id) await PronetDB.marcarNotificacionLeida(id).catch(() => {});
      updateBellCount();
    }
    if (url) {
      const hash = url.replace(/^.*#/, '#');
      if (hash.startsWith('#s-')) goTo(hash.replace('#', ''));
    }
  });

  function elegirPrestador(nombre, iniciales, bgColor, textColor, precio, plazo) {
    // Actualizar pantalla de confirmación con datos del prestador elegido
    const title = document.getElementById('conf-title');
    const av    = document.getElementById('conf-av');
    const cname = document.getElementById('conf-name');
    const cprecio = document.getElementById('conf-precio');
    const cplazo  = document.getElementById('conf-plazo');
    if (title)   title.textContent   = '¡Elegiste a ' + nombre + '!';
    if (av)      { av.textContent = iniciales; av.style.background = bgColor; av.style.color = textColor; }
    if (cname)   cname.textContent   = nombre;
    if (cprecio) cprecio.textContent = precio + ' precio fijo';
    if (cplazo)  cplazo.textContent  = plazo;
    // Agregar notificación al centro de notifs (simular que le llegó al prestador)
    addNotifElegido();
    // Ir a la pantalla de confirmación
    goTo('s-confirmacion');
  }

  // FIX: se eliminaron los parámetros (nombre, precio) que nunca se usaban
  function addNotifElegido() {
    // Actualizar badge de la campanita
    const badge = document.getElementById('bell-count');
    if (badge) {
      const n = parseInt(badge.textContent || '0') + 1;
      badge.textContent = n;
      badge.style.display = 'flex';
    }
  }

  // ── Pedidos ──────────────────────────────────────────────────────────
  function switchPedTab(tab) {
    document.getElementById('ptab-busco').classList.toggle('on', tab === 'busco');
    document.getElementById('ptab-presto').classList.toggle('on', tab === 'presto');
    document.getElementById('pview-busco').style.display = tab === 'busco' ? 'block' : 'none';
    document.getElementById('pview-presto').style.display = tab === 'presto' ? 'block' : 'none';
  }

  function npNext(step) {
    // ── Validación temprana: al salir del paso 1, exigir título y descripción ──
    if (step === 2) {
      if (!reportarInvalidos('np-titulo', 'np-desc')) return;
      const titulo = (document.getElementById('np-titulo')?.value || '').trim();
      const desc   = (document.getElementById('np-desc')?.value || '').trim();
      if (!titulo || !desc) {
        mostrarErrorCampo(!titulo ? 'np-titulo' : 'np-desc',
          !titulo ? 'Completá el título del pedido' : 'Contanos qué necesitás en la descripción');
        return;
      }
    }
    [1,2,3].forEach(i => { const el = document.getElementById('np-'+i); if(el) el.style.display='none'; });
    const ex = document.getElementById('np-exito'); if(ex) ex.style.display='none';
    const t = document.getElementById('np-'+step); if(t) { t.style.display='block'; }
    const s = document.getElementById('s-nuevo-pedido'); if(s) s.scrollTop=0;
    // Inicializar grid de fotos al llegar al paso 3
    if (step === 3) npIniciarFotos();
  }

  /** Marca un campo con error y muestra un mensaje tooltip debajo */
  function mostrarErrorCampo(inputId, mensaje) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.style.border = '2px solid #EF4444';
    inp.focus();
    inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Tooltip de error debajo del campo
    let tip = document.getElementById(inputId + '-error-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = inputId + '-error-tip';
      tip.style.cssText = 'color:#DC2626;font-size:12px;font-weight:600;margin-top:5px;display:flex;align-items:center;gap:4px';
      inp.parentNode.insertBefore(tip, inp.nextSibling);
    }
    tip.innerHTML = '⚠️ ' + mensaje;
    // Limpiar al escribir
    inp.addEventListener('input', function fix() {
      inp.style.border = '';
      if (tip) tip.remove();
      inp.removeEventListener('input', fix);
    });
  }

  function npBack(step) {
    if(step <= 1) { goTo('s-pedidos'); return; }
    npNext(step-1);
  }

  // ── Fotos del pedido ────────────────────────────────────────────────────
  let npFotosArchivos = []; // archivos seleccionados por el vecino

  /** Inicializa el grid de fotos al entrar al paso 3 */
  function npIniciarFotos() {
    npFotosArchivos = [];
    npRenderFotosGrid();
  }

  /** Renderiza el grid de slots: los seleccionados + un slot vacío para agregar */
  function npRenderFotosGrid() {
    const grid = document.getElementById('np-fotos-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // Slots con preview de fotos ya cargadas
    npFotosArchivos.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const slot = document.createElement('div');
      slot.className = 'foto-slot filled';
      slot.style.position = 'relative';
      slot.innerHTML = `
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;position:absolute;inset:0">
        <button onclick="npQuitarFoto(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:13px;cursor:pointer;line-height:1;z-index:2">×</button>
      `;
      grid.appendChild(slot);
    });
    // Slot para agregar (máximo 4 fotos)
    if (npFotosArchivos.length < PRONET_CONFIG.PEDIDO_FOTOS_MAX) {
      const add = document.createElement('div');
      add.className = 'foto-slot';
      add.innerHTML = '<div class="fs-icon">➕</div><div class="fs-lbl">Agregar foto</div>';
      add.onclick = () => document.getElementById('np-foto-input')?.click();
      grid.appendChild(add);
    }
  }

  /** Maneja la selección de archivos desde el input */
  function npAgregarFotos(input) {
    const files = Array.from(input.files || []);
    const restantes = PRONET_CONFIG.PEDIDO_FOTOS_MAX - npFotosArchivos.length;
    files.slice(0, restantes).forEach(f => npFotosArchivos.push(f));
    input.value = ''; // reset para permitir re-seleccionar el mismo archivo
    npRenderFotosGrid();
  }

  /** Quita una foto del array y re-renderiza */
  function npQuitarFoto(idx) {
    npFotosArchivos.splice(idx, 1);
    npRenderFotosGrid();
  }

  /** Sube las fotos a Storage usando PronetDB y devuelve array de URLs públicas */
  async function npSubirFotos(pedidoId) {
    if (!npFotosArchivos.length) return [];
    return await PronetDB.subirFotosPedido(pedidoId, npFotosArchivos);
  }

  // ══ PROMOCIONAR: COMPRAR UN ESPACIO DEL CARRUSEL ════════════════════
  //
  // Tercer producto que PRONET le vende a un usuario, después de las
  // suscripciones y los créditos. Sigue siendo "PRONET le cobra a alguien":
  // no es plata entre vecinos.
  //
  // El orden importa y es al revés de lo intuitivo: PRIMERO SE MODERA,
  // DESPUÉS SE COBRA. Cobrar antes obliga a devolver plata cada vez que se
  // rechaza una imagen, y eso es una operación que no queremos.

  let promoDestino = 'whatsapp';
  let promoImagenUrl = null;   // la del carrusel
  let promoFlyerUrl  = null;   // la que se abre ampliada, si el destino es 'imagen'

  async function abrirPromocionar() {
    if (!usuarioActual) {
      mostrarGate && mostrarGate({ titulo: 'Promocionar', sub: 'Necesitás una cuenta.' });
      return;
    }
    goTo('s-promocionar');
    promoDestino = 'whatsapp';
    promoImagenUrl = null;
    promoFlyerUrl = null;
    ['promo-nombre','promo-whatsapp'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const err = document.getElementById('promo-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    promoSetDestino('whatsapp');

    // El teléfono del perfil como valor propuesto: casi siempre es el mismo,
    // y ahorra tipearlo.
    const wa = document.getElementById('promo-whatsapp');
    if (wa && usuarioActual.telefono) wa.value = usuarioActual.telefono;

    // El precio sale de planes_limites, igual que los planes: nunca escrito
    // en el cliente, para que no diga uno y se cobre otro.
    //
    // Se lee de la base y NO de PRONET_CONFIG.PLANES: el sync del arranque
    // sólo pisa los planes que ya existen en config.js, así que la fila
    // `banner` —que es nueva— nunca llegaría y el precio quedaría en
    // "Consultar" para siempre.
    const pEl = document.getElementById('promo-precio');
    if (pEl) pEl.textContent = '…';
    PronetDB.listarPlanesLimites().then(filas => {
      const precio = (filas || []).find(f => f.plan === 'banner')?.precio_mes;
      const el = document.getElementById('promo-precio');
      if (el) el.textContent = precio ? '$' + Number(precio).toLocaleString('es-AR') : 'Consultar';
    }).catch(() => {});

    const libres = await PronetDB.bannersEspaciosLibres();
    const esp = document.getElementById('promo-espacios');
    if (esp) esp.textContent = libres > 0
      ? '📍 Quedan ' + libres + ' espacio' + (libres === 1 ? '' : 's') + ' disponible' + (libres === 1 ? '' : 's')
      : '📍 Por ahora no hay espacios libres';
    const btn = document.getElementById('promo-btn');
    if (btn) { btn.disabled = libres <= 0; btn.style.opacity = libres > 0 ? '1' : '.5'; }

    renderMisBanners();
  }
  window.abrirPromocionar = abrirPromocionar;

  function promoSetDestino(tipo) {
    promoDestino = tipo;
    document.querySelectorAll('#promo-destino .mkt-sec').forEach((b, i) => {
      b.classList.toggle('on', (i === 0) === (tipo === 'whatsapp'));
    });
    const w = document.getElementById('promo-wrap-whatsapp');
    const f = document.getElementById('promo-wrap-flyer');
    if (w) w.style.display = tipo === 'whatsapp' ? '' : 'none';
    if (f) f.style.display = tipo === 'imagen'   ? '' : 'none';
  }
  window.promoSetDestino = promoSetDestino;

  /** Sube y previsualiza. Se sube al elegirla y no al enviar: así el vecino
   *  ve si la imagen entró antes de completar el resto. */
  async function _promoSubir(input, contenedorId, cb) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast && showToast('⚠️ La imagen no puede superar 5 MB'); input.value = ''; return; }
    const cont = document.getElementById(contenedorId);
    if (cont) cont.innerHTML = '<div style="font-size:13px;color:var(--ink3)">⏳ Subiendo…</div>';
    const res = await PronetDB.subirImagenBanner(file, true);   // true = carpeta propia
    if (!res.ok) {
      if (cont) cont.innerHTML = '<div style="font-size:12.5px;color:#E53E3E;padding:0 12px;text-align:center">No se pudo subir: ' + escHTML(res.error || '') + '</div>';
      return;
    }
    if (cont) cont.innerHTML = '<img src="' + escHTML(res.url) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
    cb(res.url);
  }

  function promoPrevisualizar(input) { _promoSubir(input, 'promo-img-prev', (u) => { promoImagenUrl = u; }); }
  window.promoPrevisualizar = promoPrevisualizar;
  function promoPrevisualizarFlyer(input) { _promoSubir(input, 'promo-flyer-prev', (u) => { promoFlyerUrl = u; }); }
  window.promoPrevisualizarFlyer = promoPrevisualizarFlyer;

  async function promoEnviar() {
    const err = document.getElementById('promo-error');
    const btn = document.getElementById('promo-btn');
    const decir = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };
    const nombre = (document.getElementById('promo-nombre')?.value || '').trim();

    if (!nombre) return decir('Poné un nombre para identificar tu aviso');
    if (!promoImagenUrl) return decir('Falta la imagen del aviso');
    let enlace;
    if (promoDestino === 'whatsapp') {
      const tel = (document.getElementById('promo-whatsapp')?.value || '').trim();
      if (tel.replace(/\D/g, '').length < 8) return decir('Escribí un WhatsApp válido');
      enlace = 'https://wa.me/' + telParaWhatsapp(tel);
    } else {
      if (!promoFlyerUrl) return decir('Falta el flyer que se abre al tocarlo');
      enlace = promoFlyerUrl;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    const res = await PronetDB.comprarBanner({
      nombre, imagen_url: promoImagenUrl, enlace, dias: 30, destino: promoDestino,
    });
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar a revisión'; }
    if (!res.ok) return decir(res.error || 'No se pudo enviar');

    if (err) err.style.display = 'none';
    showToast && showToast('✅ Tu aviso quedó en revisión. Te avisamos cuando lo aprobemos.');
    abrirPromocionar();   // recarga el formulario limpio y la lista
  }
  window.promoEnviar = promoEnviar;

  // ── Moderación de avisos (admin) ─────────────────────────────────────
  const _bannersModCache = new Map();

  async function renderBannersPendientes() {
    const cont = document.getElementById('mod-banners-lista');
    const wrap = document.getElementById('mod-banners');
    if (!cont || !wrap) return;
    // La sección entera desaparece con el circuito apagado: no tiene sentido
    // una cola de moderación de algo que nadie puede enviar.
    if (!bannersPagosActivos()) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    cont.innerHTML = '<div style="padding:16px 0;text-align:center;font-size:12.5px;color:var(--ink3)">⏳ Cargando…</div>';
    const lista = await PronetDB.listarBannersPendientes();
    const libres = await PronetDB.bannersEspaciosLibres();
    const aviso = document.getElementById('mod-banners-espacios');
    if (aviso) {
      aviso.textContent = libres > 0
        ? 'Quedan ' + libres + ' espacio' + (libres === 1 ? '' : 's') + ' libre' + (libres === 1 ? '' : 's')
        : 'Sin espacios libres: no vas a poder aprobar hasta que venza alguno';
      aviso.style.color = libres > 0 ? 'var(--ink3)' : '#BE123C';
    }
    if (!lista.length) {
      cont.innerHTML = '<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--ink3)">No hay avisos esperando revisión.</div>';
      return;
    }
    _bannersModCache.clear();
    lista.forEach(b => _bannersModCache.set(b.id, b));
    cont.innerHTML = lista.map(b => {
      const quien = b.perfiles?.nombre || 'Vecino';
      const destino = b.destino_tipo === 'imagen' ? 'Abre un flyer' : 'Abre WhatsApp';
      return '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">' +
        '<img src="' + escHTML(b.imagen_url) + '" alt="" style="width:100%;aspect-ratio:3/1;object-fit:cover;border-radius:8px;display:block;margin-bottom:9px">' +
        '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">' + escHTML(b.nombre) + '</div>' +
        '<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">' + escHTML(quien) + ' · ' + escHTML(destino) + ' · ' + (b.dias || 30) + ' días</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
          '<button onclick="modResolverBanner(\'' + escHTML(b.id) + '\',true)" style="flex:1;padding:9px;font-size:12.5px;font-weight:700;background:#166534;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Aprobar</button>' +
          '<button onclick="modResolverBanner(\'' + escHTML(b.id) + '\',false)" style="flex:1;padding:9px;font-size:12.5px;font-weight:700;background:var(--surface);color:#BE123C;border:1.5px solid #FECACA;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Rechazar</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  window.renderBannersPendientes = renderBannersPendientes;

  async function modResolverBanner(id, aprobar) {
    const b = _bannersModCache.get(id);
    if (!b) return;
    let motivo = null;
    if (!aprobar) {
      // El motivo le llega al vecino tal cual: es lo único que le explica
      // por qué se rechazó y qué corregir.
      motivo = prompt('¿Por qué se rechaza? El vecino va a leer esto.');
      if (motivo === null) return;
    }
    const res = await PronetDB.resolverBanner(id, aprobar, motivo);
    if (!res?.ok) { showToast && showToast('⚠️ ' + (res?.error || 'No se pudo resolver')); return; }
    showToast && showToast(aprobar ? '✅ Aprobado. Ahora puede pagarlo.' : 'Rechazado.');
    renderBannersPendientes();
  }
  window.modResolverBanner = modResolverBanner;

  // ── Moderación de avisos de prestadores (admin) ──────────────────────
  // Mismo molde que los banners: nada sale al aire sin pasar por acá, y el
  // motivo del rechazo le llega al prestador tal cual (por notificación,
  // cosa que el RPC hace solo).
  const _pubsModCache = new Map();

  async function renderPubsPendientes() {
    const cont = document.getElementById('mod-pubs-lista');
    const wrap = document.getElementById('mod-pubs-prestador');
    if (!cont || !wrap) return;
    if (!pubsPrestadorActivo()) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    cont.innerHTML = '<div style="padding:16px 0;text-align:center;font-size:12.5px;color:var(--ink3)">⏳ Cargando…</div>';
    const lista = await PronetDB.listarPubsPrestadorPendientes();
    if (!lista.length) {
      cont.innerHTML = '<div style="padding:16px 14px;text-align:center;font-size:12.5px;color:var(--ink3)">No hay avisos de prestadores esperando revisión.</div>';
      return;
    }
    _pubsModCache.clear();
    lista.forEach(p => _pubsModCache.set(p.id, p));
    cont.innerHTML = lista.map(p => {
      const quien = p.prestadores?.nombre || 'Prestador';
      return '<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">' +
        (p.foto_url
          ? '<img src="' + escHTML(p.foto_url) + '" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block;margin-bottom:9px">'
          : '') +
        '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">' + escHTML(p.titulo) + '</div>' +
        '<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">' + escHTML(quien) + ' · ' + escHTML(rubroDeCat(p.rubro)) + '</div>' +
        (p.descripcion ? '<div style="font-size:12px;color:var(--ink2);margin-top:6px;line-height:1.45">' + escHTML(p.descripcion) + '</div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
          '<button onclick="modResolverPub(\'' + escHTML(p.id) + '\',true)" style="flex:1;padding:9px;font-size:12.5px;font-weight:700;background:#166534;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Aprobar</button>' +
          '<button onclick="modResolverPub(\'' + escHTML(p.id) + '\',false)" style="flex:1;padding:9px;font-size:12.5px;font-weight:700;background:var(--surface);color:#BE123C;border:1.5px solid #FECACA;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Rechazar</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  window.renderPubsPendientes = renderPubsPendientes;

  async function modResolverPub(id, aprobar) {
    const p = _pubsModCache.get(id);
    if (!p) return;
    let motivo = null;
    if (!aprobar) {
      motivo = prompt('¿Por qué se rechaza? El prestador va a leer esto.');
      if (motivo === null) return;
    }
    const res = await PronetDB.resolverPubPrestador(id, aprobar, motivo);
    if (!res?.ok) { showToast && showToast('⚠️ ' + (res?.error || 'No se pudo resolver')); return; }
    showToast && showToast(aprobar ? '✅ Publicado. El prestador ya recibió el aviso.' : 'Rechazado. Le llegó el motivo al prestador.');
    renderPubsPendientes();
  }
  window.modResolverPub = modResolverPub;

  const _misBannersCache = new Map();

  async function renderMisBanners() {
    const cont = document.getElementById('promo-lista');
    if (!cont) return;
    cont.innerHTML = '<div style="padding:18px 0;text-align:center;font-size:12.5px;color:var(--ink3)">⏳ Cargando…</div>';
    const lista = await PronetDB.listarMisBanners();
    if (!lista.length) {
      cont.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:12.5px;color:var(--ink3)">Todavía no enviaste ningún aviso.</div>';
      return;
    }
    _misBannersCache.clear();
    lista.forEach(b => _misBannersCache.set(b.id, b));
    const E = {
      pendiente: { t: 'En revisión', c: '#B45309', b: '#FEF3C7' },
      aprobado:  { t: 'Aprobado',    c: '#166534', b: '#DCFCE7' },
      rechazado: { t: 'Rechazado',   c: '#BE123C', b: '#FFE4E6' },
      activo:    { t: 'Publicado',   c: '#166534', b: '#DCFCE7' },
      borrador:  { t: 'Borrador',    c: 'var(--ink3)', b: 'var(--surface)' },
    };
    cont.innerHTML = lista.map(b => {
      const e = E[b.estado] || E.pendiente;
      const vence = b.hasta ? new Date(b.hasta).toLocaleDateString('es-AR') : null;
      return '<div style="border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<img src="' + escHTML(b.imagen_url) + '" alt="" style="width:64px;height:22px;object-fit:cover;border-radius:5px;flex-shrink:0">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">' + escHTML(b.nombre) + '</div>' +
            '<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">' +
              (b.estado === 'activo'
                ? ('👆 ' + (b.clicks || 0) + ' click' + (b.clicks === 1 ? '' : 's') + (vence ? ' · hasta el ' + vence : ''))
                : (b.dias || 30) + ' días') +
            '</div>' +
          '</div>' +
          '<span style="flex-shrink:0;background:' + e.b + ';color:' + e.c + ';border-radius:20px;padding:4px 10px;font-size:10.5px;font-weight:700">' + e.t + '</span>' +
        '</div>' +
        (b.estado === 'rechazado' && b.motivo_rechazo
          ? '<div style="font-size:11.5px;color:#BE123C;margin-top:8px;line-height:1.45">' + escHTML(b.motivo_rechazo) + '</div>' : '') +
        (b.estado === 'aprobado'
          ? '<button onclick="promoPagar(\'' + escHTML(b.id) + '\')" style="width:100%;margin-top:9px;padding:9px;font-size:12.5px;font-weight:700;background:var(--blue);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Pagar y publicar</button>'
          : '') +
      '</div>';
    }).join('');
  }

  /** Lleva al checkout. Sólo el id viaja en el onclick — el resto sale del
   *  cache, mismo criterio que en el resto de la app. */
  async function promoPagar(id) {
    const b = _misBannersCache.get(id);
    if (!b) return;
    if (!mpCheckoutActivo()) {
      showToast && showToast('🧪 El cobro está en modo test: pedile al admin que lo active.');
      return;
    }
    showToast && showToast('Abriendo el pago…');
    const res = await PronetDB.crearPreferenciaMP('banner', 'mes', id);
    if (res?.init_point) { window.location.href = res.init_point; return; }
    showToast && showToast('⚠️ No se pudo abrir el pago. ' + (res?.error || ''));
  }
  window.promoPagar = promoPagar;

  // ══ MIS AVISOS EN SERVICIOS (panel del prestador) ═══════════════════
  //
  // Fase 2 de PLAN-PUBLICACIONES-PRESTADOR.md. El prestador arma hasta
  // pub_slots avisos con foto y los manda a revisión; el admin los aprueba
  // (Fase 3) y recién ahí los ve el vecino (Fase 4). El prestador NO navega
  // ese espacio: su ventana a cómo quedó es la vista previa de acá.

  function pubsPrestadorActivo() {
    return configApp.publicaciones_prestador === 'true';
  }

  let _ppLista = [];          // cache de la última carga
  let _ppEditando = null;     // id en edición, o null si es alta
  let _ppFotoNueva = null;    // File elegido en el form, todavía sin subir
  let _ppMiPrestador = null;  // fila de `prestadores` propia (para la preview)

  function abrirPubsPrestador() {
    if (!esPrestador() || !pubsPrestadorActivo()) return;
    goTo('s-pubs-prestador');
    ppCerrarForm();
    renderPubsPrestador();
  }
  window.abrirPubsPrestador = abrirPubsPrestador;

  /** Etiqueta de estado para el slot. La 'vencida' es lógica: el estado en
   *  la base sigue siendo 'activa', pero la vigencia ya pasó y el RLS del
   *  feed ya no la muestra. */
  /** ¿Ya venció? Se pregunta por las dos vías a propósito: el cron pone
   *  estado='vencida' una vez por hora, así que entre que la vigencia pasa
   *  y el job corre hay una ventana donde sigue diciendo 'activa'. El feed
   *  del vecino nunca la muestra en esa ventana (el RLS compara la fecha),
   *  pero el panel del prestador sí la mostraría como publicada. */
  function ppVencida(p) {
    return p.estado === 'vencida'
      || (p.estado === 'activa' && new Date(p.vigencia_hasta) <= new Date());
  }

  function ppEstadoInfo(p) {
    if (ppVencida(p)) return { label: 'Vencida', bg: '#F1F3F7', color: '#8A94A3' };
    if (p.estado === 'activa') {
      const resta = Math.ceil((new Date(p.vigencia_hasta) - Date.now()) / 86400000);
      const porVencer = resta <= 2;
      return {
        label: 'Publicada · ' + resta + (resta === 1 ? ' día' : ' días'),
        bg: porVencer ? '#FFF4E0' : '#E7F6EF',
        color: porVencer ? '#B9760A' : '#127A52',
      };
    }
    if (p.estado === 'pendiente') return { label: 'En revisión', bg: '#FFF4E0', color: '#B9760A' };
    if (p.estado === 'rechazada') return { label: 'Rechazada', bg: '#FEF2F2', color: '#DC2626' };
    return { label: 'Borrador', bg: '#F1F3F7', color: '#5A6272' };
  }

  async function renderPubsPrestador() {
    const cont = document.getElementById('pp-slots');
    const cupo = document.getElementById('pp-cupo');
    if (!cont) return;
    cont.innerHTML = '<div style="padding:20px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando…</div>';

    _ppLista = await PronetDB.listarMisPubsPrestador();
    const slots = limitePlan('pub_slots') ?? 1;
    const dias  = limitePlan('pub_duracion_dias') ?? 7;
    if (cupo) cupo.textContent = _ppLista.length + ' de ' + slots + ' avisos usados · ' + dias + ' días al aire por aviso';

    const metricas = await PronetDB.metricasPubsPrestador(_ppLista.map(p => p.id));

    const tarjetas = _ppLista.map(p => {
      const e = ppEstadoInfo(p);
      const m = metricas[p.id] || { vistas: 0, clics: 0, likes: 0, solicitudes: 0 };
      const vencida = ppVencida(p);
      const editable = p.estado !== 'activa' || vencida;
      // Renovar sólo tiene sentido en lo que ya pasó por moderación una vez:
      // un borrador no se renueva, se envía.
      const renovable = vencida && !!p.moderado_en;
      // Impulsar sólo lo que está al aire de verdad: pagar por subir algo
      // que nadie puede ver sería cobrar por nada.
      const impulsado = p.impulso_hasta && new Date(p.impulso_hasta) > new Date();
      const impulsable = p.estado === 'activa' && !vencida && impulsosActivos();
      return '<div style="background:white;border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:10px">' +
        (p.foto_url
          ? '<div style="height:110px;background:#EEF1F6 url(' + escHTML(p.foto_url) + ') center/cover"></div>'
          : '<div style="height:56px;background:#EEF1F6;display:flex;align-items:center;justify-content:center;font-size:22px">🛠️</div>') +
        '<div style="padding:11px 13px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
            '<div style="font-size:14px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHTML(p.titulo) + '</div>' +
            '<span style="flex-shrink:0;font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;background:' + e.bg + ';color:' + e.color + '">' + e.label + '</span>' +
          '</div>' +
          '<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">' + escHTML(rubroDeCat(p.rubro)) + '</div>' +
          (p.estado === 'rechazada' && p.motivo_rechazo
            ? '<div style="font-size:11.5px;color:#DC2626;margin-top:6px;line-height:1.4">Motivo: ' + escHTML(p.motivo_rechazo) + '</div>' : '') +
          (p.estado === 'activa' || vencida
            ? '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--ink3);font-weight:600">' +
                '<span title="Vieron tu aviso">👁 ' + m.vistas + '</span>' +
                '<span title="Les gustó">👍 ' + m.likes + '</span>' +
                '<span title="Tocaron Contactar">👆 ' + m.clics + '</span>' +
                '<span title="Te mandaron un pedido" style="color:#127A52">📩 ' + m.solicitudes + '</span>' +
                (p.renovaciones ? '<span title="Veces renovado">🔄 ' + p.renovaciones + '</span>' : '') +
              '</div>' +
              // La conversión recién con una muestra mínima. Con 3 vistas y
              // 0 clics diría 0%, que no informa nada y desmotiva a quien
              // paga — mismo criterio con el que se postergó "Actividad
              // reciente" en Entre Vecinos.
              (m.vistas >= 20
                ? '<div style="margin-top:5px;font-size:11px;color:var(--ink3)">' +
                    Math.round((m.clics / m.vistas) * 100) + '% de los que lo vieron te contactaron</div>'
                : '') : '') +
          (impulsado
            ? '<div style="margin-top:8px;font-size:11px;font-weight:700;color:#B9760A">⚡ Impulsado hasta el ' +
                new Date(p.impulso_hasta).toLocaleDateString('es-AR') + '</div>' : '') +
          (impulsable && !impulsado
            ? '<button style="width:100%;margin-top:9px;border:1px solid #F59E0B;background:#FFF8EC;color:#B9760A;border-radius:9px;padding:8px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif" onclick="ppImpulsar(\'' + p.id + '\')">⚡ Impulsar · aparece primero</button>'
            : '') +
          (renovable
            ? '<div style="margin-top:9px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:9px 11px">' +
                '<div style="font-size:11.5px;color:#9A3412;line-height:1.4">Salió de Servicios. Renovalo y vuelve al aire sin pasar de nuevo por revisión.</div>' +
                '<button style="width:100%;margin-top:8px;border:0;background:#EA580C;color:white;border-radius:9px;padding:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif" onclick="ppRenovar(\'' + p.id + '\')">🔄 Renovar</button>' +
              '</div>' : '') +
          '<div style="display:flex;gap:8px;margin-top:10px">' +
            '<button style="flex:1;border:1px solid var(--border);background:white;border-radius:10px;padding:8px 4px;font-size:11.5px;font-weight:700;color:var(--ink2);cursor:pointer;font-family:\'Inter\',sans-serif" onclick="ppVistaPrevia(\'' + p.id + '\')">👀 Vista previa</button>' +
            (editable
              ? '<button style="flex:1;border:1px solid var(--border);background:white;border-radius:10px;padding:8px 4px;font-size:11.5px;font-weight:700;color:var(--ink2);cursor:pointer;font-family:\'Inter\',sans-serif" onclick="ppAbrirForm(\'' + p.id + '\')">✏️ Editar</button>'
              : '') +
            ((p.estado === 'borrador' || p.estado === 'rechazada')
              ? '<button style="flex:1.2;border:0;background:var(--blue);color:white;border-radius:10px;padding:8px 4px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif" onclick="ppEnviarRevision(\'' + p.id + '\')">Enviar a revisión</button>'
              : '') +
            '<button aria-label="Eliminar" style="border:1px solid var(--border);background:white;border-radius:10px;padding:8px 10px;font-size:12px;cursor:pointer" onclick="ppEliminar(\'' + p.id + '\')">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    const libres = Math.max(0, slots - _ppLista.length);
    const slotVacio = libres > 0
      ? '<div role="button" tabindex="0" onclick="ppAbrirForm(null)" style="border:2px dashed var(--border);border-radius:14px;padding:22px;text-align:center;cursor:pointer;background:var(--surface)">' +
          '<div style="font-size:22px">＋</div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--blue);margin-top:4px">Agregar aviso</div>' +
          '<div style="font-size:11px;color:var(--ink3);margin-top:2px">' + libres + (libres === 1 ? ' lugar libre' : ' lugares libres') + '</div>' +
        '</div>'
      : '<div style="border:1px solid var(--border);border-radius:14px;padding:14px;text-align:center;font-size:12px;color:var(--ink3);background:var(--surface)">Usaste todos los avisos de tu plan. Eliminá uno para armar otro.</div>';

    cont.innerHTML = tarjetas + slotVacio;
  }

  function ppLlenarRubros(sel, actual) {
    sel.innerHTML = RUBROS.map(r =>
      '<option value="' + escHTML(r.slug) + '"' + (r.slug === actual ? ' selected' : '') + '>' +
        r.emoji + ' ' + escHTML(r.n) + '</option>').join('');
  }

  function ppAbrirForm(id) {
    _ppEditando = id;
    _ppFotoNueva = null;
    const p = id ? _ppLista.find(x => x.id === id) : null;
    const form = document.getElementById('pp-form');
    if (!form) return;
    document.getElementById('pp-form-titulo').textContent = p ? 'Editar aviso' : 'Nuevo aviso';
    document.getElementById('pp-titulo').value = p?.titulo || '';
    document.getElementById('pp-desc').value = p?.descripcion || '';
    ppLlenarRubros(document.getElementById('pp-rubro'),
      p?.rubro || catDeRubro(usuarioActual?.rubro || '') || RUBROS[0].slug);
    const prev = document.getElementById('pp-img-prev');
    prev.innerHTML = p?.foto_url
      ? '<img src="' + escHTML(p.foto_url) + '" alt="" style="width:100%;height:100%;object-fit:cover">'
      : '<div style="font-size:26px">📷</div><div style="font-size:13px;font-weight:600;color:var(--blue)">Tocá para subir una foto</div>';
    const err = document.getElementById('pp-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    form.style.display = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.ppAbrirForm = ppAbrirForm;

  function ppCerrarForm() {
    _ppEditando = null;
    _ppFotoNueva = null;
    const form = document.getElementById('pp-form');
    if (form) form.style.display = 'none';
    const inp = document.getElementById('pp-img-input');
    if (inp) inp.value = '';
  }
  window.ppCerrarForm = ppCerrarForm;

  function ppPrevisualizar(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { showToast('⚠️ La foto no puede superar 5 MB.'); input.value = ''; return; }
    _ppFotoNueva = f;
    const prev = document.getElementById('pp-img-prev');
    const url = URL.createObjectURL(f);
    prev.innerHTML = '<img src="' + url + '" alt="" style="width:100%;height:100%;object-fit:cover">';
  }
  window.ppPrevisualizar = ppPrevisualizar;

  async function ppGuardar(estado) {
    const titulo = document.getElementById('pp-titulo').value.trim();
    const rubro  = document.getElementById('pp-rubro').value;
    const desc   = document.getElementById('pp-desc').value.trim();
    const err    = document.getElementById('pp-error');
    const mostrar = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };

    if (titulo.length < 3) return mostrar('Escribí un título (mínimo 3 letras).');
    const p = _ppEditando ? _ppLista.find(x => x.id === _ppEditando) : null;
    if (estado === 'pendiente' && !_ppFotoNueva && !p?.foto_url)
      return mostrar('Para enviarlo a revisión necesita una foto.');

    const btn1 = document.getElementById('pp-btn-revision');
    const btn2 = document.getElementById('pp-btn-borrador');
    [btn1, btn2].forEach(b => { if (b) b.disabled = true; });
    try {
      let foto_url = p?.foto_url || null;
      if (_ppFotoNueva) {
        foto_url = await PronetDB.subirFotoPubPrestador(_ppFotoNueva);
        if (!foto_url) return mostrar('No se pudo subir la foto. Probá de nuevo.');
      }
      const campos = { titulo, rubro, descripcion: desc || null, foto_url, estado };
      const res = _ppEditando
        ? await PronetDB.actualizarPubPrestador(_ppEditando, campos)
        : await PronetDB.crearPubPrestador(campos);
      if (!res.ok) {
        return mostrar(res.codigo === 'limite'
          ? 'Llegaste al máximo de avisos de tu plan.'
          : 'No se pudo guardar. ' + (res.error || ''));
      }
      showToast(estado === 'pendiente'
        ? '📨 Enviado. Te avisamos cuando lo revisemos.'
        : '💾 Guardado como borrador.');
      ppCerrarForm();
      renderPubsPrestador();
    } finally {
      [btn1, btn2].forEach(b => { if (b) b.disabled = false; });
    }
  }
  window.ppGuardar = ppGuardar;

  async function ppEnviarRevision(id) {
    const p = _ppLista.find(x => x.id === id);
    if (p && !p.foto_url) { ppAbrirForm(id); showToast('⚠️ Sumale una foto antes de enviarlo.'); return; }
    const res = await PronetDB.actualizarPubPrestador(id, { estado: 'pendiente' });
    if (!res.ok) { showToast('⚠️ ' + (res.error || 'No se pudo enviar.')); return; }
    showToast('📨 Enviado. Te avisamos cuando lo revisemos.');
    renderPubsPrestador();
  }
  window.ppEnviarRevision = ppEnviarRevision;

  function impulsosActivos() {
    return configApp.impulsos_activos === 'true';
  }

  /** Compra suelta: lleva al checkout de MP con el aviso como referencia.
   *  El mismo circuito del banner — y con el `ref` viajando de verdad, que
   *  es el detalle que la primera vez quedó afuera y dejó un pago cobrado
   *  sin efecto. */
  async function ppImpulsar(id) {
    const p = _ppLista.find(x => x.id === id);
    if (!p) return;
    const res = await PronetDB.crearPreferenciaMP('impulso', 'mes', id);
    if (res?.init_point) { window.location.href = res.init_point; return; }
    showToast('⚠️ No se pudo abrir el pago. ' + (res?.error || ''));
  }
  window.ppImpulsar = ppImpulsar;

  async function ppRenovar(id) {
    const res = await PronetDB.renovarPubPrestador(id);
    if (!res.ok) { showToast('⚠️ ' + (res.error || 'No se pudo renovar.')); return; }
    showToast('🔄 Renovado por ' + res.dias + ' días. Ya está de nuevo en Servicios.');
    renderPubsPrestador();
  }
  window.ppRenovar = ppRenovar;

  async function ppEliminar(id) {
    const p = _ppLista.find(x => x.id === id);
    if (!confirm('¿Eliminar "' + (p?.titulo || 'este aviso') + '"? No se puede deshacer.')) return;
    const res = await PronetDB.borrarPubPrestador(id);
    if (!res.ok) { showToast('⚠️ No se pudo eliminar.'); return; }
    showToast('🗑️ Aviso eliminado.');
    renderPubsPrestador();
  }
  window.ppEliminar = ppEliminar;

  /** La tarjeta como la va a ver el vecino (Fase 4 usa este mismo armado).
   *  De sólo lectura: no registra vista ni permite interacción — es la
   *  ventana del prestador a un espacio que no navega. */
  async function ppVistaPrevia(id) {
    const p = _ppLista.find(x => x.id === id);
    const cont = document.getElementById('pp-preview-card');
    if (!p || !cont) return;
    // rating/resenas viven en `prestadores`, no en el perfil: se trae la
    // fila real para que la vista previa muestre la misma reputación que va
    // a ver el vecino, no un dato inventado.
    if (!_ppMiPrestador && usuarioActual?.prestador_id) {
      _ppMiPrestador = await PronetDB.obtener('prestadores', usuarioActual.prestador_id);
    }
    cont.innerHTML = pubPrestadorCardHTML(p, {
      nombre: _ppMiPrestador?.nombre || usuarioActual?.nombre || '',
      rating: _ppMiPrestador?.rating, resenas: _ppMiPrestador?.resenas,
    }, true);
    document.getElementById('pp-preview').classList.add('show');
  }
  window.ppVistaPrevia = ppVistaPrevia;

  function ppCerrarPreview() {
    document.getElementById('pp-preview').classList.remove('show');
  }
  window.ppCerrarPreview = ppCerrarPreview;

  /** Tarjeta compartida entre la vista previa (F2) y el feed del vecino
   *  (F4). Reputación: SOLO la real — rating bayesiano y reseñas
   *  verificadas del prestador. Sin estrellas si todavía no tiene. */
  function pubPrestadorCardHTML(p, prestador, esPreview, social) {
    // Reputación: SÓLO la real. Sin reseñas verificadas no se inventan
    // estrellas — se dice que es nuevo, que es información honesta y no
    // castiga con un 0 a quien todavía no trabajó por la app.
    const rep = (prestador?.resenas > 0 && prestador?.rating)
      ? '★ ' + Number(prestador.rating).toFixed(1) + ' · ' + prestador.resenas + (prestador.resenas === 1 ? ' reseña' : ' reseñas')
      : 'Nuevo en PRONET';
    const id = escHTML(String(p.id || ''));
    const acciones = esPreview
      ? '<span style="font-size:11.5px;font-weight:700;color:white;background:var(--blue);padding:7px 13px;border-radius:8px;opacity:.5">Contactar (vista previa)</span>'
      : '<div style="display:flex;align-items:center;gap:8px">' +
          '<button id="pplike-' + id + '" onclick="pubPrestLike(\'' + id + '\')" ' +
            'style="border:1px solid var(--border);background:white;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;color:' +
            (social?.liked ? '#E11D48' : 'var(--ink3)') + '">' +
            (social?.liked ? '❤️ ' : '🤍 ') + (social?.likes || 0) + '</button>' +
          '<button onclick="pubPrestContactar(\'' + id + '\')" ' +
            'style="border:0;background:var(--blue);color:white;border-radius:8px;padding:7px 13px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif">Contactar</button>' +
        '</div>';
    return '<div style="background:white;border:1px solid var(--border);border-left:4px solid var(--blue);border-radius:14px;overflow:hidden;margin-bottom:11px">' +
      (p.foto_url ? '<div style="height:140px;background:#EEF1F6 url(' + escHTML(p.foto_url) + ') center/cover"></div>' : '') +
      '<div style="padding:12px 13px">' +
        '<span style="font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:6px;background:#E8F0FF;color:#1A4FC4">Prestador</span>' +
        '<div style="font-size:14.5px;font-weight:700;color:var(--ink);margin-top:6px">' + escHTML(p.titulo) + '</div>' +
        '<div style="font-size:12px;color:var(--ink3);margin-top:2px">' +
          escHTML(prestador?.nombre || '') + ' · ' + escHTML(rubroDeCat(p.rubro)) + '</div>' +
        (p.descripcion ? '<div style="font-size:12px;color:var(--ink2);margin-top:6px;line-height:1.45">' + escHTML(p.descripcion) + '</div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px">' +
          '<span style="font-size:11.5px;font-weight:700;color:#B9760A;flex-shrink:0">' + rep + '</span>' +
          acciones +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ══ PRE-ALTA DE PRESTADORES ═════════════════════════════════════════
  //
  // El alta normal pide email + contraseña + confirmar el mail. Alguien a
  // quien le ofrecés la app parado en una cola no abre el mail para
  // confirmar: ahí se pierde, no escribiendo el nombre. Esto separa capturar
  // el dato (30 segundos, sin cuenta) de crear la cuenta (después).
  //
  // Dos caminos al mismo formulario: el prestador entra por el link/QR del
  // vecino, o el vecino carga los datos en su propio teléfono. El segundo es
  // el más probable en la calle — el que tiene la app abierta es él.

  let _prealtaCodigo = null;   // el código con el que se entró al formulario

  async function abrirInvitar() {
    if (!usuarioActual) {
      mostrarGate && mostrarGate({ titulo: 'Invitar prestadores', sub: 'Necesitás una cuenta para invitar.' });
      return;
    }
    goTo('s-invitar');
    const codEl = document.getElementById('inv-codigo');
    const cod = await PronetDB.miCodigoReferido();
    if (codEl) codEl.textContent = cod || '—';
    _prealtaCodigo = cod;
    invPintarQR();
    renderMisPrealtas();
  }
  window.abrirInvitar = abrirInvitar;

  function invLink() {
    return location.origin + location.pathname + '?prealta=' + encodeURIComponent(_prealtaCodigo || '');
  }

  /** Carga la librería de QR una sola vez, cuando se abre la pantalla.
   *
   *  Local y no de un CDN: la CSP bloquea los hosts externos. Bajo demanda y
   *  no en el <head>: son 56 KB para una pantalla que casi nadie abre.
   *  Mismo patrón que cargarGoogleMapsAPI(). */
  let _qrLibPromesa = null;
  function cargarQRLib() {
    if (window.qrcode) return Promise.resolve(true);
    if (_qrLibPromesa) return _qrLibPromesa;
    _qrLibPromesa = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = './vendor/qrcode.js';
      s.onload  = () => resolve(!!window.qrcode);
      s.onerror = () => { _qrLibPromesa = null; resolve(false); };
      document.head.appendChild(s);
    });
    return _qrLibPromesa;
  }

  /** Dibuja el QR del link de invitación.
   *
   *  Corrección M (15%): el QR se muestra en una pantalla y se escanea de
   *  cerca, no impreso ni arrugado. Subir a Q/H agrandaría los módulos sin
   *  necesidad y lo haría más difícil de enfocar con una cámara vieja. */
  async function invPintarQR() {
    const cont = document.getElementById('inv-qr');
    if (!cont || !_prealtaCodigo) return;
    const ok = await cargarQRLib();
    if (!ok) { cont.innerHTML = '<div style="font-size:11.5px;color:var(--ink3);padding:18px 0">No se pudo cargar el código QR. Igual podés compartir el link.</div>'; return; }
    try {
      const qr = window.qrcode(0, 'M');   // 0 = elige la versión más chica que entre
      qr.addData(invLink());
      qr.make();
      // createSvgTag arma el SVG entero: nada de lo que devuelve viene del
      // usuario (es una URL que construimos nosotros), así que no hay dato
      // ajeno interpolándose acá.
      cont.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      const svg = cont.querySelector('svg');
      if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block'; }
    } catch (e) {
      console.warn('[QR]', e?.message || e);
      cont.innerHTML = '';
    }
  }

  function invCompartirWhatsapp() {
    if (!_prealtaCodigo) return;
    const msg = '¡Hola! Te invito a sumarte a PRONET, la app de servicios de Escobar. ' +
                'Anotate acá en un minuto (no hace falta crear cuenta): ' + invLink();
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  }
  window.invCompartirWhatsapp = invCompartirWhatsapp;

  async function invCopiarLink() {
    if (!_prealtaCodigo) return;
    try {
      await navigator.clipboard.writeText(invLink());
      showToast && showToast('🔗 Link copiado');
    } catch {
      // clipboard falla sin HTTPS o sin permiso: mostrar el link para copiar a mano
      showToast && showToast(invLink(), 8000);
    }
  }
  window.invCopiarLink = invCopiarLink;

  /** El vecino carga los datos él mismo, en su teléfono. */
  function invCargarYo() {
    if (!_prealtaCodigo) return;
    abrirPrealta(_prealtaCodigo, { volverA: 's-invitar' });
  }
  window.invCargarYo = invCargarYo;

  async function renderMisPrealtas() {
    const cont = document.getElementById('inv-lista');
    if (!cont) return;
    cont.innerHTML = '<div style="padding:18px 0;text-align:center;font-size:12.5px;color:var(--ink3)">⏳ Cargando…</div>';
    const lista = await PronetDB.listarMisPrealtas();
    if (!lista.length) {
      cont.innerHTML = '<div style="padding:22px 14px;text-align:center;font-size:12.5px;color:var(--ink3);line-height:1.6">Todavía no anotaste a nadie.<br>Cuando lo hagas, van a aparecer acá.</div>';
      return;
    }
    const ESTADOS = {
      pendiente:  { t: 'Pendiente',  c: '#B45309', b: '#FEF3C7' },
      reclamada:  { t: 'Ya se sumó', c: '#166534', b: '#DCFCE7' },
      descartada: { t: 'Descartada', c: 'var(--ink3)', b: 'var(--surface)' },
    };
    _prealtasCache.clear();
    lista.forEach(p => _prealtasCache.set(p.id, p));
    cont.innerHTML = lista.map(p => {
      const e = ESTADOS[p.estado] || ESTADOS.pendiente;
      const rubros = (p.rubros || []).join(' · ');
      // Sólo el id (uuid) va en el onclick; el nombre y el teléfono salen del
      // cache. escHTML() no protege dentro de un handler inline — el parser
      // decodifica las entidades antes de que el JS las lea.
      return '<div style="border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13.5px;font-weight:700;color:var(--ink)">' + escHTML(p.nombre) + '</div>' +
            '<div style="font-size:11.5px;color:var(--ink3);margin-top:2px">' + escHTML(p.telefono) +
              (rubros ? ' · ' + escHTML(rubros) : '') + '</div>' +
          '</div>' +
          '<span style="flex-shrink:0;background:' + e.b + ';color:' + e.c + ';border-radius:20px;padding:4px 10px;font-size:10.5px;font-weight:700">' + e.t + '</span>' +
        '</div>' +
        (p.estado === 'pendiente'
          ? '<button onclick="invMandarAlta(\'' + escHTML(p.id) + '\')" style="width:100%;margin-top:9px;padding:8px;font-size:12px;font-weight:700;background:#25D366;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:\'Inter\',sans-serif">Mandarle el link de alta</button>'
          : '') +
      '</div>';
    }).join('');
  }

  const _prealtasCache = new Map();

  /** Número en el formato que espera wa.me: sólo dígitos, con país y el 9 de
   *  celular. Los vecinos escriben "11 4554-6665" y así el link no abre. */
  function telParaWhatsapp(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.startsWith('54')) return d.startsWith('549') ? d : '549' + d.slice(2);
    return '549' + d.replace(/^0/, '');
  }

  /** Le manda por WhatsApp el link que convierte su pre-alta en cuenta. */
  function invMandarAlta(id) {
    const p = _prealtasCache.get(id);
    if (!p) return;
    const link = location.origin + location.pathname + '?reclamar=' + encodeURIComponent(id);
    const msg = 'Hola ' + (p.nombre || '').split(' ')[0] + '! Te dejo el link para terminar tu alta en PRONET. ' +
                'Ya tenés los datos cargados, sólo te falta poner un mail y una contraseña: ' + link;
    window.open('https://wa.me/' + telParaWhatsapp(p.telefono) + '?text=' + encodeURIComponent(msg), '_blank');
  }
  window.invMandarAlta = invMandarAlta;

  /** Abre el formulario público. `volverA` es null cuando se entró por el
   *  link sin sesión: ahí no hay pantalla a la que volver. */
  async function abrirPrealta(codigo, { volverA = null } = {}) {
    _prealtaCodigo = codigo;
    _prealtaVolverA = volverA;
    const back = document.getElementById('prealta-back');
    if (back) back.style.display = volverA ? '' : 'none';
    ['prealta-nombre','prealta-tel','prealta-dni'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // El botón de escanear sólo si el navegador sabe leer un PDF417.
    prealtaPuedeEscanear().then(puede => {
      const b = document.getElementById('prealta-btn-dni');
      if (b) b.style.display = puede ? '' : 'none';
    });
    const err = document.getElementById('prealta-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    document.getElementById('prealta-form').style.display = '';
    document.getElementById('prealta-ok').style.display   = 'none';
    // Rubros y zonas salen del catálogo, no escritos a mano: si el admin
    // agrega un rubro, acá aparece sin tocar código.
    const wrap = document.getElementById('prealta-rubros');
    if (wrap) {
      const rubros = await PronetDB.listarRubros(true).catch(() => []);
      wrap.innerHTML = rubros.map(r =>
        '<div class="sub-opt" data-rubro="' + escHTML(r.nombre) + '" onclick="this.classList.toggle(\'on\')">' +
        escHTML((r.emoji ? r.emoji + ' ' : '') + r.nombre) + '</div>').join('');
    }
    const selZ = document.getElementById('prealta-zona');
    if (selZ && selZ.options.length <= 1) {
      const zonas = await PronetDB.listarZonasArbol().catch(() => []);
      selZ.innerHTML = '<option value="">Elegí tu zona…</option>' +
        zonas.filter(z => z.nivel === 2).map(z =>
          '<option value="' + escHTML(z.nombre) + '">' + escHTML(z.nombre) + '</option>').join('');
    }
    goTo('s-prealta');
  }

  let _prealtaVolverA = null;

  // ── Escaneo del DNI ──────────────────────────────────────────────────
  //
  // El dorso del DNI argentino trae un PDF417 con los datos en TEXTO PLANO,
  // separados por '@'. No hay servicio que consultar ni costo: se decodifica
  // en el propio teléfono, incluso sin internet. Distinto sería validar
  // contra RENAPER, que sí se paga y no es lo que queremos acá.
  //
  // Sólo se usa el decodificador nativo del navegador (BarcodeDetector). No
  // se trae una librería: cubrir los navegadores que no lo tienen exige
  // WebAssembly (~400 KB) y acá no hay forma de probarlo contra un DNI real.
  // Donde no está, el botón no aparece y se carga a mano, que es el camino
  // normal igual.

  /** Pasa a "Nombre Apellido" en capitalizado. El DNI viene TODO EN MAYÚSCULAS. */
  function _tituloNombre(s) {
    return String(s || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  /** Extrae los datos del contenido del PDF417.
   *
   *  Se ancla en el campo de SEXO ('M' o 'F') en vez de usar posiciones
   *  fijas: hay al menos dos versiones del DNI con distinta cantidad de
   *  campos al principio, pero en las dos el orden relativo es
   *  …apellido, nombre, sexo, documento… Anclar ahí funciona con ambas.
   *
   *  Devuelve null si no reconoce la estructura — mejor no completar nada
   *  que completar mal y que la persona no lo revise. */
  function parsearDNI(texto) {
    const p = String(texto || '').split('@').map(s => s.trim());
    const iSexo = p.findIndex(x => /^[MF]$/i.test(x));
    if (iSexo < 2) return null;

    const apellido = p[iSexo - 2];
    const nombre   = p[iSexo - 1];
    // Sólo letras (con acentos y ñ), espacios, apóstrofes y guiones.
    const esNombre = (s) => /^[A-ZÁÉÍÓÚÜÑ' -]{2,}$/i.test(s || '');
    if (!esNombre(apellido) || !esNombre(nombre)) return null;

    // El documento va DESPUÉS del sexo. El número de trámite va antes y es
    // más largo, así que buscar hacia adelante evita confundirlos.
    const dni = (p.slice(iSexo + 1).find(x => /^\d{7,8}$/.test(x)) || '').replace(/^0+/, '');
    if (!dni) return null;

    const fnac = p.find(x => /^\d{2}\/\d{2}\/\d{4}$/.test(x)) || null;
    // El DNI dice APELLIDO y después NOMBRE; el formulario pide al revés.
    return { nombre: _tituloNombre(nombre) + ' ' + _tituloNombre(apellido), dni, fecha_nac: fnac };
  }
  window.parsearDNI = parsearDNI;   // expuesto para poder probarlo

  /** ¿Este navegador puede leer un PDF417? Chrome en Android sí; Safari no. */
  async function prealtaPuedeEscanear() {
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const f = await window.BarcodeDetector.getSupportedFormats();
      return f.includes('pdf417');
    } catch { return false; }
  }

  let _escanerStream = null;
  let _escanerTimer  = null;

  async function abrirEscanerDNI() {
    const cont = document.getElementById('escaner-dni');
    const video = document.getElementById('escaner-video');
    const msg = document.getElementById('escaner-msg');
    if (!cont || !video) return;
    cont.style.display = 'flex';
    if (msg) msg.textContent = 'Apuntá al código de barras ancho del dorso';
    try {
      _escanerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
      });
    } catch (e) {
      // Permiso denegado o sin cámara: no dejar la pantalla en negro.
      if (msg) msg.textContent = 'No pudimos usar la cámara. Cargá los datos a mano.';
      return;
    }
    video.srcObject = _escanerStream;
    await video.play().catch(() => {});

    const detector = new window.BarcodeDetector({ formats: ['pdf417'] });
    let intentos = 0;
    _escanerTimer = setInterval(async () => {
      if (!_escanerStream) return;
      intentos++;
      // A los ~15s sin leer nada, avisar en vez de dejarlo intentando mudo.
      if (intentos === 30 && msg) msg.textContent = 'Cuesta engancharlo. Buscá más luz y apoyá el DNI en una superficie plana.';
      let codigos = [];
      try { codigos = await detector.detect(video); } catch { return; }
      if (!codigos.length) return;
      const datos = parsearDNI(codigos[0].rawValue);
      if (!datos) {
        if (msg) msg.textContent = 'Leí el código pero no reconocí el formato. Cargalo a mano.';
        return;
      }
      cerrarEscanerDNI();
      const setV = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      setV('prealta-nombre', datos.nombre);
      setV('prealta-dni', datos.dni);
      showToast && showToast('✅ Datos cargados. Revisalos antes de enviar.');
      document.getElementById('prealta-tel')?.focus();
    }, 500);
  }
  window.abrirEscanerDNI = abrirEscanerDNI;

  function cerrarEscanerDNI() {
    if (_escanerTimer) { clearInterval(_escanerTimer); _escanerTimer = null; }
    if (_escanerStream) {
      // Sin esto la luz de la cámara queda prendida y el teléfono se calienta.
      _escanerStream.getTracks().forEach(t => t.stop());
      _escanerStream = null;
    }
    const video = document.getElementById('escaner-video');
    if (video) video.srcObject = null;
    const cont = document.getElementById('escaner-dni');
    if (cont) cont.style.display = 'none';
  }
  window.cerrarEscanerDNI = cerrarEscanerDNI;

  async function prealtaEnviar() {
    const err = document.getElementById('prealta-error');
    const btn = document.getElementById('prealta-btn');
    const mostrar = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };
    const nombre = (document.getElementById('prealta-nombre')?.value || '').trim();
    const tel    = (document.getElementById('prealta-tel')?.value || '').trim();
    const rubros = Array.from(document.querySelectorAll('#prealta-rubros .sub-opt.on')).map(e => e.dataset.rubro);
    const zona   = document.getElementById('prealta-zona')?.value || null;
    const dni    = (document.getElementById('prealta-dni')?.value || '').replace(/\D/g, '');

    if (nombre.split(/\s+/).filter(Boolean).length < 2) return mostrar('Escribí nombre y apellido');
    if (tel.replace(/\D/g, '').length < 8) return mostrar('El teléfono no parece válido');
    // Sin rubro el prestador queda invisible cuando se dé de alta — mismo
    // motivo por el que el registro normal también lo exige.
    if (!rubros.length) return mostrar('Elegí al menos un rubro');

    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    const res = await PronetDB.crearPrealta({ codigo: _prealtaCodigo, nombre, telefono: tel, rubros, zona, dni });
    if (btn) { btn.disabled = false; btn.textContent = 'Anotarme'; }

    if (!res.ok) {
      if (res.codigo === 'ya_tiene_cuenta') {
        return mostrar('Ese teléfono ya tiene una cuenta en PRONET. Iniciá sesión con ella.');
      }
      return mostrar(res.error || 'No se pudo guardar. Probá de nuevo.');
    }
    document.getElementById('prealta-form').style.display = 'none';
    document.getElementById('prealta-ok').style.display   = '';
    if (err) err.style.display = 'none';
  }
  window.prealtaEnviar = prealtaEnviar;

  function prealtaSalir() {
    if (_prealtaVolverA) {
      const destino = _prealtaVolverA;
      _prealtaVolverA = null;
      goTo(destino);
      if (destino === 's-invitar') renderMisPrealtas();
      return;
    }
    // Se entró por el link sin cuenta: la salida natural es el login.
    location.href = location.origin + location.pathname;
  }
  window.prealtaSalir = prealtaSalir;

  // ── Teléfono obligatorio para publicar ───────────────────────────────
  //
  // El índice único de teléfono no sirve contra quien simplemente no carga
  // ninguno: hoy 5 de 12 cuentas están así. Este es el otro lado del mismo
  // control — se pide en el momento del daño (publicar), no en el alta, así
  // el que sólo mira nunca se entera y las cuentas viejas se regularizan
  // solas la primera vez que publican.
  //
  // Quien manda de verdad es `trg_pedidos_exigir_telefono` en la base. Esto
  // es la versión amable: sin el modal, el usuario llenaría el formulario
  // entero para recibir un error de Postgres al final.
  let _telGateContinuar = null;

  function tieneTelefono() {
    return !!String(usuarioActual?.telefono || '').trim();
  }

  function abrirTelefonoGate(continuar) {
    _telGateContinuar = continuar;
    const inp = document.getElementById('tel-gate-input');
    const err = document.getElementById('tel-gate-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (inp) inp.value = '';
    document.getElementById('modal-telefono')?.classList.add('show');
    setTimeout(() => inp?.focus(), 120);
  }

  async function confirmarTelefonoGate() {
    const inp = document.getElementById('tel-gate-input');
    const err = document.getElementById('tel-gate-error');
    const btn = document.getElementById('tel-gate-btn');
    const tel = (inp?.value || '').trim();
    const mostrarError = (m) => { if (err) { err.textContent = m; err.style.display = 'block'; } };
    // 8 dígitos es lo mínimo de un número argentino sin código de área; no se
    // valida más que eso porque el índice compara los últimos 10 y un formato
    // demasiado estricto rebota números legítimos escritos distinto.
    if (tel.replace(/\D/g, '').length < 8) return mostrarError('Escribí un teléfono válido');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
    const res = await PronetDB.actualizarMiPerfilBasico({ telefono: tel }).catch(() => ({ ok: false }));
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar y publicar'; }
    if (!res.ok) {
      return mostrarError(res.codigo === 'telefono_duplicado'
        ? 'Ese teléfono ya está registrado en otra cuenta.'
        : 'No se pudo guardar. Probá de nuevo.');
    }
    usuarioActual.telefono = tel;
    document.getElementById('modal-telefono')?.classList.remove('show');
    const seguir = _telGateContinuar;
    _telGateContinuar = null;
    if (seguir) seguir();
  }
  window.confirmarTelefonoGate = confirmarTelefonoGate;

  function cancelarTelefonoGate() {
    _telGateContinuar = null;
    document.getElementById('modal-telefono')?.classList.remove('show');
  }
  window.cancelarTelefonoGate = cancelarTelefonoGate;

  async function npFinalizar() {
    // Antes de leer el formulario: sin teléfono el INSERT lo rechaza el
    // trigger igual, así que se pide acá y se reanuda con lo ya cargado.
    if (usuarioActual && !tieneTelefono()) return abrirTelefonoGate(npFinalizar);

    // ── Fase 1: carga de datos real ──
    // Leer el formulario y guardar el pedido en la capa de datos (PronetDB).
    const titulo = (document.getElementById('np-titulo')?.value || '').trim();
    const desc   = (document.getElementById('np-desc')?.value || '').trim();

    // ── Validación: título obligatorio ──
    if (!titulo) {
      const inp = document.getElementById('np-titulo');
      if (inp) {
        inp.style.border = '2px solid #EF4444';
        inp.placeholder = '⚠️ El título es obligatorio';
        inp.focus();
        inp.addEventListener('input', function fix() {
          inp.style.border = ''; inp.placeholder = 'Ej: Revisión de tablero eléctrico';
          inp.removeEventListener('input', fix);
        });
      }
      return;
    }

    const rubroEl = document.querySelector('#np-1 .form-opt.on .opt-lbl');
    const iconEl  = document.querySelector('#np-1 .form-opt.on .opt-icon');
    // Urgencia elegida
    const urgEl = document.querySelector('#np-urgencia-group .form-opt.on');
    const urgencia = urgEl ? (urgEl.dataset.urg || 'flexible') : 'flexible';

    // Presupuesto — leer según la modalidad seleccionada (fijo / rango / convenir)
    const modalPrecioEl = document.querySelector('.np-modal-precio.on');
    const modalPrecio   = modalPrecioEl?.dataset.modal || 'convenir';
    let precioMin = null, precioMax = null;
    if (modalPrecio === 'fijo') {
      const v = parseInt((document.getElementById('np-precio')?.value || '').replace(/\D/g, ''), 10);
      if (v > 0) { precioMin = v; precioMax = v; }
    } else if (modalPrecio === 'rango') {
      precioMin = parseInt((document.getElementById('np-precio-min')?.value || '').replace(/\D/g, ''), 10) || null;
      precioMax = parseInt((document.getElementById('np-precio-max')?.value || '').replace(/\D/g, ''), 10) || null;
    }

    // Puntual o servicio fijo. Si es fijo, la frecuencia viaja con el pedido:
    // es lo que el prestador necesita para cotizar por visita, y lo que
    // después queda registrado en el servicio fijo al elegir la propuesta.
    const modEl = document.querySelector('#np-modalidad-group .form-opt.on');
    const modalidad = modEl?.dataset.mod === 'recurrente' ? 'recurrente' : 'puntual';
    const frecVeces = modalidad === 'recurrente'
      ? Math.min(7, Math.max(1, parseInt(document.getElementById('np-frec-veces')?.value, 10) || 1))
      : null;
    const frecPeriodo = modalidad === 'recurrente'
      ? (document.getElementById('np-frec-periodo')?.value || 'semana')
      : null;

    const dirigidoA = recontratarDestino?.prestadorId || null;

    let pedido;
    try {
      pedido = await PronetDB.crear('pedidos', {
        titulo: titulo,
        descripcion: desc,
        rubro: rubroEl ? rubroEl.textContent : 'Servicio',
        icono: iconEl ? iconEl.textContent : '📋',
        zona: zonaActual,
        estado: 'Publicado',
        urgencia: urgencia,
        modalidad: modalidad,
        frecuencia_veces: frecVeces,
        frecuencia_periodo: frecPeriodo,
        // Recontratación: si hay destinatario, el pedido no va al feed.
        dirigido_a: dirigidoA,
        // De qué aviso de Servicios salió, si salió de uno. Es lo que hace
        // que "solicitudes" sea un hecho contable y no una inferencia por
        // cercanía entre un clic y un pedido cualquiera.
        origen_pub_id: recontratarDestino?.pubId || null,
        presupuesto_min: precioMin,
        presupuesto_max: precioMax,
        usuario_id: usuarioActual ? usuarioActual.id : null,
        fotos: [],
      });
    } catch (e) {
      // Red de seguridad del gate de arriba: si `usuarioActual.telefono` venía
      // desactualizado (lo borró en otra pestaña, o la sesión es vieja), el
      // trigger rechaza igual. Se reabre el modal en vez de perder la carga.
      if (String(e?.message || '').includes('TELEFONO_REQUERIDO')) {
        return abrirTelefonoGate(npFinalizar);
      }
      showToast && showToast('⚠️ No se pudo publicar el pedido. Probá de nuevo.');
      console.warn('[npFinalizar]', e?.message || e);
      return;
    }
    // Subir fotos si hay, y actualizar el pedido con las URLs
    if (pedido && npFotosArchivos.length > 0) {
      const urls = await npSubirFotos(pedido.id);
      if (urls.length > 0) {
        await PronetDB.actualizar('pedidos', pedido.id, { fotos: urls });
        pedido.fotos = urls;
      }
    }
    // Aviso a quien corresponda (no bloquea el flujo si falla).
    // Un pedido dirigido no se anuncia al rubro: sólo lo puede ver una
    // persona, avisarle al resto es ruido y una promesa que no se cumple.
    if (pedido && PronetDB.esRemoto()) {
      const aviso = dirigidoA
        ? {
            destino: 'prestador',
            prestador_id: pedido.dirigido_a,
            tipo: 'pedido',
            titulo: '🔁 Te pidieron otro trabajo',
            cuerpo: (pedido.titulo || 'Un vecino te volvió a elegir') + ' · ' + (pedido.zona || ''),
            url: '/#s-pedidos',
          }
        : {
            destino: 'prestadores_rubro',
            rubro: pedido.rubro,
            tipo: 'pedido',
            titulo: '🔔 Nuevo pedido en tu rubro',
            cuerpo: (pedido.titulo || 'Un vecino necesita tu servicio') + ' · ' + (pedido.zona || ''),
            url: '/#s-pedidos',
          };
      PronetDB.notificar(aviso).catch((e) => { console.warn('[Push] notificar pedido:', e); });
    }
    renderPedidosGuardados();
    // ── Actualizar pantalla de confirmación con datos reales ──
    const confRubro = document.getElementById('np-conf-rubro');
    const confZona  = document.getElementById('np-conf-zona');
    if (confRubro) confRubro.textContent = (iconEl ? iconEl.textContent : '📋') + ' ' + (rubroEl ? rubroEl.textContent : 'Servicio');
    if (confZona)  confZona.textContent  = zonaActual || 'Escobar';
    const confUrg = document.getElementById('np-conf-urgencia');
    if (confUrg) { const um = { hoy: 'Hoy — urgente', semana: 'Esta semana', flexible: 'Flexible' }; confUrg.textContent = um[urgencia] || 'Flexible'; }
    // Limpiar el formulario para el próximo pedido
    const t = document.getElementById('np-titulo'); if (t) t.value = '';
    const d2 = document.getElementById('np-desc');  if (d2) d2.value = '';
    ['np-precio','np-precio-min','np-precio-max'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    [1,2,3].forEach(i => { const el = document.getElementById('np-'+i); if(el) el.style.display='none'; });
    const ex = document.getElementById('np-exito'); if(ex) ex.style.display='flex';
  }

  // Filtro activo de mis pedidos
  let filtroMisPedidos = 'todos';
  function filtrarMisPedidos(el, rubro) {
    document.querySelectorAll('#ped-filter-chips .chip').forEach(c => c.classList.remove('on'));
    if (el) el.classList.add('on');
    filtroMisPedidos = rubro;
    renderPedidosGuardados();
  }

  // Pedido en edición
  let pedidoEditando = null;

  function abrirEditarPedido(p) {
    pedidoEditando = p;
    const setV = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ''; };
    setV('edit-ped-titulo', p.titulo);
    setV('edit-ped-desc', p.descripcion);

    // Marcar urgencia activa
    document.querySelectorAll('#edit-ped-urgencia .ep-urg').forEach(u => {
      u.classList.toggle('on', u.dataset.urg === (p.urgencia || 'flexible'));
    });
    const modal = document.getElementById('edit-pedido-modal');
    if (modal) modal.style.display = 'flex';
  }

  function cerrarEditarPedido(ev) {
    if (ev && ev.target && ev.target.id !== 'edit-pedido-modal') return;
    const modal = document.getElementById('edit-pedido-modal');
    if (modal) modal.style.display = 'none';
  }

  function selEditUrgencia(el) {
    document.querySelectorAll('#edit-ped-urgencia .ep-urg').forEach(u => u.classList.remove('on'));
    el.classList.add('on');
  }

  async function guardarEdicionPedido() {
    if (!pedidoEditando) return;
    const getV = (id) => (document.getElementById(id)?.value || '').trim();
    const titulo = getV('edit-ped-titulo');
    if (!titulo) { alert('El título es obligatorio'); return; }
    const parseNum = (v) => { const n = parseInt((v||'').replace(/[^\d]/g,''), 10); return isNaN(n) ? null : n; };
    const urgEl = document.querySelector('#edit-ped-urgencia .ep-urg.on');
    const cambios = {
      titulo: titulo,
      descripcion: getV('edit-ped-desc'),

      urgencia: urgEl ? urgEl.dataset.urg : 'flexible',
    };
    const btn = document.getElementById('edit-ped-guardar');
    if (btn) btn.textContent = 'Guardando...';
    await PronetDB.actualizar('pedidos', pedidoEditando.id, cambios);
    if (btn) btn.textContent = 'Guardar cambios';
    cerrarEditarPedido();
    renderPedidosGuardados();
  }

  // Renderiza los pedidos de Supabase/local en la pantalla de Pedidos
  async function renderPedidosGuardados() {
    const wrap = document.getElementById('mis-pedidos-guardados');
    if (!wrap) return;

    // Estado de carga
    wrap.innerHTML = '<div style="padding:16px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando pedidos...</div>';

    let pedidos=[],conteoProps={};
    try {
      if(usuarioActual){
        pedidos=await PronetDB.listarMios('pedidos');
        try{const props=await PronetDB.listar('propuestas');props.forEach(pr=>{if(pr.estado!=='retirada') conteoProps[pr.pedido_id]=(conteoProps[pr.pedido_id]||0)+1;});}catch(e){}
      } else { pedidos=(await PronetDB.listarPedidosDisponibles({ limite: 50 })).pedidos; }
    } catch(e) {
      wrap.innerHTML = '<div style="padding:16px 14px;text-align:center;font-size:13px;color:#BE123C">⚠️ Error al cargar pedidos</div>';
      return;
    }

    // Aplicar filtro por rubro
    if (filtroMisPedidos && filtroMisPedidos !== 'todos') {
      pedidos = pedidos.filter(p => matchRubro(p.rubro, filtroMisPedidos));
    }
    // Sincronizar el estado visual de los chips con el filtro activo
    document.querySelectorAll('#ped-filter-chips .chip').forEach(c => {
      c.classList.toggle('on', (c.dataset.filtro || 'todos') === filtroMisPedidos);
    });

    wrap.innerHTML = '';

    if (pedidos.length === 0) {
      const msg = filtroMisPedidos !== 'todos'
        ? 'No tenés pedidos de ' + filtroMisPedidos + '.'
        : 'No tenés pedidos publicados aún.<br>Tocá <strong>+ Publicar pedido</strong> para crear uno.';
      wrap.innerHTML = '<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">' + msg + '</div>';
      const count = document.getElementById('ped-count');
      if (count) count.textContent = '0 pedidos';
      return;
    }

    pedidos.forEach(p => {
      const card = document.createElement('div');
      card.className = 'ped-card';
      card.style.cssText = 'margin:0 14px 10px;border-radius:16px;background:white;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:1.5px solid var(--border)';

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:flex-start;gap:10px';

      const ico = document.createElement('div');
      ico.style.cssText = 'width:40px;height:40px;border-radius:12px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0';
      ico.textContent = p.icono || '📋';

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';

      const title = document.createElement('div');
      title.style.cssText = 'font-size:14px;font-weight:700;color:var(--ink1);line-height:1.3';
      title.textContent = p.titulo;

      const fecha = new Date(p.creado);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:11px;color:var(--ink3);margin-top:3px';
      meta.textContent = [p.rubro, p.zona, fecha.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'America/Argentina/Buenos_Aires'})].filter(Boolean).join(' · ');

      info.appendChild(title);
      info.appendChild(meta);

      if (p.descripcion) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:var(--ink2);margin-top:6px;line-height:1.5';
        desc.textContent = p.descripcion;
        info.appendChild(desc);
      }

      // Presupuesto y urgencia
      if (p.presupuesto_min || p.urgencia) {
        const tags = document.createElement('div');
        tags.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap';
        const urgMap = { hoy: '🔴 Hoy', semana: '🟡 Esta semana', flexible: '🟢 Flexible' };
        let presupuesto = '';
        if (p.presupuesto_min && p.presupuesto_max) presupuesto = '💰 $' + p.presupuesto_min.toLocaleString('es-AR') + '–$' + p.presupuesto_max.toLocaleString('es-AR');
        else if (p.presupuesto_min) presupuesto = '💰 Desde $' + p.presupuesto_min.toLocaleString('es-AR');
        tags.innerHTML =
          (presupuesto ? `<span style="background:var(--surface);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--ink2)">${presupuesto}</span>` : '') +
          (p.urgencia ? `<span style="background:var(--surface);border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;color:var(--ink2)">${urgMap[p.urgencia]||'🟢 Flexible'}</span>` : '');
        info.appendChild(tags);
      }

      const badge=document.createElement('div');
      badge.style.cssText='font-size:10px;font-weight:700;color:#16A34A;background:#DCFCE7;border-radius:20px;padding:3px 10px;flex-shrink:0;white-space:nowrap';
      badge.textContent='● '+(p.estado||'Publicado');
      // La parte superior de la card es siempre clickeable → abre el detalle (propuestas recibidas)
      top.style.cursor = 'pointer';
      top.addEventListener('click', () => abrirDetallePedido(p.usuario_id ? p : { ...p, usuario_id: usuarioActual?.id }));
      top.appendChild(ico);top.appendChild(info);top.appendChild(badge);card.appendChild(top);
      const nProps=conteoProps[p.id]||0;
      // toLowerCase() y no comparación directa: el RPC elegir_propuesta
      // escribe 'Cerrado' con mayúscula y esta lista estaba en minúsculas,
      // así que los pedidos cerrados daban "abierto" y se les mostraba
      // "N propuestas recibidas · Ver y comparar" y el botón Renovar.
      const pedidoAbierto=!['cerrado','calificado','terminado','cancelado'].includes((p.estado||'').toLowerCase());
      if(nProps>0&&pedidoAbierto){const pb=document.createElement('button');pb.textContent='📬 '+nProps+' propuesta'+(nProps!==1?'s':'')+' recibida'+(nProps!==1?'s':'')+' — Ver y comparar →';pb.style.cssText='width:100%;margin-top:10px;font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-s);border:1.5px solid #C7D5FF;border-radius:10px;padding:9px;cursor:pointer;font-family:inherit';pb.addEventListener('click',(e)=>{e.stopPropagation();abrirDetallePedido(p.usuario_id ? p : { ...p, usuario_id: usuarioActual?.id });});card.appendChild(pb);}

      // Aviso de vencimiento + renovar. Se muestra cuando quedan menos de
      // 24hs o cuando ya venció, que son los dos momentos en que el vecino
      // puede hacer algo al respecto.
      const HS_V = window.PRONET_CONFIG?.PROPUESTA_EXPIRACION_HS || 168;
      const vence = p.expira_en ? new Date(p.expira_en)
                                : new Date(new Date(p.creado).getTime() + HS_V * 3600000);
      const hsRestan = (vence - Date.now()) / 3600000;
      const yaVencio = (p.estado === 'Vencido');
      if (yaVencio || (pedidoAbierto && hsRestan > 0 && hsRestan <= 24)) {
        const av = document.createElement('div');
        av.style.cssText = 'display:flex;align-items:center;gap:9px;margin-top:10px;padding:9px 11px;border-radius:10px;background:' +
          (yaVencio ? '#FEF2F2;border:1px solid #FECACA' : '#FFFBEB;border:1px solid #FDE68A');
        const txt = yaVencio
          ? 'Venció. Renovalo si seguís necesitándolo.'
          : 'Vence en ' + Math.max(1, Math.round(hsRestan)) + 'hs.';
        av.innerHTML = '<span style="font-size:14px">' + (yaVencio ? '⌛' : '🕐') + '</span>' +
          '<span style="flex:1;font-size:11.5px;font-weight:600;color:' + (yaVencio ? '#B91C1C' : '#92400E') + '">' + escHTML(txt) + '</span>';
        const btnR = document.createElement('button');
        btnR.textContent = 'Renovar 7 días';
        btnR.style.cssText = 'background:white;border:1.5px solid ' + (yaVencio ? '#FECACA' : '#FDE68A') +
          ';border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;color:' +
          (yaVencio ? '#B91C1C' : '#92400E') + ';flex-shrink:0';
        btnR.addEventListener('click', async (e) => {
          e.stopPropagation();
          btnR.disabled = true; btnR.textContent = 'Renovando…';
          const r = await PronetDB.renovarPedido(p.id);
          if (r?.ok) { showToast && showToast('✅ Pedido renovado por 7 días'); renderPedidosGuardados(); }
          else { btnR.disabled = false; btnR.textContent = 'Renovar 7 días'; showToast && showToast('⚠️ ' + (r?.error || 'No se pudo renovar')); }
        });
        av.appendChild(btnR);
        card.appendChild(av);
      }

      // Botones: Editar + Eliminar
      const botones = document.createElement('div');
      botones.style.cssText = 'display:flex;gap:8px;margin-top:10px';

      const edit = document.createElement('button');
      edit.textContent = '✏️ Editar';
      edit.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:var(--blue);background:var(--blue-s);border:1px solid #C7D5FF;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit';
      edit.addEventListener('click', (e) => { e.stopPropagation(); abrirEditarPedido(p); });

      const del = document.createElement('button');
      del.textContent = '🗑 Eliminar';
      del.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:#BE123C;background:#FFF1F2;border:1px solid #FECDD3;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        del.textContent = '⏳...';
        del.disabled = true;
        await PronetDB.borrar('pedidos', p.id);
        renderPedidosGuardados();
      });

      botones.appendChild(edit);
      botones.appendChild(del);
      card.appendChild(botones);
      wrap.appendChild(card);
    });

    // Actualizar contador
    const count = document.getElementById('ped-count');
    if (count) count.textContent = pedidos.length + ' pedido' + (pedidos.length !== 1 ? 's' : '');
  }

  function npReset() { npNext(1); }

  function selFormOpt(el, scope) {
    el.closest(scope || '.form-options').querySelectorAll('.form-opt').forEach(o => o.classList.remove('on'));
    el.classList.add('on');
  }

  // ══ RECONTRATACIÓN ═════════════════════════════════════════════════
  //
  // Otro trabajo con la misma persona. No reusa el chat: `resenas` tiene
  // UNIQUE (chat_id), así que dos trabajos en un mismo chat dejan el
  // segundo sin poder calificarse. Cada trabajo tiene su chat; lo que se
  // mantiene es la relación.
  //
  // El pedido nace DIRIGIDO: no va al feed. El vecino ya eligió, y publicar
  // abierto haría que le compitan a alguien que ya le resolvió un problema.
  let recontratarDestino = null;   // { prestadorId, nombre }

  /** Muestra el acceso a recontratar sólo si el trabajo de este chat ya
   *  terminó y quien mira es el vecino. Antes de eso es ruido. */
  function reflejarRecontratar(chat) {
    const caja = document.getElementById('chat-recontratar');
    if (!caja) return;
    const soyVecino = !!usuarioActual && chat?.vecino_id === usuarioActual.id;
    const termino = ['terminado_por_vecino', 'terminado_prestador', 'calificado'].includes(chat?.estado);
    if (!soyVecino || !termino || !chat?.prestador_id) { caja.style.display = 'none'; return; }

    recontratarDestino = {
      prestadorId: chat.prestador_id,
      nombre: chat.prestadores?.nombre || chat.contraparte_nombre || 'esta persona',
    };
    const txt = document.getElementById('chat-recontratar-txt');
    if (txt) txt.textContent = 'Pedirle otro trabajo a ' + recontratarDestino.nombre;
    caja.style.display = 'block';
  }

  /** Abre el alta de pedido con el destinatario fijado. */
  /** Abre el alta de pedido con el destinatario fijado.
   *
   *  El orden importa y es la razón de que esto sea un helper: goTo() llama
   *  a quitarRecontratar() al entrar a s-nuevo-pedido (limpia un destino que
   *  haya quedado colgado de otra vez, que está bien). Si se setea el
   *  destino ANTES del goTo, se pierde — y peor: el `nombre` se lee después,
   *  contra null, y tira TypeError, así que el banner nunca se muestra y el
   *  pedido termina saliendo ABIERTO a todo el rubro. El vecino cree que le
   *  está escribiendo a una persona y le escribe a cualquiera.
   *  Por eso se navega primero y se fija el destino después. */
  function dirigirPedidoA(prestadorId, nombre, pubId) {
    if (!prestadorId) return;
    goTo('s-nuevo-pedido');
    recontratarDestino = { prestadorId, nombre: nombre || 'esta persona', pubId: pubId || null };
    const banner = document.getElementById('np-dirigido-banner');
    const nom    = document.getElementById('np-dirigido-nombre');
    if (nom) nom.textContent = recontratarDestino.nombre;
    if (banner) banner.style.display = 'flex';
  }

  function abrirRecontratar() {
    if (!recontratarDestino) return;
    dirigirPedidoA(recontratarDestino.prestadorId, recontratarDestino.nombre);
  }
  window.abrirRecontratar = abrirRecontratar;

  /** Cancela el direccionamiento: el pedido vuelve a ser abierto. */
  function quitarRecontratar() {
    recontratarDestino = null;
    const banner = document.getElementById('np-dirigido-banner');
    if (banner) banner.style.display = 'none';
  }
  window.quitarRecontratar = quitarRecontratar;

  /** Puntual / servicio fijo. Muestra la frecuencia sólo cuando hace falta:
   *  preguntarle "cada cuánto" a quien pidió una destapación es ruido. */
  function selModalidadPedido(el) {
    el.closest('#np-modalidad-group').querySelectorAll('.form-opt').forEach(o => o.classList.remove('on'));
    el.classList.add('on');
    const wrap = document.getElementById('np-frecuencia-wrap');
    if (wrap) wrap.style.display = el.dataset.mod === 'recurrente' ? 'block' : 'none';
  }
  window.selModalidadPedido = selModalidadPedido;

  function selUrgencia(el) {
    el.closest('.form-group').querySelectorAll('.form-opt').forEach(o => o.classList.remove('on'));
    el.classList.add('on');
  }

  // ── Publicar servicio ────────────────────────────────────────────────
  function pubNext(step) {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('pub-' + i);
      if (el) el.style.display = 'none';
    }
    const exito = document.getElementById('pub-exito');
    if (exito) exito.style.display = 'none';
    const target = document.getElementById('pub-' + step);
    if (target) { target.style.display = 'block'; target.scrollTop = 0; }
    // scroll pantalla al tope
    const screen = document.getElementById('s-publicar');
    if (screen) screen.scrollTop = 0;
  }

  function pubBack(step) {
    if (step <= 1) { goTo('s-home'); return; }
    pubNext(step - 1);
  }

  async function pubFinalizar() {
    if (!usuarioActual?.prestador_id) {
      showToast && showToast('⚠️ Solo los prestadores pueden publicar un servicio');
      return;
    }

    const val = id => (document.getElementById(id)?.value || '').trim();

    // Paso 1 — rubro y descripción
    const rubroEl   = document.querySelector('#pub-1 .form-opt.on');
    const rubroIcono = rubroEl?.querySelector('.opt-icon')?.textContent?.trim() || '';
    const rubroNombre = rubroEl?.querySelector('.opt-lbl')?.textContent?.trim() || '';
    if (!rubroNombre) { showToast && showToast('⚠️ Elegí un rubro en el paso 1'); pubNext(1); return; }
    const descripcion = val('pub-desc');

    // Paso 2 — especialidades
    const especialidades = Array.from(document.querySelectorAll('#pub-2 .sub-opt.on'))
      .map(e => e.textContent.trim()).filter(Boolean);

    // Paso 3 — zona y radio
    const direccion = val('pub-direccion');
    const radioEl   = document.querySelector('#pub-3 .r-chip.on');
    const radio     = radioEl?.textContent?.trim() || '';
    const zonaTexto = [direccion, radio].filter(Boolean).join(' · ') || usuarioActual.zona || 'Escobar';

    // Paso 4 — precio y tarifa
    const tipoTarifa = document.querySelector('#pub-4 .pt-chip.on')?.textContent?.trim() || 'Por visita';
    const precioMin  = parseInt((val('pub-precio-min')).replace(/\D/g, ''), 10) || null;
    const precioMax  = parseInt((val('pub-precio-max')).replace(/\D/g, ''), 10) || null;
    const urgencias  = document.getElementById('campo-3')?.checked ?? false;

    // Paso 5 — medios de pago
    const mediosPago = Array.from(document.querySelectorAll('#pub-5 .pago-opt.on .pago-lbl'))
      .map(e => e.textContent.trim()).filter(Boolean);
    if (!mediosPago.length) mediosPago.push('Efectivo');

    const btn = document.querySelector('#pub-5 .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = 'Publicando...'; }

    const cambios = {
      rubro: rubroNombre,
      descripcion: descripcion || null,
      especialidades,
      subrubro: especialidades[0] || null,
      zona: direccion || usuarioActual.zona || 'Escobar',
      radio_cobertura: radio || null,
      medios_pago: mediosPago,
      precio_min: precioMin,
      precio_max: precioMax,
      tipo_tarifa: tipoTarifa,
      urgencias_24h: urgencias,
    };

    const r = await PronetDB.actualizar('prestadores', usuarioActual.prestador_id, cambios).catch(() => null);
    if (btn) { btn.disabled = false; btn.textContent = '✓ Publicar servicio'; }

    if (!r) {
      showToast && showToast('⚠️ No se pudo guardar el servicio. Intentá de nuevo.');
      return;
    }

    // Sincronizar usuarioActual con los cambios guardados
    Object.assign(usuarioActual, cambios);

    // Poblar pantalla de éxito con datos reales
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('pub-ex-rubro', rubroIcono + ' ' + rubroNombre);
    set('pub-ex-zona', zonaTexto);
    const tarifaTxt = tipoTarifa === 'A convenir' ? 'A convenir'
      : (precioMin && precioMax ? `$${precioMin.toLocaleString('es-AR')}–$${precioMax.toLocaleString('es-AR')} / ${tipoTarifa.toLowerCase()}`
        : precioMin ? `desde $${precioMin.toLocaleString('es-AR')} / ${tipoTarifa.toLowerCase()}`
        : tipoTarifa);
    set('pub-ex-tarifa', tarifaTxt);
    set('pub-ex-pagos', mediosPago.map(p =>
      p.includes('Efectivo') ? '💵' : p.includes('Transferencia') ? '🏦' : p.includes('QR') ? '📲' : p
    ).join(' '));

    // Mostrar éxito
    for (let i = 1; i <= 5; i++) { const el = document.getElementById('pub-' + i); if (el) el.style.display = 'none'; }
    const exito = document.getElementById('pub-exito');
    if (exito) exito.style.display = 'flex';

    showToast && showToast('✅ Servicio publicado correctamente');
  }

  function pubReset() {
    pubNext(1);
  }

  function selPubRubro(el) {
    document.querySelectorAll('#pub-1 .form-opt').forEach(r => r.classList.remove('on'));
    el.classList.add('on');
  }

  // ── Analítica ────────────────────────────────────────────────────────
  // Caché de analítica para no repetir la llamada al cambiar de período
  let analiticaCache = null;
  let analiticaPeriodo = '30d';

  function setPeriod(btn, period) {
    document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    analiticaPeriodo = period;
    renderAnalytica(period);
  }

  async function renderAnalytica(periodo = '30d') {
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const setHTML = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };

    // Placeholder mientras carga
    set('kpi-vistas', '...');
    set('kpi-contactos', '...');
    set('kpi-conv', '...');

    const data = await PronetDB.obtenerAnalitica(periodo).catch(() => null);
    if (!data) {
      // Fallback visual si no hay datos
      set('kpi-vistas', '0'); set('kpi-contactos', '0'); set('kpi-conv', '0%');
      set('kpi-vistas-d', '—'); set('kpi-contactos-d', '—'); set('kpi-conv-d', '—');
      const wrap = document.getElementById('bar-chart');
      if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:24px;color:#999;font-size:13px">Sin datos aún. Compartí tu perfil para empezar a acumular vistas.</div>';
      renderAnalyticaSecundaria(null);
      return;
    }

    // KPIs principales
    const vistas = data.vistas_mes || 0;
    const contactos = data.contactos_mes || 0;
    const conv = vistas > 0 ? Math.round((contactos / vistas) * 100) : 0;
    const vAnt = data.vistas_anterior || 0;
    const cAnt = data.contactos_anterior || 0;
    const convAnt = vAnt > 0 ? Math.round((cAnt / vAnt) * 100) : 0;

    const delta = (actual, anterior) => {
      if (anterior === 0) return actual > 0 ? '▲ nuevo' : '—';
      const pct = Math.round(((actual - anterior) / anterior) * 100);
      return pct >= 0 ? `▲ +${pct}%` : `▼ ${pct}%`;
    };
    const deltaEl = (id, val) => {
      const e = document.getElementById(id);
      if (!e) return;
      e.textContent = val;
      e.className = 'an-kpi-delta ' + (val.startsWith('▲') ? 'up' : val.startsWith('▼') ? 'down' : '');
    };

    set('kpi-vistas', vistas.toLocaleString('es-AR'));
    set('kpi-contactos', contactos.toLocaleString('es-AR'));
    set('kpi-conv', conv + '%');
    deltaEl('kpi-vistas-d', delta(vistas, vAnt));
    deltaEl('kpi-contactos-d', delta(contactos, cAnt));
    deltaEl('kpi-conv-d', convAnt === 0 ? '—' : (conv - convAnt >= 0 ? `▲ +${conv - convAnt}pts` : `▼ ${conv - convAnt}pts`));

    // Cupo de propuestas del plan. Se muestra sólo si hay tope: con plan Pro
    // (ilimitado) la fila no aporta nada.
    puedeEnviarPropuesta().then(c => {
      const fila = document.getElementById('an-cupo');
      if (!fila) return;
      if (c && c.limite != null) {
        set('an-cupo-val', (c.usadas ?? 0) + ' de ' + c.limite);
        fila.style.display = 'flex';
      } else {
        fila.style.display = 'none';
      }
    }).catch(() => {});

    // Actualizar tile hero de Mi perfil y menú-item de analítica
    set('perfil-vistas-mes', vistas.toLocaleString('es-AR') + ' vistas este mes');
    set('analitic-menu-sub', vistas.toLocaleString('es-AR') + ' vistas · ' + contactos.toLocaleString('es-AR') + ' contactos este mes');

    // Actualizar label del período en el hero
    const mesLabel = document.querySelector('#s-analytics .an-hero > div[style*="font-size:11px"]');
    if (mesLabel) {
      const ahora = new Date();
      const mes = ahora.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
      const cfgAn = getPlanConfig(planActual);
      mesLabel.textContent = mes.charAt(0).toUpperCase() + mes.slice(1) + ' · ' + cfgAn.emoji + ' Plan ' + cfgAn.nombre + ' activo';
    }

    // Gráfico de barras diarias
    const diarios = data.vistas_diarias || [];
    if (diarios.length) {
      const maxV = Math.max(...diarios.map(d => d.count), 1);
      const barWrap = document.getElementById('bar-chart');
      const lblWrap = document.getElementById('bar-labels');
      const step = diarios.length > 14 ? Math.ceil(diarios.length / 10) : 1;
      const muestra = diarios.filter((_, i) => i % step === 0);
      if (barWrap) barWrap.innerHTML = muestra.map(d => {
        const h = Math.round((d.count / maxV) * 72);
        const dia = new Date(d.fecha + 'T12:00:00').getDate();
        return `<div class="bar-col">
          <div style="position:relative;height:80px;display:flex;align-items:flex-end;gap:2px">
            <div class="bar" style="height:${h}px;background:linear-gradient(180deg,#2B5BFF,#4A78FF);flex:1" data-val="${d.count} vistas"></div>
          </div>
        </div>`;
      }).join('');
      if (lblWrap) lblWrap.innerHTML = muestra.map(d => {
        const dia = new Date(d.fecha + 'T12:00:00').getDate();
        return `<span style="font-size:9px;color:var(--ink3);flex:1;text-align:center">${dia}</span>`;
      }).join('');
    }

    renderAnalyticaSecundaria(data, vistas, contactos, conv);
  }

  async function renderAnalyticaSecundaria(data, vistas = 0, contactos = 0, conv = 0) {
    // Embudo de conversión con datos reales
    const funnelEl = document.querySelector('#s-analytics .funnel');
    if (funnelEl) {
      const trabajosCerrados = data?.trabajos_completados || 0;
      const funnelData = vistas > 0 ? [
        { label: 'Vistas', val: vistas, pct: 100, color: 'linear-gradient(90deg,#2B5BFF,#4A78FF)' },
        { label: 'Chat iniciado', val: contactos, pct: Math.round((contactos/vistas)*100), color: 'linear-gradient(90deg,#10B981,#34D399)' },
        { label: 'Trabajo cerrado', val: trabajosCerrados, pct: Math.round((trabajosCerrados/vistas)*100), color: 'linear-gradient(90deg,#7C3AED,#A78BFA)' },
      ] : [
        { label: 'Vistas', val: 0, pct: 100, color: 'linear-gradient(90deg,#2B5BFF,#4A78FF)' },
        { label: 'Chat iniciado', val: 0, pct: 0, color: 'linear-gradient(90deg,#10B981,#34D399)' },
        { label: 'Trabajo cerrado', val: 0, pct: 0, color: 'linear-gradient(90deg,#7C3AED,#A78BFA)' },
      ];
      funnelEl.innerHTML = funnelData.map(f => `
        <div class="funnel-row">
          <div class="funnel-label">${f.label}</div>
          <div class="funnel-bar-wrap">
            <div class="funnel-bar" style="width:${Math.max(f.pct,2)}%;background:${f.color}"><span>${f.val}</span></div>
          </div>
          <div class="funnel-pct">${f.pct}%</div>
        </div>`).join('');
      // Hint de conversión vs promedio zonal
      const hintEl = funnelEl.nextElementSibling;
      if (hintEl) {
        const promedio = parseInt(window.PRONET_CONFIG?.CONVERSION_PROMEDIO_ZONAL) || 9;
        if (vistas === 0) {
          hintEl.innerHTML = '💡 Compartí tu perfil para empezar a acumular vistas y medir tu conversión.';
        } else {
          hintEl.innerHTML = conv >= promedio
            ? `💡 Tu conversión es <strong style="color:var(--blue)">${conv}%</strong> vs el promedio zonal de <strong>${promedio}%</strong>. Estás por encima.`
            : `💡 Tu conversión es <strong style="color:var(--gold)">${conv}%</strong> vs el promedio zonal de <strong>${promedio}%</strong>. Hay margen para mejorar.`;
        }
      }
    }

    // Origen de vistas
    const origenWrap = document.querySelector('#s-analytics .zona-rows');
    if (origenWrap) {
      if (data?.por_origen?.length) {
        const total = data.por_origen.reduce((s, o) => s + o.count, 0) || 1;
        const labels = { busqueda: 'Búsqueda', mapa: 'Mapa "Cerca"', inicio: 'Feed / Ranking', perfil: 'Contacto directo', directo: 'Directo' };
        const colores = { busqueda: 'linear-gradient(90deg,var(--gold),#FBBF24)', mapa: 'linear-gradient(90deg,var(--green),#34D399)', inicio: 'linear-gradient(90deg,#2B5BFF,#4A78FF)', perfil: 'linear-gradient(90deg,#7C3AED,#A78BFA)' };
        origenWrap.innerHTML = data.por_origen.map(o => {
          const pct = Math.round((o.count / total) * 100);
          return `<div class="zona-row">
            <div class="zona-name" style="width:110px">${labels[o.origen] || o.origen}</div>
            <div class="zona-prog-wrap"><div class="zona-prog" style="width:${pct}%;background:${colores[o.origen]||'linear-gradient(90deg,#2B5BFF,#4A78FF)'}"></div></div>
            <div class="zona-val" style="width:50px;color:var(--ink);font-weight:600">${o.count} vistas</div>
          </div>`;
        }).join('');
      } else {
        origenWrap.innerHTML = '<div style="text-align:center;padding:16px;color:#999;font-size:13px">Sin datos de origen aún</div>';
      }
    }

    // Ranking por zona — cálculo en tiempo real desde la tabla prestadores
    // Ranking por zona — usa el mismo RPC que Mi Perfil para no traer toda la tabla
    const rankZonaWrap = document.getElementById('ranking-zonas');
    if (rankZonaWrap && usuarioActual?.prestador_id) {
      const rk = await PronetDB.obtenerPosicionPrestador(usuarioActual.prestador_id).catch(() => null);
      if (rk?.pos_zona) {
        const pct = Math.round(((rk.total_zona - rk.pos_zona + 1) / rk.total_zona) * 100);
        rankZonaWrap.innerHTML = `
          <div class="zona-row">
            <div class="zona-name">${escHTML(rk.zona || '')}</div>
            <div class="zona-prog-wrap"><div class="zona-prog" style="width:${pct}%"></div></div>
            <div class="zona-rank">#${rk.pos_zona}</div>
            <div class="zona-val">de ${rk.total_zona} prestadores</div>
          </div>`;
      } else {
        rankZonaWrap.innerHTML = '<div style="text-align:center;padding:16px;color:#999;font-size:13px">Sin datos de ranking aún</div>';
      }
    }

    // Reputación — datos reales del prestador logueado
    const pid = usuarioActual?.prestador_id;
    const [pRep, recom, tasa] = await Promise.all([
      PronetDB.obtener('prestadores', pid).catch(() => null),
      pid ? PronetDB.contarRecomendaciones(pid).catch(() => ({ actual: 0, anterior: 0 })) : { actual: 0, anterior: 0 },
      pid ? PronetDB.calcularTasaRespuesta(pid).catch(() => null) : null,
    ]);
    if (pRep) {
      const rating = pRep.rating || 0;
      const resenas = pRep.resenas || 0;
      const ratingEl = document.getElementById('rep-rating');
      const starsEl = document.getElementById('rep-stars');
      const resenasEl = document.getElementById('rep-resenas');
      if (ratingEl) ratingEl.textContent = rating.toFixed(1);
      if (starsEl) starsEl.textContent = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
      if (resenasEl) resenasEl.textContent = resenas;
    }
    // Recomendaciones del mes actual vs anterior
    const recomEl = document.getElementById('rep-recom');
    const recomDelta = document.getElementById('rep-recom-delta');
    if (recomEl) recomEl.textContent = recom.actual;
    if (recomDelta) {
      const diff = recom.actual - recom.anterior;
      if (diff > 0) {
        recomDelta.textContent = `▲ +${diff} vs mes ant.`;
        recomDelta.style.color = 'var(--green)';
      } else if (diff < 0) {
        recomDelta.textContent = `▼ ${diff} vs mes ant.`;
        recomDelta.style.color = 'var(--red, #E53935)';
      } else {
        recomDelta.textContent = recom.anterior > 0 ? `= igual que mes ant.` : `este mes`;
        recomDelta.style.color = 'var(--ink3)';
      }
    }
    // Tasa de respuesta
    const tasaEl = document.getElementById('rep-tasa');
    const tasaLabel = document.getElementById('rep-tasa-label');
    if (tasaEl) tasaEl.textContent = tasa !== null ? `${tasa}%` : '—';
    if (tasaLabel) {
      if (tasa === null) { tasaLabel.textContent = 'sin datos aún'; tasaLabel.style.color = 'var(--ink3)'; }
      else if (tasa >= 90) { tasaLabel.textContent = 'Excelente'; tasaLabel.style.color = 'var(--green)'; }
      else if (tasa >= 70) { tasaLabel.textContent = 'Buena'; tasaLabel.style.color = 'var(--blue)'; }
      else { tasaLabel.textContent = 'Mejorable'; tasaLabel.style.color = 'var(--red, #E53935)'; }
    }
  }

  function renderBars(d) {
    const wrap = document.getElementById('bar-chart');
    const lblWrap = document.getElementById('bar-labels');
    if (!wrap) return;
    const max = Math.max(...d.bars);
    // FIX: muestrear vistas y contactos con el MISMO índice para que las dos
    // series queden alineadas (antes usaban divisores distintos y se desfasaban)
    const sampleStep = d.bars.length > 14 ? Math.ceil(d.bars.length / 10) : 1;
    const idx    = d.bars.map((_, i) => i).filter(i => i % sampleStep === 0);
    const slice  = idx.map(i => d.bars[i]);
    const cslice = idx.map(i => d.contacts[i] || 0);

    wrap.innerHTML = slice.map((v, i) => {
      const h = Math.round((v / max) * 72);
      const ch = Math.round(((cslice[i]||0) / max) * 72);
      return `<div class="bar-col">
        <div style="position:relative;height:80px;display:flex;align-items:flex-end;gap:2px">
          <div class="bar" style="height:${h}px;background:linear-gradient(180deg,#2B5BFF,#4A78FF);flex:1" data-val="${v} vistas"></div>
          <div class="bar" style="height:${ch}px;background:linear-gradient(180deg,var(--gold),#FBBF24);flex:1" data-val="${cslice[i]||0} contactos"></div>
        </div>
      </div>`;
    }).join('');

    // labels
    const lbls = d.labels.length >= slice.length ? d.labels.filter((_,i) => i % Math.ceil(d.labels.length/slice.length)===0||d.labels.length===slice.length) : d.labels;
    lblWrap.innerHTML = lbls.slice(0, slice.length).map(l =>
      `<span style="font-size:9px;color:var(--ink3);flex:1;text-align:center">${l}</span>`
    ).join('');
  }

  function renderRankTimeline(d) {
    const wrap = document.getElementById('rank-timeline');
    if (!wrap) return;
    const days = d.rankDays;
    const maxPos = 6;
    wrap.innerHTML = days.map((pos, i) => {
      const h = Math.round(((maxPos - pos + 1) / maxPos) * 60);
      const isGold = pos === 1;
      return `<div class="rt-col">
        <div class="rt-bar${isGold?' gold':''}" style="height:${h}px" data-pos="${pos}"></div>
        <div class="rt-lbl">${i === 0 ? 'Sem 1' : i === days.length-1 ? 'Hoy' : ''}</div>
      </div>`;
    }).join('');
  }

  // renderAnalytica se llama desde goTo('s-analytics') directamente

  // ── Suscripción ─────────────────────────────────────────────────────
  function _calcRenew(meses) {
    const d = new Date();
    d.setMonth(d.getMonth() + meses);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  let currentBilling     = 'anual';
  let currentCheckoutPlan = 'pro';

  function switchBilling(btn, mode) {
    currentBilling = mode;
    document.querySelectorAll('.pt-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const esAnual = mode === 'anual';
    const planes  = (window.PRONET_CONFIG || {}).PLANES || [];
    planes.filter(p => p.id !== 'base').forEach(p => {
      const precio   = esAnual ? p.precio_anual : p.precio_mes;
      const amountEl = document.getElementById(p.id + '-amount');
      const periodEl = document.getElementById(p.id + '-period');
      const savingEl = document.getElementById(p.id + '-saving');
      const descEl   = document.getElementById(p.id + '-desc');
      if (amountEl) amountEl.textContent = '$' + precio.toLocaleString('es-AR');
      if (periodEl) periodEl.textContent = esAnual ? '/ año' : '/ mes';
      if (savingEl) { savingEl.textContent = esAnual ? '2 meses gratis' : ''; savingEl.style.display = esAnual ? 'inline' : 'none'; }
      if (descEl)   descEl.textContent   = esAnual
        ? 'Equivale a $' + p.precio_mes.toLocaleString('es-AR') + ' por mes. Cancelás cuando quieras.'
        : 'Cancelás cuando quieras.';
    });
  }

  function abrirCheckout(planId) {
    currentCheckoutPlan = planId;
    const cfg    = getPlanConfig(planId);
    const esAnual = currentBilling === 'anual';
    const precio  = esAnual ? cfg.precio_anual : cfg.precio_mes;
    const total   = '$' + precio.toLocaleString('es-AR') + ' ARS';
    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setT('checkout-title',        'Activar Plan ' + cfg.nombre);
    setT('checkout-sub',          (esAnual ? 'Anual' : 'Mensual') + ' · ' + total + (esAnual ? ' · 2 meses gratis' : ''));
    setT('checkout-plan-label',   cfg.nombre + ' ' + (esAnual ? 'Anual' : 'Mensual'));
    setT('checkout-boost-val',    '×' + cfg.loyalty_boost + ' activado');
    setT('checkout-propuestas-val', cfg.propuestas_mes ? cfg.propuestas_mes + '/mes' : 'Ilimitadas');
    setT('checkout-renew',        _calcRenew(esAnual ? 12 : 1));
    setT('checkout-total',        total);
    document.getElementById('checkout-overlay').classList.add('show');
  }

  function cerrarCheckout(e) {
    if (e.target === document.getElementById('checkout-overlay')) {
      document.getElementById('checkout-overlay').classList.remove('show');
    }
  }

  function selPayMethod(el) {
    document.querySelectorAll('.cm-opt').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
  }

  async function confirmarPago() {
    // Con MP activo: crear la preferencia real y redirigir a MercadoPago.
    // El plan recién se activa cuando llega el webhook con el pago aprobado —
    // acá no tocamos suscripciones ni el estado local.
    if (mpCheckoutActivo()) {
      const btnMp = document.querySelector('#checkout-overlay .btn-p');
      if (btnMp) { btnMp.disabled = true; btnMp.textContent = 'Redirigiendo a MercadoPago…'; }
      const res = await PronetDB.crearPreferenciaMP(currentCheckoutPlan, currentBilling);
      if (btnMp) { btnMp.disabled = false; btnMp.textContent = 'Confirmar pago seguro 🔒'; }
      if (!res.ok) {
        showToast && showToast('⚠️ No se pudo iniciar el pago. ' + (res.error || ''));
        return;
      }
      window.location.href = res.init_point;
      return;
    }

    // Modo test (Checkout MP apagado): activa sin cobrar.
    // Antes esto hacía un upsert directo a `suscripciones` desde el cliente.
    // La auditoría de seguridad del 2026-07-31 cerró esa escritura: la policy
    // permitía que cualquiera se autoactivara Elite gratis desde la consola.
    // Ahora va por activar_plan_admin(), que valida es_admin() server-side —
    // para un usuario común falla y se avisa en vez de mentir con la UI.
    const btnConfirmar = document.querySelector('#checkout-overlay .btn-p');
    if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.textContent = 'Activando…'; }

    // Congelar el plan elegido: el RPC es async y para entonces el usuario
    // pudo haber abierto otro checkout.
    const planElegido    = currentCheckoutPlan;
    const periodoElegido = currentBilling;

    const uid = await PronetDB.usuarioIdActual().catch(() => null);
    const res = uid
      ? await PronetDB.rpc('activar_plan_admin', {
          p_usuario_id: uid,
          p_plan:       planElegido,
          p_periodo:    periodoElegido,
        })
      : { ok: false, error: 'SIN_SESION' };

    if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.textContent = 'Confirmar pago seguro 🔒'; }

    if (!res.ok) {
      showToast && showToast(res.error === 'SOLO_ADMIN'
        ? '🧪 Modo test: solo un admin puede activar un plan sin pagar. Activá "Checkout MercadoPago" para el flujo real.'
        : '⚠️ No se pudo activar el plan. ' + (res.error || ''));
      return;
    }

    planActual    = planElegido;
    periodoActual = periodoElegido;
    venceActual   = res.vence_en || null;
    reflejarPlan();

    document.getElementById('checkout-overlay').classList.remove('show');
    const cfg = getPlanConfig(planActual);
    setTimeout(() => {
      const titleEl = document.getElementById('subs-success-title');
      const subEl   = document.getElementById('subs-success-sub');
      if (titleEl) titleEl.textContent = '¡Plan ' + cfg.nombre + ' activado!';
      if (subEl)   subEl.textContent   = 'Tu loyalty boost ×' + cfg.loyalty_boost + ' ya está activo.';
      document.getElementById('subs-success').classList.add('show');
    }, 300);
  }

  function cerrarSubsSuccess() {
    document.getElementById('subs-success').classList.remove('show');
    reflejarPlan();
    goTo('s-miperfil');
  }

  function toggleFaq(el) {
    el.classList.toggle('open');
  }

  // ── Onboarding ──────────────────────────────────────────────────────
  const TOTAL_STEPS = 8;

  function renderSteps(current) {
    for (let s = 1; s <= TOTAL_STEPS; s++) {
      const el = document.getElementById('steps-' + s);
      if (!el) continue;
      el.innerHTML = '';
      for (let i = 1; i <= TOTAL_STEPS; i++) {
        const d = document.createElement('div');
        d.className = 'ob-step' + (i < current ? ' done' : i === current ? ' cur' : '');
        el.appendChild(d);
      }
    }
  }

  function showOb(id) {
    document.querySelectorAll('.ob-screen').forEach(s => s.classList.add('hidden'));
    const t = document.getElementById(id);
    if (t) t.classList.remove('hidden');
    renderSteps(parseInt(id.replace('ob-','')) || 0);
  }

  function obStart(tipo) {
    // pre-select type
    if (tipo === 'cliente') {
      document.getElementById('tc-prestador').classList.remove('on');
      document.getElementById('tc-cliente').classList.add('on');
    }
    showOb('ob-1');
  }

  function obNext(step) {
    if (step === 8) poblarExitoOnboarding();
    showOb('ob-' + step);
  }

  function poblarExitoOnboarding() {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const set = (id, txt, color) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = txt;
      el.style.color = color || '';
    };

    // Nombre — paso 2
    const nombre = [val('f-ej-roberto'), val('f-ej-pena')].filter(Boolean).join(' ') || '—';
    set('sc-nombre', nombre);

    // Rubro — paso 3: ícono + label del rubro seleccionado
    const rubroEl = document.querySelector('#ob-3 .rubro-opt.on');
    const rubroIcono = rubroEl ? rubroEl.querySelector('.ro-icon')?.textContent || '' : '';
    const rubroLbl   = rubroEl ? (rubroEl.querySelector('.ro-lbl')?.textContent || '').replace(/\s+/g, ' ').trim() : '';
    set('sc-rubro', rubroIcono && rubroLbl ? rubroIcono + ' ' + rubroLbl : '—');

    // Zona — paso 4: dirección + radio seleccionado
    const dir   = val('f-ej-mitre-1245-escobar-2');
    const radio = document.querySelector('#ob-4 .r-chip.on')?.textContent?.trim() || '';
    const zona  = [dir, radio].filter(Boolean).join(' · ') || '—';
    set('sc-zona', zona);

    // Tarifa — paso 6: tipo + rango de precio
    const tipo    = document.querySelector('#ob-6 .pt-chip.on')?.textContent?.trim() || '';
    const precMin = val('f-ej-6000');
    const precMax = val('f-ej-10000');
    let tarifa = '—';
    if (precMin || precMax) {
      tarifa = ['$' + precMin, '$' + precMax].filter(v => v !== '$').join('–');
      if (tipo) tarifa += ' / ' + tipo.toLowerCase();
    } else if (tipo) {
      tarifa = tipo;
    }
    set('sc-tarifa', tarifa);

    // Pagos — paso 7: emojis de los métodos seleccionados
    const pagosEl = document.querySelectorAll('#ob-7 .pago-opt.on .pago-ico');
    const pagos   = Array.from(pagosEl).map(e => e.textContent.trim()).join(' ') || '—';
    set('sc-pagos', pagos);

    // Mapa en tiempo real — paso 7
    const mapaActivo = document.getElementById('campo-19')?.checked;
    set('sc-mapa', mapaActivo ? '✓ Activo' : '— Inactivo', mapaActivo ? 'var(--green)' : 'var(--ink3)');
  }

  function obBack(step) {
    if (step <= 1) { showOb('ob-splash'); return; }
    showOb('ob-' + (step - 1));
  }

  function obSkip() {
    document.querySelectorAll('.ob-screen').forEach(s => s.classList.add('hidden'));
    goTo('s-miperfil');
  }

  function selectType(t) {
    document.querySelectorAll('.type-card').forEach(c => c.classList.remove('on'));
    document.getElementById('tc-' + t).classList.add('on');
  }

  function selectRubro(el, rubro) {
    document.querySelectorAll('.rubro-opt').forEach(r => r.classList.remove('on'));
    el.classList.add('on');
    const subs = { dom:['Limpieza','Planchado','Post-obra','Vidrios'], elec:['Instalaciones','Reparaciones','Tableros','Urgencias 24h','Certificación ENRE','Eficiencia energética'], jard:['Poda','Mantenimiento','Diseño','Riego'], masc:['Paseador','Cuidador','Peluquería canina'], cuidad:['Niñera','Adultos mayores','Acompañante'], chef:['Chef a domicilio','Catering','Eventos'] };
    const wrap = document.getElementById('sub-opts');
    wrap.innerHTML = (subs[rubro]||[]).map((s,i) => `<div class="sub-opt ${i<2?'on':''}" onclick="this.classList.toggle('on')">${s}</div>`).join('');
    habilitarAccesibilidadTeclado(wrap); // los sub-opts se crean dinámicamente
  }

  function selZona(el) {
    const cls = el.classList.contains('zm-opt') ? '.zm-opt' : '.form-opt';
    const container = el.closest('[role="group"]') || el.parentElement;
    container.querySelectorAll(cls).forEach(z => z.classList.remove('on'));
    el.classList.add('on');
    actualizarMapaCobertura();
  }

  function actualizarMapaCobertura() {
    const iframe = document.getElementById('zona-mapa-iframe');
    if (!iframe) return;
    const lat = -34.3483, lon = -58.7968;
    const zonaLbl = document.querySelector('#pub-3 .form-opt.on .opt-lbl')?.textContent || '';
    if (zonaLbl === 'Toda la ciudad') {
      iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=-59.1%2C-34.65%2C-58.45%2C-34.05&layer=mapnik&marker=${lat}%2C${lon}`;
      return;
    }
    if (zonaLbl === 'A domicilio') {
      iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=-58.95%2C-34.45%2C-58.65%2C-34.25&layer=mapnik&marker=${lat}%2C${lon}`;
      return;
    }
    const radiusKm = parseInt(document.querySelector('#pub-3 .r-chip.on')?.textContent) || 8;
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const bbox = `${(lon-dLon).toFixed(4)}%2C${(lat-dLat).toFixed(4)}%2C${(lon+dLon).toFixed(4)}%2C${(lat+dLat).toFixed(4)}`;
    iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
  }

  function selPrecio(el) {
    document.querySelectorAll('.pt-chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
  }

  function toggleFoto(el) {
    el.classList.toggle('filled');
    const icon = el.querySelector('.fs-icon');
    const lbl  = el.querySelector('.fs-lbl');
    if (el.classList.contains('filled')) { icon.textContent='✓'; lbl.textContent='Foto cargada'; }
    else { icon.textContent='➕'; lbl.textContent='Agregar foto'; }
  }

  // ── Inicio ──────────────────────────────────────────────────────────
  // Renderizar gráficos cuando la pantalla de analítica se active
  document.addEventListener('DOMContentLoaded', function() {
    renderAnalytica('30d');
  });

  // ── Reseña ──────────────────────────────────────────────────────────
  let currentStars = 5;
  const starLabels = ['', 'Muy malo', 'Regular', 'Bueno', 'Muy bueno', '¡Excelente!'];

  function setStars(n) {
    currentStars = n;
    document.querySelectorAll('#stars-big .star-big').forEach((s, i) => {
      s.classList.toggle('lit', i < n);
    });
    const lbl = document.getElementById('star-label');
    lbl.textContent = starLabels[n];
    lbl.style.color = n >= 4 ? 'var(--blue)' : n === 3 ? 'var(--gold)' : 'var(--red)';

    // El impacto depende de la nota, así que se recalcula con cada cambio.
    pintarImpactoResena();

    // swap tag suggestions based on rating
    const posWrap = document.getElementById('tags-positivos');
    if (n <= 2) {
      posWrap.querySelector('.rev-tags-title').textContent = '¿Qué falló? (opcional)';
      posWrap.querySelector('.rev-tags').innerHTML = [
        'No fue puntual','Precio alto','Trabajo incompleto','No respondió','Dejó sucio','Falta de explicación'
      ].map(t => `<div class="rev-tag" onclick="this.classList.toggle('on')">${t}</div>`).join('');
    } else {
      posWrap.querySelector('.rev-tags-title').textContent = '¿Qué destacás? (opcional)';
      posWrap.querySelector('.rev-tags').innerHTML = [
        ['✓ Puntual',true],['✓ Prolijo',true],['✓ Buen precio',true],
        ['✓ Rápido',false],['✓ Amable',false],['✓ Con garantía',false],
        ['✓ Explicó bien',false],['✓ Lo recomendaría',false]
      ].map(([t,on]) => `<div class="rev-tag ${on?'on':''}" onclick="this.classList.toggle('on')">${t}</div>`).join('');
    }

    // Mostrar/ocultar bloque de tags de problema (denuncias leves) solo con 1-2 estrellas
    const problemas = document.getElementById('rev-problemas');
    if (problemas) problemas.style.display = n <= 2 ? 'block' : 'none';
  }

  function updateChar(el) {
    const c = document.getElementById('rev-char-count');
    if (c) c.textContent = el.value.length;
  }


  // ═══════════════════════════════════════════════════════════════════
  // ETAPA 7B — Máquina de estados del chat
  // ═══════════════════════════════════════════════════════════════════

  /** Actualiza todos los banners del chat según el estado y el rol del usuario actual. */
  async function actualizarBannersChat(chatId) {
    const chat = await PronetDB.obtenerChat(chatId).catch(() => null);
    if (!chat) return;
    const estado = chat.estado;
    const uid = usuarioActual?.id;
    const soyVecino = chat.vecino_id === uid;
    const soyPrestador = !soyVecino;
    const footer = document.getElementById('chat-footer');
    const fotosGaleria = document.getElementById('chat-fotos-galeria');
    // Ocultar todos los banners primero
    ['chat-resena-banner','chat-confirmar-banner','chat-terminar-banner',
     'chat-vecino-cierre-banner','chat-cancelar-banner','chat-cerrado-banner',
     'chat-rechazada-banner','chat-enviar-propuesta-banner','chat-denuncia-link'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Mostrar link de denuncia solo para el vecino del chat
    const denLink = document.getElementById('chat-denuncia-link');
    if (denLink && soyVecino) denLink.style.display = 'block';
    reflejarRecontratar(chat);
    const show = id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; };
    const showBlock = id => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };
    switch (estado) {
      case 'consulta':
        if (footer) footer.style.display = ''; // tanto vecino como prestador pueden escribir
        if (fotosGaleria) fotosGaleria.style.display = 'none';
        if (soyPrestador) showBlock('chat-enviar-propuesta-banner');
        // Para el vecino: hint de que puede escribir para consultar
        if (soyVecino) {
          const body = document.getElementById('chat-body');
          const msgInput = document.getElementById('chat-msg');
          if (msgInput) msgInput.placeholder = 'Contale lo que necesitás...';
        }
        break;
      case 'propuesta_enviada':
        if (footer) footer.style.display = '';
        if (fotosGaleria) fotosGaleria.style.display = 'none';
        break;
      case 'activo': {
        if (footer) footer.style.display = '';
        if (fotosGaleria) fotosGaleria.style.display = '';
        if (soyPrestador) {
          // Resetear el botón por si venía de terminado_prestador (disputa)
          const btnTerminar = document.querySelector('#chat-terminar-banner button');
          if (btnTerminar) { btnTerminar.textContent = 'Marcar como terminado'; btnTerminar.disabled = false; }
          show('chat-terminar-banner');
        }
        show('chat-cancelar-banner');
        // Verificar si pasaron 7 días sin actividad (para habilitar cierre del vecino)
        if (soyVecino && chat.ultimo_evento_at) {
          const dias = (Date.now() - new Date(chat.ultimo_evento_at).getTime()) / 86400000;
          if (dias >= PRONET_CONFIG.INACTIVIDAD_CIERRE_DIAS) {
            // Mostrar banner de tomar control y ocultar el de cancelar
            // (no tiene sentido mostrar ambos — el cierre tiene prioridad)
            show('chat-vecino-cierre-banner');
            const banCancelar = document.getElementById('chat-cancelar-banner');
            if (banCancelar) banCancelar.style.display = 'none';
          }
        }
        break;
      }
      case 'terminado_prestador':
        if (footer) footer.style.display = '';
        if (fotosGaleria) fotosGaleria.style.display = '';
        if (soyVecino) {
          show('chat-confirmar-banner');
        } else {
          // Prestador: info de que está esperando confirmación
          const el = document.getElementById('chat-terminar-banner');
          if (el) { el.style.display = 'flex'; el.querySelector('button').textContent = '⏳ Esperando confirmación del vecino'; el.querySelector('button').disabled = true; }
        }
        break;
      case 'terminado_por_vecino':
        if (footer) footer.style.display = '';
        if (fotosGaleria) fotosGaleria.style.display = '';
        if (soyVecino) show('chat-resena-banner');
        break;
      case 'calificado':
        if (footer) footer.style.display = 'none';
        if (fotosGaleria) fotosGaleria.style.display = 'none';
        showBlock('chat-cerrado-banner');
        break;
      case 'cancelado':
        if (footer) footer.style.display = 'none';
        if (fotosGaleria) fotosGaleria.style.display = 'none';
        const banCerrado = document.getElementById('chat-cerrado-banner');
        if (banCerrado) {
          banCerrado.style.display = 'block';
          banCerrado.textContent = '❌ Trabajo cancelado' + (chat.motivo_cancelacion ? ': ' + chat.motivo_cancelacion : '') + '.';
        }
        break;
      case 'rechazada':
        if (footer) footer.style.display = 'none';
        if (fotosGaleria) fotosGaleria.style.display = 'none';
        showBlock('chat-rechazada-banner');
        break;
    }
  }

  /** Prestador inicia consulta desde el detalle del pedido. */
  async function consultarAntesDeProponer() {
    if (!pedidoActual?.id) return;
    const btn = document.getElementById('pd-btn-consultar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Abriendo...'; }
    const res = await PronetDB.iniciarConsulta(pedidoActual.id).catch(() => null);
    if (btn) { btn.disabled = false; btn.textContent = '💬 Consultar primero'; }
    if (!res?.ok) { showToast && showToast('⚠️ ' + (res?.error || 'No se pudo abrir el chat')); return; }
    chatActualId = res.chat_id;
    chatOrigen = 's-detalle-pedido';
    // Obtener nombre del vecino desde el chat/perfil (pedidoActual puede no tenerlo)
    let vecinoNombre = pedidoActual.vecino_nombre || pedidoActual.usuario_nombre || null;
    if (!vecinoNombre) {
      const chat = await PronetDB.obtenerChat(chatActualId).catch(() => null);
      vecinoNombre = chat?.vecino_nombre || 'Vecino';
    }
    // Setear header del chat
    const nameEl = document.getElementById('chat-name');
    if (nameEl) nameEl.textContent = vecinoNombre;
    const avEl = document.getElementById('chat-av');
    if (avEl) {
      const ini = vecinoNombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      avEl.innerHTML = ini || '?';
      avEl.style.background = '#EEF2FF';
      avEl.style.color = '#2B5BFF';
    }
    const tituloEl = document.getElementById('chat-service-titulo');
    if (tituloEl) tituloEl.textContent = pedidoActual.titulo || 'Consulta';
    const subEl = document.getElementById('chat-service-sub');
    if (subEl) subEl.textContent = pedidoActual.rubro || '';
    goTo('s-chat');
    document.getElementById('chat-body').innerHTML =
      '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">💬 Consultá al vecino antes de enviar tu propuesta.</div>';
    await cargarMensajesChat();
    await actualizarBannersChat(chatActualId);
    if (chatSuscripcion) chatSuscripcion();
    chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
      if (payload.new && payload.new.chat_id === chatActualId) {
        const esPropio = payload.new.autor_id === usuarioActual.id;
        if (!esPropio) { agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id); PronetDB.marcarLeidos(chatActualId); }
      }
    });
  }

  /** Prestador toca "Enviar propuesta" desde el chat de consulta.
   *  Marca el chat con un flag y abre el formulario normal de propuesta. */
  window._chatOrigenPropuesta = null;
  async function enviarPropuestaDesdeChat() {
    if (!chatActualId) return;
    const chat = await PronetDB.obtenerChat(chatActualId).catch(() => null);
    if (!chat) { showToast && showToast('⚠️ No se pudo cargar el chat'); return; }
    if (chat.estado !== 'consulta') { showToast && showToast('⚠️ Este chat ya no está en consulta'); return; }
    // Cargar el pedido en pedidoActual
    const pedidoCompleto = await PronetDB.obtener('pedidos', chat.pedido_id).catch(() => null);
    if (!pedidoCompleto) { showToast && showToast('⚠️ Pedido no encontrado'); return; }
    pedidoActual = pedidoCompleto;
    // CRITICAL: limpiar propuestaMia para que enviarPropuesta cree una nueva.
    // Si el prestador viene navegando desde otro pedido, propuestaMia podría
    // tener una propuesta vieja y el UPDATE la pisaría.
    propuestaMia = null;
    // Verificar si el prestador ya tenía propuesta a ESTE pedido específico
    // (por si volvió a consultar después de ofertar y quiere modificar)
    try {
      const mias = await PronetDB.listar('propuestas');
      const miaEstePedido = mias.find(pr => pr.pedido_id === chat.pedido_id && pr.prestador_id === usuarioActual.prestador_id && pr.estado === 'pendiente');
      if (miaEstePedido) propuestaMia = miaEstePedido;
    } catch(e) {}
    // Sólo marcar el origen si el formulario llegó a abrirse: si el plan no
    // deja enviar más propuestas, una marca colgada transicionaría este chat
    // al enviar una propuesta de otro pedido.
    const abierto = await abrirNuevaPropuesta();
    window._chatOrigenPropuesta = abierto ? chatActualId : null;
  }

  /** Prestador marca el trabajo como terminado. */
  async function marcarTrabajoTerminado() {
    if (!chatActualId) return;
    const res = await PronetDB.marcarTerminado(chatActualId).catch(() => null);
    if (!res?.ok) { showToast && showToast('⚠️ ' + (res?.error || 'Error al marcar terminado')); return; }
    showToast && showToast('✅ Marcaste el trabajo como terminado. El vecino recibirá una notificación.');
    await actualizarBannersChat(chatActualId);
    // Notificar al vecino
    if (PronetDB.esRemoto()) {
      const chat = await PronetDB.obtenerChat(chatActualId).catch(() => null);
      if (chat?.vecino_id) {
        PronetDB.notificar({ destino: 'usuario', usuario_id: chat.vecino_id,
          tipo: 'terminado',
          titulo: '✅ ' + (usuarioActual?.nombre || 'El prestador') + ' marcó el trabajo como terminado',
          cuerpo: '¿Confirmás que está todo bien? Entrá al chat para calificar.',
          url: '/#s-chats' }).catch(() => {});
      }
    }
  }

  /** Trae el prestador REAL del chat actual y lo carga en prestadorActual.
   *  Necesario porque prestadorActual es global y puede haber quedado con
   *  datos de otro prestador visitado antes (bug: mostraba "Roberto Peña"
   *  al calificar porque nunca se sincronizaba con el chat). */
  async function sincronizarPrestadorDelChat() {
    if (!chatActualId) return;
    const chat = await PronetDB.obtenerChat(chatActualId).catch(() => null);
    if (!chat?.prestador_id) return;
    const prestador = await PronetDB.obtener('prestadores', chat.prestador_id).catch(() => null);
    if (prestador) prestadorActual = prestador;
  }

  /** Vecino confirma o rechaza el cierre declarado por el prestador. */
  async function confirmarCierreChat(confirma) {
    if (!chatActualId) return;
    if (confirma) {
      // Muestra pantalla de reseña directamente
      await sincronizarPrestadorDelChat();
      abrirResena();
    } else {
      // Vuelve a activo
      const res = await PronetDB.confirmarCierre(chatActualId, false).catch(() => null);
      if (!res?.ok) { showToast && showToast('⚠️ Error al actualizar'); return; }
      showToast && showToast('📝 Le avisamos al prestador que hay algo pendiente.');
      await actualizarBannersChat(chatActualId);
    }
  }

  /** Vecino toma el control del cierre tras 7 días de inactividad. */
  async function vecTomaCierre() {
    if (!chatActualId) return;
    const res = await PronetDB.marcarTerminadoPorVecino(chatActualId).catch(() => null);
    if (!res?.ok) { showToast && showToast('⚠️ ' + (res?.error || 'No se puede cerrar aún')); return; }
    showToast && showToast('✅ Trabajo marcado como terminado.');
    await actualizarBannersChat(chatActualId);
    await sincronizarPrestadorDelChat();
    abrirResena();
  }

  // Motivos de cancelación por rol
  const MOTIVOS_VECINO = [
    'Cambié de opinión / ya no lo necesito',
    'Encontré otro prestador',
    'El prestador no responde',
    'El prestador no puede en la fecha acordada',
    'Precio más alto de lo esperado',
    'Otro',
  ];
  const MOTIVOS_PRESTADOR = [
    'No puedo en la fecha acordada',
    'El trabajo es más complejo de lo previsto',
    'El vecino no responde',
    'Zona fuera de mi cobertura',
    'Ya tomé otro trabajo',
    'Otro',
  ];
  let motivoSeleccionado = null;

  /** Abre el modal de cancelación con los motivos según el rol. */
  function abrirModalCancelar() {
    const modal = document.getElementById('modal-cancelar');
    if (!modal) return;
    const esPrestador = !!(usuarioActual?.prestador_id);
    const motivos = esPrestador ? MOTIVOS_PRESTADOR : MOTIVOS_VECINO;
    const cont = document.getElementById('cancelar-motivos');
    motivoSeleccionado = null;
    if (cont) {
      cont.innerHTML = motivos.map((m, i) => `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;cursor:pointer;font-size:13px;color:var(--ink)" onclick="seleccionarMotivo(this,'${m.replace(/'/g,"\'")}')">
          <div style="width:18px;height:18px;border-radius:50%;border:2px solid var(--border);flex-shrink:0" class="radio-dot-${i}"></div>
          ${m}
        </label>`).join('');
    }
    const txt = document.getElementById('cancelar-texto');
    if (txt) txt.value = '';
    modal.style.display = 'flex';
  }

  function seleccionarMotivo(el, motivo) {
    motivoSeleccionado = motivo;
    document.querySelectorAll('#cancelar-motivos label').forEach(l => {
      l.style.borderColor = 'var(--border)';
      l.style.background = 'white';
      // Limpiar el "relleno" del círculo del radio en todos los labels
      const dot = l.querySelector('div[class^="radio-dot-"]');
      if (dot) {
        dot.style.borderColor = 'var(--border)';
        dot.style.background = 'white';
        dot.style.boxShadow = 'none';
      }
    });
    el.style.borderColor = 'var(--blue)';
    el.style.background = '#EEF2FF';
    // Rellenar el círculo del radio seleccionado (borde azul + puntito interno)
    const dotSel = el.querySelector('div[class^="radio-dot-"]');
    if (dotSel) {
      dotSel.style.borderColor = 'var(--blue)';
      dotSel.style.background = 'var(--blue)';
      dotSel.style.boxShadow = 'inset 0 0 0 3px white';
    }
    // Mostrar textarea solo si eligió "Otro"
    const txt = document.getElementById('cancelar-texto');
    if (txt) txt.placeholder = motivo === 'Otro' ? 'Explicá el motivo...' : 'Detalles adicionales (opcional)...';
  }

  function cerrarModalCancelar() {
    const modal = document.getElementById('modal-cancelar');
    if (modal) modal.style.display = 'none';
  }

  async function confirmarCancelacion() {
    if (!motivoSeleccionado) { showToast && showToast('⚠️ Elegí un motivo'); return; }
    const txtEl = document.getElementById('cancelar-texto');
    const txt = (txtEl?.value || '').trim();
    if (motivoSeleccionado === 'Otro' && !txt) {
      showToast && showToast('⚠️ Describí el motivo');
      if (txtEl) txtEl.focus();
      return;
    }
    if (!chatActualId) return;
    // Protección contra doble-submit
    const btnConfirm = document.querySelector('#modal-cancelar button[onclick="confirmarCancelacion()"]');
    if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Cancelando...'; }
    try {
      const res = await PronetDB.cancelarChat(chatActualId, motivoSeleccionado, txt).catch(() => null);
      if (!res?.ok) {
        showToast && showToast('⚠️ ' + (res?.error || 'Error al cancelar'));
        // Rehabilitar el botón para reintentar
        if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Confirmar cancelación'; }
        return;
      }
      cerrarModalCancelar();
      showToast && showToast('❌ Trabajo cancelado.');
      await actualizarBannersChat(chatActualId);
      // Notificar a la contraparte (quien no canceló)
      if (PronetDB.esRemoto()) {
        const chat = await PronetDB.obtenerChat(chatActualId).catch(() => null);
        if (chat) {
          const soyVecino = usuarioActual?.id === chat.vecino_id;
          const titulo = '❌ ' + (usuarioActual?.nombre || (soyVecino ? 'El vecino' : 'El prestador')) + ' canceló el trabajo';
          const cuerpo = motivoSeleccionado + (txt ? ': ' + txt.slice(0, PRONET_CONFIG.NOTIF_CUERPO_MAX) : '');
          if (soyVecino && chat.prestador_id) {
            const destinatarioId = await PronetDB.usuarioIdDePrestador(chat.prestador_id).catch(() => null);
            if (destinatarioId) {
              PronetDB.notificar({ destino: 'usuario', usuario_id: destinatarioId,
                tipo: 'cancelacion', titulo, cuerpo, url: '/#s-chats' }).catch(() => {});
            }
          } else if (!soyVecino && chat.vecino_id) {
            PronetDB.notificar({ destino: 'usuario', usuario_id: chat.vecino_id,
              tipo: 'cancelacion', titulo, cuerpo, url: '/#s-chats' }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[Cancelar] error inesperado:', e);
      showToast && showToast('⚠️ Error inesperado al cancelar');
    } finally {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.textContent = 'Confirmar cancelación'; }
    }
  }

  /** Filtra la lista de chats por estado. */
  let chatsFiltroActual = 'todos';
  let chatsCache = [];

  /** Filtros que NO son un estado suelto.
   *
   *  Existen porque el tablero de Inicio agrupa: "¡Te eligieron!" cuenta
   *  `activo` + `elegida`, y "sin leer" no es un estado sino un dato de los
   *  mensajes. Si el chip filtrara por igualdad contra `estado`, tocar el
   *  indicador llevaría a una lista con menos filas que el número que
   *  acababa de mostrar — que es exactamente lo que no puede pasar. */
  const GRUPOS_CHAT = {
    activo:               c => ['activo', 'elegida'].includes(c.estado),
    propuesta_enviada:    c => ['propuesta_enviada', 'pendiente'].includes(c.estado),
    terminado_por_vecino: c => c.estado === 'terminado_por_vecino',
    no_leidos:            c => (c._noLeidos || 0) > 0,
  };
  const ETIQUETA_CHAT = {
    todos:                'Conversaciones activas',
    activo:               'Trabajos en curso',
    no_leidos:            'Con mensajes sin leer',
    terminado_por_vecino: 'Trabajos para cerrar',
    propuesta_enviada:    'Propuestas esperando respuesta',
    consulta:             'Consultas',
    calificado:           'Completados',
    cancelado:            'Cancelados',
    rechazada:            'Rechazados',
  };

  // Filtro con el que hay que abrir Mensajes en la próxima entrada. Lo deja
  // puesto irAChats() y lo consume renderChats(), que es asíncrono: aplicarlo
  // antes de que la lista exista no tendría efecto.
  let chatsFiltroPendiente = null;

  function filtrarChats(chipEl, filtro) {
    chatsFiltroActual = filtro;
    document.querySelectorAll('#chats-filtros .chip').forEach(c => c.classList.remove('on'));
    // Sin `chipEl` (viene del tablero, no de un click en el chip) hay que
    // buscar el chip para que la pantalla muestre cuál filtro está activo.
    const chip = chipEl || document.querySelector('#chats-filtros .chip[data-filtro="' + filtro + '"]');
    if (chip) {
      chip.classList.add('on');
      if (!chipEl) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    renderizarListaChats(chatsCache);
  }

  /** Abre Mensajes ya filtrado. Lo usa el tablero de Inicio: si el indicador
   *  dice "1 trabajo para cerrar", tocarlo tiene que dejar ese trabajo a la
   *  vista, no la lista completa donde hay que volver a buscarlo. */
  function irAChats(filtro) {
    chatsFiltroPendiente = filtro || 'todos';
    goTo('s-chats');
  }
  window.irAChats = irAChats;

  function renderizarListaChats(chats) {
    const lista = document.getElementById('chats-lista');
    const vacio = document.getElementById('chats-vacio');
    if (!lista) return;
    // Deduplicar por id por si Supabase devuelve la misma fila más de una vez
    const unicos = [...new Map(chats.map(c => [c.id, c])).values()];
    const test = GRUPOS_CHAT[chatsFiltroActual] || (c => c.estado === chatsFiltroActual);
    const filtrados = chatsFiltroActual === 'todos' ? unicos : unicos.filter(test);
    lista.innerHTML = '';
    if (filtrados.length === 0) {
      // El vacío genérico ("Cuando elijas a un prestador se abrirá el chat")
      // es falso si hay chats y el que no tiene resultados es el filtro:
      // deja al usuario creyendo que perdió sus conversaciones.
      if (chatsFiltroActual !== 'todos' && unicos.length) {
        if (vacio) vacio.style.display = 'none';
        lista.innerHTML =
          '<div style="padding:44px 24px;text-align:center">' +
            '<div style="font-size:34px;margin-bottom:10px">🔍</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--ink)">Nada en «' +
              escHTML(ETIQUETA_CHAT[chatsFiltroActual] || chatsFiltroActual) + '»</div>' +
            '<div style="font-size:13px;color:var(--ink3);margin-top:4px">Tenés ' + unicos.length +
              (unicos.length !== 1 ? ' conversaciones' : ' conversación') + ' en otros estados.</div>' +
            '<button onclick="filtrarChats(null,\'todos\')" style="margin-top:14px;background:var(--blue);color:white;border:none;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Ver todas</button>' +
          '</div>';
        return;
      }
      if (vacio) vacio.style.display = '';
      return;
    }
    if (vacio) vacio.style.display = 'none';

    const encabezado = (txt) => {
      const el = document.createElement('div');
      el.style.cssText = 'padding:10px 16px 6px;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.6px';
      // El texto anterior mostraba el valor crudo de la base
      // ("Filtrado por: terminado_por_vecino"). ETIQUETA_CHAT lo traduce.
      el.textContent = txt;
      return el;
    };

    const crearItem = (c) => {
      const item = document.createElement('div');
      item.className = 'chat-item';
      item.style.cursor = 'pointer';
      // Badge de estado
      const estadoBadge = {
        'consulta': '<span style="font-size:10px;background:#EEF2FF;color:#2B5BFF;border-radius:6px;padding:2px 6px;font-weight:700">Consulta</span>',
        'propuesta_enviada': '<span style="font-size:10px;background:#FFF7ED;color:#EA580C;border-radius:6px;padding:2px 6px;font-weight:700">Propuesta enviada</span>',
        'activo': '<span style="font-size:10px;background:#ECFDF5;color:#059669;border-radius:6px;padding:2px 6px;font-weight:700">En curso</span>',
        'terminado_prestador': '<span style="font-size:10px;background:#F0FDF4;color:#16A34A;border-radius:6px;padding:2px 6px;font-weight:700">⏳ Confirmar</span>',
        'terminado_por_vecino': '<span style="font-size:10px;background:#F0FDF4;color:#16A34A;border-radius:6px;padding:2px 6px;font-weight:700">⏳ Calificar</span>',
        'calificado': '<span style="font-size:10px;background:#F1F5F9;color:#64748B;border-radius:6px;padding:2px 6px;font-weight:700">✅ Completado</span>',
        'cancelado': '<span style="font-size:10px;background:#FFF1F2;color:#BE123C;border-radius:6px;padding:2px 6px;font-weight:700">❌ Cancelado</span>',
        'rechazada': '<span style="font-size:10px;background:#FFF1F2;color:#BE123C;border-radius:6px;padding:2px 6px;font-weight:700">😔 Rechazado</span>',
      }[c.estado] || '';
      // Una misma cuenta puede ser prestador en un chat y cliente en otro.
      // Sin esta marca, "Trabajos en curso" mezclaba los trabajos que te
      // dieron con los que vos contrataste, y no había forma de distinguir
      // unos de otros: dos filas idénticas con estados iguales.
      item.innerHTML = `
        <div class="ci-av-wrap">
          <div class="ci-av" style="background:#EEF2FF;color:#2B5BFF">${escHTML((c.contraparte_iniciales||c.prestador_iniciales||'??').slice(0,2).toUpperCase())}</div>
          ${['activo','consulta','propuesta_enviada'].includes(c.estado) ? '<div class="ci-online"></div>' : ''}
        </div>
        <div class="ci-body">
          <div class="ci-top">
            <div class="ci-name">${escHTML(c.contraparte_nombre||c.prestador_nombre||'Prestador')}</div>
            <div class="ci-time">${escHTML(c.hora_ultimo||'')}</div>
          </div>
          <div style="margin-bottom:3px">${estadoBadge}</div>
          <div class="ci-preview">${escHTML(c.ultimo_mensaje||'Sin mensajes aún')}</div>
        </div>`;
      item.addEventListener('click', async () => {
        const nameEl = document.getElementById('chat-name');
        const avEl = document.getElementById('chat-av');
        const tituloEl = document.getElementById('chat-service-titulo');
        const subEl = document.getElementById('chat-service-sub');
        if (nameEl) nameEl.textContent = c.contraparte_nombre || c.prestador_nombre || 'Prestador';
        if (avEl) { avEl.innerHTML = (c.contraparte_iniciales||c.prestador_iniciales||'??').slice(0,2).toUpperCase(); avEl.style.background='#EEF2FF'; avEl.style.color='#2B5BFF'; }
        if (tituloEl) tituloEl.textContent = c.pedido_titulo || 'Trabajo';
        if (subEl) subEl.textContent = c.rubro || '';
        chatActualId = c.id;
        chatOrigen = 's-chats';
        goTo('s-chat');
        document.getElementById('chat-body').innerHTML =
          '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
        // Mostrar link de denuncia directamente con vecino_id del chat de la lista
        const denLink = document.getElementById('chat-denuncia-link');
        if (denLink) denLink.style.display = (c.vecino_id === usuarioActual?.id) ? 'block' : 'none';
        await cargarMensajesChat();
        // Abrir el chat es haberlo visto. Esta llamada faltaba: la
        // suscripción de abajo sólo marca los mensajes que llegan CON el chat
        // ya abierto, así que los que estaban esperando quedaban sin leer
        // para siempre y el contador del tablero no bajaba nunca.
        // Los otros puntos que abren un chat (consulta y chat directo) lo
        // crean en el momento, así que no tienen nada pendiente que marcar.
        // `!== 0` y no `> 0`: si el caché no trae el dato (undefined) hay que
        // marcar igual. Saltear el UPDATE es una optimización, no una regla.
        if (c._noLeidos !== 0) {
          await PronetDB.marcarLeidos(c.id);
          c._noLeidos = 0;   // el caché tiene que reflejarlo por si se vuelve sin recargar
        }
        await actualizarBannersChat(chatActualId);
        if (chatSuscripcion) chatSuscripcion();
        chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
          if (payload.new && payload.new.chat_id === chatActualId) {
            const esPropio = payload.new.autor_id === usuarioActual.id;
            if (!esPropio) { agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id); PronetDB.marcarLeidos(chatActualId); }
          }
        });
      });
      return item;
    };

    // Una misma cuenta puede ser prestador en un chat y cliente en otro, y
    // mezclados eran indistinguibles: dos filas con el mismo estado "En
    // curso", una del trabajo que le dieron y otra del que él contrató.
    // Se separan en dos grupos con encabezado. Sólo tiene sentido en cuentas
    // que son las dos cosas: en una puramente vecina TODO es contratado y el
    // segundo encabezado sobra.
    const dual = !!usuarioActual?.prestador_id;
    const comoPrestador = dual ? filtrados.filter(c => c.soy_prestador !== false) : filtrados;
    const comoCliente   = dual ? filtrados.filter(c => c.soy_prestador === false) : [];

    // El segundo grupo describe la relación, no el estado: "Trabajos en
    // curso" ya lo dice el primero, y repetirlo no distinguiría nada.
    const LBL_CLIENTE = {
      consulta:          'Consultas que hiciste',
      propuesta_enviada: 'Propuestas que recibiste',
    }[chatsFiltroActual] || 'Trabajos contratados';

    if (comoPrestador.length) {
      // Con un solo grupo el encabezado sigue siendo el del filtro, como antes.
      lista.appendChild(encabezado(ETIQUETA_CHAT[chatsFiltroActual] || 'Conversaciones'));
      comoPrestador.forEach(c => lista.appendChild(crearItem(c)));
    }
    if (comoCliente.length) {
      lista.appendChild(encabezado(LBL_CLIENTE));
      comoCliente.forEach(c => lista.appendChild(crearItem(c)));
    }
  }

  function abrirResena() {
    const el = document.getElementById('s-resena');
    if (el) { el.classList.remove('hidden'); }
    // Resetear estrellas, tags y pantalla de éxito de una reseña anterior
    document.querySelectorAll('#stars-big .star-big').forEach(s => s.classList.remove('lit'));
    document.querySelectorAll('#tags-positivos .rev-tag, #rev-problemas .review-tag').forEach(t => t.classList.remove('on'));
    const suc = document.getElementById('rev-success'); if (suc) suc.classList.remove('show');
    const lbl = document.getElementById('rev-label'); if (lbl) lbl.textContent = '';
    // Poblar con el prestador del chat actual
    const p = prestadorActual;
    if (p) {
      const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      const avEl = document.getElementById('rev-av');
      if (avEl) { avEl.innerHTML = avatarInner(p); if (p.color_bg) avEl.style.background = p.color_bg; if (p.color_text) avEl.style.color = p.color_text; }
      set('rev-name', p.nombre || 'Prestador');
      set('rev-role', (p.rubro || '') + ' · ' + (p.zona || 'Escobar'));
      const tag = document.getElementById('rev-tag');
      if (tag) tag.textContent = (p.icono || '⚡') + ' ' + (p.rubro || 'Servicio') + ' · $' + (p.precio || 0).toLocaleString('es-AR');
      const fechaInput = document.getElementById('campo-15');
      if (fechaInput && !fechaInput.value) fechaInput.value = new Date().toISOString().split('T')[0];
      const ta = document.getElementById('rev-texto');
      if (ta) {
        ta.value = '';
        const primerNombre = (p.nombre || 'El prestador').split(' ')[0];
        ta.placeholder = 'Ej: ' + primerNombre + ' llegó a tiempo, resolvió el problema y dejó todo limpio. Súper recomendado.';
        const cc = document.getElementById('rev-char-count'); if (cc) cc.textContent = '0';
      }
      // Los datos del prestador quedan guardados para poder recalcular el
      // impacto cada vez que el vecino cambia la nota o el toggle.
      _resenaPrestador = { nombre: p.nombre, rating: p.rating, resenas: p.resenas, zona: p.zona, rubro: p.rubro };
      pintarImpactoResena();
    }
  }

  // Datos del prestador que se está calificando, para recalcular el impacto.
  let _resenaPrestador = null;

  /** El panel "Impacto de tu reseña".
   *
   *  Antes decía tres cosas y dos no eran ciertas:
   *   1. "mantiene su puntuación de X" — se pintaba ANTES de que el vecino
   *      eligiera la nota, así que le anticipaba un resultado que dependía de
   *      algo que todavía no había hecho. Si ponía 1 estrella, la puntuación
   *      no se mantenía: bajaba.
   *   2. "+1 punto extra al score zonal" — el score zonal NO EXISTE. Se buscó
   *      en todo el proyecto y aparecía sólo en ese texto. `recomendar` no
   *      participa de ningún ranking: la fórmula real es
   *      (rating*reseñas + 15) / (reseñas + 5), sólo nota y cantidad.
   *
   *  Ahora el promedio se proyecta de verdad con la nota elegida, y lo de la
   *  recomendación dice lo único que hace: aparecer en el perfil. */
  function pintarImpactoResena() {
    const imp = document.getElementById('rev-impacto');
    const p = _resenaPrestador;
    if (!imp || !p) return;
    const nombre = (p.nombre || 'El prestador').split(' ')[0];
    const resenas = p.resenas || 0;
    const rating  = p.rating || 0;
    const nota = typeof currentStars === 'number' ? currentStars : null;

    let linea1;
    if (!nota) {
      linea1 = '⭐ Hoy tiene <strong>' + rating.toFixed(1) + '</strong>'
             + (resenas ? ' con ' + resenas + (resenas === 1 ? ' reseña' : ' reseñas') : ', sin reseñas todavía');
    } else if (!resenas) {
      // Sin reseñas previas no hay de dónde subir ni bajar: el 5.0 que trae
      // la ficha es el valor por defecto de la columna, no reputación ganada
      // (el mismo malentendido que motivó el ranking bayesiano). Decir "baja
      // a 4.0" sugeriría que perdió algo que nunca tuvo.
      linea1 = '⭐ ' + escHTML(nombre) + ' arranca con <strong>' + nota.toFixed(1) + '</strong> — es su primera reseña';
    } else {
      // Promedio proyectado, el mismo cálculo que hace la base al acreditar.
      const nuevo = (rating * resenas + nota) / (resenas + 1);
      const sube = nuevo > rating + 0.049;
      const baja = nuevo < rating - 0.049;
      const flecha = sube ? '📈' : baja ? '📉' : '⭐';
      const verbo  = sube ? 'sube a' : baja ? 'baja a' : 'queda en';
      linea1 = flecha + ' ' + escHTML(nombre) + ' ' + verbo + ' <strong>' + nuevo.toFixed(1) + '</strong>'
             + ' (de ' + rating.toFixed(1) + ' con ' + resenas + (resenas === 1 ? ' reseña)' : ' reseñas)');
    }

    const recomienda = !!document.getElementById('chk-recomendar')?.checked;
    imp.innerHTML =
      '<div>' + linea1 + '</div>' +
      '<div>🏆 Cuenta para su posición en <strong>' + escHTML(p.zona || 'Escobar') + ' · ' + escHTML(p.rubro || 'Servicios') + '</strong></div>' +
      (recomienda
        ? '<div>👥 Va a figurar como <strong>Recomendado por vecinos</strong> en su perfil</div>'
        : '');
  }
  window.pintarImpactoResena = pintarImpactoResena;

  function cerrarResena() {
    const el = document.getElementById('s-resena');
    if (el) el.classList.add('hidden');
    const suc = document.getElementById('rev-success');
    if (suc) suc.classList.remove('show');
  }

  async function enviarResena() {
    // Validar que haya puntos seleccionados
    const puntosEl = document.querySelectorAll('#stars-big .star-big.lit');
    const puntos = puntosEl.length;
    if (!puntos) { showToast && showToast('⭐ Elegí al menos 1 estrella'); return; }
    const comentario = (document.getElementById('rev-texto')?.value || '').trim();
    // Tags seleccionados → agregar al comentario
    const tagsPos = [...document.querySelectorAll('#tags-positivos .rev-tag.on')].map(t => t.textContent.trim());
    const tagsNeg = [...document.querySelectorAll('#rev-problemas .review-tag.on')].map(t => t.textContent.trim());
    const textoFinal = [
      tagsPos.join(', '),
      tagsNeg.join(', '),
      comentario
    ].filter(Boolean).join(' · ').slice(0, 500);

    if (!chatActualId) {
      showToast && showToast('⚠️ No hay un trabajo activo para reseñar');
      return;
    }

    // Guardar en Supabase
    const recomendar = document.getElementById('chk-recomendar')?.checked ?? false;
    const btn = document.querySelector('#s-resena .rev-submit-btn, #s-resena button[onclick*="enviarResena"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    const res = await PronetDB.dejarResena(chatActualId, puntos, textoFinal, recomendar);
    if (btn) { btn.disabled = false; btn.textContent = 'Publicar mi reseña →'; }

    if (!res.ok) {
      showToast && showToast('⚠️ ' + (res.error || 'No se pudo enviar la reseña'));
      return;
    }

    // Actualizar el rating en el objeto local
    if (prestadorActual && res.rating_nuevo) {
      prestadorActual.rating = parseFloat(res.rating_nuevo.toFixed(1));
      prestadorActual.resenas = res.resenas;
    }

    // Mostrar pantalla de éxito
    const suc = document.getElementById('rev-success');
    if (suc) {
      suc.classList.add('show');
      const p = prestadorActual;
      if (p) {
        const primerNombre = (p.nombre || 'El prestador').split(' ')[0];
        const rk = document.getElementById('ri-ranking');
        if (rk) rk.innerHTML = escHTML(primerNombre) + ' se mantiene en <strong>' + escHTML(p.zona || 'Escobar') + '</strong> · ' + escHTML(p.rubro || 'Servicios');
        const pt = document.getElementById('ri-puntuacion');
        if (pt) pt.innerHTML = 'Nueva puntuación: <strong>' + (p.rating || 5).toFixed(1) + ' · ' + (p.resenas || 1) + ' reseñas</strong>';
      }
    }

    // Actualizar el banner del chat
    if (bannerResena) bannerResena.style.display = 'none';
    if (bannerCerrado) bannerCerrado.style.display = 'flex';
    if (footer) footer.style.display = 'none';

    // La CAMPANITA ya la escribe dejar_resena() en la base, junto con la
    // reseña. Antes se mandaba desde acá y estaba condicionada a que
    // `prestadorActual` existiera: si no —se llegaba a calificar después de
    // recargar, se navegaba distinto— la reseña se guardaba y el aviso se
    // perdía sin dejar rastro. En los datos: 7 reseñas, 1 aviso.
    //
    // Lo que SÍ queda acá es el push, que necesita la Edge Function y no se
    // puede disparar desde Postgres.
    if (prestadorActual) {
      const destinatarioId = await PronetDB.usuarioIdDePrestador(prestadorActual.id).catch(() => null);
      if (destinatarioId) {
        PronetDB.notificar({
          soloPush: true,          // la campanita ya la escribió dejar_resena
          destino: 'usuario',
          usuario_id: destinatarioId,
          tipo: 'resena',
          titulo: '⭐ Recibiste una reseña de ' + puntos + ' estrella' + (puntos > 1 ? 's' : ''),
          cuerpo: textoFinal.slice(0, PRONET_CONFIG.NOTIF_CUERPO_MAX) || 'Un vecino calificó tu trabajo',
          url: '#s-miperfil',
        }).catch(() => {});

        // Loyalty: los puntos por reseña (prestador +100, vecino +50, y el
        // bonus de primer trabajo +400) los acredita el trigger
        // trg_acreditar_por_resena en Supabase. No se acredita desde acá:
        // el cliente no puede escribir el saldo sin volverlo falsificable.

        // Detectar primer trabajo: si es el primero, +400 pts extra y push especial
        if (PronetDB.esRemoto()) {
          // Se cuenta sobre `resenas`, la misma fuente que usa el trigger
          // trg_acreditar_por_resena para dar los +400, así el aviso y los
          // puntos no pueden discrepar. `resenas` tiene unique(chat_id), así
          // que el conteo no se duplica.
          // Antes esto miraba chats_trabajo con head:true y leía data.length,
          // que siempre era null → esPrimero daba SIEMPRE true y el aviso de
          // "primer trabajo" salía en cada trabajo cerrado.
          const { count } = await window._sb
            .from('resenas')
            .select('id', { count: 'exact', head: true })
            .eq('prestador_id', prestadorActual.id);
          const esPrimero = (count ?? 0) === 1;
          if (esPrimero) {
            // Los +400 los acredita trg_acreditar_por_resena; acá solo se avisa.
            PronetDB.notificar({
              destino: 'usuario',
              usuario_id: destinatarioId,
              tipo: 'primer_trabajo',
              titulo: '🏆 Tu primer trabajo quedó registrado',
              cuerpo: 'Cerraste tu primer trabajo en PRONET. Ganaste 500 puntos y ya sos Bronce. El barrio te empieza a conocer.',
              url: '/#s-loyalty',
            }).catch(() => {});
            // Marcar para que el prestador vea el modal al abrir la app
            PronetDB.insertarNotificacion({
              usuario_id: destinatarioId,
              tipo: 'celebracion_primer_trabajo',
              titulo: 'primer_trabajo',
            }).catch(() => {});
          }
        }
      }
    }

    // Los +50 al vecino los acredita trg_acreditar_por_resena en Supabase.

    // Cerrar la pantalla de reseña después de 2 segundos
    setTimeout(() => cerrarResena(), 2000);
  }

  async function toggleDisp(cb) {
    const sub = document.getElementById('toggle-sub');
    const row = cb.closest('.toggle-row');
    const icon = row.querySelector('.toggle-icon');
    const activo = cb.checked;
    if (activo) {
      sub.textContent = 'Tu ubicación es visible en el mapa · Activo';
      icon.style.background = '#DCFCE7';
    } else {
      sub.textContent = 'No aparecés en el mapa de búsqueda · Inactivo';
      icon.style.background = '#F3F4F6';
    }
    // Persistir en la BD
    if (PronetDB.esRemoto() && usuarioActual?.prestador_id) {
      try {
        const cambios = { activo };
        // Al activarse, capturar GPS real para posicionar el pin en el mapa
        if (activo && navigator.geolocation) {
          showToast && showToast('📍 Obteniendo tu ubicación...');
          await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                cambios.lat = pos.coords.latitude;
                cambios.lng = pos.coords.longitude;
                resolve();
              },
              (err) => {
                const msgs = { 1: 'Permiso de ubicación denegado', 2: 'No se pudo obtener la ubicación', 3: 'Tiempo agotado al obtener ubicación' };
                showToast && showToast('⚠️ ' + (msgs[err.code] || 'Sin ubicación') + ' — aparecerás en la zona general');
                resolve();
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          });
        }
        await PronetDB.actualizar('prestadores', usuarioActual.prestador_id, cambios);
        const coordsTxt = cambios.lat ? ' · 📍 ubicación actualizada' : '';
        showToast && showToast(activo ? '✅ Ahora estás disponible' + coordsTxt : '⏸ Marcado como no disponible');
      } catch(e) {
        console.warn('[toggleDisp] error:', e.message);
        showToast && showToast('⚠️ No se pudo actualizar la disponibilidad');
        cb.checked = !activo;
      }
    }
  }

  function selectPin(id) {
    document.querySelectorAll('.sheet-card').forEach(c => c.classList.remove('selected'));
    const sc = document.getElementById('sc-' + id);
    if (sc) { sc.classList.add('selected'); sc.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
  }

  // ══ Chat real ═══════════════════════════════════════════════════════
  let chatActualId = null;
  let chatSuscripcion = null;
  let chatOrigen = 's-pedidos';
  let chatMercadoActualId = null;
  let chatMercadoSuscripcion = null;
  let chatMercadoContraparteId = null;
  let chatMercadoContraparteNombre = null;
  let chatMercadoContraparteTelefono = null;
  let chatMercadoOrigen = 's-mercado';

  function volverDesdeChat() {
    if (chatSuscripcion) { chatSuscripcion(); chatSuscripcion = null; }
    chatActualId = null;
    goTo(chatOrigen);
  }

  async function abrirChat(propuestaId, datos = {}) {
    if (!usuarioActual) { mostrarGate(ACCIONES_PROTEGIDAS.contactar); return; }
    chatOrigen = document.querySelector('.screen.active')?.id || 's-pedidos';
    const p = datos.prestador || prestadorActual;
    const ped = datos.pedido || pedidoActual;
    if (p) {
      const avEl = document.getElementById('chat-av');
      if (avEl) { avEl.innerHTML = avatarInner(p); avEl.style.background = p.color_bg || '#EEF2FF'; avEl.style.color = p.color_text || '#2B5BFF'; }
      const nameEl = document.getElementById('chat-name');
      if (nameEl) nameEl.textContent = p.nombre || 'Prestador';
      const statusEl = document.getElementById('chat-status');
      if (statusEl) statusEl.innerHTML = '<div class="disp-dot"></div>' + escHTML(p.zona || 'Escobar');
    }
    if (ped) {
      const iconEl = document.getElementById('chat-service-icon');
      if (iconEl) iconEl.textContent = ped.icono || '💬';
      const tituloEl = document.getElementById('chat-service-titulo');
      if (tituloEl) tituloEl.textContent = ped.titulo || 'Trabajo';
      const subEl = document.getElementById('chat-service-sub');
      if (subEl) subEl.textContent = (ped.rubro || '') + (p ? ' · $' + (p.precio || 0).toLocaleString('es-AR') + '/' + (p.precio_unidad || 'visita') : '');
    }
    goTo('s-chat');
    document.getElementById('chat-body').innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Abriendo chat...</div>';
    const res = await PronetDB.abrirChatPropuesta(propuestaId);
    if (!res.ok) {
      document.getElementById('chat-body').innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⚠️ ' + escHTML(res.error) + '</div>';
      return;
    }
    chatActualId = res.chat_id;
    await cargarMensajesChat();

    // Verificar estado del chat para mostrar el banner correcto
    const chatData = await PronetDB.obtenerChat(chatActualId).catch(() => null);
    // Actualizar header con datos reales de la contraparte si faltaban
    if (chatData) {
      const soyVecinoChat = chatData.vecino_id === usuarioActual.id;
      const nameEl2 = document.getElementById('chat-name');
      const avEl2 = document.getElementById('chat-av');
      const contraparteNombre = soyVecinoChat
        ? (chatData.prestadores?.nombre || chatData.prestador_nombre || 'Prestador')
        : (chatData.vecino_nombre || 'Vecino');
      if (nameEl2 && (nameEl2.textContent === 'Cargando...' || nameEl2.textContent === 'Prestador' || nameEl2.textContent === 'Vecino' || nameEl2.textContent === '?')) {
        nameEl2.textContent = contraparteNombre;
        if (avEl2) {
          const ini = contraparteNombre.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
          avEl2.innerHTML = ini || '?';
          avEl2.style.background = soyVecinoChat ? '#FEF3C7' : '#EEF2FF';
          avEl2.style.color = soyVecinoChat ? '#92400E' : '#2B5BFF';
        }
      }
    }
    await actualizarBannersChat(chatActualId);
    if (chatSuscripcion) chatSuscripcion();
    chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
      if (payload.new && payload.new.chat_id === chatActualId) {
        const esPropio = payload.new.autor_id === usuarioActual.id;
        // Si es propio ya lo mostramos por optimistic UI — no duplicar
        if (!esPropio) {
          agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id);
          PronetDB.marcarLeidos(chatActualId);
        }
      }
      // Mensajes de otros chats se manejan en la suscripción global de iniciarRealtime
    });
    PronetDB.marcarLeidos(chatActualId);
  }

  function openChat(id) {
    if (!usuarioActual) { mostrarGate(ACCIONES_PROTEGIDAS.contactar); return; }
    const p = prestadorActual;
    if (p) {
      const avEl = document.getElementById('chat-av');
      if (avEl) { avEl.innerHTML = avatarInner(p); avEl.style.background = p.color_bg || '#EEF2FF'; avEl.style.color = p.color_text || '#2B5BFF'; }
      const nameEl = document.getElementById('chat-name');
      if (nameEl) nameEl.textContent = p.nombre || 'Prestador';
      const subEl = document.getElementById('chat-service-sub');
      if (subEl) subEl.textContent = (p.rubro || '') + ' · $' + (p.precio || 0).toLocaleString('es-AR') + '/' + (p.precio_unidad || 'visita');
    }
    goTo('s-chat');
    // Buscar el chat existente con este prestador y cargarlo
    (async () => {
      if (!p?.id) return;
      const body = document.getElementById('chat-body');
      if (body) body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
      // Buscar chat activo/consulta con este prestador
      const chats = await PronetDB.listarChats().catch(() => []);
      const chatExistente = chats.find(c => c.prestador_id === p.id &&
        ['consulta','propuesta_enviada','activo','terminado_prestador','terminado_por_vecino'].includes(c.estado));
      if (chatExistente) {
        chatActualId = chatExistente.id;
        await cargarMensajesChat();
        await actualizarBannersChat(chatActualId);
        if (chatSuscripcion) chatSuscripcion();
        chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
          if (payload.new && payload.new.chat_id === chatActualId) {
            if (payload.new.autor_id !== usuarioActual.id) {
              agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id);
              PronetDB.marcarLeidos(chatActualId);
            }
          }
        });
        PronetDB.marcarLeidos(chatActualId);
      } else {
        // No hay chat — mostrar mensaje para que el vecino inicie contacto
        if (body) body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">👋 Escribile al prestador para consultar disponibilidad y precio.</div>';
        const footer = document.getElementById('chat-footer');
        if (footer) footer.style.display = '';
        const msgInput = document.getElementById('chat-msg');
        if (msgInput) msgInput.placeholder = 'Consultá disponibilidad, precio...';
      }
    })();
  }

  async function cargarMensajesChat() {
    if (!chatActualId) return;
    const body = document.getElementById('chat-body');
    const mensajes = await PronetDB.listarMensajes(chatActualId);
    body.innerHTML = '';
    if (!mensajes.length) {
      body.innerHTML = '<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">👋 ¡Primer mensaje! Contale lo que necesitás.</div>';
      return;
    }
    mensajes.forEach(m => {
      const esPropio = m.autor_id === usuarioActual.id;
      agregarBurbuja(m.texto, m.creado, esPropio, m.id);
    });
    body.scrollTop = body.scrollHeight;
  }

  function agregarBurbuja(texto, creado, esPropio, msgId) {
    const body = document.getElementById('chat-body');
    if (!body) return;
    // Deduplicar: si ya existe un elemento con este ID, no agregar de nuevo
    if (msgId && body.querySelector('[data-msg-id="' + msgId + '"]')) return;
    const placeholder = body.querySelector('div[style*="text-align:center"]');
    if (placeholder) placeholder.remove();
    const hora = new Date(creado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
    const div = document.createElement('div');
    div.className = 'msg ' + (esPropio ? 'out' : 'in');
    if (msgId) div.dataset.msgId = msgId;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = texto;
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time';
    timeEl.textContent = hora;
    div.appendChild(bubble);
    div.appendChild(timeEl);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  async function enviarMensajeChat() {
    const inp = document.getElementById('chat-msg');
    const txt = (inp.value || '').trim();
    if (!txt) return;

    // Si no hay chat todavía (vecino contactando desde el perfil por primera vez),
    // crear el chat de consulta antes de enviar el mensaje
    if (!chatActualId) {
      if (!prestadorActual?.id) { showToast && showToast('⚠️ No hay prestador seleccionado'); return; }
      inp.disabled = true;
      const res = await PronetDB.iniciarChatDirecto(prestadorActual.id).catch(() => null);
      inp.disabled = false;
      if (!res?.ok) { showToast && showToast('⚠️ No se pudo iniciar el chat: ' + (res?.error || '')); return; }
      chatActualId = res.chat_id;
      // Suscribirse al nuevo chat
      if (chatSuscripcion) chatSuscripcion();
      chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
        if (payload.new && payload.new.chat_id === chatActualId) {
          if (payload.new.autor_id !== usuarioActual.id) {
            agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id);
            PronetDB.marcarLeidos(chatActualId);
          }
        }
      });
      await actualizarBannersChat(chatActualId);
    }
    inp.value = '';
    agregarBurbuja(txt, new Date().toISOString(), true);
    const res = await PronetDB.enviarMensaje(chatActualId, txt);
    if (!res.ok) { showToast && showToast('⚠️ No se pudo enviar el mensaje'); return; }
    // Push al destinatario (si tiene suscripción activa)
    if (PronetDB.esRemoto()) {
      const chat = await PronetDB.obtener('chats_trabajo', chatActualId);
      if (chat) {
        // El destinatario es el otro participante
        const soyVecino = chat.vecino_id === usuarioActual.id;
        // Para el prestador necesitamos el usuario_id via perfiles
        let destinatarioId = null;
        if (soyVecino) {
          destinatarioId = await PronetDB.usuarioIdDePrestador(chat.prestador_id);
        } else {
          destinatarioId = chat.vecino_id;
        }
        // Solo notificar si el chat está en un estado activo de conversación
        const estadosSinNotif = ['terminado_prestador','terminado_por_vecino','calificado','cancelado','rechazada'];
        if (destinatarioId && !estadosSinNotif.includes(chat.estado)) {
          PronetDB.notificar({
            destino: 'usuario',
            usuario_id: destinatarioId,
            tipo: 'mensaje',
            titulo: '💬 Nuevo mensaje de ' + escHTML(usuarioActual.nombre || 'un usuario'),
            cuerpo: txt.slice(0, PRONET_CONFIG.NOTIF_CUERPO_MAX),
            url: '/#s-chats',
          }).catch(() => {});
        }
      }
    }
  }

  function sendMsg() { enviarMensajeChat(); }



  // ── Punto 3: accesibilidad de teclado ────────────────────────────────
  // El prototipo tiene ~330 <div>/<span> clickeables que no eran operables
  // sin mouse. Este helper les da semántica de botón y foco, y un listener
  // delegado dispara el click con Enter o Espacio. Los elementos nativos
  // (<button>, <a>, <input>...) ya lo traen y se saltean.
  function habilitarAccesibilidadTeclado(root) {
    (root || document).querySelectorAll('[onclick]').forEach(el => {
      const tag = el.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') return;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (el && el.getAttribute && el.getAttribute('role') === 'button' && el.hasAttribute('onclick')) {
      e.preventDefault(); // evitar scroll con Espacio
      el.click();
    }
  });

  // ══ PROPUESTAS · Pasos 2-4 ══════════════════════════════════════════
  let plazoNP=null, propuestaMia=null;
  let adjuntoPropuesta=null; // { file, url, tipo, nombre }

  function onAdjuntoPropuestaSelected(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > PRONET_CONFIG.ADJUNTO_MAX_MB * 1024 * 1024) { showToast && showToast('⚠️ El archivo supera los ' + PRONET_CONFIG.ADJUNTO_MAX_MB + ' MB'); input.value=''; return; }
    adjuntoPropuesta = { file, tipo: file.type.includes('pdf') ? 'pdf' : 'imagen', nombre: file.name };
    const preview = document.getElementById('np-adjunto-preview');
    const icono = document.getElementById('np-adjunto-icono');
    const nombre = document.getElementById('np-adjunto-nombre');
    const btn = document.getElementById('np-adjunto-btn');
    if (preview) preview.style.display = 'flex';
    if (btn) btn.style.display = 'none';
    if (icono) icono.textContent = adjuntoPropuesta.tipo === 'pdf' ? '📄' : '🖼️';
    if (nombre) nombre.textContent = file.name;
  }

  function quitarAdjuntoPropuesta() {
    adjuntoPropuesta = null;
    const input = document.getElementById('np-adjunto-input');
    const preview = document.getElementById('np-adjunto-preview');
    const btn = document.getElementById('np-adjunto-btn');
    if (input) input.value = '';
    if (preview) preview.style.display = 'none';
    if (btn) btn.style.display = 'flex';
  }

  async function marcarSiYaOferte(pedido) {
    const btn=document.querySelector('#pd-cta-prestador .btn-p'),sub=document.getElementById('pd-cta-sub');
    if(!btn) return;
    try {
      const mias=await PronetDB.listar('propuestas');
      const mia=mias.find(pr=>pr.pedido_id===pedido.id&&pr.prestador_id===usuarioActual.prestador_id);
      propuestaMia=mia||null;
      if(mia&&mia.estado==='pendiente'){btn.textContent='✏️ Editar mi propuesta';if(sub)sub.textContent='Ya ofertaste $'+(mia.precio||0).toLocaleString('es-AR')+' — podés modificarla';btn.dataset.propuestaId=mia.id;}
      else if(mia&&mia.estado==='retirada'){btn.textContent='📤 Volver a ofertar';if(sub)sub.textContent='Retiraste tu propuesta anterior';btn.dataset.propuestaId=mia.id;}
      else{btn.textContent='📤 Enviar propuesta';if(sub)sub.textContent='Tu propuesta le llega directo al vecino';delete btn.dataset.propuestaId;}
    } catch(e){}
  }

  // Carga el precio referencial del catálogo para un rubro dado
  // y lo muestra en el bloque ref-inline del formulario de propuesta.
  // Tap sobre el precio (no un botón aparte) despliega el alcance — mismo
  // patrón que refPronetCardHTML() en el detalle de pedido.
  async function cargarRefPrecio(rubro) {
    const refEl      = document.getElementById('np-ref-inline');
    const refNota    = document.getElementById('np-ref-nota');
    const detalleBox = document.getElementById('np-ref-detalle-box');
    if (!refEl) return;
    const ocultarTodo = () => {
      refEl.style.display = 'none';
      refEl.onclick = null;
      refEl.style.cursor = '';
      if (refNota) refNota.style.display = 'none';
      if (detalleBox) { detalleBox.style.display = 'none'; detalleBox.innerHTML = ''; }
    };
    if (!FEATURES.catalogoPrecios) { ocultarTodo(); return; }
    try {
      const ficha = await PronetDB.obtenerFichaPorRubro(rubro);
      if (!ficha?.precio_ref_min) { ocultarTodo(); return; }
      const minTotal = ficha.precio_ref_min;
      const maxTotal = ficha.precio_ref_max || ficha.precio_ref_min;
      const unidad   = ficha.precio_unidad || 'visita';
      if (typeof configurarLimitesSlider === 'function') {
        configurarLimitesSlider(minTotal, maxTotal, rubro);
      }
      // Tooltip de alcance: qué incluye/no incluye, para poder comparar precios entre propuestas.
      const incluye = Array.isArray(ficha.incluye) ? ficha.incluye : [];
      const noIncluye = Array.isArray(ficha.no_incluye) ? ficha.no_incluye : [];
      const tieneDetalle = incluye.length || noIncluye.length;
      refEl.textContent = '💡 Precio ref. PRONET para ' + rubro + ': $'
        + minTotal.toLocaleString('es-AR') + '–$'
        + maxTotal.toLocaleString('es-AR') + ' / ' + unidad + (tieneDetalle ? ' ⓘ' : '');
      refEl.style.display = '';
      if (refNota) {
        refNota.textContent = '⚠️ Referencial basado en precios habituales del rubro. Puede variar según complejidad.';
        refNota.style.display = '';
      }
      if (detalleBox) {
        if (tieneDetalle) {
          let html = '';
          if (incluye.length) html += '<div style="font-weight:600;color:var(--ink);margin-bottom:2px">✅ Incluye</div>' + incluye.map(i => '<div>• ' + escHTML(i) + '</div>').join('');
          if (noIncluye.length) html += '<div style="font-weight:600;color:var(--ink);margin:6px 0 2px">❌ No incluye</div>' + noIncluye.map(i => '<div>• ' + escHTML(i) + '</div>').join('');
          detalleBox.innerHTML = html;
          detalleBox.style.display = 'none';
          refEl.style.cursor = 'pointer';
          refEl.onclick = () => { detalleBox.style.display = detalleBox.style.display === 'none' ? '' : 'none'; };
        } else {
          detalleBox.style.display = 'none';
          detalleBox.innerHTML = '';
          refEl.onclick = null;
          refEl.style.cursor = '';
        }
      }
    } catch(e) {
      ocultarTodo();
    }
  }

  async function abrirNuevaPropuesta() {
    let p=pedidoActual; if(!p) return;
    // Si el pedido llegó incompleto (ej: payload parcial de Realtime),
    // traer solo ese registro de la base — no toda la tabla.
    if(!p.titulo || !p.rubro) {
      try {
        const completo = await PronetDB.obtener('pedidos', p.id);
        if(completo) { pedidoActual = completo; p = completo; }
      } catch(e) {}
    }
    // Editar una propuesta existente no consume cupo; sólo las nuevas.
    const editando=propuestaMia&&(propuestaMia.estado==='pendiente'||propuestaMia.estado==='retirada');
    if(!editando){
      // El chequeo de cupo es async y sin feedback se sentía como que el
      // toque no había registrado — deshabilitar mientras se resuelve.
      const btnProponer = document.getElementById('pd-btn-proponer');
      const btnTextoOriginal = btnProponer ? btnProponer.textContent : '';
      if (btnProponer) { btnProponer.disabled = true; btnProponer.textContent = '⏳ Verificando...'; }
      const cupo = await puedeEnviarPropuesta();
      if(!cupo.ok){
        if (btnProponer) { btnProponer.disabled = false; btnProponer.textContent = btnTextoOriginal; }
        avisarLimitePlan('Ya enviaste tus ' + cupo.limite + ' propuestas de este mes');
        return;
      }
      if (btnProponer) { btnProponer.disabled = false; btnProponer.textContent = btnTextoOriginal; }
    }
    const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
    set('np-icono', p.icono || '📋');
    set('nprop-titulo', p.titulo || 'Pedido');
    // Cargar referencial con el rubro del pedido
    if(p.rubro) cargarRefPrecio(p.rubro);
    let presupuesto='A convenir';
    if(p.presupuesto_min&&p.presupuesto_max) presupuesto='$'+p.presupuesto_min.toLocaleString('es-AR')+'–$'+p.presupuesto_max.toLocaleString('es-AR');
    const urgMap={hoy:'Hoy — urgente',semana:'Esta semana',flexible:'Flexible'};
    set('np-meta','📍 '+(p.zona||'Escobar')+' · '+presupuesto+' · '+(urgMap[p.urgencia]||'Flexible'));
    const refEl=document.getElementById('np-presupuesto-ref');
    if(refEl){const tiene=!!(p.presupuesto_min||p.presupuesto_max);refEl.textContent=tiene?'Presupuesto estimado del cliente: '+presupuesto:'';refEl.style.display=tiene?'':'none';}
    const precio=document.getElementById('np-precio'),mensaje=document.getElementById('np-mensaje');
    document.querySelectorAll('#s-nueva-propuesta .form-opt').forEach(o=>o.classList.remove('on'));
    if(editando){
      if(precio) precio.value=(propuestaMia.precio||0).toLocaleString('es-AR');
      if(mensaje) mensaje.value=propuestaMia.mensaje||'';
      plazoNP=propuestaMia.plazo||null;
      const opt=document.querySelector('#s-nueva-propuesta .form-opt[data-plazo="'+plazoNP+'"]');
      if(opt) opt.classList.add('on');
    } else { if(precio)precio.value='';if(mensaje)mensaje.value='';plazoNP=null;quitarAdjuntoPropuesta(); }
    const btnEnv=document.getElementById('np-enviar');
    if(btnEnv) btnEnv.textContent=editando?'💾 Actualizar propuesta':'📤 Enviar propuesta';
    goTo('s-nueva-propuesta');
    return true;
  }

  function selPlazoNP(el){document.querySelectorAll('#s-nueva-propuesta [data-plazo]').forEach(o=>o.classList.remove('on'));el.classList.add('on');plazoNP=el.dataset.plazo;}

  // ══ Modalidad de precio (fijo | rango | convenir) ═══════════════════
  let npModalPrecio = 'fijo';
  let npRefMin = 3000;
  let npRefMax = 50000;

  function selModalPrecio(el) {
    document.querySelectorAll('.np-modal-precio').forEach(o => o.classList.remove('on'));
    el.classList.add('on');
    npModalPrecio = el.dataset.modal;
    // Mostrar/ocultar los tres bloques
    document.getElementById('np-precio-fijo-wrap').style.display = npModalPrecio === 'fijo' ? '' : 'none';
    document.getElementById('np-precio-rango-wrap').style.display = npModalPrecio === 'rango' ? 'block' : 'none';
    document.getElementById('np-precio-convenir-wrap').style.display = npModalPrecio === 'convenir' ? 'block' : 'none';
    if (npModalPrecio === 'rango') sincronizarSliderConInputs();
  }

  // Límites de slider por rubro (min_abs, max_abs, paso de escala)
  const SLIDER_RANGOS = PRONET_CONFIG.SLIDER_RANGOS;
  // Rubros con ficha activa real en catalogo_servicios (no el fallback de config.js).
  // Solo estos muestran "Ref. PRONET" — evita marketear un precio que nadie cargó.
  let RUBROS_CON_CATALOGO = new Set();
  let npRubroActual = '_default';

  // Calcula los límites del slider según el rubro y el referencial del catálogo
  function configurarLimitesSlider(refMin, refMax, rubro) {
    const base = SLIDER_RANGOS[rubro] || SLIDER_RANGOS['_default'];
    // Usar el mayor entre el base y 2x el referencial
    npRefMin = Math.min(base.min, refMin || base.min);
    npRefMax = Math.max(base.max, (refMax || base.max) * 2);
    npRubroActual = rubro || '_default';
    actualizarEtiquetasSlider();
  }

  function actualizarEtiquetasSlider() {
    const lblMin = document.getElementById('np-slider-lbl-min');
    const lblMax = document.getElementById('np-slider-lbl-max');
    if (lblMin) lblMin.textContent = '$' + npRefMin.toLocaleString('es-AR');
    if (lblMax) lblMax.textContent = '$' + npRefMax.toLocaleString('es-AR');
  }

  // Re-escalar el slider si el usuario escribe un monto fuera del rango actual
  function reescalarSiNecesario(monto) {
    let cambio = false;
    if (monto > 0 && monto < npRefMin) {
      npRefMin = Math.floor(monto * 0.8 / 1000) * 1000;
      cambio = true;
    }
    if (monto > npRefMax) {
      npRefMax = Math.ceil(monto * 1.4 / 10000) * 10000;
      cambio = true;
    }
    if (cambio) actualizarEtiquetasSlider();
  }

  // Convertir posición del slider (0-100) a monto
  function posAMonto(pos) {
    const raw = npRefMin + (pos / 100) * (npRefMax - npRefMin);
    return Math.round(raw / 1000) * 1000;
  }
  // Convertir monto a posición del slider (0-100)
  function montoAPos(monto) {
    if (npRefMax === npRefMin) return 0;
    return Math.max(0, Math.min(100, ((monto - npRefMin) / (npRefMax - npRefMin)) * 100));
  }

  // Cuando el usuario mueve un handle del slider
  function npRangoDesdeSlider() {
    const sliderMin = document.getElementById('np-slider-min');
    const sliderMax = document.getElementById('np-slider-max');
    let vMin = parseInt(sliderMin.value);
    let vMax = parseInt(sliderMax.value);
    // Evitar que se crucen (mínimo 3% de separación)
    if (vMin > vMax - 3) {
      if (document.activeElement === sliderMin) { vMin = vMax - 3; sliderMin.value = vMin; }
      else { vMax = vMin + 3; sliderMax.value = vMax; }
    }
    const montoMin = posAMonto(vMin);
    const montoMax = posAMonto(vMax);
    // Actualizar inputs
    document.getElementById('np-precio-min').value = montoMin.toLocaleString('es-AR');
    document.getElementById('np-precio-max').value = montoMax.toLocaleString('es-AR');
    actualizarVisualSlider(vMin, vMax, montoMin, montoMax);
  }

  // Cuando el usuario escribe en un input — con re-escalado automático
  function npRangoDesdeInput(cual, inp) {
    npFormatearPrecio(inp);
    const monto = parseInt((inp.value || '').replace(/\D/g, ''), 10) || 0;
    // Re-escalar el slider si el monto está fuera del rango actual
    reescalarSiNecesario(monto);
    const pos = montoAPos(monto);
    if (cual === 'min') {
      document.getElementById('np-slider-min').value = pos;
    } else {
      document.getElementById('np-slider-max').value = pos;
    }
    sincronizarSliderConInputs();
  }

  function sincronizarSliderConInputs() {
    const vMin = parseInt(document.getElementById('np-slider-min').value);
    const vMax = parseInt(document.getElementById('np-slider-max').value);
    const montoMin = posAMonto(vMin);
    const montoMax = posAMonto(vMax);
    // Poblar inputs si están vacíos
    const inpMin = document.getElementById('np-precio-min');
    const inpMax = document.getElementById('np-precio-max');
    if (!inpMin.value) inpMin.value = montoMin.toLocaleString('es-AR');
    if (!inpMax.value) inpMax.value = montoMax.toLocaleString('es-AR');
    actualizarVisualSlider(vMin, vMax, montoMin, montoMax);
  }

  function actualizarVisualSlider(vMin, vMax, montoMin, montoMax) {
    const wrapEl = document.getElementById('np-slider-wrap');
    if (!wrapEl) return;
    const anchoWrap = wrapEl.offsetWidth - 24;

    // Barra activa entre los dos handles
    const range = document.getElementById('np-slider-range');
    if (range) {
      range.style.left = (12 + (vMin / 100) * anchoWrap) + 'px';
      range.style.width = (((vMax - vMin) / 100) * anchoWrap) + 'px';
    }

    // Banda referencial (zona verde azulada del catálogo) — solo con ficha activa real
    const band = document.getElementById('np-slider-ref-band');
    const bandaVisible = band && npRefMax > npRefMin
      && FEATURES.catalogoPrecios && RUBROS_CON_CATALOGO.has(npRubroActual);
    if (bandaVisible) {
      const base = SLIDER_RANGOS[npRubroActual] || SLIDER_RANGOS['_default'];
      const refPosMin = ((base.min - npRefMin) / (npRefMax - npRefMin)) * 100;
      const refPosMax = ((base.max - npRefMin) / (npRefMax - npRefMin)) * 100;
      band.style.left = (12 + (Math.max(0,refPosMin) / 100) * anchoWrap) + 'px';
      band.style.width = (((Math.min(100,refPosMax) - Math.max(0,refPosMin)) / 100) * anchoWrap) + 'px';
      band.style.display = '';
      band.title = 'Zona habitual: $' + base.min.toLocaleString('es-AR') + '–$' + base.max.toLocaleString('es-AR');
    } else if (band) {
      band.style.display = 'none';
    }

    // Tooltips
    const tipMin = document.getElementById('np-tooltip-min');
    const tipMax = document.getElementById('np-tooltip-max');
    if (tipMin) { tipMin.style.left = 'calc(12px + ' + vMin + '% * (100% - 24px) / 100)'; tipMin.textContent = '$' + montoMin.toLocaleString('es-AR'); }
    if (tipMax) { tipMax.style.left = 'calc(12px + ' + vMax + '% * (100% - 24px) / 100)'; tipMax.textContent = '$' + montoMax.toLocaleString('es-AR'); }

    // Preview
    const preview = document.getElementById('np-rango-preview-txt');
    if (preview) preview.textContent = 'Entre $' + montoMin.toLocaleString('es-AR') + ' y $' + montoMax.toLocaleString('es-AR');
  }

  // Mostrar tooltip mientras se arrastra
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.getElementById('np-slider-wrap');
    if (!wrap) return;
    ['np-slider-min', 'np-slider-max'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = () => wrap.classList.add('dragging');
      const off = () => setTimeout(() => wrap.classList.remove('dragging'), 400);
      el.addEventListener('mousedown', on);
      el.addEventListener('touchstart', on, { passive: true });
      el.addEventListener('mouseup', off);
      el.addEventListener('touchend', off);
      el.addEventListener('mouseleave', off);
    });
  });

  function npFormatearPrecio(inp){const n=parseInt(inp.value.replace(/\D/g,''),10);inp.value=isNaN(n)?'':n.toLocaleString('es-AR');}

  async function enviarPropuesta() {
    const btn=document.getElementById('np-enviar');
    // Leer precio según la modalidad seleccionada
    let precio = 0, precio_min = null, precio_max = null;
    const modalidad = npModalPrecio || 'fijo';
    if (modalidad === 'fijo') {
      precio = parseInt((document.getElementById('np-precio')?.value||'').replace(/\D/g,''),10);
      if(!precio || precio<=0){showToast && showToast('⚠️ Ingresá tu precio para este trabajo.');return;}
    } else if (modalidad === 'rango') {
      precio_min = parseInt((document.getElementById('np-precio-min')?.value||'').replace(/\D/g,''),10);
      precio_max = parseInt((document.getElementById('np-precio-max')?.value||'').replace(/\D/g,''),10);
      if(!precio_min || !precio_max || precio_min<=0 || precio_max<=0){showToast && showToast('⚠️ Completá el rango de precios.');return;}
      if(precio_min >= precio_max){showToast && showToast('⚠️ El precio mínimo debe ser menor al máximo.');return;}
      precio = precio_min; // el "precio base" es el mínimo, para compatibilidad con orden y filtros
    } else if (modalidad === 'convenir') {
      precio = null;
    }
    const mensaje=(document.getElementById('np-mensaje')?.value||'').trim();
    if(!plazoNP){showToast && showToast('⚠️ Elegí tu disponibilidad para este trabajo.');return;}
    // Subir adjunto si hay uno seleccionado
    let adjuntoData = { adjunto_url: null, adjunto_tipo: null, adjunto_nombre: null };
    if (adjuntoPropuesta?.file) {
      showToast && showToast('⏳ Subiendo adjunto...');
      const res = await PronetDB.subirAdjuntoPropuesta(adjuntoPropuesta.file).catch(() => null);
      if (res) { adjuntoData = { adjunto_url: res.url, adjunto_tipo: res.tipo, adjunto_nombre: res.nombre }; }
      else { showToast && showToast('⚠️ No se pudo subir el adjunto, pero la propuesta se enviará igual.'); }
    }
    if(!usuarioActual||!usuarioActual.prestador_id){showToast && showToast('⚠️ Tu perfil de prestador no está completo todavía.');return;}
    if(btn){btn.disabled=true;btn.textContent='⏳ Enviando...';}
    try {
      // Salvaguarda: si propuestaMia quedó apuntando a otro pedido, ignorarla
      const propuestaValida = (propuestaMia && propuestaMia.pedido_id === pedidoActual.id) ? propuestaMia : null;
      const idExistente = propuestaValida ? propuestaValida.id : null;
      const datos = { precio, plazo:plazoNP, mensaje, modalidad_precio: modalidad, precio_min, precio_max, ...adjuntoData };
      let propuestaId = idExistente;
      if(idExistente){await PronetDB.actualizar('propuestas',idExistente,{...datos, estado:'pendiente'});}
      else{
        const nueva = await PronetDB.crear('propuestas',{pedido_id:pedidoActual.id,prestador_id:usuarioActual.prestador_id,...datos});
        propuestaId = nueva?.id || null;
      }
      // Si venimos desde un chat de consulta, transicionar el chat a 'propuesta_enviada'
      if (window._chatOrigenPropuesta && propuestaId) {
        const upd = await PronetDB.actualizar('chats_trabajo', window._chatOrigenPropuesta, {
          propuesta_id: propuestaId,
          estado: 'propuesta_enviada',
          ultimo_evento_at: new Date().toISOString(),
        }).catch((e) => { console.warn('[enviarPropuesta] update chat', e); return null; });
        window._chatOrigenPropuesta = null;
      }
      // Texto legible del precio para la notificación
      const precioTxt = modalidad === 'fijo' ? '$'+precio.toLocaleString('es-AR')
                     : modalidad === 'rango' ? '$'+precio_min.toLocaleString('es-AR')+'–$'+precio_max.toLocaleString('es-AR')
                     : 'A convenir';
      // Push al dueño del pedido (no bloquea si falla)
      if(pedidoActual.usuario_id && PronetDB.esRemoto()){
        PronetDB.notificar({
          destino:'usuario',
          usuario_id: pedidoActual.usuario_id,
          tipo: 'propuesta',
          titulo: idExistente ? '✏️ Propuesta actualizada' : '📨 ¡Nueva propuesta!',
          cuerpo: (usuarioActual.nombre||'Un prestador')+' ofertó '+precioTxt+' en "'+(pedidoActual.titulo||'tu pedido')+'"',
          url: '/#s-pedidos',
        }).catch(()=>{});
      }
      showToast && showToast(idExistente?'✅ Propuesta actualizada.':'✅ ¡Propuesta enviada! Te avisamos cuando el vecino la vea.');
      // Construir objeto propuesta actualizado para poblar la pantalla de estado
      const propObj = { id: propuestaId, pedido_id: pedidoActual.id, precio, precio_min, precio_max, modalidad_precio: modalidad, plazo: plazoNP, creado: propuestaValida?.creado || new Date().toISOString() };
      goTo('s-estado-propuesta');
      const epEl=document.getElementById('s-estado-propuesta');if(epEl)epEl.scrollTop=0;
      cargarEstadoPropuesta(pedidoActual, propObj);
    } catch(e) {
      const msg=(e&&e.message)||'';
      if(msg.includes('limite_propuestas')) avisarLimitePlan('Alcanzaste tu límite de propuestas de este mes');
      else if(msg.includes('duplicate')||msg.includes('23505')) showToast && showToast('⚠️ Ya tenés una propuesta en este pedido.');
      else if(msg.includes('row-level security')||msg.includes('policy')) showToast && showToast('⚠️ Este pedido ya no acepta propuestas.');
      else showToast && showToast('⚠️ No se pudo enviar la propuesta. Revisá tu conexión.');
    } finally { if(btn){btn.disabled=false;btn.textContent='📤 Enviar propuesta';} }
  }

  // ══ PROPUESTAS · Paso 3+4: comparación y elección ═══════════════════
  const PLAZO_LBL={urgente:'⚡ Urgente',semana:'🗓 Esta semana',coordinar:'📞 A coordinar'};

  // ══ ESTADO PROPUESTA · Carga dinámica de la pantalla ══════════════════
  async function cargarEstadoPropuesta(pedido, propuesta) {
    if (!pedido || !propuesta) return;

    const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const PLAZO_MAP = { urgente: 'Hoy mismo', semana: 'Esta semana', coordinar: 'A coordinar' };
    const MOD_MAP   = { fijo: 'fijo', rango: 'rango', convenir: 'a convenir' };

    // — Precio legible —
    let precioTxt = '—';
    const mod = propuesta.modalidad_precio || 'fijo';
    if (mod === 'rango' && propuesta.precio_min && propuesta.precio_max) {
      precioTxt = '$' + propuesta.precio_min.toLocaleString('es-AR') + '–$' + propuesta.precio_max.toLocaleString('es-AR') + ' rango';
    } else if (mod === 'convenir') {
      precioTxt = 'A convenir';
    } else if (propuesta.precio) {
      precioTxt = '$' + propuesta.precio.toLocaleString('es-AR') + ' ' + (MOD_MAP[mod] || '');
    }

    // — Ref PRONET desde catálogo — solo si el rubro tiene ficha activa real —
    let refTxt = null;
    try {
      const tieneCatalogo = FEATURES.catalogoPrecios && pedido.rubro && RUBROS_CON_CATALOGO.has(pedido.rubro);
      const rango = tieneCatalogo ? SLIDER_RANGOS[pedido.rubro] : null;
      if (rango) refTxt = '$' + rango.min.toLocaleString('es-AR') + '–$' + rango.max.toLocaleString('es-AR');
    } catch (e) {}

    // — Tiempo relativo —
    const tiempoRelativo = (iso) => {
      if (!iso) return '—';
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (diff < 1)   return 'Hace un momento';
      if (diff < 60)  return 'Hace ' + diff + ' min';
      const hs = Math.floor(diff / 60);
      if (hs < 24)    return 'Hace ' + hs + 'h ' + (diff % 60) + 'min';
      return 'Hace ' + Math.floor(hs / 24) + ' día' + (Math.floor(hs / 24) > 1 ? 's' : '');
    };

    // — Consultar chats_trabajo para estado real —
    let chatEstado = propuesta.estado || 'pendiente';
    let chatId = null;
    try {
      if (PronetDB.esRemoto() && propuesta.id) {
        const chats = await PronetDB.listarMisChats();
        const miChat = chats.find(c => c.propuesta_id === propuesta.id);
        if (miChat) { chatEstado = miChat.estado; chatId = miChat.id; }
      }
    } catch (e) { console.warn('[EP] error buscando chat:', e); }

    // — Hero según estado real —
    const ESTADOS = {
      pendiente:            { icon: '⏳', title: 'Propuesta enviada — esperando respuesta',  sub: 'El cliente está evaluando las propuestas recibidas. Te notificamos cuando decida.', bg: '#2B5BFF' },
      propuesta_enviada:    { icon: '⏳', title: 'Propuesta enviada — esperando respuesta',  sub: 'El cliente está evaluando las propuestas recibidas. Te notificamos cuando decida.', bg: '#2B5BFF' },
      consulta:             { icon: '💬', title: 'En consulta con el cliente',                sub: 'Estás en conversación con el vecino antes de enviar tu propuesta.', bg: '#2B5BFF' },
      activo:               { icon: '🟢', title: '¡Te eligieron! Trabajo en curso',           sub: 'El vecino aceptó tu propuesta. Coordiná el servicio por el chat.', bg: '#16A34A' },
      terminado_prestador:  { icon: '✅', title: 'Marcaste el trabajo como terminado',        sub: 'Esperando que el vecino confirme el cierre y te califique.', bg: '#16A34A' },
      terminado_por_vecino: { icon: '🏁', title: 'El vecino cerró el trabajo',               sub: 'El vecino tomó el cierre. Esperando calificación.', bg: '#16A34A' },
      calificado:           { icon: '⭐', title: 'Trabajo completado y calificado',           sub: 'El trabajo fue cerrado y calificado exitosamente.', bg: '#CA8A04' },
      cancelado:            { icon: '❌', title: 'Trabajo cancelado',                         sub: 'Este trabajo fue cancelado.', bg: '#DC2626' },
      rechazada:            { icon: '😔', title: 'El vecino eligió otra propuesta',           sub: 'No fuiste elegido esta vez. Seguí ofertando para mejorar tu ranking.', bg: '#6B7280' },
      retirada:             { icon: '↩️', title: 'Retiraste tu propuesta',                   sub: 'Retiraste tu oferta de este pedido.', bg: '#6B7280' },
      elegida:              { icon: '🟢', title: '¡Te eligieron! Trabajo en curso',           sub: 'El vecino aceptó tu propuesta. Coordiná el servicio por el chat.', bg: '#16A34A' },
    };
    const cfg = ESTADOS[chatEstado] || ESTADOS['pendiente'];
    const heroEl = document.getElementById('ep-hero');
    if (heroEl) heroEl.style.background = 'linear-gradient(135deg, ' + cfg.bg + ' 0%, ' + cfg.bg + 'BB 100%)';
    set('ep-icon', cfg.icon);
    set('ep-title', cfg.title);
    set('ep-sub', cfg.sub);

    // — Botón chat: mostrar/ocultar según estado —
    const chatWrap = document.getElementById('ep-chat-wrap');
    const btnChat  = document.getElementById('ep-btn-chat');
    const mostrarChat = ['activo','terminado_prestador','terminado_por_vecino','calificado','elegida'].includes(chatEstado);
    if (chatWrap) chatWrap.style.display = mostrarChat ? 'block' : 'none';
    // Guardar chatId en el botón para epAbrirChat()
    if (btnChat) { btnChat.dataset.chatId = chatId || ''; btnChat.dataset.propuestaId = propuesta.id || ''; }

    // — Tiempo de respuesta (pedido → propuesta) —
    let velozTxt = '';
    if (pedido.creado && propuesta.creado) {
      const mins = Math.floor((new Date(propuesta.creado) - new Date(pedido.creado)) / 60000);
      if (mins < 60) velozTxt = ' · Respondiste en ' + mins + ' min → Veloz ⚡';
    }

    // — Cantidad de propuestas del pedido —
    let nProps = 0;
    try {
      const todas = await PronetDB.listar('propuestas');
      nProps = todas.filter(p => p.pedido_id === pedido.id && p.estado !== 'retirada').length;
    } catch (e) {}

    // — Expira en —
    let expiraTxt = '';
    if (pedido.expira_en || pedido.creado) {
      const base = pedido.expira_en ? new Date(pedido.expira_en) : new Date(new Date(pedido.creado).getTime() + PRONET_CONFIG.PROPUESTA_EXPIRACION_HS * 3600000);
      const horas = Math.max(0, Math.floor((base - Date.now()) / 3600000));
      if (horas > 0) expiraTxt = ' · Expira en ' + horas + 'hs';
    }

    // — Presupuesto del pedido —
    let presupTxt = 'A convenir';
    if (pedido.presupuesto_min && pedido.presupuesto_max) {
      presupTxt = '$' + pedido.presupuesto_min.toLocaleString('es-AR') + '–$' + pedido.presupuesto_max.toLocaleString('es-AR');
    }

    // — Poblar campos —
    set('ep-pedido-titulo', pedido.titulo || '—');
    set('ep-precio', precioTxt);
    set('ep-plazo', PLAZO_MAP[propuesta.plazo] || propuesta.plazo || '—');

    const refRow = document.getElementById('ep-ref-row');
    if (refTxt) { set('ep-ref', refTxt); if (refRow) refRow.style.display = 'flex'; }
    else { if (refRow) refRow.style.display = 'none'; }

    set('ep-tl-pedido-sub', (pedido.titulo || '—') + ' · ' + (pedido.zona || 'Escobar') + ' · ' + presupTxt);
    set('ep-tl-pedido-time', tiempoRelativo(pedido.creado));
    set('ep-tl-prop-sub', precioTxt + ' · ' + (PLAZO_MAP[propuesta.plazo] || '—') + velozTxt);
    set('ep-tl-prop-time', tiempoRelativo(propuesta.creado));
    set('ep-tl-eval-sub', (nProps > 0 ? nProps + ' propuesta' + (nProps !== 1 ? 's' : '') + ' recibidas' : 'Sin propuestas aún') + expiraTxt);

    // — Timeline dinámico según estado real —
    actualizarTimelineEP(chatEstado);
  }

  // Función global para el botón de chat en s-estado-propuesta
  window.epAbrirChat = function() {
    const btn = document.getElementById('ep-btn-chat');
    const pId = (btn && btn.dataset.propuestaId) || (propuestaMia && propuestaMia.id);
    if (!pId) { console.warn('[EP] no hay propuesta_id para abrir chat'); return; }
    abrirChat(pId, { pedido: pedidoActual });
  };

  function actualizarTimelineEP(estado) {
    // Helpers para marcar dot/línea
    const done  = (n) => {
      const d = document.getElementById('ep-tl-dot-' + n);
      const l = document.getElementById('ep-tl-line-' + n);
      if (d) { d.className = 'tl-dot done'; d.textContent = '✓'; d.style = ''; }
      if (l) { l.className = 'tl-line done'; }
    };
    const active = (n, label) => {
      const d = document.getElementById('ep-tl-dot-' + n);
      if (d) { d.className = 'tl-dot active'; d.textContent = label || '•••'; d.style.cssText = 'color:white;font-size:10px'; }
    };
    const wait  = (n) => {
      const d = document.getElementById('ep-tl-dot-' + n);
      const l = document.getElementById('ep-tl-line-' + n);
      if (d) { d.className = 'tl-dot wait'; d.textContent = ''; d.style = ''; }
      if (l) { l.className = 'tl-line'; }
    };
    const txt   = (id, val, color) => {
      const e = document.getElementById(id);
      if (e) { e.textContent = val; if (color) e.style.color = color; }
    };
    const show  = (id) => { const e = document.getElementById(id); if (e) e.style.display = ''; };
    const hide  = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };

    // Pasos 1 y 2 siempre done
    done(1); done(2);

    if (['pendiente', 'propuesta_enviada', 'consulta'].includes(estado)) {
      // Paso 3 activo (evaluando)
      active(3); wait(4); wait(5);
      txt('ep-tl-eval-title', 'El cliente está evaluando propuestas', 'var(--blue)');
      txt('ep-tl-eligen-title', 'El cliente elige al prestador', 'var(--ink3)');
      txt('ep-tl-eligen-sub', 'Recibirás una notificación si te eligen', 'var(--ink3)');
      txt('ep-tl-chat-title', 'Chat y coordinación del servicio', 'var(--ink3)');
      hide('ep-tl-eligen-time'); hide('ep-tl-chat-sub'); hide('ep-tl-item-6');

    } else if (['activo', 'elegida'].includes(estado)) {
      // Pasos 3 y 4 done, paso 5 activo
      done(3); done(4); active(5, '💬');
      txt('ep-tl-eval-title', 'El cliente evaluó las propuestas', 'var(--ink)');
      txt('ep-tl-eligen-title', '¡Te eligieron!', 'var(--green,#16A34A)');
      txt('ep-tl-eligen-sub', 'El vecino aceptó tu propuesta', 'var(--green,#16A34A)');
      txt('ep-tl-chat-title', 'Chat y coordinación del servicio', 'var(--blue)');
      show('ep-tl-eligen-time'); hide('ep-tl-chat-sub'); hide('ep-tl-item-6');

    } else if (['terminado_prestador', 'terminado_por_vecino'].includes(estado)) {
      // Pasos 3, 4 y 5 done, paso 6 activo
      done(3); done(4); done(5); show('ep-tl-item-6'); active(6, '⏳');
      txt('ep-tl-eval-title', 'El cliente evaluó las propuestas', 'var(--ink)');
      txt('ep-tl-eligen-title', '¡Te eligieron!', 'var(--green,#16A34A)');
      txt('ep-tl-chat-title', 'Trabajo realizado', 'var(--ink)');
      txt('ep-tl-calif-title', estado === 'terminado_prestador' ? 'Esperando confirmación del vecino' : 'Esperando calificación', 'var(--blue)');
      txt('ep-tl-calif-sub', '', '');

    } else if (estado === 'calificado') {
      // Todos done
      done(3); done(4); done(5); show('ep-tl-item-6'); done(6);
      txt('ep-tl-eval-title', 'El cliente evaluó las propuestas', 'var(--ink)');
      txt('ep-tl-eligen-title', '¡Te eligieron!', 'var(--green,#16A34A)');
      txt('ep-tl-chat-title', 'Trabajo realizado', 'var(--ink)');
      txt('ep-tl-calif-title', 'Calificación recibida ⭐', 'var(--ink)');

    } else if (estado === 'cancelado') {
      done(3); active(4, '❌'); wait(5); hide('ep-tl-item-6');
      txt('ep-tl-eligen-title', 'Trabajo cancelado', '#DC2626');
      txt('ep-tl-eligen-sub', '', '');
      txt('ep-tl-chat-title', 'Chat y coordinación del servicio', 'var(--ink3)');

    } else if (['rechazada', 'retirada'].includes(estado)) {
      active(3, '😔'); wait(4); wait(5); hide('ep-tl-item-6');
      txt('ep-tl-eval-title', estado === 'rechazada' ? 'El vecino eligió otra propuesta' : 'Retiraste tu propuesta', '#6B7280');
      txt('ep-tl-eligen-title', 'El cliente elige al prestador', 'var(--ink3)');
      txt('ep-tl-eligen-sub', 'Recibirás una notificación si te eligen', 'var(--ink3)');
      txt('ep-tl-chat-title', 'Chat y coordinación del servicio', 'var(--ink3)');
      hide('ep-tl-item-6');
    }
  }

  async function renderPropuestasRecibidas(pedido, wrap) {
    if(!wrap) wrap=document.getElementById('pd-propuestas');
    if(!wrap) return false;
    wrap.innerHTML='<div style="padding:20px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando propuestas...</div>';
    let props=[];
    try{props=await PronetDB.listar('propuestas');}catch(e){return false;}
    props=props.filter(pr=>pr.pedido_id===pedido.id&&pr.estado!=='retirada');
    if(props.length===0){wrap.innerHTML='<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no recibiste propuestas.<br>Los prestadores de tu zona ya pueden ver tu pedido.</div>';return false;}
    let porId={};
    // Sólo los prestadores que efectivamente propusieron. Antes pedía la
    // tabla entera para armar un mapa del que se usaban dos o tres entradas.
    try{const pr=await PronetDB.obtenerVarios('prestadores',props.map(p=>p.prestador_id));pr.forEach(x=>{porId[x.id]=x;});}catch(e){}
    const t=document.getElementById('pd-props-title'),s=document.getElementById('pd-props-sub'),f=document.getElementById('pd-props-foot');
    const hayElegida=props.some(pr=>pr.estado==='elegida');
    if(t) t.textContent=hayElegida?'✅ Prestador elegido':'📬 Propuestas recibidas ('+props.length+')';
    if(s) s.textContent=hayElegida?'Este pedido ya está cerrado':'Compará precio, plazo y reputación antes de elegir';
    if(f) f.style.display='none';
    const peso={elegida:0,pendiente:1,rechazada:2};
    props.sort((a,b)=>(peso[a.estado]-peso[b.estado])||(a.precio-b.precio));
    wrap.innerHTML='';

    // Ref PRONET: ayuda a comparar propuestas de alcance distinto — solo si hay ficha activa real.
    try {
      const tieneCatalogo = FEATURES.catalogoPrecios && pedido.rubro && RUBROS_CON_CATALOGO.has(pedido.rubro);
      if (tieneCatalogo) {
        const ficha = await PronetDB.obtenerFichaPorRubro(pedido.rubro);
        if (ficha?.precio_ref_min) {
          const minTotal = ficha.precio_ref_min;
          const maxTotal = ficha.precio_ref_max || ficha.precio_ref_min;
          const incluye = Array.isArray(ficha.incluye) ? ficha.incluye : [];
          const noIncluye = Array.isArray(ficha.no_incluye) ? ficha.no_incluye : [];
          const refTxt = '$' + minTotal.toLocaleString('es-AR') + ' – $' + maxTotal.toLocaleString('es-AR');
          const refCard = document.createElement('div');
          refCard.innerHTML = refPronetCardHTML('ref-props', refTxt, incluye, noIncluye, 'Usalo para comparar propuestas de alcance similar');
          wrap.appendChild(refCard);
        }
      }
    } catch (e) {}

    props.forEach(pr=>{
      const p2=porId[pr.prestador_id]||{};
      const card=document.createElement('div');
      const esElegida=pr.estado==='elegida',esRechazada=pr.estado==='rechazada';
      card.className='prop-card';
      card.style.cssText='background:white;border-radius:14px;padding:14px;margin-bottom:10px;border:1.5px solid '+(esElegida?'var(--green,#16A34A)':'var(--border)')+(esRechazada?';opacity:.55':'');
      const chip=esElegida?'<div style="margin-left:auto;background:#DCFCE7;color:#16A34A;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">✅ Elegida</div>':esRechazada?'<div style="margin-left:auto;background:var(--surface,#F1F5F9);color:var(--ink3);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">Rechazada</div>':'<div style="margin-left:auto;background:var(--gold-s);color:#92400E;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">⭐ '+(p2.rating||5).toFixed(1)+'</div>';
      // Formatear el precio según la modalidad
      const modal = pr.modalidad_precio || 'fijo';
      const precioTxt = modal === 'convenir'
        ? '<div class="prop-precio">🤝 <span style="font-size:14px">A convenir</span> <span>tras visita</span></div>'
        : modal === 'rango'
        ? '<div class="prop-precio">$'+(pr.precio_min||0).toLocaleString('es-AR')+'–$'+(pr.precio_max||0).toLocaleString('es-AR')+' <span>rango</span></div>'
        : '<div class="prop-precio">$'+(pr.precio||0).toLocaleString('es-AR')+' <span>precio fijo</span></div>';
      const adjuntoHtml = pr.adjunto_url ? (() => {
        if (pr.adjunto_tipo === 'pdf') {
          return '<a href="'+escHTML(pr.adjunto_url)+'" target="_blank" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#EEF2FF;border-radius:8px;margin-top:8px;font-size:12px;color:var(--blue);font-weight:600;text-decoration:none">📄 '+escHTML(pr.adjunto_nombre||'Ver presupuesto')+'</a>';
        } else {
          const imgUrl = escHTML(pr.adjunto_url);
          return '<img src="'+imgUrl+'" onclick="abrirFotoModal(this.src)" style="width:100%;border-radius:8px;margin-top:8px;cursor:pointer;max-height:180px;object-fit:cover" alt="Adjunto de propuesta">';
        }
      })() : '';
      card.innerHTML='<div class="prop-top"><div class="prop-av" style="background:'+escHTML(p2.color_bg||'#EEF2FF')+';color:'+escHTML(p2.color_text||'#2B5BFF')+'">'+avatarInner(p2)+'</div><div style="min-width:0"><div class="prop-name">'+escHTML(p2.nombre||'Prestador')+'</div><div class="prop-rank">📍 '+escHTML(p2.zona||'Escobar')+' · '+escHTML(PLAZO_LBL[pr.plazo]||pr.plazo||'')+'</div></div>'+chip+'</div><div style="display:flex;gap:16px;align-items:baseline;margin:8px 0">'+precioTxt+'</div>'+(pr.mensaje?'<div class="prop-msg">"'+escHTML(pr.mensaje)+'"</div>':'')+adjuntoHtml;
      const btn=document.createElement('button');btn.style.marginTop='10px';
      if(esElegida){btn.className='prop-select-btn gold';btn.textContent='💬 Chatear con '+((p2.nombre||'').split(' ')[0]||'el prestador');btn.addEventListener('click',e=>{e.stopPropagation();prestadorActual=p2;abrirChat(pr.id,{prestador:p2,pedido:pedidoActual});});card.appendChild(btn);}
      else if(!esRechazada&&!hayElegida){btn.className='prop-select-btn';btn.textContent='Elegir a '+((p2.nombre||'este prestador').split(' ')[0])+' →';btn.addEventListener('click',e=>{e.stopPropagation();elegirPropuestaUI(pr,p2);});card.appendChild(btn);}
      wrap.appendChild(card);
    });
    return true;
  }

  async function elegirPropuestaUI(pr,prestador) {
    const nombre=(prestador&&prestador.nombre)||'este prestador';
    const ok=confirm('¿Elegir a '+nombre+' por $'+(pr.precio||0).toLocaleString('es-AR')+'?\n\nLas demás propuestas se rechazarán y el pedido quedará cerrado.');
    if(!ok) return;
    const res=await PronetDB.rpc('elegir_propuesta',{p_propuesta_id:pr.id});
    if(!res||res.ok!==true){alert(res&&res.error&&res.error.includes('PROPUESTA_NO_ELEGIBLE')?'Esta propuesta ya no se puede elegir.':'No se pudo confirmar la elección.');if(pedidoActual)renderPropuestasRecibidas(pedidoActual);return;}
    if(pedidoActual)pedidoActual.estado='Cerrado';
    await renderPropuestasRecibidas(pedidoActual);renderPedidosGuardados();
    alert('✅ ¡Elegiste a '+nombre+'! Coordiná día y detalles por chat.');
    // Abrir el chat real de la propuesta elegida
    prestadorActual=prestador;
    abrirChat(pr.id, { prestador: prestador, pedido: pedidoActual });
  }

  // ══ MENÚ PRESTADOR ═══════════════════════════════════════════════════
  function abrirCobertura(){goTo('s-publicar');pubNext(3);}
  /** Abre las reseñas propias y corre la marca: al verlas dejan de ser
   *  nuevas y el indicador del tablero se apaga en el próximo render. */
  async function verResenasNuevas(){
    marcarResenasComoVistas();
    await abrirMisResenas();
  }
  window.verResenasNuevas = verResenasNuevas;

  async function abrirMisResenas(){
    if(!usuarioActual||!usuarioActual.prestador_id){alert('Tu perfil de prestador no está completo todavía.');return;}
    try{const yo=await PronetDB.obtener('prestadores',usuarioActual.prestador_id);if(yo)abrirPerfilPrestador(yo);else alert('No se encontró tu perfil.');}catch(e){alert('No se pudo cargar tu perfil.');}
  }
  /** @param {string=} filtro Estado de propuesta a mostrar ('pendiente',
   *  'elegida'…). Lo pasa el tablero de Inicio para que la pantalla muestre
   *  las mismas que contó el indicador. Sin filtro, muestra todas. */
  async function abrirMisPropuestas(filtro){
    if(!usuarioActual||!usuarioActual.prestador_id){alert('Tu perfil de prestador no está completo todavía.');return;}
    // Guardar la pantalla de origen para el back
    window._misPropuestasOrigen = document.querySelector('.screen.active')?.id || 's-miperfil';
    goTo('s-mis-propuestas');
    const wrap=document.getElementById('mp-lista');if(!wrap)return;
    wrap.innerHTML='<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    let mias=[],pedidos=[];
    // Sólo mis propuestas, y sólo los pedidos que ellas referencian. Antes
    // traía las DOS tablas completas para quedarse con un puñado de filas.
    try{
      mias = await PronetDB.listarPropuestasDePrestador(usuarioActual.prestador_id);
      pedidos = await PronetDB.obtenerVarios('pedidos', mias.map(pr => pr.pedido_id));
    }catch(e){wrap.innerHTML='<div style="padding:24px;text-align:center;color:#BE123C">⚠️ No se pudieron cargar tus propuestas.</div>';return;}
    if(mias.length===0){wrap.innerHTML='<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no enviaste propuestas.</div>';return;}
    const totalMias=mias.length;
    let bannerFiltro='';
    if(filtro){
      mias=mias.filter(pr=>pr.estado===filtro);
      const LBL={pendiente:'Esperando respuesta',elegida:'Te eligieron',rechazada:'No elegidas',retirada:'Retiradas'};
      if(mias.length===0){
        wrap.innerHTML='<div style="padding:44px 24px;text-align:center"><div style="font-size:34px;margin-bottom:10px">🔍</div>'+
          '<div style="font-size:14px;font-weight:700;color:var(--ink)">Nada en «'+escHTML(LBL[filtro]||filtro)+'»</div>'+
          '<div style="font-size:13px;color:var(--ink3);margin-top:4px">Tenés '+totalMias+' propuesta'+(totalMias!==1?'s':'')+' en otros estados.</div>'+
          '<button onclick="abrirMisPropuestas()" style="margin-top:14px;background:var(--blue);color:white;border:none;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Ver todas</button></div>';
        return;
      }
      bannerFiltro='<div style="display:flex;align-items:center;gap:8px;background:var(--blue-s);border-radius:12px;padding:9px 12px;margin-bottom:12px">'+
        '<span style="flex:1;font-size:12px;font-weight:600;color:var(--blue)">Mostrando: '+escHTML(LBL[filtro]||filtro)+' ('+mias.length+')</span>'+
        '<button onclick="abrirMisPropuestas()" style="background:white;border:1px solid #C7D5FF;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;color:var(--blue);cursor:pointer;font-family:inherit">Ver todas</button></div>';
    }
    const peso={elegida:0,pendiente:1,retirada:2,rechazada:3};
    mias.sort((a,b)=>(peso[a.estado]-peso[b.estado])||(new Date(b.creado)-new Date(a.creado)));
    const CHIP={elegida:'<span style="background:#DCFCE7;color:#16A34A;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">✅ ¡Te eligieron!</span>',pendiente:'<span style="background:var(--gold-s);color:#92400E;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">⏳ Pendiente</span>',rechazada:'<span style="background:var(--surface,#F1F5F9);color:var(--ink3);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">No elegida</span>',retirada:'<span style="background:var(--surface,#F1F5F9);color:var(--ink3);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">Retirada</span>'};
    wrap.innerHTML=bannerFiltro;
    mias.forEach(pr=>{
      const ped=pedidos.find(p=>p.id===pr.pedido_id)||{},esElegida=pr.estado==='elegida';
      const card=document.createElement('div');
      card.style.cssText='background:white;border-radius:14px;padding:14px;margin-bottom:10px;border:1.5px solid '+(esElegida?'var(--green,#16A34A)':'var(--border)')+(pr.estado==='rechazada'||pr.estado==='retirada'?';opacity:.6':'');
      card.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:18px">'+(ped.icono||'📋')+'</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHTML(ped.titulo||'Pedido')+'</div><div style="font-size:11px;color:var(--ink3)">📍 '+escHTML(ped.zona||'Escobar')+' · '+escHTML(ped.estado||'Publicado')+'</div></div>'+(CHIP[pr.estado]||'')+'</div><div style="display:flex;gap:12px;align-items:baseline"><div style="font-size:17px;font-weight:800;color:var(--ink)">$'+(pr.precio||0).toLocaleString('es-AR')+'</div><div style="font-size:11px;font-weight:600;color:var(--ink2)">'+escHTML(PLAZO_LBL[pr.plazo]||pr.plazo||'')+'</div></div>';
      // Toda card navega a s-estado-propuesta — desde ahí el prestador accede al chat
      card.style.cursor='pointer';
      card.addEventListener('click',()=>{pedidoActual=ped;propuestaMia=pr;goTo('s-estado-propuesta');const ep=document.getElementById('s-estado-propuesta');if(ep)ep.scrollTop=0;cargarEstadoPropuesta(ped,pr);});
      wrap.appendChild(card);
    });
  }

  // ══ NOTIFICACIONES REALTIME ══════════════════════════════════════════
  function showToast(msg, accion, persistente=false) {
    let host=document.getElementById('toast-host');
    if(!host){host=document.createElement('div');host.id='toast-host';host.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;width:min(92%,380px)';document.body.appendChild(host);}
    // Ajustar top según safe-area real (se recalcula en cada toast por si cambió)
    if(window.navigator.standalone){
      const screens=document.querySelector('.screens');
      const pt=screens?parseInt(screens.style.paddingTop)||0:0;
      host.style.top=(pt>0?(pt+8):59+8)+'px';
    } else {
      host.style.top='max(env(safe-area-inset-top,0px) + 8px, 14px)';
    }
    const t=document.createElement('div');
    t.style.cssText='background:var(--ink,#171B2D);color:white;border-radius:14px;padding:12px 14px 12px 16px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:fadeIn .25s ease;display:flex;align-items:center;gap:10px';
    const txt=document.createElement('span');txt.textContent=msg;txt.style.cssText='flex:1;cursor:'+(accion?'pointer':'default');
    if(accion) txt.addEventListener('click',()=>{accion();t.remove();});
    t.appendChild(txt);
    const x=document.createElement('button');x.textContent='✕';x.style.cssText='background:rgba(255,255,255,.15);border:none;color:white;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px;flex-shrink:0;font-family:inherit';
    x.addEventListener('click',e=>{e.stopPropagation();t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300);});
    t.appendChild(x);host.appendChild(t);
    if(!persistente) setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .4s';setTimeout(()=>t.remove(),400);},6000);
  }

  function agregarNotifCampanita(texto,accion){
    const badge=document.getElementById('bell-count');
    if(badge){const n=parseInt(badge.textContent||'0')+1;badge.textContent=n;badge.style.display='flex';}
    const lista=document.getElementById('notif-list');if(!lista)return;
    const hace=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    const item=document.createElement('div');item.className='notif-item unread';item.style.cursor=accion?'pointer':'default';
    item.innerHTML='<div class="notif-unread-dot"></div><div class="notif-avatar" style="background:#EEF2FF;color:#2B5BFF">🔔</div><div class="notif-body"><div class="notif-title">'+escHTML(texto)+'</div><div class="notif-time">Ahora · '+hace+'</div><div class="notif-action">'+(accion?'<button class="na-btn na-primary" data-accion="ir">Ver ahora</button>':'')+'<button class="na-btn na-ghost" data-accion="ignorar">Descartar</button></div></div>';
    item.querySelector('[data-accion="ignorar"]')?.addEventListener('click',e=>{e.stopPropagation();item.classList.remove('unread');});
    if(accion){item.querySelector('[data-accion="ir"]')?.addEventListener('click',e=>{e.stopPropagation();accion();item.classList.remove('unread');});item.addEventListener('click',()=>{accion();item.classList.remove('unread');});}
    lista.insertBefore(item,lista.firstChild);
  }

  let rtIniciado=false;
  function iniciarRealtime(){
    if(rtIniciado||!usuarioActual||!PronetDB.esRemoto()) return;
    rtIniciado=true;
    console.log('[Realtime] iniciado para:', usuarioActual.nombre, '· tipo:', usuarioActual.tipo);
    PronetDB.suscribir('pedidos',(payload)=>{
      if(payload.eventType!=='INSERT') return;
      const ped=payload.new||{};
      if(!esPrestador()) return;
      if(ped.usuario_id===usuarioActual.id) return;
      showToast('📋 Nuevo pedido: "'+(ped.titulo||'ver detalle')+'"',()=>abrirDetallePedido(ped),false);
      const home=document.getElementById('s-home');
      if(home&&home.classList.contains('active')) renderHomeFeed(catActiva||'todos');
    });
    PronetDB.suscribir('propuestas',(payload)=>{
      const pr=payload.new||{};if(!usuarioActual) return;
      const soyAutor=usuarioActual.prestador_id&&pr.prestador_id===usuarioActual.prestador_id;
      if(payload.eventType==='UPDATE'&&pr.estado==='elegida'&&soyAutor){
        showToast('🎉 ¡Te eligieron! Trabajo confirmado por $'+(pr.precio||0).toLocaleString('es-AR'),()=>abrirMisPropuestas(),true);
        agregarNotifCampanita('🎉 ¡Te eligieron! Trabajo confirmado por $'+(pr.precio||0).toLocaleString('es-AR'),()=>abrirMisPropuestas());
        if (PronetDB.esRemoto() && usuarioActual?.id) {
          PronetDB.insertarNotificacion({ usuario_id: usuarioActual.id, tipo: 'propuesta',
            titulo: '🎉 ¡Te eligieron! Trabajo confirmado por $'+(pr.precio||0).toLocaleString('es-AR'),
            url: '/#s-mis-propuestas' }).catch(() => {});
        }
        // Refrescar s-estado-propuesta si está activa y es esta propuesta
        const epScreen = document.getElementById('s-estado-propuesta');
        if (epScreen?.classList.contains('active') && propuestaMia?.id === pr.id && pedidoActual) {
          cargarEstadoPropuesta(pedidoActual, { ...propuestaMia, estado: 'elegida' });
        }
        return;
      }
      if(payload.eventType==='INSERT'&&!esPrestador()&&!soyAutor){
        showToast('📬 Nueva propuesta por $'+(pr.precio||0).toLocaleString('es-AR')+' — Tocá para comparar',()=>goTo('s-pedidos'),true); // persistente
        agregarNotifCampanita('📬 Nueva propuesta por $'+(pr.precio||0).toLocaleString('es-AR'),()=>goTo('s-pedidos'));
        updateBellCount();
        if (PronetDB.esRemoto() && usuarioActual?.id) {
          PronetDB.insertarNotificacion({ usuario_id: usuarioActual.id, tipo: 'propuesta',
            titulo: '📬 Nueva propuesta por $'+(pr.precio||0).toLocaleString('es-AR'),
            url: '/#s-pedidos' }).catch(() => {});
        }
        renderPedidosGuardados();
        if(pedidoActual&&pedidoActual.id===pr.pedido_id){const det=document.getElementById('s-detalle-pedido');if(det&&det.classList.contains('active'))renderPropuestasRecibidas(pedidoActual);}
      }
    });

    // Realtime global de mensajes de chat (cuando el chat no está abierto)
    PronetDB.suscribir('mensajes_chat', (payload) => {
      if (!payload.new || !usuarioActual) return;
      const msg = payload.new;
      // Si el mensaje es propio o el chat está abierto → ya se maneja en abrirChat
      if (msg.autor_id === usuarioActual.id) return;
      if (chatActualId === msg.chat_id) return; // el chat local ya lo recibe
      // Notificar en campanita y toast
      const txt = (msg.texto || '').slice(0, PRONET_CONFIG.CHAT_PREVIEW_MAX);
      const preview = txt + (txt.length >= 50 ? '...' : '');
      showToast('💬 Nuevo mensaje: "' + preview + '"', () => goTo('s-chats'), false);
      agregarNotifCampanita('💬 Nuevo mensaje: "' + preview + '"', () => goTo('s-chats'));
      if (PronetDB.esRemoto() && usuarioActual?.id) {
        PronetDB.insertarNotificacion({ usuario_id: usuarioActual.id, tipo: 'mensaje',
          titulo: '💬 Nuevo mensaje: "' + preview + '"',
          url: '/#s-chats' }).catch(() => {});
      }
    });

    // Realtime de cambios de estado del trabajo (cancelaciones, terminados, etc.)
    PronetDB.suscribir('chats_trabajo', (payload) => {
      if (!payload.new || !usuarioActual) return;
      const chat = payload.new;

      const soyVecino  = chat.vecino_id    === usuarioActual.id;
      const soyPrestador = usuarioActual.prestador_id && chat.prestador_id === usuarioActual.prestador_id;
      if (!soyVecino && !soyPrestador) return; // no es mi chat

      // — Nuevo chat: notificar al prestador y refrescar lista si está abierta —
      if (payload.eventType === 'INSERT' && soyPrestador) {
        showToast('💬 Un vecino quiere contactarte', () => goTo('s-chats'), true);
        agregarNotifCampanita('💬 Un vecino quiere contactarte', () => goTo('s-chats'));
        const chatsScreen = document.getElementById('s-chats');
        if (chatsScreen && chatsScreen.classList.contains('active')) renderChats();
      }

      // — Refresco en vivo de s-estado-propuesta (funciona con INSERT y UPDATE) —
      const epAbierta = document.getElementById('s-estado-propuesta');
      if (epAbierta && epAbierta.classList.contains('active') && pedidoActual) {
        const esMiChat = (propuestaMia && chat.propuesta_id === propuestaMia.id)
                      || (soyPrestador && chat.pedido_id === pedidoActual.id);
        if (esMiChat && propuestaMia) {
          // Recargar toda la pantalla por Realtime
          // Actualizar el estado de la propuesta en memoria por si Realtime trae info nueva
          if (chat.estado === 'activo' || chat.estado === 'calificado') propuestaMia.estado = 'elegida';
          // Recargar toda la pantalla — hero, card, timeline, botón chat
          cargarEstadoPropuesta(pedidoActual, propuestaMia);
        }
      }

      if (payload.eventType !== 'UPDATE') return;

      const estado = chat.estado;
      const estadoAnterior = payload.old?.estado;
      // Cualquier UPDATE a la fila dispara este evento, no solo un cambio de
      // estado — por ejemplo, cada mensaje nuevo actualiza hora_ultimo. Sin
      // esta guarda, el toast y la notificación de "trabajo terminado" o
      // "cancelado" se repetían en cada mensaje posterior, porque el chat
      // seguía en ese estado aunque no acababa de transicionar a él.
      const recienCambio = estado !== estadoAnterior;
      const canceladoPorMi = chat.cancelado_por === usuarioActual.id;

      // Cancelación → notificar a quien NO canceló
      if (estado === 'cancelado' && recienCambio && !canceladoPorMi) {
        const quien = soyVecino ? 'El prestador' : 'El vecino';
        const titulo = '❌ ' + quien + ' canceló el trabajo';
        const cuerpo = chat.motivo_cancelacion || '';
        showToast(titulo + (cuerpo ? ': ' + cuerpo : ''), () => goTo('s-chats'), true);
        agregarNotifCampanita(titulo, () => goTo('s-chats'));
        if (PronetDB.esRemoto()) {
          PronetDB.insertarNotificacion({ usuario_id: usuarioActual.id, tipo: 'cancelacion',
            titulo, cuerpo, url: '/#s-chats' }).catch(() => {});
        }
        actualizarBannersChat(chat.id);
        return;
      }

      // Prestador marcó terminado → notificar al vecino
      if (estado === 'terminado_prestador' && recienCambio && soyVecino) {
        const titulo = '✅ El prestador marcó el trabajo como terminado';
        showToast(titulo + ' — Confirmá para calificar', () => goTo('s-chats'), true);
        agregarNotifCampanita(titulo, () => goTo('s-chats'));
        if (PronetDB.esRemoto()) {
          PronetDB.insertarNotificacion({ usuario_id: usuarioActual.id, tipo: 'terminado',
            titulo, url: '/#s-chats' }).catch(() => {});
        }
        actualizarBannersChat(chat.id);
        return;
      }

      // Trabajo calificado (cierre completo) → actualizar banners
      if (estado === 'calificado') {
        actualizarBannersChat(chat.id);
      }
    });

    // Realtime de notificaciones: actualiza la campana cuando llega una nueva
    PronetDB.suscribir('notificaciones', (payload) => {
      if (!payload.new || !usuarioActual) return;
      if (payload.new.usuario_id !== usuarioActual.id) return;
      if (payload.eventType !== 'INSERT') return;
      const notif = payload.new;
      agregarNotifCampanita(notif.titulo, notif.url ? () => { if(notif.url.includes('#')) goTo(notif.url.split('#')[1]); } : null);
      updateBellCount();
    });
  }

  // ── Inicialización (el script corre al final del <body>, DOM listo) ──
  habilitarAccesibilidadTeclado();
  restaurarEstado();
  cargarCarrito();          // el carrito sobrevive al cierre de la app
  pintarBadgeCarrito();
  renderPedidosGuardados();

  // ── Restaurar sesión y renderizar el Home con el usuario correcto ──
  // renderHomeFeed va DENTRO de restaurarSesion para evitar el flash de
  // contenido de invitado al abrir la PWA en iOS (race condition de timing)
  (async function restaurarSesion() {
    // La config global no depende de la sesión: un invitado también tiene que
    // ver los planes pagos ocultos si están desactivados. Si falla la lectura,
    // configApp queda vacío y planesPagosActivos() da false — el default seguro.
    configApp = await (PronetDB?.obtenerConfigApp?.() || Promise.resolve({})).catch(() => ({}));

    // Sincronizar límites y precios de cada plan desde la DB: evita drift
    // entre config.js (cliente) y planes_limites (fuente de verdad del
    // trigger de límites Y de crear-preferencia, que resuelve el precio real
    // del cobro). precio_mes/precio_anual quedan sin tocar si la fila no los
    // tiene (fallback a lo que ya trae config.js) — nunca se pisa con null.
    const limitesDB = await PronetDB.listarPlanesLimites().catch(() => []);
    if (limitesDB.length && window.PRONET_CONFIG?.PLANES) {
      limitesDB.forEach(row => {
        const p = window.PRONET_CONFIG.PLANES.find(p => p.id === row.plan);
        if (!p) return;
        p.propuestas_mes  = row.propuestas_mes;
        p.fotos_portfolio = row.fotos_portfolio;
        if (row.precio_mes             != null) p.precio_mes              = row.precio_mes;
        if (row.precio_anual           != null) p.precio_anual            = row.precio_anual;
        if (row.mkt_publicaciones_mes  != null) p.mkt_publicaciones_mes   = row.mkt_publicaciones_mes;
        if (row.mkt_publicaciones_anio != null) p.mkt_publicaciones_anio  = row.mkt_publicaciones_anio;
        // Publicaciones del prestador en Servicios: el panel muestra estos
        // límites, pero quien los garantiza es el trigger de la base.
        if (row.pub_slots          != null) p.pub_slots          = row.pub_slots;
        if (row.pub_duracion_dias  != null) p.pub_duracion_dias  = row.pub_duracion_dias;
        if (row.pub_destacados_mes != null) p.pub_destacados_mes = row.pub_destacados_mes;
        // El boost que se le PROMETE al usuario tiene que salir de la misma
        // fila que usa acreditar_puntos() para calcularlo. Si quedan en dos
        // lados, la pantalla puede decir ×1.5 mientras la base acredita ×1.25
        // y nadie se entera: el número prometido y el entregado divergen.
        if (row.loyalty_boost != null) p.loyalty_boost = Number(row.loyalty_boost);
      });
    }

    // Sincronizar límites operacionales desde config_app → PRONET_CONFIG
    const mapaCfgOp = {
      propuesta_expiracion_hs:  'PROPUESTA_EXPIRACION_HS',
      pedido_vencimiento_hs:    'PROPUESTA_EXPIRACION_HS',  // nombre nuevo de la misma cosa
      inactividad_cierre_dias:  'INACTIVIDAD_CIERRE_DIAS',
      pedido_fotos_max:         'PEDIDO_FOTOS_MAX',
      adjunto_max_mb:           'ADJUNTO_MAX_MB',
      // Umbrales de descubrimiento: definen qué ve el usuario y hasta ahora
      // cambiarlos exigía un deploy.
      rating_top:               'RATING_TOP',
      sugeridos_pedido:         'SUGERIDOS_PEDIDO',
      mapa_prestadores_max:     'MAPA_PRESTADORES_MAX',
      resenas_preview:          'RESENAS_PREVIEW',
    };
    if (window.PRONET_CONFIG) {
      Object.entries(mapaCfgOp).forEach(([clave, key]) => {
        const v = parseFloat(configApp[clave]);
        if (!isNaN(v)) window.PRONET_CONFIG[key] = v;
      });
    }

    // ProMarket: sincronizar el flag de feature con config_app
    // Si el admin lo desactivó, FEATURES.mercadoPlaza se baja para que
    // aplicarFeatureFlags() oculte el tab y bloquee goTo('s-mercado').
    FEATURES.mercadoPlaza = configApp.promarket_activo !== 'false';

    // El resto de las funcionalidades apagadas por el admin.
    //
    // Hasta ahora el panel de niveles guardaba en localStorage, o sea POR
    // DISPOSITIVO: un admin apagaba `loyalty` y se apagaba en su navegador
    // mientras los usuarios lo seguían viendo. Era una preferencia local
    // disfrazada de configuración. Ahora sale de config_app y alcanza a
    // todos.
    //
    // Se guardan sólo las APAGADAS: el estado normal es "todo prendido",
    // así que la clave queda vacía casi siempre y un flag nuevo en el
    // código arranca encendido sin tener que tocar la base.
    (configApp.features_off || '').split(',').map(s => s.trim()).filter(Boolean)
      .forEach(k => { if (k in FEATURES) FEATURES[k] = false; });

    aplicarFeatureFlags();

    // Catálogo de rubros desde la base. No se espera: los chips ya están
    // dibujados con el respaldo del código, y esto los reemplaza cuando
    // llega. Bloquear el arranque por esto dejaría la pantalla en blanco
    // si la consulta tarda.
    cargarRubrosDeLaBase().catch(() => {});
    cargarZonasDeLaBase().catch(() => {});
    cargarNivelesLoyalty().catch(() => {});

    configCargada = true;
    reflejarPlan();

    if (typeof PronetDB === 'undefined' || !PronetDB.usuarioActual) {
      renderHomeFeed('todos'); // sin sesión disponible: render como invitado
      return;
    }
    const quitarAntiFlash = () => { const s = document.getElementById('anti-flash-login'); if (s) s.remove(); };
    try {
      const u = await PronetDB.usuarioActual();
      const loginEl = document.getElementById('login-screen');
      if (u) {
        // Bloquear si el email no fue confirmado — verificar directo desde Auth
        const { data: { user: authUser } } = await window._sb.auth.getUser();
        if (authUser && !authUser.email_confirmed_at) {
          quitarAntiFlash();
          if (loginEl) loginEl.classList.remove('hidden');
          showToast('📧 Confirmá tu email antes de ingresar. Revisá tu casilla de correo.', 8000);
          renderHomeFeed('todos');
          return;
        }
        usuarioActual = u;
        const tycTs = localStorage.getItem('pronet_tyc_aceptado');
        if (tycTs) PronetDB.registrarAceptacionTyc(tycTs).catch(() => {});

        const _continuarLogin = async () => {
        // modoRol persiste en localStorage entre sesiones y entre cuentas.
        // Si el usuario que ingresa es un prestador puro (sin doble perfil),
        // limpiar para que no herede un 'vecino' de una sesión anterior.
        if (!tieneDoblePerfil()) {
          modoRol = null;
          localStorage.setItem('pronet-modo-rol', '');
        }
        if (loginEl) loginEl.classList.add('hidden');
        reflejarUsuario();
        iniciarRealtime();
        updateBellCount();
        cargarSliderRangosDesdeDB();
        PronetDB.obtenerSuscripcion().then(s => {
          planActual       = s.plan              || 'base';
          periodoActual    = s.periodo           || 'mensual';
          venceActual      = s.vence_en          || null;
          esFundadorActual = s.es_fundador_activo || false;
          reflejarPlan();
        }).catch(() => {});
        if (u.zona) { zonaActual = u.zona; actualizarZonaLabel(zonaActual); }
        // Prestador: arrancar el feed filtrado por su rubro
        let catInicial = catActiva || 'todos';
        if (esPrestador() && u.prestador_id) {
          try {
            const { data: prest } = await window._sb.from('prestadores')
              .select('rubro').eq('id', u.prestador_id).maybeSingle();
            if (prest?.rubro && prest.rubro !== 'General') {
              const slug = prest.rubro.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              catInicial = slug;
              catActiva  = slug;
              document.querySelectorAll('.rubro').forEach(r => {
                r.classList.toggle('on', r.getAttribute('onclick')?.includes(`'${slug}'`));
              });
            }
          } catch(e) {}
        }
        renderHomeFeed(catInicial);
        renderPedidosGuardados();

        // Procesar retorno desde MercadoPago (capturado sincrónicamente antes)
        const _mpRes  = window._pendingMpResult;
        const _mpPago = window._pendingMpPayment;
        if (_mpRes) {
          delete window._pendingMpResult;
          delete window._pendingMpPayment;
          if (_mpRes === 'success' && localStorage.getItem('pronet_compra_credito_pendiente')) {
            localStorage.removeItem('pronet_compra_credito_pendiente');
            (async function activarCreditoPromarket() {
              const creditosAntes = usuarioActual?.promarket_creditos || 0;
              const exito = async () => {
                usuarioActual = await PronetDB.usuarioActual().catch(() => usuarioActual);
                reflejarUsuario();
                showToast('✅ ¡Publicación extra acreditada! Ya podés publicar de nuevo.', 6000);
                setTimeout(() => goTo('s-mercado'), 400);
              };
              const u0 = await PronetDB.usuarioActual().catch(() => null);
              if ((u0?.promarket_creditos || 0) > creditosAntes) { usuarioActual = u0; return exito(); }

              showToast('✅ Pago recibido — acreditando tu publicación...', 4000);
              if (_mpPago) {
                const r = await PronetDB.verificarPagoMP(_mpPago);
                if (r?.ok) return exito();
              }
              for (const ms of [2500, 5000, 10000]) {
                await new Promise(r => setTimeout(r, ms));
                const u2 = await PronetDB.usuarioActual().catch(() => null);
                if ((u2?.promarket_creditos || 0) > creditosAntes) { usuarioActual = u2; return exito(); }
              }
              showToast('⚠️ El pago está siendo procesado. En unos minutos se acredita — si no, contactanos.', 9000);
            })();
          } else if (_mpRes === 'success') {
            (async function activarProMarket() {
              const exito = async () => {
                usuarioActual = await PronetDB.usuarioActual().catch(() => usuarioActual);
                reflejarUsuario();
                showToast('¡Ya sos Pro Market! Tocá + para publicar en el feed.', 6000);
                setTimeout(() => goTo('s-mercado'), 400);
              };

              if (usuarioActual?.es_pro_marketplace) return exito();

              showToast('✅ Pago recibido — activando tu acceso...', 4000);

              // Verificación directa contra MP: no depende de que el webhook
              // haya llegado. Activa el plan en el momento si el pago está
              // aprobado, y es idempotente respecto del webhook.
              if (_mpPago) {
                const r = await PronetDB.verificarPagoMP(_mpPago);
                if (r?.ok) return exito();
              }

              // Fallback: el webhook puede estar demorado
              for (const ms of [2500, 5000, 10000]) {
                await new Promise(r => setTimeout(r, ms));
                const u2 = await PronetDB.usuarioActual().catch(() => null);
                if (u2?.es_pro_marketplace) { usuarioActual = u2; return exito(); }
              }
              showToast('⚠️ El pago está siendo procesado. En unos minutos se activa — si no, contactanos.', 9000);
            })();
          } else if (_mpRes === 'failure') {
            showToast('⚠️ El pago no se completó. Podés intentarlo de nuevo.', 5000);
          }
        }
        }; // fin _continuarLogin

        if (!u.tyc_aceptado_en) {
          // Cuenta sin T&C aceptado: mostrar modal antes de dejar entrar
          _tycPostLoginCallback = _continuarLogin;
          const modal = document.getElementById('modal-tyc-login');
          if (modal) {
            ['tyc-check-terminos', 'tyc-check-edad'].forEach(id => {
              const el = document.getElementById(id); if (el) el.checked = false;
            });
            actualizarBotonTyc();
            // El modal vive DENTRO de #login-screen, que a esta altura ya está
            // oculto (la clase .hidden y el <style> anti-flash lo esconden
            // apenas se detecta un token, para que no parpadee el login al
            // recargar). Ponerle display:flex al modal no alcanza: quedaba con
            // caja 0x0, invisible e inclickeable.
            //
            // El efecto era silencioso y grave: nadie podía aceptar, así que
            // _continuarLogin no corría nunca y la cuenta entraba a medio
            // inicializar — sin reflejarUsuario() (un prestador veía la UI de
            // vecino), sin plan y sin realtime. Y sin salida, porque lo único
            // que destraba es este modal.
            quitarAntiFlash();
            if (loginEl) loginEl.classList.remove('hidden');
            modal.style.display = 'flex';
          } else {
            _continuarLogin(); // sin modal: dejar pasar igual
          }
        } else {
          _continuarLogin();
        }

      } else {
        // Token inválido o expirado: mostrar login. Salvo que se haya entrado
        // por un link de invitación, que es público y ya pintó su pantalla.
        quitarAntiFlash();
        if (loginEl && !window._prealtaPendiente) loginEl.classList.remove('hidden');
        renderHomeFeed('todos'); // render como invitado
      }
    } catch (e) {
      quitarAntiFlash();
      const loginEl = document.getElementById('login-screen');
      if (loginEl && !window._prealtaPendiente) loginEl.classList.remove('hidden');
      renderHomeFeed('todos');
    }
  })();

  // Capturar el resultado de MP y limpiar la URL de forma síncrona.
  // El procesamiento real ocurre dentro de restaurarSesion() una vez que
  // usuarioActual ya está cargado (ver _pendingMpResult más abajo).
  // Link de invitación (?prealta=CODIGO). Es la única pantalla pública de la
  // app: la abre alguien que todavía no tiene cuenta, así que no espera a que
  // restaurarSesion resuelva ni pasa por el login. Corre en el mismo tick que
  // el resto del módulo, o sea antes de que restaurarSesion vuelva de su
  // primer await — por eso alcanza con la bandera para que no pise la pantalla.
  (function capturarPrealta() {
    const cod = (new URLSearchParams(location.search).get('prealta') || '').trim();
    if (!cod) return;
    window._prealtaPendiente = cod;
    history.replaceState(null, '', location.pathname);
    try { quitarAntiFlash(); } catch (e) {}
    document.getElementById('login-screen')?.classList.add('hidden');
    abrirPrealta(cod, { volverA: null });
  })();

  // Link de alta (?reclamar=ID). Lo manda por WhatsApp el que lo anotó: abre
  // el registro con el nombre puesto y marcado como prestador, y al terminar
  // hacerRegistro() convierte la pre-alta en su ficha.
  (function capturarReclamo() {
    const id = (new URLSearchParams(location.search).get('reclamar') || '').trim();
    if (!id) return;
    window._reclamarPrealta = id;
    history.replaceState(null, '', location.pathname);
    (async () => {
      const pa = await PronetDB.prealtaPublica(id).catch(() => null);
      // Si la pre-alta ya se usó o no existe, no se avisa nada raro: queda el
      // registro normal, que es un final correcto igual.
      try { quitarAntiFlash(); } catch (e) {}
      document.getElementById('login-screen')?.classList.remove('hidden');
      mostrarFormRegistro();
      const radioP = document.querySelector('input[name="reg-tipo"][value="prestador"]');
      if (radioP) { radioP.checked = true; mostrarRubrosRegistro(true); }
      if (pa?.nombre) {
        const inp = document.getElementById('reg-nombre');
        if (inp) inp.value = pa.nombre;
      }
      (pa?.rubros || []).forEach(r => {
        document.querySelector('#reg-rubros .sub-opt[data-rubro="' + String(r).replace(/"/g, '') + '"]')?.classList.add('on');
      });
    })();
  })();

  (function capturarRetornoMP() {
    const p = new URLSearchParams(location.search);
    const mp = p.get('mp');
    if (mp) {
      // MP agrega payment_id / collection_id a la back_url al volver
      window._pendingMpResult  = mp;
      window._pendingMpPayment = p.get('payment_id') || p.get('collection_id') || null;
      history.replaceState(null, '', location.pathname);
    }
  })();

  // Búsqueda por texto al escribir (debounce 400ms para no saturar Supabase)
  const searchInp = document.querySelector('.search-input');
  if (searchInp) {
    let searchTimer;
    searchInp.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderBusqueda(searchInp.value, filtroActivo), 400);
    });
  }

  // Indicador de conexión real: hace una consulta de prueba y muestra el resultado
  (async function mostrarModoDatos() {
    const el = document.getElementById('dev-panel-datos');
    if (!el || typeof PronetDB === 'undefined') return;
    if (!PronetDB.esRemoto()) {
      el.textContent = '⚪ Datos: LOCAL (este dispositivo)';
      el.style.color = 'rgba(255,255,255,.5)';
      return;
    }
    el.textContent = '⏳ Verificando Supabase...';
    el.style.color = 'rgba(255,255,255,.5)';
    try {
      // contar() y no listar(): esto sólo muestra un número, no hace falta
      // traerse las filas para saber cuántas hay.
      const n = await PronetDB.contar('pedidos');
      el.textContent = '🟢 Datos: SUPABASE (' + n + ' pedido' + (n !== 1 ? 's' : '') + ')';
      el.style.color = '#39FF14';
    } catch (e) {
      el.textContent = '🔴 SUPABASE sin respuesta';
      el.style.color = '#FCA5A5';
    }
  })();

  // ── PWA: registro del Service Worker ─────────────────────────────────
  // Solo funciona servido por HTTP/HTTPS (Netlify, localhost, etc.);
  // abriendo el archivo directo (file://) se omite sin romper nada.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('[PWA] No se pudo registrar el Service Worker:', err);
      });
    });
    // Único disparador de reload: 'controllerchange' es la señal correcta de
    // que un SW nuevo tomó control de la página (dispara tanto en la primera
    // instalación como en actualizaciones posteriores). Antes también se
    // recargaba desde 'updatefound'/'statechange', duplicando el reload en
    // CADA actualización — dos reloads casi simultáneos podían interrumpirse
    // entre sí y dejar la página con un contexto a medio destruir (visible
    // en los tests de Playwright como "window.PronetDB is undefined" al azar).
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      console.log('[PWA] SW actualizado — recargando para aplicar cambios');
      window.location.reload();
    });

    // El SW nos avisa cuando renovó la suscripción push (pushsubscriptionchange).
    // Lo guardamos en Supabase con la sesión activa del usuario.
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type !== 'push-resubscribed') return;
      const sub = event.data.subscription;
      if (!sub?.endpoint || !window._sb) return;
      const uid = await PronetDB.usuarioIdActual();
      if (!uid) return;
      const { error } = await window._sb.from('push_suscripciones').upsert(
        { usuario_id: uid, endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth },
        { onConflict: 'endpoint' }
      );
      if (error) console.warn('[PWA] push-resubscribed: no se pudo guardar la suscripción', error.message);
    });
  }

  // ── Instalación PWA ─────────────────────────────────────────────────
  // Android: captura beforeinstallprompt y muestra card no intrusiva en home.
  // iOS Safari: hint manual con instrucciones de "Agregar a pantalla de inicio".
  (function iniciarInstalacion() {
    if (window.navigator.standalone) return; // ya instalada

    // --- Android A2HS ---
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (localStorage.getItem('pronet_install_descartado')) return;
      // Primera visita: esperar 30s. Segunda visita en adelante: 5s.
      const visitas = parseInt(localStorage.getItem('pronet_visitas') || '0') + 1;
      localStorage.setItem('pronet_visitas', String(visitas));
      setTimeout(() => mostrarInstallCard(deferredPrompt), visitas >= 2 ? 5000 : 30000);
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      document.getElementById('install-card')?.remove();
      showToast && showToast('✅ ¡PRONET instalado! Buscalo en tu pantalla de inicio.');
    });

    // --- iOS Safari ---
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const esSafariIOS = esIOS && !/crios|fxios|opios/i.test(navigator.userAgent);
    if (esSafariIOS && !localStorage.getItem('pronet_ios_hint_visto')) {
      setTimeout(mostrarIOSHint, 20000);
    }
  })();

  function mostrarInstallCard(prompt) {
    if (document.getElementById('install-card')) return;
    const home = document.getElementById('s-home');
    if (!home) return;
    const card = document.createElement('div');
    card.id = 'install-card';
    card.className = 'install-card';
    card.innerHTML =
      '<div class="install-card-icon">📲</div>' +
      '<div class="install-card-body">' +
        '<div class="install-card-title">Instalá PRONET</div>' +
        '<div class="install-card-sub">Acceso directo desde tu pantalla de inicio, sin abrir el navegador</div>' +
      '</div>' +
      '<button class="install-card-btn">Instalar</button>' +
      '<button class="install-card-close" aria-label="Cerrar">✕</button>';
    home.insertBefore(card, home.firstChild);
    card.querySelector('.install-card-btn').addEventListener('click', async () => {
      card.remove();
      if (!prompt) return;
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome !== 'accepted') localStorage.setItem('pronet_install_descartado', 'true');
    });
    card.querySelector('.install-card-close').addEventListener('click', () => {
      card.remove();
      localStorage.setItem('pronet_install_descartado', 'true');
    });
  }

  function mostrarIOSHint() {
    if (document.getElementById('ios-install-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'ios-install-hint';
    hint.className = 'ios-install-hint';
    hint.innerHTML =
      '<span class="ios-hint-text">Para instalar PRONET: tocá <strong>⬆ Compartir</strong> → <strong>Agregar a pantalla de inicio</strong></span>' +
      '<button aria-label="Cerrar">✕</button>';
    document.body.appendChild(hint);
    requestAnimationFrame(() => requestAnimationFrame(() => hint.classList.add('visible')));
    const cerrar = () => {
      hint.classList.remove('visible');
      setTimeout(() => hint.remove(), 300);
      localStorage.setItem('pronet_ios_hint_visto', 'true');
    };
    hint.querySelector('button').addEventListener('click', cerrar);
    setTimeout(cerrar, 12000);
  }

  // ── Monitor de conexión ─────────────────────────────────────────────
  // Banner discreto encima del nav cuando no hay red; toast al restaurarse.
  function iniciarMonitorConexion() {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.className = 'offline-banner';
    banner.textContent = '⚡ Sin conexión — los datos pueden no estar actualizados';
    const nav = document.querySelector('.nav');
    if (nav) nav.parentNode.insertBefore(banner, nav);

    function actualizar() { banner.classList.toggle('visible', !navigator.onLine); }
    window.addEventListener('offline', actualizar);
    window.addEventListener('online', () => { actualizar(); showToast && showToast('✅ Conexión restaurada'); });
    actualizar();
  }
  iniciarMonitorConexion();
  // Las cuatro listas de rubros salen del catálogo único. El HTML sólo trae
  // los contenedores vacíos, así que esto tiene que correr sí o sí al iniciar.
  pintarRubros();

  // Fix teclado iOS en PWA: ocultar nav mientras el teclado esta abierto en s-chat
  if (window.visualViewport) {
    const nav = document.querySelector('.nav');
    window.visualViewport.addEventListener('resize', () => {
      if (!nav) return;
      const chatActive = document.getElementById('s-chat')?.classList.contains('active');
      const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
      if (chatActive && keyboardOpen) {
        nav.style.display = 'none';
      } else {
        nav.style.display = '';
      }
    });
  }
