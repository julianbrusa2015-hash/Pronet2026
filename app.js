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
      if (haySesionGuardada) login.classList.add('hidden');
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
    's-mapa':             'nb-mapa',
    's-miperfil':         'nb-perfil',
    's-ranking':          'nb-mapa',
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
    's-loyalty':            'nb-perfil',
    's-denuncia':         'nb-perfil',
    's-moderacion':       'nb-perfil',
    's-loyalty-admin':    'nb-perfil',
    's-mis-propuestas':   'nb-pedidos',
    's-resena':           'nb-pedidos',
  };
  const all = ['s-home','s-buscar','s-ranking','s-prof','s-publicar','s-miperfil','s-mapa','s-chat','s-chats','s-notif','s-subs','s-analytics','s-pedidos','s-nuevo-pedido','s-detalle-pedido','s-nueva-propuesta','s-confirmacion','s-catalogo','s-ficha-ref','s-catalogo-form','s-edit-perfil','s-estado-propuesta','s-historial','s-tyc','s-loyalty','s-denuncia','s-moderacion','s-loyalty-admin','s-mis-propuestas','s-resena'];

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
    const PANTALLAS_ADMIN = ['s-moderacion', 's-loyalty-admin', 's-catalogo', 's-catalogo-form', 's-ficha-ref'];
    if (PANTALLAS_ADMIN.includes(id) && !esAdmin()) {
      console.warn('[ADMIN] Pantalla "' + id + '" requiere rol admin.');
      showToast && showToast('🛡 Esta sección es solo para administradores');
      return;
    }
    all.forEach(s => {
      const el = document.getElementById(s);
      if (el) { el.classList.remove('active'); el.scrollTop = 0; }
    });
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
    if (id === 's-nuevo-pedido') { npNext(1); }
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
        renderPedidosGuardados();
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
    if (id === 's-chats') { renderChats(); }
    if (id === 's-moderacion') { renderModeracion(); renderConfigAdmin(); }
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
    // Ordenar por rating desc (el score visible)
    prestadores = [...prestadores].sort((a,b) => (b.rating||0) - (a.rating||0));
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
      const estrellas = Math.round(p.rating || 5);
      const stars = Array(5).fill(0).map((_,j) => `<span class="star${j >= estrellas ? ' e' : ''}" style="font-size:10px">★</span>`).join('');
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
            <div class="stars">${stars}</div>
            <span style="font-size:11px;color:var(--ink3)">${p.resenas||0} reseñas</span>
          </div>
        </div>
        <div class="rank-right">
          <div class="rank-pts">${(p.rating||5).toFixed(1)}</div>
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

  function switchLoyalty(tab) {
    ['ganar','canjear','niveles','planes','historial'].forEach(t => {
      const ltEl = document.getElementById('lt-'+t);
      const lvEl = document.getElementById('lv-'+t);
      if (ltEl) ltEl.classList.toggle('on', t===tab);
      if (lvEl) lvEl.style.display = t===tab ? 'block' : 'none';
    });
  }

  async function canjear(btn, costo, nombre, canjeId) {
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
    const nbMapa   = document.getElementById('nb-mapa');
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
    set('prof-rating', (p.rating || 5).toFixed(1));
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
    const estrellas = Math.round(p.rating || 5);
    const stars = Array(5).fill(0).map((_,i) =>
      `<span class="star${i >= estrellas ? ' e' : ''}">★</span>`).join('');
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
          <div class="c-badges"><div class="stars">${stars}</div>
            <span class="rating">${(p.rating||5).toFixed(1)}</span>
            <span class="reviews">(${p.resenas||0})</span>
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
    { id: 'pedido',    label: 'Publicá tu primer pedido',   check: async () => { const p = await PronetDB.listar('pedidos').catch(()=>[]); return p.some(x=>x.usuario_id===usuarioActual?.id); } },
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

  // Slugs de categoría (sin tilde, usados en los onclick del home) que no
  // coinciden con el nombre real del rubro guardado en la base al
  // capitalizarlos ingenuamente (ej: 'jardineria' -> 'Jardineria', pero el
  // rubro real es 'Jardinería'). Sin este mapeo el filtro no encuentra
  // ningún prestador para esos rubros.
  const CAT_SLUG_A_RUBRO = { jardineria: 'Jardinería', plomeria: 'Plomería' };
  function rubroDeCat(cat) {
    return CAT_SLUG_A_RUBRO[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1));
  }
  /** Inverso de rubroDeCat — devuelve el slug de cat para un rubro del prestador */
  function catDeRubro(rubro) {
    if (!rubro) return null;
    const norm = r => r.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const chips = document.querySelectorAll('.rubro[id^="cat-"]');
    for (const chip of chips) {
      const slug = chip.id.replace('cat-', '');
      if (norm(rubroDeCat(slug)) === norm(rubro)) return slug;
    }
    return null;
  }

  async function renderHomeFeed(cat) {
    const wrap = document.getElementById('home-feed-container');
    if (!wrap) return;
    setBannerContextual();
    renderChecklist(); // Checklist de primeros pasos

    // ── Vista PRESTADOR: mostrar pedidos disponibles para ofertar ──
    if (esPrestador()) {
      return renderPedidosDisponibles(cat);
    }

    // ── Vista CLIENTE / INVITADO: mostrar prestadores para contratar ──
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    const filtros = cat && cat !== 'todos' ? { rubro: rubroDeCat(cat) } : {};
    if (zonaActual) filtros.zona = zonaParaFiltro();
    let prestadores = await PronetDB.listarPrestadores(filtros);
    // Aplicar boost por plan y re-ordenar. El privilegio de ranking sale de
    // `desempate` en PRONET_CONFIG.PLANES: 'primero' (Elite) > true (Pro) > sin boost.
    const _boostPro    = window.PRONET_CONFIG?.BOOST_PRO     || 1.4;
    const _boostPrimero = window.PRONET_CONFIG?.BOOST_EMPRESA || 1.6;
    const _boostDePlan = (p) => {
      // Sin plan propio no hereda nada: getPlanConfig() cae a planActual (el del
      // usuario que mira), así que sólo lo consultamos si el prestador tiene plan.
      const des = p.plan ? getPlanConfig(p.plan).desempate : false;
      if (des === 'primero') return _boostPrimero;
      if (des || p.premium)  return _boostPro;
      return 1.0;
    };
    prestadores = prestadores
      .map(p => ({ ...p, _score: (p.rating || 0) * _boostDePlan(p) }))
      .sort((a, b) => b._score - a._score);
    wrap.innerHTML = '';
    // Actualizar meta con conteo real
    const meta = document.getElementById('home-cat-meta');
    const catLabel = cat && cat !== 'todos' ? rubroDeCat(cat) : 'Todos los servicios';
    if (meta) meta.textContent = catLabel + ' · ' + (zonaActual || 'Escobar') + ' · ' + prestadores.length + ' prestador' + (prestadores.length !== 1 ? 'es' : '');
    if (prestadores.length === 0) {
      wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">No hay prestadores en esta categoría aún.</div>';
      return;
    }
    prestadores.forEach(p => wrap.appendChild(crearCardPrestador(p)));
  }

  /** Compara rubros ignorando singular/plural y mayúsculas */
  function matchRubro(rubroA, rubroB) {
    if (!rubroA || !rubroB) return false;
    const a = rubroA.toLowerCase().replace(/s$/, '');
    const b = rubroB.toLowerCase().replace(/s$/, '');
    return a === b;
  }

  // Renderiza pedidos disponibles (vista prestador), filtrados por zona y rubro
  async function renderPedidosDisponibles(cat) {
    const wrap = document.getElementById('home-feed-container');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando pedidos...</div>';
    let pedidos = await PronetDB.listar('pedidos');
    // Solo pedidos publicados
    pedidos = pedidos.filter(p => (p.estado || 'Publicado') === 'Publicado');
    // Excluir los pedidos propios (un prestador no oferta sus propios pedidos)
    if (usuarioActual) pedidos = pedidos.filter(p => p.usuario_id !== usuarioActual.id);
    // Filtrar por zona (comparando zona-madre en ambos lados)
    const zonaFiltro = zonaParaFiltro();
    if (zonaFiltro) {
      pedidos = pedidos.filter(p => {
        const zonaPedido = p.zona || 'Escobar';
        const madrePedido = ZONA_DB[zonaPedido] || zonaPedido;
        return madrePedido === zonaFiltro;
      });
    }
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
            ${fotos.map(url => `<img src="${url}" style="width:90px;height:90px;object-fit:cover;border-radius:10px;flex-shrink:0;cursor:pointer" onclick="window.open('${url}','_blank')">`).join('')}
          </div>`;
      } else {
        fotosWrap.style.display = 'none';
        fotosWrap.innerHTML = '';
      }
    }
    goTo('s-detalle-pedido');
  }

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

    // Ref PRONET desde catálogo
    let refTxt = null;
    try {
      const rango = SLIDER_RANGOS && pedido.rubro ? SLIDER_RANGOS[pedido.rubro] : null;
      if (rango) refTxt = '$' + rango.min.toLocaleString('es-AR') + ' – $' + rango.max.toLocaleString('es-AR');
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
      html += '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#F0FDF4;border-radius:12px;margin-bottom:10px">';
      html += '<div style="font-size:24px">📈</div>';
      html += '<div><div style="font-size:13px;font-weight:700;color:var(--ink)">Ref. PRONET: ' + refTxt + '</div>';
      html += '<div style="font-size:11px;color:var(--ink3)">Rango de precios del mercado para este rubro</div></div></div>';
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
    prestadores = [...prestadores].sort((a,b) => (b.rating||0)-(a.rating||0)).slice(0, PRONET_CONFIG.SUGERIDOS_PEDIDO);
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
          <div style="margin-left:auto;background:var(--gold-s);color:#92400E;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">⭐ ${(p.rating||5).toFixed(1)}</div>
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
    const chats = await PronetDB.listarChats();
    chatsCache = chats;
    const noLeidos = await PronetDB.contarNoLeidos().catch(() => 0);
    if (badge) {
      if (noLeidos > 0) { badge.textContent = noLeidos + ' nuevo' + (noLeidos > 1 ? 's' : ''); badge.style.display = ''; }
      else badge.style.display = 'none';
    }
    renderizarListaChats(chatsCache);
  }

  // Renderiza el panel de moderación dinámicamente
  async function renderModeracion(filtro = 'todas') {
    if (!await verificarAdminServidor()) return;
    const listaEl = document.getElementById('mod-lista');
    if (!listaEl) return;
    listaEl.innerHTML = '<div style="padding:40px 24px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    try {
      const { data: todas } = await window._sb.from('denuncias')
        .select('*, perfiles!denunciado_id(nombre, prestador_id, prestadores(id, suspendido, denuncias_confirmadas))')
        .order('creado', { ascending: false });
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
        const badgeHTML = d.estado === 'pendiente'
          ? '<div class="badge-suspendido">🔴 Pendiente</div>'
          : d.estado === 'en_revision'
          ? '<div class="badge-revision">⚠️ En revisión</div>'
          : '<div style="background:var(--green-s);color:var(--green);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Resuelta</div>';
        const hace = d.creado ? tiempoRelativo(d.creado) : '';
        const perfil = d.perfiles || {};
        const prestadorInfo = perfil.prestadores || {};
        const prestadorId = perfil.prestador_id || prestadorInfo.id || null;
        const suspendido = !!prestadorInfo.suspendido;
        const nDenuncias = prestadorInfo.denuncias_confirmadas || 0;
        const nombreDenunciado = perfil.nombre ? `<span style="font-size:12px;color:var(--ink2)">Denunciado: <b>${escHTML(perfil.nombre)}</b>${nDenuncias > 0 ? ` · ${nDenuncias} denuncia/s confirmada/s` : ''}</span>` : '';
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
          ${nombreDenunciado ? `<div style="margin-bottom:6px">${nombreDenunciado}</div>` : ''}
          <div class="mod-desc">${escHTML(d.detalle || 'Sin detalle')}</div>
          ${d.estado !== 'resuelta' ? `
          <div class="mod-actions">
            <button class="mod-btn mod-btn-suspend" onclick="accionDenuncia('${d.id}','resuelta','baja')">Confirmar baja</button>
            <button class="mod-btn mod-btn-info" onclick="accionDenuncia('${d.id}','en_revision','contacto')">Contactar partes</button>
            <button class="mod-btn mod-btn-ok" onclick="accionDenuncia('${d.id}','resuelta','desestimada')">Desestimar</button>
          </div>` : ''}
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
            <button onclick="eliminarCanjeAdmin('${i.id}','${escHTML(i.nombre).replace(/'/g,"\\'")}')" style="background:var(--surface);border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:13px">🗑️</button>
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

  async function eliminarCanjeAdmin(id, nombre) {
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

  async function accionDenuncia(id, nuevoEstado, tipo) {
    const labels = { baja: 'Baja confirmada', contacto: 'Partes contactadas', desestimada: 'Denuncia desestimada' };
    try {
      if (tipo === 'baja') {
        // Usa RPC SECURITY DEFINER: marca resuelta + incrementa contador + auto-suspende si >= 3
        const { data, error } = await window._sb.rpc('confirmar_baja_prestador', { p_denuncia_id: id });
        if (error) throw error;
        if (data?.suspendido) {
          showToast && showToast('🚫 Prestador suspendido automáticamente (3 denuncias confirmadas)', null, true);
        } else {
          showToast && showToast('✅ Baja confirmada (' + (data?.denuncias || '?') + ' denuncia/s)');
        }
      } else {
        const { error } = await window._sb.from('denuncias').update({ estado: nuevoEstado }).eq('id', id);
        if (error) throw error;
        showToast && showToast('✅ ' + (labels[tipo] || 'Actualizado'));
      }
      renderModeracion();
      cargarBadgeDenuncias && cargarBadgeDenuncias();
    } catch (e) {
      const esConectividad = e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError');
      showToast && showToast(esConectividad ? '⚠️ Sin conexión. Intentá de nuevo.' : '❌ Error al actualizar: ' + (e?.message || 'intentá de nuevo'));
    }
  }

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
      `<div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer" onclick="abrirFotoModal('${escHTML(f.url)}')">
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
      `<div style="flex-shrink:0;width:72px;height:72px;border-radius:8px;overflow:hidden;cursor:pointer;position:relative" onclick="abrirFotoModal('${escHTML(f.url)}')">
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
    try {
      const fichas = await PronetDB.listarCatalogo(true);
      fichas.forEach(f => { if (f.rubro && f.precio_ref_min && f.precio_ref_max) SLIDER_RANGOS[f.rubro] = { min: f.precio_ref_min, max: f.precio_ref_max }; });
    } catch(e) { console.warn('[cargarSliderRangosDesdeDB]', e); }
  }

  // Ajusta el banner del Home según el tipo de usuario
  function setBannerContextual() {
    const icon = document.getElementById('home-banner-icon');
    const title = document.getElementById('home-banner-title');
    const sub = document.getElementById('home-banner-sub');
    if (!title || !sub) return;
    const tipo = usuarioActual ? usuarioActual.tipo : 'invitado';
    if (esPrestador()) {
      // Prestador: invitarlo a completar su perfil / ver pedidos
      if (icon) icon.textContent = '💼';
      title.textContent = 'Mirá los pedidos disponibles';
      sub.textContent = 'Ofertá y conseguí nuevos clientes en tu zona →';
    } else if (tipo === 'cliente') {
      // Vecino logueado: invitarlo a publicar un pedido
      if (icon) icon.textContent = '📋';
      title.textContent = '¿Necesitás un servicio?';
      sub.textContent = 'Publicá tu pedido gratis y recibí propuestas →';
    } else {
      // Invitado: invitarlo a registrarse
      if (icon) icon.textContent = '🚀';
      title.textContent = 'Sumate a PRONET gratis';
      sub.textContent = 'Registrate para publicar pedidos y contactar prestadores →';
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
        <div class="sc-dist">⭐ ${(p.rating||5).toFixed(1)} · ${escHTML(p.zona||'Escobar')}${badgePrem}</div>
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

  // Permite activar/desactivar cada feature suelta sin arrastrar un nivel
  // completo (ej: probar loyalty sin denuncias).
  const FLAG_LABELS = {
    bolsaTrabajo:       { label: 'Bolsa de trabajo',    grupo: 'Nivel 1' },
    tutorialOnboarding: { label: 'Tutorial onboarding', grupo: 'Nivel 1' },
    badgeVerificado:    { label: 'Badge verificado',    grupo: 'Nivel 2' },
    // Distinto de planes_pagos_activos (config_app, editable desde Moderación):
    // esto solo decide si la SECCIÓN existe en el build/demo, no si se puede
    // comprar. Si cualquiera de los dos está apagado, Suscripción se oculta.
    suscripcionPro:     { label: 'Sección Suscripción (demo)', grupo: 'Nivel 2' },
    catalogoPrecios:    { label: 'Catálogo de precios', grupo: 'Nivel 2' },
    editarPerfilPro:    { label: 'Editar perfil pro',   grupo: 'Nivel 2' },
    denuncias:          { label: 'Denuncias',           grupo: 'Nivel 2' },
    loyalty:            { label: 'PRONET Points',       grupo: 'Nivel 3' },
    analyticsAvanzado:  { label: 'Analítica avanzada',  grupo: 'Nivel 3' },
    mostrarSelectorDemo:{ label: 'Selector demo login', grupo: 'Demo' },
    // panelConfiguracion se excluye a propósito: apagarlo desde adentro
    // del propio panel te dejaría sin forma de volver a abrirlo.
  };
  let flagsPersonalizados = false;

  function renderFlagToggles() {
    const wrap = document.getElementById('dev-flags');
    if (!wrap) return;
    wrap.innerHTML = '';
    let grupoActual = null;
    Object.keys(FLAG_LABELS).forEach(key => {
      const meta = FLAG_LABELS[key];
      if (meta.grupo !== grupoActual) {
        grupoActual = meta.grupo;
        const g = document.createElement('div');
        g.textContent = grupoActual;
        g.style.cssText = 'font-size:8px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin:6px 0 3px';
        wrap.appendChild(g);
      }
      const on = FEATURES[key];
      const row = document.createElement('div');
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', on ? 'true' : 'false');
      row.setAttribute('tabindex', '0');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:7px;cursor:pointer;margin-bottom:3px;background:' + (on ? 'rgba(57,255,20,.08)' : 'rgba(255,255,255,.04)');
      const lbl = document.createElement('span');
      lbl.textContent = meta.label;
      lbl.style.cssText = 'font-size:11px;font-weight:600;color:' + (on ? 'white' : 'rgba(255,255,255,.45)');
      const dot = document.createElement('span');
      dot.textContent = on ? '●' : '○';
      dot.style.cssText = 'font-size:12px;color:' + (on ? '#39FF14' : 'rgba(255,255,255,.3)');
      row.appendChild(lbl);
      row.appendChild(dot);
      row.addEventListener('click', () => toggleFeature(key));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFeature(key); } });
      wrap.appendChild(row);
    });
  }

  function toggleFeature(key) {
    FEATURES[key] = !FEATURES[key];
    flagsPersonalizados = true;
    aplicarFeatureFlags();
    // Si la pantalla activa quedó deshabilitada, volver a Home
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && !isScreenEnabled(activeScreen.id)) goTo('s-home');
    const status = document.getElementById('dev-panel-status');
    if (status) status.textContent = 'Nivel: personalizado';
    renderFlagToggles();
    guardarEstado();
  }

  // ── Persistencia de estado (Punto 2 del plan) ────────────────────────
  // Guarda nivel de features, zona y tipo de usuario para que sobrevivan
  // a la recarga. Protegido con try/catch: en entornos que bloquean
  // localStorage (sandbox, artifacts, cookies deshabilitadas) la app
  // sigue funcionando solo en memoria, sin romper nada.
  const STORAGE_KEY = 'pronet-estado-v1';
  let nivelActual = 3;

  function guardarEstado() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        nivel: nivelActual,
        flags: { ...FEATURES },        // Punto 3: snapshot de flags individuales
        personalizado: flagsPersonalizados,
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
    // Flags: si el usuario personalizó toggles individuales, restaurar el
    // snapshot exacto; si no, alcanza con re-aplicar el nivel guardado.
    if (est.personalizado && est.flags && typeof est.flags === 'object') {
      Object.keys(FEATURES).forEach(k => {
        if (k === 'panelConfiguracion') return; // nunca restaurar apagado el panel
        if (typeof est.flags[k] === 'boolean') FEATURES[k] = est.flags[k];
      });
      flagsPersonalizados = true;
      if (typeof est.nivel === 'number') nivelActual = est.nivel;
      aplicarFeatureFlags();
      const status = document.getElementById('dev-panel-status');
      if (status) status.textContent = 'Nivel: personalizado';
      renderFlagToggles();
    } else if (est.nivel === 1 || est.nivel === 2 || est.nivel === 3) {
      setNivel(est.nivel);
    }
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
    flagsPersonalizados = false; // volver a un preset limpia la personalización
    renderFlagToggles();         // reflejar el preset en los toggles individuales
    guardarEstado(); // persistir nivel elegido
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

  async function cargarEdicionPrestador() {
    const esPrestador = usuarioActual && usuarioActual.prestador_id;
    // Las secciones de prestador se ocultan para clientes
    ['edit-desc-field','edit-esp-field','edit-pagos-field'].forEach(fid => {
      const f = document.getElementById(fid); if (f) f.style.display = esPrestador ? '' : 'none';
    });
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
      const perfilNuevo = await PronetDB.actualizar('perfiles', usuarioActual.id, perfilCambios);
      if (perfilNuevo) { usuarioActual.nombre = nombre; usuarioActual.telefono = telefono; if (fotoPerfilNueva) usuarioActual.foto_url = fotoPerfilNueva; }
      // 2. Fila del prestador (si lo es)
      if (usuarioActual.prestador_id) {
        const especialidades = Array.from(document.querySelectorAll('#edit-especialidades .sub-opt.on')).map(e => e.dataset.esp);
        const medios_pago = Array.from(document.querySelectorAll('#edit-pagos .pago-opt.on')).map(e => e.dataset.pago);
        const iniciales = nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const cambios = {
          nombre, iniciales,
          descripcion: val('edit-desc'),
          especialidades,
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
  let planActual    = 'base'; // 'base' | 'plus' | 'pro' | 'elite'
  let periodoActual = 'anual'; // 'mensual' | 'anual'

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
  async function quieroSerPrestador() {
    if (!usuarioActual) {
      // Invitado → registro con tipo prestador pre-seleccionado
      const radioP = document.querySelector('input[name="reg-tipo"][value="prestador"]');
      if (radioP) radioP.checked = true;
      document.getElementById('login-screen').classList.remove('hidden');
      mostrarFormRegistro();
      return;
    }
    // Vecino logueado sin perfil prestador → sumar el rol de prestador.
    // NO se toca `tipo`: antes esto hacía update({tipo:'prestador'}) y como
    // tieneDoblePerfil() exige tipo!=='prestador', el vecino perdía su vista
    // de vecino para siempre — no podía volver a publicar pedidos ni le
    // aparecía el toggle. El rol de prestador lo habilita `prestador_id`,
    // que es lo que esPrestador() mira, así que queda con doble perfil.
    if (!window._sb) { showToast('Sin conexión'); return; }
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
    const nbMapa   = document.getElementById('nb-mapa');
    const btnPub   = document.getElementById('btn-publicar-pedido');
    const esPresta = esPrestador();
    if (nbBuscar) nbBuscar.style.display = esPresta ? 'none' : '';
    if (nbMapa)   nbMapa.style.display   = esPresta ? 'none' : '';
    if (btnPub)   btnPub.style.display   = esPresta ? 'none' : '';
    reflejarUsuario();
    goTo('s-home');
  }
  window.toggleModoRol = toggleModoRol;

  function esPro() {
    return planActual === 'plus' || planActual === 'pro' || planActual === 'elite';
  }

  function getPlanConfig(id) {
    const planes = (window.PRONET_CONFIG || {}).PLANES || [];
    return planes.find(p => p.id === (id || planActual)) || planes[0] || {};
  }

  /** Badge del plan de un prestador para las cards de búsqueda.
   *  Sólo los planes con badge_busqueda lo muestran (hoy Pro y Elite).
   *  Recibe el plan del prestador, no el del usuario que mira. */
  function badgePlanPrestador(plan) {
    if (!plan) return '';
    const planes = (window.PRONET_CONFIG || {}).PLANES || [];
    const cfg = planes.find(p => p.id === plan);
    if (!cfg || !cfg.badge_busqueda) return '';
    const clase = plan === 'elite' ? 'b-elite' : 'b-pro';
    return `<span class="badge ${clase}">${cfg.emoji} ${escHTML(cfg.badge_label)}</span>`;
  }

  // Config global de la app (tabla config_app). Se carga al iniciar.
  let configApp = {};
  let configCargada = false;

  /** ¿Los planes pagos están habilitados? Lo controla el admin. */
  function planesPagosActivos() {
    return configApp.planes_pagos_activos === 'true';
  }

  /** Plan cuyos límites aplican realmente.
   *  En prelanzamiento (pagos desactivados) Base recibe los límites de Plus:
   *  el número no es arbitrario, es el mismo que después se vende. Los planes
   *  superiores nunca se degradan. Misma regla que plan_para_limites() en SQL. */
  function planParaLimites(plan) {
    if (planesPagosActivos()) return plan;
    return plan === 'base' ? 'plus' : plan;
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
        : actual === 1 ? 'Con Pro sumás ranking por zona, embudo de contacto y de dónde vienen tus visitas.'
        :                'Con Elite podés descargar tu historial de trabajos en CSV, con montos y calificaciones.';
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
      showToast && showToast('⚠️ La exportación está disponible en el plan Elite.');
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

  /** Pinta el estado del interruptor de planes pagos en el panel admin. */
  function renderConfigAdmin() {
    const chk = document.getElementById('cfg-planes-pagos');
    const est = document.getElementById('cfg-planes-estado');
    const on  = planesPagosActivos();
    if (chk) chk.checked = on;
    if (est) {
      est.textContent = on
        ? 'Activados · los usuarios pueden contratar Plus, Pro y Elite'
        : 'Desactivados · etapa fundadora, solo Base con límites de Plus';
      est.style.color = on ? 'var(--green)' : 'var(--ink3)';
    }
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

  // Superficie de test: funciones puras del sistema de planes, para que los
  // specs de Playwright puedan verificarlas sin depender del estado de la DB.
  window._planesAPI = {
    getPlanConfig,
    planParaLimites,
    planesPagosActivos,
    limitePlan,
    badgePlanPrestador,
    planActual:  () => planActual,
    configApp:   () => ({ ...configApp }),
    // Los specs deben esperar esto: _planesAPI existe al parsear el script,
    // pero la config se carga async y reflejarPlan() corre después.
    configCargada: () => configCargada,
    // Señal distinta y posterior: la config se carga ANTES de resolver la
    // sesión. Un spec que navegue apenas configCargada() da true puede pegarle
    // a goTo() con usuarioActual todavía en null y comerse el gate de invitado.
    sesionLista: () => !!usuarioActual,
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
    const ids = ['base','plus','pro','elite'];
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
        if (id !== 'elite') btn.style.cssText = '';
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
          if (id === 'elite') btn.style.cssText = 'background:linear-gradient(135deg,#92400E,#D97706);border:none';
          else btn.style.cssText = '';
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
    const nbMapa   = document.getElementById('nb-mapa');
    const btnPub   = document.getElementById('btn-publicar-pedido');
    if (esPrestador()) {
      if (nbBuscar) nbBuscar.style.display = 'none';
      if (nbMapa)   nbMapa.style.display   = 'none';
      if (btnPub)   btnPub.style.display   = 'none';
    } else {
      if (nbBuscar) nbBuscar.style.display = '';
      if (nbMapa)   nbMapa.style.display   = '';
      if (btnPub)   btnPub.style.display   = '';
    }
    if (!usuarioActual) return;
    const nombre = usuarioActual.nombre || 'Usuario';
    const inic = inicialesDe(nombre);
    const tipo = admin ? 'Administrador' : (esPrestador() ? 'Prestador' : 'Cliente');
    const zona = usuarioActual.zona || 'Escobar';

    // Ocultar PRONET Points para admin o si el feature está desactivado
    const loyaltyTile = document.querySelector('[data-feature="loyalty"]');
    if (loyaltyTile) loyaltyTile.style.display = (esAdmin() || !FEATURES.loyalty) ? 'none' : '';
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
  }

  // ── Mensajes no leídos (dinámico) ──────────────────────────────────
  async function cargarBadgeMensajes() {
    const subEl = document.getElementById('mp-mensajes-sub');
    const dotEl = document.getElementById('mp-mensajes-dot');
    if (!subEl) return;
    try {
      const count = await PronetDB.contarNoLeidos();
      if (count > 0) {
        subEl.textContent = count + ' mensaje' + (count > 1 ? 's' : '') + ' sin leer';
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
      const emoji = niv === 'Oro' ? '🥇' : niv === 'Plata' ? '🥈' : '🥉';
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
              <button class="canje-btn" onclick="canjear(this,${i.costo_puntos},'${escHTML(i.nombre).replace(/'/g,"\\'")}','${i.id}')">Canjear</button>
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
      const miRubro = miPerfil.rubro || '';
      const miZona = miPerfil.zona || 'Escobar';
      // Traer todos los prestadores del mismo rubro
      const todos = await PronetDB.listarPrestadores({ rubro: miRubro });
      const ordenados = [...todos].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      // Encontrar la posición del prestador actual
      const pos = ordenados.findIndex(p => p.id === usuarioActual.prestador_id) + 1;
      // Generar cards
      wrap.innerHTML = '';
      if (pos > 0) {
        const card = document.createElement('div');
        card.className = 'my-rank-card';
        card.innerHTML = '<div class="mr-pos">#' + pos + '</div>'
          + '<div class="mr-cat">' + escHTML(miRubro) + '</div>'
          + '<div class="mr-zona">' + escHTML(miZona) + '</div>';
        wrap.appendChild(card);
      }
      // Ranking general (todos los rubros, misma zona)
      const todosZona = await PronetDB.listarPrestadores({ zona: miZona });
      const ordZona = [...todosZona].sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const posGeneral = ordZona.findIndex(p => p.id === usuarioActual.prestador_id) + 1;
      if (posGeneral > 0) {
        const card2 = document.createElement('div');
        card2.className = 'my-rank-card';
        card2.innerHTML = '<div class="mr-pos">#' + posGeneral + '</div>'
          + '<div class="mr-cat">General</div>'
          + '<div class="mr-zona">' + escHTML(miZona) + '</div>';
        wrap.appendChild(card2);
      }
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
  function mostrarFormRegistro() {
    const modal = document.getElementById('registro-modal');
    if (modal) modal.style.display = 'flex';
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) { err.textContent = 'El email no tiene un formato válido'; err.style.display='block'; } return; }
    if (pw.length < 8) { if (err) { err.textContent = 'La contraseña debe tener al menos 8 caracteres'; err.style.display='block'; } return; }
    if (nombre.trim().split(/\s+/).length < 2) { if (err) { err.textContent = 'Ingresá nombre y apellido'; err.style.display='block'; } return; }

    const btn = document.getElementById('reg-submit');
    if (btn) btn.innerHTML = 'Creando cuenta...';
    const res = await PronetDB.registrar(email, pw, nombre, tipo, zonaActual);
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
      const icono = { pedido:'📋', propuesta:'📬', mensaje:'💬', cancelacion:'❌', terminado:'✅', resena:'⭐', general:'🔔' }[n.tipo] || '🔔';
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

  async function npFinalizar() {
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

    const pedido = await PronetDB.crear('pedidos', {
      titulo: titulo,
      descripcion: desc,
      rubro: rubroEl ? rubroEl.textContent : 'Servicio',
      icono: iconEl ? iconEl.textContent : '📋',
      zona: zonaActual,
      estado: 'Publicado',
      urgencia: urgencia,
      presupuesto_min: precioMin,
      presupuesto_max: precioMax,
      usuario_id: usuarioActual ? usuarioActual.id : null,
      fotos: [],
    });
    // Subir fotos si hay, y actualizar el pedido con las URLs
    if (pedido && npFotosArchivos.length > 0) {
      const urls = await npSubirFotos(pedido.id);
      if (urls.length > 0) {
        await PronetDB.actualizar('pedidos', pedido.id, { fotos: urls });
        pedido.fotos = urls;
      }
    }
    // Push a los prestadores del rubro (no bloquea el flujo si falla)
    if (pedido && PronetDB.esRemoto()) {
      PronetDB.notificar({
        destino: 'prestadores_rubro',
        rubro: pedido.rubro,
        tipo: 'pedido',
        titulo: '🔔 Nuevo pedido en tu rubro',
        cuerpo: (pedido.titulo || 'Un vecino necesita tu servicio') + ' · ' + (pedido.zona || ''),
        url: '/#pedidos',
      }).catch((e) => { console.warn('[Push] notificar pedido:', e); });
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
      } else { pedidos=await PronetDB.listar('pedidos'); }
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
      if(nProps>0){const pb=document.createElement('button');pb.textContent='📬 '+nProps+' propuesta'+(nProps!==1?'s':'')+' recibida'+(nProps!==1?'s':'')+' — Ver y comparar →';pb.style.cssText='width:100%;margin-top:10px;font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-s);border:1.5px solid #C7D5FF;border-radius:10px;padding:9px;cursor:pointer;font-family:inherit';pb.addEventListener('click',(e)=>{e.stopPropagation();abrirDetallePedido(p.usuario_id ? p : { ...p, usuario_id: usuarioActual?.id });});card.appendChild(pb);}

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
    // Ranking por zona — cálculo en tiempo real
    const rankZonaWrap = document.getElementById('ranking-zonas');
    if (rankZonaWrap && usuarioActual?.prestador_id) {
      let rubroPrestador = '';
      const pData = await PronetDB.obtener('prestadores', usuarioActual.prestador_id).catch(() => null);
      rubroPrestador = pData?.rubro || '';
      if (rubroPrestador) {
        const ranking = await PronetDB.obtenerRankingPrestador(usuarioActual.prestador_id, rubroPrestador).catch(() => []);
        if (ranking.length) {
          rankZonaWrap.innerHTML = ranking.map(r => `
            <div class="zona-row">
              <div class="zona-name">${escHTML(r.zona)}</div>
              <div class="zona-prog-wrap"><div class="zona-prog" style="width:${r.pct}%"></div></div>
              <div class="zona-rank">#${r.posicion}</div>
              <div class="zona-val">de ${r.total} prestadores</div>
            </div>`).join('');
        } else {
          rankZonaWrap.innerHTML = '<div style="text-align:center;padding:16px;color:#999;font-size:13px">Sin datos de ranking aún</div>';
        }
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

  function confirmarPago() {
    const btnConfirmar = document.querySelector('#checkout-overlay .btn-p');
    if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.textContent = 'Activando…'; }

    // Congelar el plan elegido: el upsert de abajo corre async y para entonces
    // el usuario pudo haber abierto otro checkout.
    const planElegido    = currentCheckoutPlan;
    const periodoElegido = currentBilling;

    planActual    = planElegido;
    periodoActual = periodoElegido;
    reflejarPlan();

    document.getElementById('checkout-overlay').classList.remove('show');
    const cfg = getPlanConfig(planActual);
    setTimeout(() => {
      if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.textContent = 'Confirmar pago seguro 🔒'; }
      const titleEl = document.getElementById('subs-success-title');
      const subEl   = document.getElementById('subs-success-sub');
      if (titleEl) titleEl.textContent = '¡Plan ' + cfg.nombre + ' activado!';
      if (subEl)   subEl.textContent   = 'Tu loyalty boost ×' + cfg.loyalty_boost + ' ya está activo.';
      document.getElementById('subs-success').classList.add('show');
    }, 300);

    // Persistir en Supabase en background
    if (window._sb) {
      PronetDB.usuarioIdActual().then(uid => {
        if (!uid) return;
        const vence = new Date();
        vence.setMonth(vence.getMonth() + (periodoElegido === 'anual' ? 12 : 1));
        window._sb.from('suscripciones').upsert({
          usuario_id: uid,
          plan: planElegido,
          estado: 'activo',
          periodo: periodoElegido,
          activado_en: new Date().toISOString(),
          vence_en: vence.toISOString()
        }, { onConflict: 'usuario_id' }).then(({ error }) => {
          if (error) console.warn('[subs] Error al guardar suscripción:', error.message);
        });
      });
    }
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
  function filtrarChats(chipEl, filtro) {
    chatsFiltroActual = filtro;
    document.querySelectorAll('#chats-filtros .chip').forEach(c => c.classList.remove('on'));
    if (chipEl) chipEl.classList.add('on');
    renderizarListaChats(chatsCache);
  }

  function renderizarListaChats(chats) {
    const lista = document.getElementById('chats-lista');
    const vacio = document.getElementById('chats-vacio');
    if (!lista) return;
    // Deduplicar por id por si Supabase devuelve la misma fila más de una vez
    const unicos = [...new Map(chats.map(c => [c.id, c])).values()];
    const filtrados = chatsFiltroActual === 'todos'
      ? unicos
      : unicos.filter(c => c.estado === chatsFiltroActual);
    lista.innerHTML = '';
    if (filtrados.length === 0) {
      if (vacio) vacio.style.display = '';
      return;
    }
    if (vacio) vacio.style.display = 'none';
    const secLabel = document.createElement('div');
    secLabel.style.cssText = 'padding:10px 16px 6px;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.6px';
    secLabel.textContent = chatsFiltroActual === 'todos' ? 'Conversaciones activas' : 'Filtrado por: ' + chatsFiltroActual;
    lista.appendChild(secLabel);
    filtrados.forEach(c => {
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
      item.innerHTML = `
        <div class="ci-av-wrap">
          <div class="ci-av" style="background:#EEF2FF;color:#2B5BFF">${escHTML((c.prestador_iniciales||'??').slice(0,2).toUpperCase())}</div>
          ${['activo','consulta','propuesta_enviada'].includes(c.estado) ? '<div class="ci-online"></div>' : ''}
        </div>
        <div class="ci-body">
          <div class="ci-top">
            <div class="ci-name">${escHTML(c.prestador_nombre||'Prestador')}</div>
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
        if (nameEl) nameEl.textContent = c.prestador_nombre || 'Prestador';
        if (avEl) { avEl.innerHTML = (c.prestador_iniciales||'??').slice(0,2).toUpperCase(); avEl.style.background='#EEF2FF'; avEl.style.color='#2B5BFF'; }
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
        await actualizarBannersChat(chatActualId);
        if (chatSuscripcion) chatSuscripcion();
        chatSuscripcion = PronetDB.suscribir('mensajes_chat', (payload) => {
          if (payload.new && payload.new.chat_id === chatActualId) {
            const esPropio = payload.new.autor_id === usuarioActual.id;
            if (!esPropio) { agregarBurbuja(payload.new.texto, payload.new.creado, false, payload.new.id); PronetDB.marcarLeidos(chatActualId); }
          }
        });
      });
      lista.appendChild(item);
    });
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
      const imp = document.getElementById('rev-impacto');
      if (imp) {
        const primerNombre = (p.nombre || 'El prestador').split(' ')[0];
        imp.innerHTML =
          '<div>⭐ ' + escHTML(primerNombre) + ' mantiene su puntuación de <strong>' + (p.rating || 5).toFixed(1) + '</strong> (' + ((p.resenas || 0) + 1) + ' reseñas)</div>' +
          '<div>🏆 Refuerza su posición en <strong>' + escHTML(p.zona || 'Escobar') + ' · ' + escHTML(p.rubro || 'Servicios') + '</strong></div>' +
          '<div>👥 Tu recomendación suma <strong>+1 punto extra</strong> al score zonal</div>';
      }
    }
  }

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

    // Notificar al prestador
    if (prestadorActual) {
      const destinatarioId = await PronetDB.usuarioIdDePrestador(prestadorActual.id).catch(() => null);
      if (destinatarioId) {
        PronetDB.notificar({
          destino: 'usuario',
          usuario_id: destinatarioId,
          tipo: 'resena',
          titulo: '⭐ Recibiste una reseña de ' + puntos + ' estrella' + (puntos > 1 ? 's' : ''),
          cuerpo: textoFinal.slice(0, PRONET_CONFIG.NOTIF_CUERPO_MAX) || 'Un vecino calificó tu trabajo',
          url: '/#s-miperfil',
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
  // y lo muestra en el bloque ref-inline del formulario de propuesta
  async function cargarRefPrecio(rubro) {
    const refEl   = document.getElementById('np-ref-inline');
    const refNota = document.getElementById('np-ref-nota');
    if (!refEl) return;
    try {
      const ficha = await PronetDB.obtenerFichaPorRubro(rubro);
      if (!ficha?.precio_ref_min) {
        refEl.style.display = 'none';
        if (refNota) refNota.style.display = 'none';
        return;
      }
      const minTotal = ficha.precio_ref_min;
      const maxTotal = ficha.precio_ref_max || ficha.precio_ref_min;
      const unidad   = ficha.precio_unidad || 'visita';
      if (typeof configurarLimitesSlider === 'function') {
        configurarLimitesSlider(minTotal, maxTotal, rubro);
      }
      refEl.textContent = '💡 Precio ref. PRONET para ' + rubro + ': $'
        + minTotal.toLocaleString('es-AR') + '–$'
        + maxTotal.toLocaleString('es-AR') + ' / ' + unidad;
      refEl.style.display = '';
      if (refNota) {
        refNota.textContent = '⚠️ Referencial basado en precios habituales del rubro. Puede variar según complejidad.';
        refNota.style.display = '';
      }
    } catch(e) {
      refEl.style.display = 'none';
      if (refNota) refNota.style.display = 'none';
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
      const cupo = await puedeEnviarPropuesta();
      if(!cupo.ok){
        avisarLimitePlan('Ya enviaste tus ' + cupo.limite + ' propuestas de este mes');
        return;
      }
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

    // Banda referencial (zona verde azulada del catálogo)
    const band = document.getElementById('np-slider-ref-band');
    if (band && npRefMax > npRefMin) {
      const base = SLIDER_RANGOS[npRubroActual] || SLIDER_RANGOS['_default'];
      const refPosMin = ((base.min - npRefMin) / (npRefMax - npRefMin)) * 100;
      const refPosMax = ((base.max - npRefMin) / (npRefMax - npRefMin)) * 100;
      band.style.left = (12 + (Math.max(0,refPosMin) / 100) * anchoWrap) + 'px';
      band.style.width = (((Math.min(100,refPosMax) - Math.max(0,refPosMin)) / 100) * anchoWrap) + 'px';
      band.title = 'Zona habitual: $' + base.min.toLocaleString('es-AR') + '–$' + base.max.toLocaleString('es-AR');
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
      precio = 0; // se define después
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
          url: '/#propuestas',
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

    // — Ref PRONET desde catálogo —
    let refTxt = null;
    try {
      const rango = SLIDER_RANGOS && pedido.rubro ? SLIDER_RANGOS[pedido.rubro] : null;
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
    try{const pr=await PronetDB.listarPrestadores({});pr.forEach(x=>{porId[x.id]=x;});}catch(e){}
    const t=document.getElementById('pd-props-title'),s=document.getElementById('pd-props-sub'),f=document.getElementById('pd-props-foot');
    const hayElegida=props.some(pr=>pr.estado==='elegida');
    if(t) t.textContent=hayElegida?'✅ Prestador elegido':'📬 Propuestas recibidas ('+props.length+')';
    if(s) s.textContent=hayElegida?'Este pedido ya está cerrado':'Compará precio, plazo y reputación antes de elegir';
    if(f) f.style.display='none';
    const peso={elegida:0,pendiente:1,rechazada:2};
    props.sort((a,b)=>(peso[a.estado]-peso[b.estado])||(a.precio-b.precio));
    wrap.innerHTML='';
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
  async function abrirMisResenas(){
    if(!usuarioActual||!usuarioActual.prestador_id){alert('Tu perfil de prestador no está completo todavía.');return;}
    try{const yo=await PronetDB.obtener('prestadores',usuarioActual.prestador_id);if(yo)abrirPerfilPrestador(yo);else alert('No se encontró tu perfil.');}catch(e){alert('No se pudo cargar tu perfil.');}
  }
  async function abrirMisPropuestas(){
    if(!usuarioActual||!usuarioActual.prestador_id){alert('Tu perfil de prestador no está completo todavía.');return;}
    // Guardar la pantalla de origen para el back
    window._misPropuestasOrigen = document.querySelector('.screen.active')?.id || 's-miperfil';
    goTo('s-mis-propuestas');
    const wrap=document.getElementById('mp-lista');if(!wrap)return;
    wrap.innerHTML='<div style="padding:24px 14px;text-align:center;font-size:13px;color:var(--ink3)">⏳ Cargando...</div>';
    let mias=[],pedidos=[];
    try{const[props,peds]=await Promise.all([PronetDB.listar('propuestas'),PronetDB.listar('pedidos')]);mias=props.filter(pr=>pr.prestador_id===usuarioActual.prestador_id);pedidos=peds;}catch(e){wrap.innerHTML='<div style="padding:24px;text-align:center;color:#BE123C">⚠️ No se pudieron cargar tus propuestas.</div>';return;}
    if(mias.length===0){wrap.innerHTML='<div style="padding:32px 14px;text-align:center;font-size:13px;color:var(--ink3)">Todavía no enviaste propuestas.</div>';return;}
    const peso={elegida:0,pendiente:1,retirada:2,rechazada:3};
    mias.sort((a,b)=>(peso[a.estado]-peso[b.estado])||(new Date(b.creado)-new Date(a.creado)));
    const CHIP={elegida:'<span style="background:#DCFCE7;color:#16A34A;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">✅ ¡Te eligieron!</span>',pendiente:'<span style="background:var(--gold-s);color:#92400E;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">⏳ Pendiente</span>',rechazada:'<span style="background:var(--surface,#F1F5F9);color:var(--ink3);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">No elegida</span>',retirada:'<span style="background:var(--surface,#F1F5F9);color:var(--ink3);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">Retirada</span>'};
    wrap.innerHTML='';
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
  renderFlagToggles();
  habilitarAccesibilidadTeclado();
  restaurarEstado();
  renderPedidosGuardados();

  // ── Restaurar sesión y renderizar el Home con el usuario correcto ──
  // renderHomeFeed va DENTRO de restaurarSesion para evitar el flash de
  // contenido de invitado al abrir la PWA en iOS (race condition de timing)
  (async function restaurarSesion() {
    // La config global no depende de la sesión: un invitado también tiene que
    // ver los planes pagos ocultos si están desactivados. Si falla la lectura,
    // configApp queda vacío y planesPagosActivos() da false — el default seguro.
    configApp = await (PronetDB?.obtenerConfigApp?.() || Promise.resolve({})).catch(() => ({}));

    // Sincronizar los límites numéricos de cada plan desde la DB: evita drift
    // entre config.js (cliente) y planes_limites (fuente de verdad del trigger).
    const limitesDB = await PronetDB.listarPlanesLimites().catch(() => []);
    if (limitesDB.length && window.PRONET_CONFIG?.PLANES) {
      limitesDB.forEach(row => {
        const p = window.PRONET_CONFIG.PLANES.find(p => p.id === row.plan);
        if (p) { p.propuestas_mes = row.propuestas_mes; p.fotos_portfolio = row.fotos_portfolio; }
      });
    }

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
          planActual    = s.plan    || 'base';
          periodoActual = s.periodo || 'mensual';
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
      } else {
        // Token inválido o expirado: mostrar login
        quitarAntiFlash();
        if (loginEl) loginEl.classList.remove('hidden');
        renderHomeFeed('todos'); // render como invitado
      }
    } catch (e) {
      quitarAntiFlash();
      const loginEl = document.getElementById('login-screen');
      if (loginEl) loginEl.classList.remove('hidden');
      renderHomeFeed('todos');
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
      const lista = await PronetDB.listar('pedidos');
      el.textContent = '🟢 Datos: SUPABASE (' + lista.length + ' pedido' + (lista.length !== 1 ? 's' : '') + ')';
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
      navigator.serviceWorker.register('sw.js').then(reg => {
        // Cuando el SW se actualiza, recargar para tomar los archivos nuevos
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              console.log('[PWA] SW actualizado — recargando para aplicar cambios');
              window.location.reload();
            }
          });
        });
      }).catch(err => {
        console.warn('[PWA] No se pudo registrar el Service Worker:', err);
      });
    });
    // Si el controlador cambió (nuevo SW tomó control), recargar
    navigator.serviceWorker.addEventListener('controllerchange', () => {
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
