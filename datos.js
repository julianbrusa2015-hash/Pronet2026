// ═══ PRONET · datos.js — Capa de datos (Fase 2: modo dual) ═══
//
// MODO LOCAL  → sin credenciales en config.js: los datos se guardan en el
//               dispositivo (localStorage). Ideal para demos sin backend.
// MODO REMOTO → con credenciales de Supabase en config.js: los datos van a
//               tu base de datos real y se comparten entre dispositivos.
//
// La app llama siempre a PronetDB.listar / .crear / .borrar y no sabe (ni
// le importa) en qué modo está. Para migrar de local a remoto no se toca
// ninguna otra parte del código: solo se completan las credenciales.
//
// Colecciones/tablas: 'pedidos' y 'mensajes' (el SQL para crearlas en
// Supabase está en supabase-tablas.sql).

const PronetDB = (() => {
  const PREFIJO = 'pronet-db-';

  // ── Detección de modo ──────────────────────────────────────────────
  const CONFIG = (typeof window !== 'undefined' && window.PRONET_CONFIG) || {};
  let sb = null;
  try {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY &&
        typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      window._sb = sb; // expuesto para queries directas desde app.js (moderación, etc.)
    }
  } catch (e) {
    sb = null; // credenciales inválidas: caer a modo local sin romper
  }
  const remoto = !!sb;

  // SLUG de la URL de la Edge Function de push, no su nombre en el dashboard.
  // Ahí figura como "enviar-push" pero la URL es .../functions/v1/bright-service:
  // el slug quedó del nombre original y no se puede renombrar. Apuntar a
  // 'enviar-push' da 404 en el preflight, que el browser reporta como CORS.
  const PUSH_EDGE_FN_NOMBRE = 'bright-service';
  if (typeof console !== 'undefined') {
    console.info('[PronetDB] Modo: ' + (remoto ? 'REMOTO (Supabase)' : 'LOCAL (este dispositivo)'));
  }

  // ── Implementación LOCAL (localStorage) ────────────────────────────
  function claveDe(coleccion) { return PREFIJO + coleccion; }

  function leerLocal(coleccion) {
    try {
      const raw = localStorage.getItem(claveDe(coleccion));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function escribirLocal(coleccion, items) {
    try { localStorage.setItem(claveDe(coleccion), JSON.stringify(items)); return true; }
    catch (e) { return false; }
  }

  // Convierte la clave VAPID (base64 url-safe) al Uint8Array que pide PushManager
  function base64aUint8(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  /** Distingue un rechazo deliberado del servidor (constraint, RLS, trigger de
   *  negocio) de una falla de transporte. Sólo la segunda justifica el fallback
   *  local: un dato que el servidor rechazó a propósito nunca va a poder
   *  sincronizar, y guardarlo en el dispositivo simula un éxito que no ocurrió. */
  function esRechazoServidor(error) {
    const code = String(error?.code || '');
    if (/^(23|42)/.test(code)) return true; // integridad (23xxx) / permisos (42501)
    // P0001 = raise_exception: sólo lo produce un RAISE explícito, o sea una
    // regla de negocio nuestra (TELEFONO_REQUERIDO, PROPUESTA_NO_ELEGIBLE…).
    // Sin esto caían en el fallback local y el usuario veía como guardado algo
    // que el servidor había rechazado a propósito.
    if (code === 'P0001') return true;
    const m = String(error?.message || '').toLowerCase();
    return m.includes('row-level security') || m.includes('violates') || m.includes('limite_');
  }

  // ── API pública (misma firma en ambos modos) ───────────────────────
  return {
    /** true si está conectado a Supabase, false si guarda en el dispositivo */
    esRemoto() { return remoto; },

    /** Lista los registros de una colección, más recientes primero. */
    async listar(coleccion) {
      if (remoto) {
        const { data, error } = await sb.from(coleccion)
          .select('*')
          .order('creado', { ascending: false });
        if (error) { console.warn('[PronetDB] listar', coleccion, error.message, '→ fallback local'); return leerLocal(coleccion); }
        return data || [];
      }
      return leerLocal(coleccion);
    },

    /** Pedidos abiertos de una zona, filtrados EN EL SERVIDOR.
     *
     *  `listar('pedidos')` traía la tabla entera y el cliente descartaba en
     *  JS. Medido el 2026-08-06: 67 filas transferidas para usar 13 — los
     *  cerrados y vencidos se acumulan para siempre mientras el conjunto
     *  útil se mantiene chico, así que el desperdicio sólo crece.
     *
     *  Devuelve `{ pedidos, total }`. `total` es el count real del servidor,
     *  no `pedidos.length`: los contadores de la app ("Ver los 18") tienen
     *  que seguir diciendo la verdad aunque el límite recorte la lista.
     *
     *  @param {string[]=} zonas         Zonas concretas (no la zona-madre).
     *  @param {string=}   excluirUsuario Su dueño no puede ofertar.
     *  @param {number=}   limite        Techo de seguridad, no paginación. */
    async listarPedidosDisponibles({ zonas = null, excluirUsuario = null, limite = 200, miPrestadorId = null } = {}) {
      if (!remoto) {
        const todos = leerLocal('pedidos')
          .filter(p => (p.estado || 'Publicado') === 'Publicado')
          .filter(p => !excluirUsuario || p.usuario_id !== excluirUsuario)
          .filter(p => !zonas?.length || zonas.includes(p.zona || 'Escobar'))
          .filter(p => !p.dirigido_a || p.dirigido_a === miPrestadorId);
        return { pedidos: todos.slice(0, limite), total: todos.length };
      }
      let q = sb.from('pedidos')
        .select('*', { count: 'exact' })
        .eq('estado', 'Publicado')
        .order('creado', { ascending: false })
        .limit(limite);
      if (zonas?.length)   q = q.in('zona', zonas);
      if (excluirUsuario)  q = q.neq('usuario_id', excluirUsuario);
      // Los pedidos dirigidos sólo los ve su destinatario. Sin este filtro,
      // una recontratación aparecería en el feed de todos y el vecino
      // recibiría propuestas de gente que no pidió.
      q = miPrestadorId
        ? q.or('dirigido_a.is.null,dirigido_a.eq.' + miPrestadorId)
        : q.is('dirigido_a', null);
      const { data, error, count } = await q;
      if (error) {
        console.warn('[PronetDB] listarPedidosDisponibles', error.message);
        return { pedidos: [], total: 0 };
      }
      return { pedidos: data || [], total: count ?? (data || []).length };
    },

    /** Filas de una colección por una lista de ids. Evita el patrón de
     *  traerse la tabla entera para después buscar con `.find()`. */
    async obtenerVarios(coleccion, ids) {
      const unicos = [...new Set((ids || []).filter(Boolean))];
      if (!unicos.length) return [];
      if (!remoto) return leerLocal(coleccion).filter(r => unicos.includes(r.id));
      const { data, error } = await sb.from(coleccion).select('*').in('id', unicos);
      if (error) { console.warn('[PronetDB] obtenerVarios', coleccion, error.message); return []; }
      return data || [];
    },

    /** Propuestas enviadas por un prestador. */
    async listarPropuestasDePrestador(prestadorId) {
      if (!prestadorId) return [];
      if (!remoto) return leerLocal('propuestas').filter(p => p.prestador_id === prestadorId);
      const { data, error } = await sb.from('propuestas')
        .select('*').eq('prestador_id', prestadorId)
        .order('creado', { ascending: false });
      if (error) { console.warn('[PronetDB] listarPropuestasDePrestador', error.message); return []; }
      return data || [];
    },

    /** Reseñas recibidas por un prestador después de `desde`.
     *  Cuenta sin traer las filas: el tablero sólo necesita el número. */
    async contarResenasNuevas(prestadorId, desde) {
      if (!remoto || !prestadorId || !desde) return 0;
      const { count, error } = await sb.from('resenas')
        .select('id', { count: 'exact', head: true })
        .eq('prestador_id', prestadorId)
        .gt('creado', new Date(desde).toISOString());
      if (error) { console.warn('[PronetDB] contarResenasNuevas', error.message); return 0; }
      return count || 0;
    },

    /** Cuenta filas sin traerlas (`head: true` → sólo el header con el count).
     *  Para cualquier lugar que sólo necesita el número. */
    async contar(coleccion) {
      if (!remoto) return leerLocal(coleccion).length;
      const { count, error } = await sb.from(coleccion)
        .select('id', { count: 'exact', head: true });
      if (error) { console.warn('[PronetDB] contar', coleccion, error.message); return 0; }
      return count || 0;
    },

    /** Cuántos pedidos abiertos hay. Va por RPC porque desde el 2026-08-09 un
     *  vecino no lee los pedidos ajenos: contarlos con `count` devolvería
     *  siempre lo que ese usuario puede ver, no la actividad real.
     *
     *  HOY NO SE USA. Alimentaba el "Hay N vecinos buscando servicios" del
     *  Inicio, que se sacó porque el dato estaba apuntado al lector
     *  equivocado (a un vecino no le sirve saber cuántos otros buscan lo
     *  mismo). Se deja porque el RPC existe en la base y devuelve sólo un
     *  número: si mañana se muestra en otro lado, está listo. */
    async contarPedidosActivos(zona = null) {
      if (!remoto) {
        return leerLocal('pedidos')
          .filter(p => (p.estado || 'Publicado') === 'Publicado' && !p.dirigido_a)
          .filter(p => !zona || (p.zona || 'Escobar') === zona).length;
      }
      const { data, error } = await sb.rpc('contar_pedidos_activos', { p_zona: zona });
      if (error) { console.warn('[PronetDB] contarPedidosActivos', error.message); return 0; }
      return data || 0;
    },

    /** Crea un registro. Devuelve el registro con id y fecha asignados. */
    async crear(coleccion, datos) {
      if (remoto) {
        const { data, error } = await sb.from(coleccion)
          .insert(datos)     // id y creado los genera la base de datos
          .select()
          .single();
        if (error && esRechazoServidor(error)) throw error;
        if (error) { console.warn('[PronetDB] crear', coleccion, error.message, '→ fallback local'); }
        if (error || !data) {
          // Fallback: guardar localmente si Supabase falla
          const items = leerLocal(coleccion);
          const registro = { id: 'reg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), creado: new Date().toISOString(), ...datos };
          items.unshift(registro);
          escribirLocal(coleccion, items);
          return registro;
        }
        return data;
      }
      const items = leerLocal(coleccion);
      const registro = {
        id: 'reg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        creado: new Date().toISOString(),
        ...datos,
      };
      items.unshift(registro);
      escribirLocal(coleccion, items);
      return registro;
    },

    /** Devuelve el id del usuario logueado (para asignar dueño a registros) o null */
    async usuarioIdActual() {
      if (!remoto) {
        try { const raw = localStorage.getItem('pronet-usuario'); return raw ? JSON.parse(raw).id : null; }
        catch (e) { return null; }
      }
      const { data: { user } } = await sb.auth.getUser();
      return user ? user.id : null;
    },

    /** Lista registros filtrando por el usuario dueño. */
    async listarMios(coleccion) {
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      if (remoto) {
        const { data, error } = await sb.from(coleccion)
          .select('*').eq('usuario_id', uid)
          .order('creado', { ascending: false });
        if (error) { console.warn('[PronetDB] listarMios', coleccion, error.message); return []; }
        return data || [];
      }
      return leerLocal(coleccion).filter(r => r.usuario_id === uid);
    },

    /** Sube la foto de perfil al bucket 'avatares' (carpeta del usuario).
     *  Recibe un Blob/File y devuelve { ok, url } o { ok:false, error }. */
    async subirFotoPerfil(blob) {
      if (!remoto) return { ok: false, error: 'Las fotos requieren modo remoto (Supabase)' };
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { ok: false, error: 'Necesitás iniciar sesión' };
      const ruta = user.id + '/avatar.jpg';
      const { error } = await sb.storage.from('avatares')
        .upload(ruta, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '300' });
      if (error) { console.warn('[PronetDB] subirFotoPerfil', error.message); return { ok: false, error: error.message }; }
      const { data } = sb.storage.from('avatares').getPublicUrl(ruta);
      // Cache-buster: la URL es siempre la misma, sin esto el browser muestra la foto vieja
      return { ok: true, url: data.publicUrl + '?v=' + Date.now() };
    },

    // ══════════════════════════════════════════════════════════════════
    // NOTIFICACIONES PUSH (Web Push nativo + Edge Function)
    // ══════════════════════════════════════════════════════════════════

    /** true si este navegador/dispositivo puede recibir push y hay clave configurada */
    puedePush() {
      return remoto && !!CONFIG.VAPID_PUBLIC_KEY &&
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },

    /** Estado actual: 'activas' | 'inactivas' | 'bloqueadas' | 'no-disponible' */
    async estadoPush() {
      if (!this.puedePush()) return 'no-disponible';
      if (Notification.permission === 'denied') return 'bloqueadas';
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'activas' : 'inactivas';
    },

    /** Pide permiso, se suscribe y guarda la suscripción en la base. */
    async activarPush() {
      if (!this.puedePush()) return { ok: false, error: 'Push no disponible en este dispositivo' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Necesitás iniciar sesión' };
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return { ok: false, error: 'Permiso denegado' };
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64aUint8(CONFIG.VAPID_PUBLIC_KEY),
        });
      }
      const j = sub.toJSON();
      const { error } = await sb.from('push_suscripciones').upsert(
        { usuario_id: uid, endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
        { onConflict: 'endpoint' }
      );
      if (error) { console.warn('[PronetDB] activarPush', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** Desuscribe este dispositivo y borra la suscripción de la base. */
    async desactivarPush() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          if (remoto) await sb.from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
        return { ok: true };
      } catch (e) { return { ok: false, error: String(e) }; }
    },

    /** Dispara una notificación vía la Edge Function y la persiste en la tabla notificaciones.
     *  opciones = { destino:'usuario'|'prestador'|'prestadores_rubro', usuario_id?, prestador_id?, rubro?, tipo?, titulo, cuerpo?, url? } */
    async notificar(opciones) {
      if (!remoto) return { ok: false, error: 'Push requiere modo remoto' };
      try {
        // Lo que se le manda a la Edge Function. Arranca igual que `opciones`
        // y se ajusta abajo para el destino 'prestador', que la función no
        // conoce. En null significa "no pushear": o el destino no se pudo
        // resolver, o el servidor rechazó la campanita y no hay razón para
        // mandar un push que nadie autorizó.
        let cuerpoPush = opciones;

        // `soloPush`: la campanita ya la escribió un RPC del lado del
        // servidor (las reseñas, por ejemplo, la escribe dejar_resena junto
        // con la reseña misma). Sin esto se insertaría dos veces.
        if (opciones.soloPush) {
          const { data, error } = await sb.functions.invoke(PUSH_EDGE_FN_NOMBRE, { body: opciones });
          if (error) console.warn('[PronetDB] notificar push', error.message);
          return data || { ok: true };
        }
        // 1. Persistir en notificaciones (campanita in-app) — siempre, independiente
        //    del push. Vía RPC: el servidor valida que exista una relación real
        //    con el destinatario. Antes era un INSERT directo sin validar, así que
        //    cualquiera podía escribir en el buzón de cualquiera.
        if (opciones.destino === 'usuario' && opciones.usuario_id) {
          const { data: r, error } = await sb.rpc('notificar_usuario', {
            p_usuario_id: opciones.usuario_id,
            p_tipo:       opciones.tipo || 'general',
            p_titulo:     opciones.titulo,
            p_cuerpo:     opciones.cuerpo || null,
            p_url:        opciones.url || null,
          });
          if (error)      console.warn('[PronetDB] notificar_usuario', error.message);
          else if (!r?.ok) console.warn('[PronetDB] notificar_usuario', r?.error);
        } else if (opciones.destino === 'prestador' && opciones.prestador_id) {
          // Recontratación: el pedido es dirigido, así que avisa a una sola
          // ficha. El RPC resuelve el usuario (no se puede desde el cliente).
          const { data: r, error } = await sb.rpc('notificar_prestador', {
            p_prestador_id: opciones.prestador_id,
            p_tipo:         opciones.tipo || 'general',
            p_titulo:       opciones.titulo,
            p_cuerpo:       opciones.cuerpo || null,
            p_url:          opciones.url || null,
          });
          if (error)       console.warn('[PronetDB] notificar_prestador', error.message);
          else if (!r?.ok) console.warn('[PronetDB] notificar_prestador', r?.error);

          // La Edge Function no conoce el destino 'prestador' — sólo entiende
          // 'usuario' y 'prestadores_rubro'. En vez de tocarla (su código vive
          // sólo en el dashboard, fuera del repo), se traduce acá: el RPC ya
          // resolvió a qué usuario corresponde la ficha y lo devuelve.
          cuerpoPush = r?.ok && r.usuario_id
            ? { ...opciones, destino: 'usuario', usuario_id: r.usuario_id }
            : null;
        } else if (opciones.destino === 'prestadores_rubro' && opciones.rubro) {
          // Los destinatarios los resuelve el RPC desde `prestadores` (rubro +
          // activo). Antes salían de push_suscripciones, así que la campanita
          // solo le llegaba a quien tuviera push habilitado.
          const { data: r, error } = await sb.rpc('notificar_rubro', {
            p_rubro:  opciones.rubro,
            p_tipo:   opciones.tipo || 'general',
            p_titulo: opciones.titulo,
            p_cuerpo: opciones.cuerpo || null,
            p_url:    opciones.url || null,
          });
          if (error)      console.warn('[PronetDB] notificar_rubro', error.message);
          else if (!r?.ok) console.warn('[PronetDB] notificar_rubro', r?.error);
        }

        // 2. Disparar el push (best-effort — si falla, la campanita ya fue guardada)
        // OJO: este es el SLUG de la URL, no el nombre visible en el dashboard.
        // En Supabase la función figura como "enviar-push" pero su URL es
        // .../functions/v1/bright-service — el slug quedó del nombre original y
        // no se puede renombrar. Apuntar a 'enviar-push' daba 404 en el
        // preflight, que el browser reporta como error de CORS.
        // Para unificarlo hay que crear una función nueva con el slug correcto
        // (ver PENDIENTES.md), no alcanza con renombrar la existente.
        if (!cuerpoPush) return { ok: true, push: false };
        const { data, error } = await sb.functions.invoke(PUSH_EDGE_FN_NOMBRE, { body: cuerpoPush });
        if (error) { console.warn('[PronetDB] notificar push', error.message); }

        return data || { ok: true };
      } catch (e) { return { ok: false, error: String(e) }; }
    },

    /** Lista las notificaciones del usuario logueado, más recientes primero. */
    async listarNotificaciones(limite = 50) {
      if (!remoto) return [];
      // Limpieza lazy: borrar notis leídas hace más de 30 días
      sb.from('notificaciones')
        .delete()
        .eq('leida', true)
        .lt('leida_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .then(() => {}).catch(() => {});
      const { data, error } = await sb.from('notificaciones')
        .select('*')
        .order('creado', { ascending: false })
        .limit(limite);
      if (error) { console.warn('[PronetDB] listarNotificaciones', error.message); return []; }
      return data || [];
    },

    /** Marca una notificación como leída. */
    async marcarNotificacionLeida(notiId) {
      if (!remoto) return;
      try {
        await sb.from('notificaciones')
          .update({ leida: true, leida_at: new Date().toISOString() })
          .eq('id', notiId);
      } catch(e) { console.warn('[PronetDB] marcarNotificacionLeida', e.message); }
    },

    /** Cuenta notificaciones no leídas del usuario logueado. */
    async contarNotisNoLeidas() {
      if (!remoto) return 0;
      const { count, error } = await sb.from('notificaciones')
        .select('id', { count: 'exact', head: true })
        .eq('leida', false);
      if (error) return 0;
      return count || 0;
    },

    /** Inserta una notificación en la tabla sin disparar push.
     *  Usado por Realtime para persistir eventos in-app.
     *  opciones = { usuario_id, tipo, titulo, cuerpo?, url? } */
    async insertarNotificacion(opciones) {
      if (!remoto) return;
      try {
        // Vía RPC, igual que notificar(): el INSERT directo no validaba el
        // destinatario y permitía escribir en el buzón de cualquier usuario.
        const { data: r, error } = await sb.rpc('notificar_usuario', {
          p_usuario_id: opciones.usuario_id,
          p_tipo:       opciones.tipo || 'general',
          p_titulo:     opciones.titulo,
          p_cuerpo:     opciones.cuerpo || null,
          p_url:        opciones.url || null,
        });
        if (error)       console.warn('[PronetDB] insertarNotificacion', error.message);
        else if (!r?.ok) console.warn('[PronetDB] insertarNotificacion', r?.error);
      } catch(e) { console.warn('[PronetDB] insertarNotificacion', e.message); }
    },

    // ══════════════════════════════════════════════════════════════════
    // CHAT REAL (chats_trabajo + mensajes_chat)
    // ══════════════════════════════════════════════════════════════════

    /** Abre (o recupera) el chat de una propuesta. Devuelve el chat_id. */
    async abrirChatPropuesta(propuestaId) {
      if (!remoto) return { ok: false, error: 'El chat requiere modo remoto' };
      const { data, error } = await sb.rpc('abrir_chat_propuesta', { p_propuesta_id: propuestaId });
      if (error) { console.warn('[PronetDB] abrirChatPropuesta', error.message); return { ok: false, error: error.message }; }
      return { ok: true, chat_id: data };
    },

    /** Lista los chats_trabajo del usuario logueado, sin filtrar por estado
     *  (la RLS ya los limita a los propios). Para checklists/estado real
     *  que necesitan revisar el campo 'estado' del lado del cliente. */
    async listarMisChats() {
      if (!remoto) return [];
      const { data, error } = await sb.from('chats_trabajo').select('*');
      if (error) { console.warn('[PronetDB] listarMisChats', error.message); return []; }
      return data || [];
    },

    /** Lista los mensajes de un chat. */
    async listarMensajes(chatId) {
      if (!remoto) return [];
      const { data, error } = await sb.from('mensajes_chat')
        .select('*')
        .eq('chat_id', chatId)
        .order('creado', { ascending: true });
      if (error) { console.warn('[PronetDB] listarMensajes', error.message); return []; }
      return data || [];
    },

    /** Envía un mensaje en un chat. */
    async enviarMensaje(chatId, texto) {
      if (!remoto) return { ok: false, error: 'El chat requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data, error } = await sb.from('mensajes_chat')
        .insert({ chat_id: chatId, autor_id: uid, texto: texto.trim() })
        .select().single();
      if (error) { console.warn('[PronetDB] enviarMensaje', error.message); return { ok: false, error: error.message }; }
      // Actualizar último mensaje en el chat
      await sb.from('chats_trabajo').update({
        ultimo_mensaje: texto.trim().slice(0, 100),
        hora_ultimo: new Date().toISOString(),
      }).eq('id', chatId);
      return { ok: true, mensaje: data };
    },

    /** Marca como leídos todos los mensajes de un chat que no son del usuario. */
    async marcarLeidos(chatId) {
      if (!remoto) return;
      const uid = await this.usuarioIdActual();
      if (!uid) return;
      await sb.from('mensajes_chat')
        .update({ leido: true })
        .eq('chat_id', chatId)
        .eq('leido', false)
        .neq('autor_id', uid);
    },

    /** Deja una reseña, cierra el chat y recalcula el rating del prestador. */
    async dejarResena(chatId, puntos, comentario = '', recomendar = false) {
      if (!remoto) return { ok: false, error: 'Las reseñas requieren modo remoto' };
      const { data, error } = await sb.rpc('dejar_resena', {
        p_chat_id: chatId,
        p_puntos: puntos,
        p_comentario: comentario || null,
        p_recomendar: !!recomendar,
      });
      if (error) { console.warn('[PronetDB] dejarResena', error.message); return { ok: false, error: error.message }; }
      return data || { ok: true };
    },

    /** Cuenta recomendaciones (recomendar=true) de un prestador: mes actual y mes anterior. */
    async contarRecomendaciones(prestadorId) {
      if (!remoto) return { actual: 0, anterior: 0 };
      const now = new Date();
      const inicioActual  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const inicioAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const [{ count: actual }, { count: anterior }] = await Promise.all([
        sb.from('resenas').select('*', { count: 'exact', head: true })
          .eq('prestador_id', prestadorId).eq('recomendar', true).gte('creado', inicioActual),
        sb.from('resenas').select('*', { count: 'exact', head: true })
          .eq('prestador_id', prestadorId).eq('recomendar', true)
          .gte('creado', inicioAnterior).lt('creado', inicioActual),
      ]);
      return { actual: actual || 0, anterior: anterior || 0 };
    },

    /** Calcula tasa de respuesta: % de chats donde el prestador envió al menos un mensaje. */
    async calcularTasaRespuesta(prestadorId) {
      if (!remoto) return null;
      const { data: chats } = await sb.from('chats_trabajo')
        .select('id').eq('prestador_id', prestadorId);
      if (!chats?.length) return null;
      const ids = chats.map(c => c.id);
      const { data: msgs } = await sb.from('mensajes_chat')
        .select('chat_id').in('chat_id', ids).eq('autor_id', prestadorId);
      const respondidos = new Set(msgs?.map(m => m.chat_id) || []).size;
      return Math.round((respondidos / chats.length) * 100);
    },

    /** Lista las reseñas de un prestador. */
    async listarResenas(prestadorId) {
      if (!remoto) return [];
      const { data, error } = await sb.from('resenas')
        .select('*')
        .eq('prestador_id', prestadorId)
        .order('creado', { ascending: false });
      if (error) { console.warn('[PronetDB] listarResenas', error.message); return []; }
      if (!data?.length) return [];
      // Traer nombres y zonas de los vecinos manualmente (no hay FK vecino_id → perfiles)
      const vecinoIds = [...new Set(data.map(r => r.vecino_id).filter(Boolean))];
      let perfilesMap = {};
      if (vecinoIds.length) {
        const { data: perfs } = await sb.from('perfiles_publicos')
          .select('id, nombre, zona')
          .in('id', vecinoIds);
        (perfs || []).forEach(p => { perfilesMap[p.id] = p; });
      }
      return data.map(r => ({
        ...r,
        perfiles: perfilesMap[r.vecino_id] || null
      }));
    },

    /** Obtiene el usuario_id del prestador de un chat (para push de mensajes). */
    async usuarioIdDePrestador(prestadorId) {
      if (!remoto) return null;
      // Vía perfiles_publicos: RLS en `perfiles` solo deja leer la propia fila,
      // así que consultarla por el prestador_id de OTRO devolvía 200 con
      // resultado vacío. El null resultante hacía que el llamador saltara la
      // notificación en silencio — el destinatario nunca se enteraba del
      // mensaje nuevo. Mismo patrón que el bug B-06.
      const { data, error } = await sb.from('perfiles_publicos')
        .select('id').eq('prestador_id', prestadorId).maybeSingle();
      if (error) { console.warn('[PronetDB] usuarioIdDePrestador', error.message); return null; }
      return data?.id || null;
    },

    /** Cuenta mensajes no leídos del usuario en todos sus chats. */
    async contarNoLeidos() {
      if (!remoto) return 0;
      const uid = await this.usuarioIdActual();
      if (!uid) return 0;
      // Obtener los chats del usuario
      const { data: chats } = await sb.from('chats_trabajo').select('id');
      if (!chats?.length) return 0;
      const ids = chats.map(c => c.id);
      const { count } = await sb.from('mensajes_chat')
        .select('id', { count: 'exact', head: true })
        .in('chat_id', ids)
        .eq('leido', false)
        .neq('autor_id', uid);
      return count || 0;
    },

    /** Mensajes sin leer desglosados por chat: `{ [chat_id]: n }`.
     *
     *  `contarNoLeidos()` devuelve sólo el total, que alcanza para el badge
     *  pero no para FILTRAR la lista: para eso hay que saber cuáles de los
     *  chats son los que tienen algo sin leer. Es la misma consulta sin
     *  `head: true`, así que no agrega una vuelta extra al servidor. */
    async noLeidosPorChat() {
      if (!remoto) return {};
      const uid = await this.usuarioIdActual();
      if (!uid) return {};
      const { data: chats } = await sb.from('chats_trabajo').select('id');
      if (!chats?.length) return {};
      const { data: msgs } = await sb.from('mensajes_chat')
        .select('chat_id')
        .in('chat_id', chats.map(c => c.id))
        .eq('leido', false)
        .neq('autor_id', uid);
      const mapa = {};
      (msgs || []).forEach(m => { mapa[m.chat_id] = (mapa[m.chat_id] || 0) + 1; });
      return mapa;
    },

    // ── CATÁLOGO DE SERVICIOS (ABM) ──────────────────────────────────────

    /** Lista todos los servicios del catálogo ordenados por orden. */
    async listarCatalogo(soloActivos = false) {
      if (!remoto) return [];
      let q = sb.from('catalogo_servicios').select('*').order('orden', { ascending: true });
      if (soloActivos) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarCatalogo', error.message); return []; }
      return data || [];
    },

    /** Obtiene un servicio del catálogo por id. */
    async obtenerFicha(id) {
      if (!remoto || !id) return null;
      const { data, error } = await sb.from('catalogo_servicios').select('*').eq('id', id).maybeSingle();
      if (error) { console.warn('[PronetDB] obtenerFicha', error.message); return null; }
      return data;
    },

    /** Obtiene un servicio del catálogo por rubro (para el slider y el tooltip de alcance). */
    async obtenerFichaPorRubro(rubro) {
      if (!remoto || !rubro) return null;
      const { data, error } = await sb.from('catalogo_servicios').select('precio_ref_min,precio_ref_max,precio_unidad,incluye,no_incluye').eq('rubro', rubro).eq('activo', true).maybeSingle();
      if (error) { console.warn('[PronetDB] obtenerFichaPorRubro', error.message); return null; }
      return data;
    },

    /** Crea o actualiza una ficha del catálogo (solo admin). */
    async guardarFicha(datos) {
      if (!remoto) return null;
      if (datos.id) {
        const { id, ...rest } = datos;
        const { data, error } = await sb.from('catalogo_servicios').update(rest).eq('id', id).select().maybeSingle();
        if (error) { console.warn('[PronetDB] guardarFicha update', error.message); return null; }
        return data;
      } else {
        const { data, error } = await sb.from('catalogo_servicios').insert(datos).select().maybeSingle();
        if (error) { console.warn('[PronetDB] guardarFicha insert', error.message); return null; }
        return data;
      }
    },

    /** Elimina una ficha del catálogo (solo admin). */
    async eliminarFicha(id) {
      if (!remoto || !id) return false;
      const { error } = await sb.from('catalogo_servicios').delete().eq('id', id);
      if (error) { console.warn('[PronetDB] eliminarFicha', error.message); return false; }
      return true;
    },

    // ── CONFIGURACIÓN GLOBAL DE LA APP ───────────────────────────────────

    /** Lee la tabla config_app y la devuelve como objeto { clave: valor }. */
    async obtenerConfigApp() {
      if (!remoto) return {};
      const { data, error } = await sb.from('config_app').select('clave, valor');
      if (error) { console.warn('[PronetDB] obtenerConfigApp', error.message); return {}; }
      const out = {};
      (data || []).forEach(r => { out[r.clave] = r.valor; });
      return out;
    },

    /** Devuelve los límites numéricos de cada plan tal como los ve el servidor
     *  (tabla planes_limites, fuente de verdad para los triggers). */
    async listarPlanesLimites() {
      if (!remoto) return [];
      const { data, error } = await sb.from('planes_limites')
        .select('plan, nombre, precio_mes, precio_anual, propuestas_mes, fotos_portfolio, loyalty_boost, pub_slots, pub_duracion_dias, pub_destacados_mes');
      if (error) { console.warn('[PronetDB] listarPlanesLimites', error.message); return []; }
      return data || [];
    },

    /** Lee varias claves de config_app de una. Devuelve `{clave: valor}`.
     *  Sólo trae las que se piden: pedir la tabla entera devolvería también
     *  `admin_pin`, que está en texto plano. */
    async leerConfigApp(claves) {
      if (!remoto || !claves?.length) return {};
      const { data, error } = await sb.from('config_app')
        .select('clave, valor').in('clave', claves);
      if (error) { console.warn('[PronetDB] leerConfigApp', error.message); return {}; }
      const mapa = {};
      (data || []).forEach(r => { mapa[r.clave] = r.valor; });
      return mapa;
    },

    /** Servicios fijos del usuario. La RLS ya filtra por rol: el vecino ve
     *  los suyos y el prestador los suyos, con la misma consulta. */
    async listarServiciosFijos(soloActivos = true) {
      if (!remoto) return [];
      // Sólo se embebe `prestadores`, que tiene FK real. El nombre del
      // vecino se trae aparte de perfiles_publicos: `vecino_id` apunta a
      // auth.users, no a perfiles, así que un embed contra perfiles no
      // resuelve y rompe la consulta entera.
      let q = sb.from('servicios_fijos')
        .select('*, prestadores(nombre, foto_url)')
        .order('creado', { ascending: false });
      if (soloActivos) q = q.eq('estado', 'activo');
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarServiciosFijos', error.message); return []; }
      const filas = data || [];

      const uids = [...new Set(filas.map(f => f.vecino_id).filter(Boolean))];
      if (uids.length) {
        const { data: prfs } = await sb.from('perfiles_publicos').select('id, nombre').in('id', uids);
        const mapa = {};
        (prfs || []).forEach(p => { mapa[p.id] = p.nombre; });
        filas.forEach(f => { f.vecino_nombre = mapa[f.vecino_id] || 'Vecino'; });
      }
      return filas;
    },

    /** Da de baja un servicio fijo. Cualquiera de las dos partes puede:
     *  un acuerdo se termina de cualquier lado. */
    async terminarServicioFijo(id) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('servicios_fijos')
        .update({ estado: 'terminado', terminado_en: new Date().toISOString() })
        .eq('id', id).select('id');
      if (error) { console.warn('[PronetDB] terminarServicioFijo', error.message); return { ok: false, error: error.message }; }
      if (!data || !data.length) return { ok: false, error: 'No se encontró o no tenés permiso' };
      return { ok: true };
    },

    /** Niveles del programa de puntos. Lectura pública. */
    async listarLoyaltyNiveles() {
      if (!remoto) return [];
      const { data, error } = await sb.from('loyalty_niveles')
        .select('*').order('orden', { ascending: true });
      if (error) { console.warn('[PronetDB] listarLoyaltyNiveles', error.message); return []; }
      return data || [];
    },

    /** Edita un nivel. Sólo admin. UPDATE, no upsert (ver guardarRubro). */
    async guardarLoyaltyNivel(nombre, campos) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('loyalty_niveles')
        .update(campos).eq('nombre', nombre).select('nombre');
      if (error) { console.warn('[PronetDB] guardarLoyaltyNivel', error.message); return { ok: false, error: error.message }; }
      if (!data || !data.length) return { ok: false, error: 'No se encontró el nivel o no tenés permiso' };
      return { ok: true };
    },

    /** Catálogo de zonas/barrios. Lectura pública: el selector de zona
     *  aparece antes de iniciar sesión. */
    // ══ VERIFICACIÓN DE PRESTADORES ══════════════════════════════════════
    // Datos declarados (nombre completo, DNI, dirección) que el admin revisa
    // para encender el sello. Tabla aparte de `prestadores` porque esa es de
    // lectura pública — ver supabase-verificacion-prestador.sql.

    /** La solicitud del prestador actual, o null si nunca cargó nada. */
    async obtenerVerificacion() {
      if (!remoto) return null;
      const { data, error } = await sb.from('prestadores_verificacion')
        .select('*').maybeSingle();   // el RLS ya la acota a la propia
      if (error) { console.warn('[PronetDB] obtenerVerificacion', error.message); return null; }
      return data;
    },

    /** Crea o actualiza la solicitud propia.
     *
     *  Devuelve `{ ok, error }` en vez de tirar: los dos rechazos esperables
     *  —DNI repetido y solicitud ya resuelta— tienen que llegar a la UI con
     *  un mensaje que se entienda, no como "algo falló". */
    async guardarVerificacion(prestadorId, { nombre_completo, direccion, dni }) {
      if (!remoto) return { ok: false, error: 'sin conexión' };
      const fila = {
        prestador_id: prestadorId,
        nombre_completo, direccion, dni,
        estado: 'pendiente',
        actualizado: new Date().toISOString(),
      };
      const { data, error } = await sb.from('prestadores_verificacion')
        .upsert(fila, { onConflict: 'prestador_id' })
        .select();
      if (error) {
        // 23505 = unique_violation sobre idx_verificacion_dni.
        if (error.code === '23505') {
          return { ok: false, error: 'Ese DNI ya está registrado en otra cuenta.' };
        }
        console.warn('[PronetDB] guardarVerificacion', error.message);
        return { ok: false, error: error.message };
      }
      // El RLS filtra sin dar error: cero filas significa que la solicitud ya
      // fue resuelta y la policy de edición no la alcanza.
      if (!data?.length) {
        return { ok: false, error: 'Tu solicitud ya fue revisada. Escribinos a soporte para cambiarla.' };
      }
      return { ok: true, fila: data[0] };
    },

    /** Solicitudes a revisar. Sólo devuelve algo si quien pregunta es admin. */
    async listarVerificaciones(estado = 'pendiente') {
      if (!remoto) return [];
      let q = sb.from('prestadores_verificacion')
        .select('*, prestadores(nombre, rubro, zona)')
        .order('creado', { ascending: true });
      if (estado) q = q.eq('estado', estado);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarVerificaciones', error.message); return []; }
      return data || [];
    },

    /** Aprueba o rechaza. Va por RPC para que el estado de la solicitud y la
     *  bandera pública del prestador no puedan quedar desfasados. */
    async resolverVerificacion(prestadorId, aprobar, motivo = null) {
      if (!remoto) return { ok: false, error: 'sin conexión' };
      const { data, error } = await sb.rpc('resolver_verificacion', {
        p_prestador_id: prestadorId, p_aprobar: aprobar, p_motivo: motivo,
      });
      if (error) { console.warn('[PronetDB] resolverVerificacion', error.message); return { ok: false, error: error.message }; }
      return data;
    },

    /** Zonas con su nivel y sus ancestros ya calculados (vista
     *  `zonas_arbol`): 1 zona, 2 comunidad, 3 barrio.
     *
     *  Se usa donde hace falta distinguir niveles. `listarZonas()` sigue
     *  sirviendo para lo plano — el selector del mapa, por ejemplo. */
    async listarZonasArbol(soloActivas = true) {
      if (!remoto) return [];
      let q = sb.from('zonas_arbol').select('*').order('orden', { ascending: true });
      if (soloActivas) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarZonasArbol', error.message); return []; }
      return data || [];
    },

    async listarZonas(soloActivas = true) {
      if (!remoto) return [];
      let q = sb.from('zonas').select('*').order('orden', { ascending: true });
      if (soloActivas) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarZonas', error.message); return []; }
      return data || [];
    },

    /** Edita una zona existente. UPDATE y no upsert, por el mismo motivo
     *  que en `guardarRubro`: el upsert intentaría insertar con los campos
     *  obligatorios en null. */
    async guardarZona(nombre, campos) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('zonas')
        .update(campos).eq('nombre', nombre).select('nombre');
      if (error) { console.warn('[PronetDB] guardarZona', error.message); return { ok: false, error: error.message }; }
      if (!data || !data.length) return { ok: false, error: 'No se encontró la zona o no tenés permiso' };
      return { ok: true };
    },

    /** Catálogo de rubros. Lectura pública: los chips del home se dibujan
     *  antes de que haya sesión. `soloActivos` para todo lo que ofrece
     *  elegir; el panel de admin los quiere todos. */
    async listarRubros(soloActivos = true) {
      if (!remoto) return [];
      let q = sb.from('rubros').select('*').order('orden', { ascending: true });
      if (soloActivos) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarRubros', error.message); return []; }
      return data || [];
    },

    /** Edita un rubro existente. Sólo admin.
     *
     *  UPDATE y no upsert: el upsert de PostgREST es INSERT … ON CONFLICT,
     *  así que intenta el INSERT primero y falla contra el NOT NULL de
     *  `nombre` cuando sólo se mandan los campos editados. Para crear un
     *  rubro nuevo está `crearRubro`, que exige la fila completa. */
    async guardarRubro(slug, campos) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('rubros')
        .update(campos).eq('slug', slug).select('slug');
      if (error) { console.warn('[PronetDB] guardarRubro', error.message); return { ok: false, error: error.message }; }
      // Sin filas devueltas el UPDATE no encontró nada (o RLS lo filtró):
      // sin este chequeo el panel diría "guardado" sin haber guardado.
      if (!data || !data.length) return { ok: false, error: 'No se encontró el rubro o no tenés permiso' };
      return { ok: true };
    },

    /** Alta de un rubro. Exige nombre y slug; el resto tiene default. */
    async crearRubro(rubro) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (!rubro?.slug || !rubro?.nombre) return { ok: false, error: 'Faltan slug y nombre' };
      const { error } = await sb.from('rubros').insert(rubro);
      if (error) {
        console.warn('[PronetDB] crearRubro', error.message);
        return { ok: false, error: this._errorAlta(error, 'un rubro') };
      }
      return { ok: true };
    },

    /** Guarda los límites y precios de un plan. Sólo admin (policy
     *  `limites_admin_escribe`); si no lo es, RLS rechaza y se devuelve el
     *  error en vez de fingir que guardó. */
    async guardarPlanLimites(plan, cambios) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('planes_limites')
        .update(cambios).eq('plan', plan).select('plan');
      if (error) { console.warn('[PronetDB] guardarPlanLimites', error.message); return { ok: false, error: error.message }; }
      // Un UPDATE que RLS filtra no devuelve error, sólo cero filas. Sin
      // este chequeo el panel diría "✅ Guardado" sin haber guardado nada.
      if (!data || !data.length) return { ok: false, error: 'No se pudo guardar: sin permisos de administrador' };
      return { ok: true };
    },

    // ══ BANNERS PUBLICITARIOS ════════════════════════════════════════════

    /** Los que se muestran en el carrusel: activos y dentro de su vigencia.
     *
     *  La fecha la filtra el SERVIDOR, no el cliente. Si dependiera del reloj
     *  del teléfono, alguien con la fecha mal vería pauta vencida — y una
     *  promoción vencida en pantalla es un problema con quien la pagó. */
    async listarBannersVigentes() {
      if (!remoto) return [];
      const ahora = new Date().toISOString();
      const { data, error } = await sb.from('banners')
        .select('id, imagen_url, enlace')
        .eq('activo', true)
        .or('desde.is.null,desde.lte.' + ahora)
        .or('hasta.is.null,hasta.gte.' + ahora)
        .order('orden', { ascending: true });
      if (error) { console.warn('[PronetDB] listarBannersVigentes', error.message); return []; }
      return data || [];
    },

    /** Todos, incluidos los apagados y vencidos. Para el panel. */
    async listarBanners() {
      if (!remoto) return [];
      const { data, error } = await sb.from('banners').select('*')
        .order('orden', { ascending: true });
      if (error) { console.warn('[PronetDB] listarBanners', error.message); return []; }
      return data || [];
    },

    async crearBanner(banner) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (!banner?.nombre || !banner?.imagen_url) return { ok: false, error: 'Faltan nombre e imagen' };
      const { error } = await sb.from('banners').insert(banner);
      if (error) {
        console.warn('[PronetDB] crearBanner', error.message);
        return { ok: false, error: this._errorAlta(error, 'un banner') };
      }
      return { ok: true };
    },

    async guardarBanner(id, campos) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('banners').update(campos).eq('id', id).select('id');
      if (error) { console.warn('[PronetDB] guardarBanner', error.message); return { ok: false, error: error.message }; }
      if (!data?.length) return { ok: false, error: 'No se pudo guardar: sin permisos de administrador' };
      return { ok: true };
    },

    async borrarBanner(id) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('banners').delete().eq('id', id).select('id');
      if (error) { console.warn('[PronetDB] borrarBanner', error.message); return { ok: false, error: error.message }; }
      if (!data?.length) return { ok: false, error: 'No se pudo borrar: sin permisos de administrador' };
      return { ok: true };
    },

    // ── Banners que compra un vecino ──────────────────────────────────
    // Ver supabase-banners-pagos.sql. Todo el circuito está detrás del flag
    // `banners_pagos_activos`; apagado, estos métodos no se llaman.

    /** Cuántos espacios quedan libres de los 6 (o los que diga la config). */
    async bannersEspaciosLibres() {
      if (!remoto) return 0;
      const { data, error } = await sb.rpc('banners_espacios_libres');
      if (error) { console.warn('[PronetDB] bannersEspaciosLibres', error.message); return 0; }
      return Number(data) || 0;
    },

    /** Alta de un banner COMPRADO por un vecino. Queda 'pendiente' de
     *  moderación y está gateada por `banners_pagos_activos`.
     *
     *  Ojo con el nombre: NO es `crearBanner` — ése es el alta editorial del
     *  admin, que inserta directo y no pasa por el flag. Llamarlos igual hizo
     *  que el segundo pisara al primero (en un objeto gana la última clave) y
     *  el ABM del panel empezó a rechazar con "los espacios publicitarios no
     *  están disponibles". */
    async comprarBanner({ nombre, imagen_url, enlace, dias, destino } = {}) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.rpc('crear_banner', {
        p_nombre: nombre, p_imagen_url: imagen_url, p_enlace: enlace,
        p_dias: dias || 30, p_destino: destino || 'whatsapp',
      });
      if (error) { console.warn('[PronetDB] crearBanner', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false, error: 'Sin respuesta' };
    },

    /** Los banners propios, en cualquier estado. La RLS los acota al dueño. */
    async listarMisBanners() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data, error } = await sb.from('banners')
        .select('id, nombre, imagen_url, enlace, destino_tipo, estado, motivo_rechazo, dias, clicks, desde, hasta, creado')
        .eq('usuario_id', uid)
        .order('creado', { ascending: false });
      if (error) { console.warn('[PronetDB] listarMisBanners', error.message); return []; }
      return data || [];
    },

    /** Los que esperan moderación. Sólo devuelve algo si quien pregunta es admin. */
    async listarBannersPendientes() {
      if (!remoto) return [];
      const { data, error } = await sb.from('banners')
        .select('id, nombre, imagen_url, enlace, destino_tipo, dias, creado, usuario_id, perfiles:usuario_id (nombre)')
        .eq('estado', 'pendiente')
        .order('creado', { ascending: true });
      if (error) { console.warn('[PronetDB] listarBannersPendientes', error.message); return []; }
      return data || [];
    },

    /** Aprueba o rechaza. Sólo admin (lo valida el RPC). */
    async resolverBanner(id, aprobar, motivo) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.rpc('resolver_banner', {
        p_banner_id: id, p_aprobar: !!aprobar, p_motivo: motivo || null,
      });
      if (error) { console.warn('[PronetDB] resolverBanner', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false, error: 'Sin respuesta' };
    },

    /** Sube la imagen al bucket y devuelve su URL pública.
     *
     *  `carpetaPropia` la mete en <uid>/…, que es lo único que la policy le
     *  permite escribir a un usuario común. El admin sube a la raíz, como
     *  siempre, para no mover los banners editoriales que ya existen. */
    async subirImagenBanner(archivo, carpetaPropia = false) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase();
      let ruta = 'b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      if (carpetaPropia) {
        const uid = await this.usuarioIdActual();
        if (!uid) return { ok: false, error: 'Sin sesión' };
        ruta = uid + '/' + ruta;
      }
      const { error } = await sb.storage.from('banners')
        .upload(ruta, archivo, { cacheControl: '3600', upsert: false });
      if (error) {
        console.warn('[PronetDB] subirImagenBanner', error.message);
        return { ok: false, error: /policy|denied/i.test(error.message)
          ? 'Sin permisos de administrador para subir imágenes' : error.message };
      }
      const { data } = sb.storage.from('banners').getPublicUrl(ruta);
      return { ok: true, url: data.publicUrl };
    },

    /** Suma un click. Silencioso a propósito: es una métrica, y si falla no
     *  tiene por qué interrumpirle la navegación a nadie. */
    async clickBanner(id) {
      if (!remoto || !id) return;
      try { await sb.rpc('click_banner', { p_banner_id: id }); } catch (e) { /* métrica */ }
    },

    /** Traduce los dos rechazos esperables de un alta de parametría. Sin
     *  esto el panel muestra el texto crudo de Postgres ("new row violates
     *  row-level security policy for table…"), que no le dice nada a quien
     *  está cargando un barrio. */
    _errorAlta(error, queEs) {
      if (error.code === '23505') return 'Ya existe ' + queEs + ' con ese nombre';
      if (error.code === '42501') return 'No se pudo crear: sin permisos de administrador';
      return error.message;
    },

    /** Alta de zona. `nombre` es la clave primaria y `madre` el grupo con el
     *  que se filtra, así que los dos son obligatorios. Sin lat/lng la zona
     *  existe igual pero no se dibuja en el mapa de ProMarket. */
    async crearZona(zona) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (!zona?.nombre || !zona?.madre) return { ok: false, error: 'Faltan nombre y zona madre' };
      const { error } = await sb.from('zonas').insert(zona);
      if (error) {
        console.warn('[PronetDB] crearZona', error.message);
        return { ok: false, error: this._errorAlta(error, 'una zona') };
      }
      return { ok: true };
    },

    /** Alta de nivel de loyalty.
     *
     *  `orden` se renumera para TODOS después de insertar, en vez de
     *  calcularle un número al nuevo. Si sólo se le asignara uno, un nivel
     *  intermedio quedaría mal: con Bronce=1, Plata=2, Oro=3, Élite=4, un
     *  Platino de 3.000 puntos calculado como "los que tiene debajo × 10"
     *  daría 30 y se mostraría ÚLTIMO, después de Élite. El orden tiene que
     *  salir de los puntos, que es lo que de verdad ordena los niveles. */
    async crearLoyaltyNivel(nivel) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (!nivel?.nombre) return { ok: false, error: 'Falta el nombre' };
      const { error } = await sb.from('loyalty_niveles').insert(nivel);
      if (error) {
        console.warn('[PronetDB] crearLoyaltyNivel', error.message);
        return { ok: false, error: this._errorAlta(error, 'un nivel') };
      }
      await this.renumerarNiveles();
      return { ok: true };
    },

    /** Deja `orden` alineado con `min_puntos`. Sólo escribe las filas que
     *  cambian: son cinco, pero no hay razón para tocar las que ya están. */
    async renumerarNiveles() {
      if (!remoto) return { ok: true };
      const filas = await this.listarLoyaltyNiveles();
      const ordenadas = [...filas].sort((a, b) => a.min_puntos - b.min_puntos);
      for (let i = 0; i < ordenadas.length; i++) {
        if (ordenadas[i].orden !== i + 1) {
          await sb.from('loyalty_niveles').update({ orden: i + 1 }).eq('nombre', ordenadas[i].nombre);
        }
      }
      return { ok: true };
    },

    /** Funcionalidades apagadas: una sola clave de config_app con los
     *  nombres separados por coma. Devuelve un array. */
    async listarFeaturesApagadas() {
      if (!remoto) return [];
      const { data, error } = await sb.from('config_app')
        .select('valor').eq('clave', 'features_off').maybeSingle();
      if (error) { console.warn('[PronetDB] listarFeaturesApagadas', error.message); return []; }
      return (data?.valor || '').split(',').map(s => s.trim()).filter(Boolean);
    },

    /** Guarda la lista de funcionalidades apagadas. Sólo admin. */
    async guardarFeaturesApagadas(lista) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const valor = (lista || []).filter(Boolean).join(',');
      const { error } = await sb.from('config_app')
        .upsert({ clave: 'features_off', valor }, { onConflict: 'clave' });
      if (error) { console.warn('[PronetDB] guardarFeaturesApagadas', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    // ── ProMarket ─────────────────────────────────────────────────────

    /** Lista publicaciones activas, opcionalmente filtradas por categoría.
     *  Orden cronológico inverso, paginado de 10 en 10. */
    async listarPublicaciones({ categoria = null, busqueda = null, zona = null, offset = 0, categorias = null, barrios = null, incluirSinBarrio = true } = {}) {
      if (!remoto) return [];
      let q = sb.from('publicaciones')
        // `lote` NO se trae en el feed: es la dirección del vendedor y no se
        // muestra en la tarjeta. Viaja sólo cuando hay pedido, en el chat.
        .select(`id, autor_id, categoria, titulo, descripcion, precio, precio_convenir, detalles, foto_url, zona, barrio, creado,
                 disponible, likes_count, comentarios_count, perfiles:autor_id (nombre, zona)`)
        .eq('activa', true)
        .order('creado', { ascending: false })
        .range(offset, offset + 9);
      if (zona) q = q.eq('zona', zona);
      // Mercado acotado a una comunidad: `barrios` trae la comunidad y sus
      // barrios. Las comillas en el in() son necesarias: hay nombres con
      // espacios y con barra ("Matheu / Garín").
      //
      // `incluirSinBarrio` distingue dos usos que parecen el mismo:
      //  - ámbito de comunidad (true): las publicaciones sin barrio entran
      //    igual, porque son anteriores a que el campo fuera obligatorio y
      //    esconderlas dejaría el feed casi vacío.
      //  - un barrio puntual elegido en el mapa (false): el pin dice
      //    "Araucarias · 2" y al tocarlo tienen que aparecer esas 2, no 4.
      if (barrios?.length) {
        const lista = barrios.map(b => '"' + String(b).replace(/"/g, '') + '"').join(',');
        if (incluirSinBarrio) q = q.or(`barrio.is.null,barrio.in.(${lista})`);
        else                  q = q.in('barrio', barrios);
      }
      // `categorias` acota a una sección (todas las de Servicios, o las de
      // Mercado); `categoria` es el chip puntual dentro de esa sección. El
      // chip gana, pero igual pertenece a la sección activa.
      if (categoria && categoria !== 'todos') q = q.eq('categoria', categoria);
      else if (categorias?.length)            q = q.in('categoria', categorias);
      if (busqueda && busqueda.trim()) {
        const term = `%${busqueda.trim()}%`;
        q = q.or(`titulo.ilike.${term},descripcion.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarPublicaciones', error.message); return []; }
      return data || [];
    },

    // ── Pre-alta de prestadores ───────────────────────────────────────
    // Captar en la calle sin obligar a crear una cuenta. Ver
    // supabase-prealta-prestador.sql.

    /** Código de invitación del usuario actual. Se crea solo la primera vez. */
    async miCodigoReferido() {
      if (!remoto) return null;
      const { data, error } = await sb.rpc('mi_codigo_referido');
      if (error) { console.warn('[PronetDB] miCodigoReferido', error.message); return null; }
      return data || null;
    },

    /** Alta de un lead. Se llama SIN sesión: el que carga es el prestador que
     *  todavía no tiene cuenta, y por eso el RPC exige un código válido. */
    async crearPrealta({ codigo, nombre, telefono, rubros, zona, barrio, dni } = {}) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.rpc('crear_prealta', {
        p_codigo: codigo, p_nombre: nombre, p_telefono: telefono,
        p_rubros: rubros || [], p_zona: zona || null,
        p_barrio: barrio || null, p_dni: dni || null,
      });
      if (error) { console.warn('[PronetDB] crearPrealta', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false, error: 'Sin respuesta' };
    },

    /** Nombre de una pre-alta, para saludar por su nombre en el registro.
     *  Callable sin sesión; no devuelve teléfono ni DNI a propósito. */
    async prealtaPublica(id) {
      if (!remoto || !id) return null;
      const { data, error } = await sb.rpc('prealta_publica', { p_prealta_id: id });
      if (error) { console.warn('[PronetDB] prealtaPublica', error.message); return null; }
      return data || null;
    },

    /** Convierte la pre-alta en la ficha de prestador del usuario logueado.
     *  Se llama después del registro, con el id que venía en el link. */
    async reclamarPrealta(id) {
      if (!remoto || !id) return { ok: false, error: 'Sin id' };
      const { data, error } = await sb.rpc('reclamar_prealta', { p_prealta_id: id });
      if (error) { console.warn('[PronetDB] reclamarPrealta', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false, error: 'Sin respuesta' };
    },

    /** A quiénes invitó el usuario actual (o todas, si es admin). */
    async listarMisPrealtas() {
      if (!remoto) return [];
      const { data, error } = await sb.rpc('mis_prealtas');
      if (error) { console.warn('[PronetDB] listarMisPrealtas', error.message); return []; }
      return data || [];
    },

    /** Los lotes que el usuario actual tiene permitido ver, de un lote de ids.
     *
     *  El lote es la dirección del vendedor: no viene en `listarPublicaciones`
     *  y `publicaciones.lote` ya no tiene SELECT para authenticated. Sólo lo
     *  devuelve este RPC, y sólo si el autor lo habilitó y el que mira vive
     *  en su misma comunidad (ver supabase-lote-opcional.sql).
     *
     *  Batch por página, no por tarjeta: una consulta por publicación serían
     *  diez por scroll. Mismo criterio que listarRecomendaciones. */
    async listarLotesVisibles(ids) {
      if (!remoto || !ids?.length) return new Map();
      const { data, error } = await sb.rpc('lotes_visibles', { p_ids: ids });
      if (error) { console.warn('[PronetDB] listarLotesVisibles', error.message); return new Map(); }
      return new Map((data || []).map(r => [r.id, r.lote]));
    },

    /** Crea una publicación nueva. El autor_id lo pone RLS (auth.uid()). */
    async crearPublicacion({ categoria, titulo, descripcion, precio, precio_convenir, detalles, foto_url, zona, barrio, lote, mostrar_lote }) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data, error } = await sb.from('publicaciones')
        .insert({ autor_id: uid, categoria, titulo, descripcion: descripcion || null,
                  precio: precio || null, precio_convenir: !!precio_convenir, detalles: detalles || [],
                  foto_url: foto_url || null, zona: zona || null,
                  barrio: barrio || null, lote: lote || null,
                  mostrar_lote: !!mostrar_lote })
        .select('id').single();
      if (error) return { ok: false, error: error.message };
      // Best-effort: notificar suscriptores con alertas que coincidan
      if (data?.id) {
        sb.functions.invoke('match-alertas', { body: { publicacion_id: data.id } }).catch(() => {});
      }
      return { ok: true, id: data.id };
    },

    /** Cuántas publicaciones activas hay, opcionalmente acotado a un conjunto
     *  de zonas. Lo usa la portada de Entre Vecinos para mostrar un número
     *  real en vez del "24 vecinos activos hoy" fijo del diseño.
     *
     *  Cuenta publicaciones, no personas: es lo que la tabla sabe de verdad y
     *  lo que el vecino puede contrastar entrando al feed. "Vecinos activos"
     *  implicaría una noción de actividad que no registramos.
     *
     *  head:true — sólo pide el count, no trae las filas. */
    async contarPublicacionesActivas(zonas = null) {
      if (!remoto) return 0;
      let q = sb.from('publicaciones')
        .select('id', { count: 'exact', head: true })
        .eq('activa', true);
      if (zonas?.length) q = q.in('zona', zonas);
      const { count, error } = await q;
      if (error) { console.warn('[PronetDB] contarPublicacionesActivas', error.message); return 0; }
      return count || 0;
    },

    /** Publicaciones que un usuario creó en el mes calendario actual (cupo Plus). */
    async contarPublicacionesMercadoMes(usuarioId) {
      if (!remoto || !usuarioId) return 0;
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      const { count, error } = await sb.from('publicaciones')
        .select('id', { count: 'exact', head: true })
        .eq('autor_id', usuarioId)
        .gte('creado', inicio.toISOString());
      if (error) { console.warn('[PronetDB] contarPublicacionesMercadoMes', error.message); return 0; }
      return count || 0;
    },

    /** Publicaciones que un usuario creó en el año calendario actual (cupo gratis). */
    async contarPublicacionesMercadoAnio(usuarioId) {
      if (!remoto || !usuarioId) return 0;
      const inicio = new Date();
      inicio.setMonth(0, 1);
      inicio.setHours(0, 0, 0, 0);
      const { count, error } = await sb.from('publicaciones')
        .select('id', { count: 'exact', head: true })
        .eq('autor_id', usuarioId)
        .gte('creado', inicio.toISOString());
      if (error) { console.warn('[PronetDB] contarPublicacionesMercadoAnio', error.message); return 0; }
      return count || 0;
    },

    /** Crea o reutiliza una alerta de búsqueda para el usuario actual. */
    async crearAlertaBusqueda(termino) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const t = termino.trim().toLowerCase();
      const { error } = await sb.from('alertas_busqueda')
        .upsert({ usuario_id: uid, termino: t, activa: true },
                 { onConflict: 'usuario_id,termino', ignoreDuplicates: false });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Registra una búsqueda en ProMarket (best-effort, no bloquea la UX).
     *  Se usa solo para agregar tendencias — nunca se expone individualmente. */
    async registrarBusquedaMercado(termino, zona, categoria, resultadosCount) {
      if (!remoto) return;
      const uid = await this.usuarioIdActual();
      if (!uid) return; // solo se loguea de usuarios logueados
      // Sin `.catch()` colgado del builder: no existe y tiraba TypeError antes
      // de mandar el insert. `busquedas_mercado` quedó en cero filas.
      const { error } = await sb.from('busquedas_mercado').insert({
        termino: termino.trim().toLowerCase().slice(0, 100),
        zona: zona || null,
        categoria: categoria && categoria !== 'todos' ? categoria : null,
        resultados_count: resultadosCount || 0,
        usuario_id: uid,
      });
      if (error) console.warn('[PronetDB] registrarBusquedaMercado', error.message);
    },

    /** Términos más buscados sin resultado en una zona (últimos 7 días,
     *  mínimo 3 búsquedas). Devuelve [{termino, cantidad}]. */
    async listarTendenciasBusqueda(zona) {
      if (!remoto || !zona) return [];
      const { data, error } = await sb.rpc('tendencias_busqueda_zona', { p_zona: zona });
      if (error) { console.warn('[PronetDB] listarTendenciasBusqueda', error.message); return []; }
      return data || [];
    },

    /** Lista todas las alertas de búsqueda activas del usuario actual. */
    async listarMisAlertas() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data, error } = await sb.from('alertas_busqueda')
        .select('id, termino, creado')
        .eq('usuario_id', uid).eq('activa', true)
        .order('creado', { ascending: false });
      if (error) { console.warn('[PronetDB] listarMisAlertas', error.message); return []; }
      return data || [];
    },

    /** Elimina una alerta de búsqueda por id (usada desde la pantalla Mis alertas). */
    async eliminarAlertaBusquedaPorId(id) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false };
      const { error } = await sb.from('alertas_busqueda').delete().eq('id', id).eq('usuario_id', uid);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Elimina una alerta de búsqueda del usuario actual. */
    async eliminarAlertaBusqueda(termino) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false };
      await sb.from('alertas_busqueda')
        .delete().eq('usuario_id', uid).eq('termino', termino.trim().toLowerCase());
      return { ok: true };
    },

    /** Devuelve true si el usuario ya tiene una alerta activa para ese término. */
    async verificarAlertaBusqueda(termino) {
      if (!remoto) return false;
      const uid = await this.usuarioIdActual();
      if (!uid) return false;
      const { data } = await sb.from('alertas_busqueda')
        .select('id').eq('usuario_id', uid).eq('termino', termino.trim().toLowerCase())
        .eq('activa', true).maybeSingle();
      return !!data;
    },

    /** Lista todos los hilos de chat iniciados por el usuario como consultante. */
    async listarMisConsultasEnviadas() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data: chats, error } = await sb.from('chats_mercado')
        .select('id, ultimo_mensaje, hora_ultimo, publicacion_id, autor_id, publicaciones(titulo, foto_url)')
        .eq('consultante_id', uid)
        .order('hora_ultimo', { ascending: false, nullsFirst: false });
      if (error) { console.warn('[PronetDB] listarMisConsultasEnviadas', error.message); return []; }
      if (!chats || !chats.length) return [];
      const ids = [...new Set(chats.map(c => c.autor_id))];
      const { data: perfiles } = await sb.from('perfiles').select('id, nombre').in('id', ids);
      const pm = Object.fromEntries((perfiles || []).map(p => [p.id, p]));
      return chats.map(c => ({ ...c, autor: pm[c.autor_id] || {} }));
    },

    /** Devuelve {zona: count} de publicaciones activas para el mapa.
     *
     *  El GROUP BY corre en Postgres (RPC contar_publicaciones_por_zona).
     *  Antes se traían TODAS las filas con select('zona') y se contaban
     *  acá con un forEach: a 50k publicaciones eso transfería 50k filas
     *  al dispositivo para armar un contador de 11 números, con costo
     *  lineal al tamaño de la tabla. Ahora la respuesta es de tamaño
     *  constante (una fila por zona). */
    /** `[{lugar, cantidad, vecinos}]` de publicaciones activas. Alimenta los
     *  pines del mapa y el resumen de búsqueda ("3 vecinos ofrecen pizza ·
     *  Araucarias (2)").
     *
     *  Agrupa por barrio y no por zona: un pin para todo Escobar no contesta
     *  "¿dónde hay empanadas?". Las que no declaran barrio caen en el pin de
     *  su zona — son anteriores a que el campo fuera obligatorio y perderlas
     *  del mapa sería peor. `barrios` acota igual que el feed. */
    async contarPublicacionesPorBarrio({ categoria = null, busqueda = null, barrios = null, zona = null, categorias = null } = {}) {
      if (!remoto) return [];
      const { data, error } = await sb.rpc('contar_publicaciones_por_barrio', {
        p_categoria: categoria && categoria !== 'todos' ? categoria : null,
        p_busqueda:  busqueda && busqueda.trim() ? busqueda.trim() : null,
        p_barrios:   barrios?.length ? barrios : null,
        p_zona:      zona || null,
        // Acota a la sección activa. Sin esto el conteo no coincide con lo
        // que el feed muestra: en Servicios contaría también los productos.
        p_categorias: categorias?.length ? categorias : null,
      });
      if (error) { console.warn('[PronetDB] contarPublicacionesPorBarrio', error.message); return []; }
      return (data || [])
        .filter(r => r.lugar)
        .map(r => ({
          lugar: r.lugar,
          cantidad: Number(r.cantidad) || 0,
          // Personas distintas, no publicaciones: dos avisos de la misma
          // persona son un vecino. Decir "2 vecinos" ahí sería inflar el
          // mercado, que es justo la impresión que no queremos dar con el
          // marketplace arrancando. Medido: Araucarias tiene 2 y 1.
          vecinos: Number(r.vecinos) || 0,
        }));
    },

    async contarPublicacionesPorZona({ categoria = null, busqueda = null } = {}) {
      if (!remoto) return {};
      const { data, error } = await sb.rpc('contar_publicaciones_por_zona', {
        p_categoria: categoria && categoria !== 'todos' ? categoria : null,
        p_busqueda:  busqueda && busqueda.trim() ? busqueda.trim() : null,
      });
      if (error) { console.warn('[PronetDB] contarPublicacionesPorZona', error.message); return {}; }
      const counts = {};
      (data || []).forEach(r => { if (r.zona) counts[r.zona] = Number(r.cantidad) || 0; });
      return counts;
    },

    /** Edita campos de una publicación propia. foto_url=undefined la deja sin cambios. */
    /** Marca una publicación con o sin stock.
     *
     *  Método aparte y NO `editarPublicacion({disponible})`: esa función
     *  desestructura campos fijos y escribe siempre categoría, título,
     *  precio y detalles. Llamarla con un solo campo dejaría el resto en
     *  null — borraría la publicación en vez de marcarla. */
    async cambiarDisponibilidad(id, disponible) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data, error } = await sb.from('publicaciones')
        .update({ disponible: !!disponible })
        .eq('id', id).eq('autor_id', uid).select('id');
      if (error) { console.warn('[PronetDB] cambiarDisponibilidad', error.message); return { ok: false, error: error.message }; }
      // RLS filtra sin dar error: cero filas significa que la publicación no
      // es de quien pregunta.
      if (!data?.length) return { ok: false, error: 'No es tu publicación' };
      return { ok: true };
    },

    async editarPublicacion(id, { categoria, titulo, descripcion, precio, precio_convenir, detalles, foto_url, zona, barrio, lote, mostrar_lote }) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const campos = { categoria, titulo, descripcion: descripcion || null, precio: precio ?? null, precio_convenir: !!precio_convenir, detalles: detalles || [] };
      if (foto_url !== undefined) campos.foto_url = foto_url;
      // Ubicación: sólo se pisa si vino. Un editar que no toca la zona no
      // debería borrarla.
      if (zona   !== undefined) campos.zona   = zona || null;
      if (barrio !== undefined) campos.barrio = barrio || null;
      if (lote   !== undefined) campos.lote   = lote || null;
      if (mostrar_lote !== undefined) campos.mostrar_lote = !!mostrar_lote;
      const { error } = await sb.from('publicaciones').update(campos).eq('id', id).eq('autor_id', uid);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Lista todos los hilos de chat recibidos como autor de publicaciones. */
    async listarConsultasRecibidas() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data: chats, error } = await sb.from('chats_mercado')
        .select('id, ultimo_mensaje, hora_ultimo, publicacion_id, consultante_id, publicaciones(titulo)')
        .eq('autor_id', uid)
        .order('hora_ultimo', { ascending: false, nullsFirst: false });
      if (error) { console.warn('[PronetDB] listarConsultasRecibidas', error.message); return []; }
      if (!chats || !chats.length) return [];
      const ids = [...new Set(chats.map(c => c.consultante_id))];
      const { data: perfiles } = await sb.from('perfiles').select('id, nombre').in('id', ids);
      const pm = Object.fromEntries((perfiles || []).map(p => [p.id, p]));
      return chats.map(c => ({ ...c, consultante: pm[c.consultante_id] || {} }));
    },

    /** Lista todas las publicaciones propias (activas e inactivas).
     *
     *  Va por RPC y no por select directo porque `lote` dejó de tener SELECT
     *  para `authenticated`, y GRANT es por ROL y no por fila: sin esto el
     *  propio autor no podría leer su lote para editarlo. El RPC filtra por
     *  auth.uid(), así que sigue devolviendo sólo lo suyo. */
    async listarMisPublicaciones() {
      if (!remoto) return [];
      const { data, error } = await sb.rpc('mis_publicaciones');
      if (error) { console.warn('[PronetDB] listarMisPublicaciones', error.message); return []; }
      return data || [];
    },

    /** Reactiva una publicación propia desactivada. */
    async reactivarPublicacion(id) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { error } = await sb.from('publicaciones').update({ activa: true }).eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Desactiva (soft-delete) una publicación propia. */
    async desactivarPublicacion(id) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { error } = await sb.from('publicaciones')
        .update({ activa: false }).eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Sube una foto al bucket mercado y devuelve la URL pública. */
    async subirFotoMercado(archivo, usuarioId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const ext  = archivo.name.split('.').pop().toLowerCase();
      const path = `${usuarioId}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from('mercado').upload(path, archivo,
        { cacheControl: '3600', upsert: false });
      if (error) return { ok: false, error: error.message };
      const { data } = sb.storage.from('mercado').getPublicUrl(path);
      return { ok: true, url: data.publicUrl };
    },

    /** Registra en la base la aceptación de T&C/privacidad, una sola vez por
     *  cuenta (conserva la fecha de la primera aceptación, no la pisa).
     *  Recibe el timestamp real del checkbox (guardado en localStorage) en
     *  vez de usar "ahora" — así no se inventa una fecha de consentimiento
     *  para sesiones viejas que nunca vieron el modal. */
    async registrarAceptacionTyc(timestampLocal) {
      if (!remoto || !timestampLocal) return;
      const uid = await this.usuarioIdActual();
      if (!uid) return;
      const { data } = await sb.from('perfiles').select('tyc_aceptado_en').eq('id', uid).maybeSingle();
      if (data?.tyc_aceptado_en) return;
      // OJO: nada de `.catch()` colgado del builder de PostgREST — no existe
      // ese método, así que la llamada tiraba TypeError ANTES de mandar el
      // request y el consentimiento no se guardaba nunca. Los errores de
      // PostgREST vienen en `error`, no por excepción.
      const { error } = await sb.from('perfiles')
        .update({ tyc_aceptado_en: timestampLocal }).eq('id', uid);
      if (error) console.warn('[PronetDB] registrarAceptacionTyc', error.message);
    },

    /** Devuelve el teléfono de un usuario, solo si ya comparten un chat de
     *  ProMarket (ver supabase-fix-perfiles-lectura.sql — el teléfono no es
     *  legible por un SELECT genérico, solo por esta función). */
    async obtenerTelefonoUsuario(userId) {
      if (!remoto || !userId) return null;
      const { data, error } = await sb.rpc('obtener_telefono_contacto', { p_usuario_id: userId });
      if (error) { console.warn('[PronetDB] obtenerTelefonoUsuario', error.message); return null; }
      return data || null;
    },

    /** Abre (o recupera) el chat de consulta entre quien consulta y el autor de la publicación. */
    async abrirChatMercado(publicacionId) {
      if (!remoto) return { ok: false, error: 'El chat requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: pub, error: pubErr } = await sb.from('publicaciones')
        .select('autor_id').eq('id', publicacionId).single();
      if (pubErr || !pub) return { ok: false, error: 'Publicación no encontrada' };
      const { data, error } = await sb.from('chats_mercado')
        .upsert({ publicacion_id: publicacionId, autor_id: pub.autor_id, consultante_id: uid },
                 { onConflict: 'publicacion_id,consultante_id', ignoreDuplicates: false })
        .select('id').single();
      if (error) { console.warn('[PronetDB] abrirChatMercado', error.message); return { ok: false, error: error.message }; }
      return { ok: true, chat_id: data.id };
    },

    /** Lista los mensajes de un chat de mercado. */
    async listarMensajesMercado(chatId) {
      if (!remoto) return [];
      const { data, error } = await sb.from('mensajes_mercado')
        .select('*').eq('chat_id', chatId).order('creado', { ascending: true });
      if (error) { console.warn('[PronetDB] listarMensajesMercado', error.message); return []; }
      return data || [];
    },

    /** Envía un mensaje en un chat de mercado. */
    async enviarMensajeMercado(chatId, texto) {
      if (!remoto) return { ok: false, error: 'El chat requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data, error } = await sb.from('mensajes_mercado')
        .insert({ chat_id: chatId, autor_id: uid, texto: texto.trim() })
        .select().single();
      if (error) { console.warn('[PronetDB] enviarMensajeMercado', error.message); return { ok: false, error: error.message }; }
      await sb.from('chats_mercado').update({
        ultimo_mensaje: texto.trim().slice(0, 100),
        hora_ultimo: new Date().toISOString(),
      }).eq('id', chatId);
      return { ok: true, mensaje: data };
    },

    /** Envía una propuesta de reserva en un chat de mercado. */
    async enviarReservaMercado(chatId, fecha, hora) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false };
      const metadata = { fecha, hora, estado: 'pendiente' };
      const { data, error } = await sb.from('mensajes_mercado')
        .insert({ chat_id: chatId, autor_id: uid, texto: `Reserva: ${fecha} ${hora}`, tipo: 'reserva', metadata })
        .select().single();
      if (error) { console.warn('[PronetDB] enviarReservaMercado', error.message); return { ok: false, error: error.message }; }
      await sb.from('chats_mercado').update({
        ultimo_mensaje: `📅 Propuesta de reserva`,
        hora_ultimo: new Date().toISOString(),
      }).eq('id', chatId);
      return { ok: true, mensaje: data };
    },

    /** Actualiza el estado de una reserva (pendiente → confirmada | cancelada). */
    async actualizarEstadoReserva(mensajeId, nuevoEstado) {
      if (!remoto) return { ok: false };
      const { data } = await sb.from('mensajes_mercado').select('metadata').eq('id', mensajeId).single();
      const meta = { ...(data?.metadata || {}), estado: nuevoEstado };
      const { error } = await sb.from('mensajes_mercado').update({ metadata: meta }).eq('id', mensajeId);
      if (error) { console.warn('[PronetDB] actualizarEstadoReserva', error.message); return { ok: false }; }
      return { ok: true };
    },

    /** Marca como leídos los mensajes de un chat de mercado que no son del usuario. */
    async marcarLeidosMercado(chatId) {
      if (!remoto) return;
      const uid = await this.usuarioIdActual();
      if (!uid) return;
      await sb.from('mensajes_mercado')
        .update({ leido: true }).eq('chat_id', chatId).eq('leido', false).neq('autor_id', uid);
    },

    /** Guarda un valor de configuración (solo admin, por RLS). */
    async guardarConfigApp(clave, valor) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { error } = await sb.from('config_app').upsert({
        clave, valor: String(valor), actualizado: new Date().toISOString(),
      }, { onConflict: 'clave' });
      if (error) { console.warn('[PronetDB] guardarConfigApp', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** Crea una preferencia de pago en MercadoPago vía Edge Function y
     *  devuelve la URL de checkout. El precio se resuelve server-side —
     *  acá solo mandamos qué plan/periodo quiere el usuario. */
    /** `ref` identifica QUÉ se paga cuando el producto no es el plan en sí:
     *  hoy, el id del banner. Los planes y los créditos no lo mandan. */
    async crearPreferenciaMP(plan, periodo, ref = null) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      try {
        const { data, error } = await sb.functions.invoke('crear-preferencia', { body: { plan, periodo, ref } });
        if (error) { console.warn('[PronetDB] crearPreferenciaMP', error.message); return { ok: false, error: error.message }; }
        if (!data?.init_point) return { ok: false, error: 'Respuesta inválida de MercadoPago' };
        return { ok: true, init_point: data.init_point };
      } catch (e) { return { ok: false, error: String(e) }; }
    },

    /** Devuelve Set con los IDs de publicaciones que el usuario actual likeó. */
    async listarMisLikes(pubIds) {
      if (!remoto || !pubIds?.length) return new Set();
      const uid = await this.usuarioIdActual();
      if (!uid) return new Set();
      const { data } = await sb.from('likes_publicaciones')
        .select('publicacion_id').eq('usuario_id', uid).in('publicacion_id', pubIds);
      return new Set((data || []).map(r => r.publicacion_id));
    },

    /** Alterna like en una publicación. Devuelve { ok, liked } */
    async toggleLike(pubId) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: existing } = await sb.from('likes_publicaciones')
        .select('publicacion_id').eq('usuario_id', uid).eq('publicacion_id', pubId).maybeSingle();
      if (existing) {
        await sb.from('likes_publicaciones').delete().eq('usuario_id', uid).eq('publicacion_id', pubId);
        return { ok: true, liked: false };
      } else {
        await sb.from('likes_publicaciones').insert({ usuario_id: uid, publicacion_id: pubId });
        return { ok: true, liked: true };
      }
    },

    /** Lista los primeros N comentarios de una publicación con el nombre del autor. */
    async listarComentarios(pubId, limit = 30) {
      if (!remoto) return [];
      const { data, error } = await sb.from('comentarios_publicaciones')
        .select('id, texto, creado, autor_id, puntaje, perfiles:autor_id (nombre)')
        .eq('publicacion_id', pubId)
        .order('creado', { ascending: true })
        .limit(limit);
      if (error) { console.warn('[PronetDB] listarComentarios', error.message); return []; }
      return data || [];
    },

    /** Categorías de ProMarket. `tipo` decide la sección: 'servicio' o
     *  'producto'. Lectura pública — el feed se ve sin sesión. */
    async listarMktCategorias(soloActivas = true) {
      if (!remoto) return [];
      let q = sb.from('mkt_categorias').select('*').order('orden', { ascending: true });
      if (soloActivas) q = q.eq('activo', true);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarMktCategorias', error.message); return []; }
      return data || [];
    },

    async crearMktCategoria(cat) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (!cat?.slug || !cat?.nombre) return { ok: false, error: 'Faltan slug y nombre' };
      const { error } = await sb.from('mkt_categorias').insert(cat);
      if (error) {
        console.warn('[PronetDB] crearMktCategoria', error.message);
        return { ok: false, error: this._errorAlta(error, 'una categoría') };
      }
      return { ok: true };
    },

    async guardarMktCategoria(slug, campos) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.from('mkt_categorias')
        .update(campos).eq('slug', slug).select('slug');
      if (error) { console.warn('[PronetDB] guardarMktCategoria', error.message); return { ok: false, error: error.message }; }
      if (!data?.length) return { ok: false, error: 'No se pudo guardar: sin permisos de administrador' };
      return { ok: true };
    },

    /** Recomendaciones de varias publicaciones de una sola consulta.
     *
     *  Devuelve un Map id → { recomiendan, puntajes, promedio }. Va aparte
     *  del feed y no embebido: `publicaciones_recomendaciones` es una vista
     *  agregada y no tiene FK, así que PostgREST no la puede traer como
     *  relación de `publicaciones`. Una consulta más por página es barato;
     *  una por tarjeta no lo sería. */
    async listarRecomendaciones(ids) {
      const vacio = new Map();
      if (!remoto || !ids?.length) return vacio;
      const { data, error } = await sb.from('publicaciones_recomendaciones')
        .select('*').in('publicacion_id', ids);
      if (error) { console.warn('[PronetDB] listarRecomendaciones', error.message); return vacio; }
      return new Map((data || []).map(r => [r.publicacion_id, r]));
    },

    /** Crea un comentario en una publicación.
     *
     *  `puntaje` es opcional: null significa "comentó sin puntuar", que no es
     *  lo mismo que cero. Se normaliza acá para que un 0 o un valor fuera de
     *  rango no llegue nunca a la base — el check lo rechazaría con un error
     *  de Postgres en la cara del usuario. */
    async crearComentario(pubId, texto, puntaje = null) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const n = Number(puntaje);
      const estrellas = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
      const { error } = await sb.from('comentarios_publicaciones')
        .insert({ publicacion_id: pubId, autor_id: uid, puntaje: estrellas,
                  texto: texto.trim().slice(0, 500) });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Borra un comentario propio. */
    async borrarComentario(comentarioId) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false };
      const { error } = await sb.from('comentarios_publicaciones')
        .delete().eq('id', comentarioId).eq('autor_id', uid);
      return error ? { ok: false } : { ok: true };
    },

    async verificarPagoMP(paymentId) {
      if (!remoto) return { ok: false };
      try {
        const { data, error } = await sb.functions.invoke('verificar-pago-mp', { body: { payment_id: String(paymentId) } });
        if (error) { console.warn('[PronetDB] verificarPagoMP', error.message); return { ok: false }; }
        return data || { ok: false };
      } catch (e) { return { ok: false }; }
    },

    /** Propuestas que el prestador creó en el mes calendario actual.
     *  Ante error devuelve 0 (falla abierta): un límite de plan no debe
     *  bloquear al usuario por una caída transitoria de red. */
    async contarPropuestasMes(prestadorId) {
      if (!remoto || !prestadorId) return 0;
      const inicio = new Date();
      inicio.setDate(1);
      inicio.setHours(0, 0, 0, 0);
      const { count, error } = await sb.from('propuestas')
        .select('id', { count: 'exact', head: true })
        .eq('prestador_id', prestadorId)
        .gte('creado', inicio.toISOString());
      if (error) { console.warn('[PronetDB] contarPropuestasMes', error.message); return 0; }
      return count || 0;
    },

    // ── FOTOS DE PORTFOLIO ───────────────────────────────────────────────

    /** Lista las fotos del portfolio de un prestador. */
    async listarPortfolio(prestadorId) {
      if (!remoto || !prestadorId) return [];
      const { data, error } = await sb.from('portfolio_fotos')
        .select('*').eq('prestador_id', prestadorId).order('orden');
      if (error) { console.warn('[PronetDB] listarPortfolio', error.message); return []; }
      return data || [];
    },

    /** Sube una foto al portfolio (resize client-side recomendado antes de llamar). */
    async subirFotoPortfolio(prestadorId, file, descripcion = '') {
      if (!remoto || !prestadorId) return null;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${prestadorId}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('portfolio').upload(path, file, { upsert: false });
      if (upErr) { console.warn('[PronetDB] subirFotoPortfolio', upErr.message); return null; }
      const { data: { publicUrl } } = sb.storage.from('portfolio').getPublicUrl(path);
      const { data, error } = await sb.from('portfolio_fotos')
        .insert({ prestador_id: prestadorId, url: publicUrl, descripcion }).select().maybeSingle();
      if (error) {
        // El archivo ya subió a Storage antes de saber si el INSERT iba a
        // funcionar (ej: el trigger de límite de plan lo rechaza). Sin este
        // borrado queda huérfano en el bucket para siempre — nadie más lo
        // referencia ni lo limpia.
        // El catch es best-effort: si el bucket no tiene policy de DELETE
        // para authenticated, esto falla en silencio y el huérfano persiste
        // igual — no hay forma de confirmarlo desde el cliente sin haber
        // subido un archivo real primero.
        await sb.storage.from('portfolio').remove([path]).catch(() => {});
        console.warn('[PronetDB] portfolio insert', error.message);
        if (esRechazoServidor(error)) throw error; // ej: límite de plan
        return null;
      }
      return data;
    },

    /** Elimina una foto del portfolio. */
    async eliminarFotoPortfolio(fotoId) {
      if (!remoto || !fotoId) return false;
      const { data: foto } = await sb.from('portfolio_fotos')
        .select('url').eq('id', fotoId).maybeSingle();
      const { error } = await sb.from('portfolio_fotos').delete().eq('id', fotoId);
      if (error) return false;
      if (foto?.url) {
        const m = foto.url.match(/\/storage\/v1\/object\/public\/portfolio\/(.+)$/);
        if (m) await sb.storage.from('portfolio').remove([m[1]]).catch(() => {});
      }
      return true;
    },

    // ── PUBLICACIONES DEL PRESTADOR (Servicios · Entre Vecinos) ─────────
    // Fase 2 del plan PLAN-PUBLICACIONES-PRESTADOR.md. El RLS del servidor
    // es quien manda: el dueño no puede autoactivarse ('activa' sólo la pone
    // el RPC del admin) y el trigger de la base limita los slots por plan.

    /** Las publicaciones del prestador logueado, todas, en cualquier estado.
     *  El filtro por prestador_id es NECESARIO además del RLS: la policy de
     *  lectura también me deja ver las activas de OTROS (soy "vecino" para
     *  ellas), así que sin el eq() vendrían mezcladas. */
    async listarMisPubsPrestador() {
      if (!remoto) return [];
      const pid = (await this.usuarioActual())?.prestador_id;
      if (!pid) return [];
      const { data, error } = await sb.from('publicaciones_prestador')
        .select('*').eq('prestador_id', pid).order('creado');
      if (error) { console.warn('[PronetDB] listarMisPubsPrestador', error.message); return []; }
      return data || [];
    },

    /** Crea una publicación (nace como borrador, o directo a revisión).
     *  Devuelve {ok, data} o {ok:false, error, codigo} — el trigger de
     *  límite de slots rechaza con P0001. */
    async crearPubPrestador({ titulo, descripcion, rubro, foto_url, estado = 'borrador' }) {
      if (!remoto) return { ok: false };
      const pid = (await this.usuarioActual())?.prestador_id;
      if (!pid) return { ok: false, error: 'Sin perfil de prestador' };
      const { data, error } = await sb.from('publicaciones_prestador')
        .insert({ prestador_id: pid, titulo, descripcion, rubro, foto_url,
                  estado: estado === 'pendiente' ? 'pendiente' : 'borrador' })
        .select().maybeSingle();
      if (error) {
        console.warn('[PronetDB] crearPubPrestador', error.message);
        return { ok: false, error: error.message,
                 codigo: error.message.includes('limite_publicaciones') ? 'limite' : null };
      }
      return { ok: true, data };
    },

    /** Edita contenido y/o estado. El RLS sólo permite dejarla en borrador o
     *  pendiente — mandar 'activa' desde acá falla a propósito. */
    async actualizarPubPrestador(id, campos) {
      if (!remoto || !id) return { ok: false };
      const permitidos = {};
      ['titulo', 'descripcion', 'rubro', 'foto_url', 'estado'].forEach(k => {
        if (campos[k] !== undefined) permitidos[k] = campos[k];
      });
      const { data, error } = await sb.from('publicaciones_prestador')
        .update(permitidos).eq('id', id).select().maybeSingle();
      if (error) { console.warn('[PronetDB] actualizarPubPrestador', error.message); return { ok: false, error: error.message }; }
      // maybeSingle sin fila = el RLS no dejó (p.ej. editar una activa)
      if (!data) return { ok: false, error: 'No se pudo editar en este estado' };
      return { ok: true, data };
    },

    async borrarPubPrestador(id) {
      if (!remoto || !id) return { ok: false };
      const { error } = await sb.from('publicaciones_prestador').delete().eq('id', id);
      if (error) { console.warn('[PronetDB] borrarPubPrestador', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** Foto de la publicación. Reusa el bucket 'portfolio' (misma policy de
     *  path {prestadorId}/...) con prefijo pub- para distinguirla. */
    async subirFotoPubPrestador(file) {
      if (!remoto || !file) return null;
      const pid = (await this.usuarioActual())?.prestador_id;
      if (!pid) return null;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${pid}/pub-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('portfolio').upload(path, file, { upsert: false });
      if (upErr) { console.warn('[PronetDB] subirFotoPubPrestador', upErr.message); return null; }
      const { data: { publicUrl } } = sb.storage.from('portfolio').getPublicUrl(path);
      return publicUrl;
    },

    /** Métricas de mis publicaciones: {pubId: {vistas, clics, likes, solicitudes}}.
     *
     *  Sale de un RPC y no de contar en el cliente porque las SOLICITUDES
     *  viven en `pedidos`, que el prestador no puede leer entero: sólo ve
     *  los abiertos de su rubro y los dirigidos a él. Contarlas desde acá
     *  daría de menos sin que nada falle — el peor tipo de error, porque el
     *  número igual se muestra. */
    async metricasPubsPrestador(ids) {
      if (!remoto || !ids?.length) return {};
      const res = {};
      ids.forEach(id => { res[id] = { vistas: 0, clics: 0, likes: 0, solicitudes: 0 }; });
      const { data, error } = await sb.rpc('metricas_pubs_prestador');
      if (error) { console.warn('[PronetDB] metricasPubsPrestador', error.message); return res; }
      (data || []).forEach(r => {
        if (!res[r.publicacion_id]) return;
        res[r.publicacion_id] = {
          vistas: Number(r.vistas) || 0,
          clics: Number(r.clics) || 0,
          likes: Number(r.likes) || 0,
          solicitudes: Number(r.solicitudes) || 0,
        };
      });
      return res;
    },

    /** Las zonas cuyos pedidos le corresponden al prestador logueado, ya
     *  expandidas hacia abajo (quien cubre "Puertos del Lago" recibe los de
     *  Araucarias y los demás barrios).
     *
     *  Se resuelve en el servidor para que el feed y el push usen el MISMO
     *  criterio. Antes el feed salía de la zona que el prestador estaba
     *  mirando en su dispositivo, así que tocar el filtro de navegación le
     *  cambiaba los pedidos que recibía. */
    async miCobertura() {
      if (!remoto) return null;
      const { data, error } = await sb.rpc('mi_cobertura');
      if (error) { console.warn('[PronetDB] miCobertura', error.message); return null; }
      return (data && data.length) ? data : null;
    },

    // La renovación NO tiene método acá a propósito: pasa por
    // crearPreferenciaMP('renovacion', …) y la activa el webhook, como el
    // impulso y el banner. El RPC `renovar_pub_prestador` que llamaba este
    // método fue eliminado de la base — dejarlo ejecutable por el cliente
    // era la puerta de atrás del cobro.

    /** Feed del vecino: avisos activos y vigentes. El RLS ya filtra estado,
     *  vigencia y prestador suspendido; los eq/gt de acá son para que el
     *  servidor no mande filas que igual se van a descartar.
     *  Trae del prestador SÓLO la reputación real (rating bayesiano y
     *  reseñas): es el único número de reputación que se muestra. */
    async listarPubsPrestadorActivas({ rubro = null, busqueda = '', limite = 40 } = {}) {
      if (!remoto) return [];
      let q = sb.from('publicaciones_prestador')
        .select('id, titulo, descripcion, rubro, foto_url, publicada_desde, impulso_hasta, prestador_id, prestadores:prestador_id (id, nombre, rating, resenas, zona)')
        .eq('estado', 'activa')
        .gt('vigencia_hasta', new Date().toISOString());
      if (rubro && rubro !== 'todos') q = q.eq('rubro', rubro);
      if (busqueda?.trim()) {
        const t = busqueda.trim().replace(/[%,]/g, ' ');
        q = q.or('titulo.ilike.%' + t + '%,descripcion.ilike.%' + t + '%');
      }
      // Los impulsados primero (Fase 6); dentro de cada grupo, los más nuevos.
      const { data, error } = await q
        .order('impulso_hasta', { ascending: false, nullsFirst: false })
        .order('publicada_desde', { ascending: false })
        .limit(limite);
      if (error) { console.warn('[PronetDB] listarPubsPrestadorActivas', error.message); return []; }
      return data || [];
    },

    /** Registra una vista o un clic de contacto. El RPC decide si cuenta:
     *  excluye a cualquier cuenta prestador y deduplica por día. */
    async registrarEventoPub(pubId, tipo) {
      if (!remoto || !pubId) return;
      const { error } = await sb.rpc('fn_pub_prestador_evento', { p_pub_id: pubId, p_tipo: tipo });
      if (error) console.warn('[PronetDB] registrarEventoPub', error.message);
    },

    /** Like de un aviso de prestador. Devuelve {ok, liked}. */
    async toggleLikePubPrestador(pubId) {
      if (!remoto) return { ok: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: hay } = await sb.from('likes_pub_prestador')
        .select('publicacion_id').eq('usuario_id', uid).eq('publicacion_id', pubId).maybeSingle();
      if (hay) {
        await sb.from('likes_pub_prestador').delete()
          .eq('usuario_id', uid).eq('publicacion_id', pubId);
        return { ok: true, liked: false };
      }
      const { error } = await sb.from('likes_pub_prestador')
        .insert({ usuario_id: uid, publicacion_id: pubId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, liked: true };
    },

    /** Cuáles de estos avisos likeó el usuario, y cuántos likes tiene cada
     *  uno. Un solo par de consultas para todo el feed. */
    async likesDePubsPrestador(ids) {
      const res = { mios: new Set(), conteo: {} };
      if (!remoto || !ids?.length) return res;
      const uid = await this.usuarioIdActual();
      const { data } = await sb.from('likes_pub_prestador')
        .select('publicacion_id, usuario_id').in('publicacion_id', ids);
      (data || []).forEach(l => {
        res.conteo[l.publicacion_id] = (res.conteo[l.publicacion_id] || 0) + 1;
        if (uid && l.usuario_id === uid) res.mios.add(l.publicacion_id);
      });
      return res;
    },

    /** Cola de moderación (admin): avisos de prestadores esperando revisión.
     *  El nombre del prestador viene por el embed del FK. */
    async listarPubsPrestadorPendientes() {
      if (!remoto) return [];
      const { data, error } = await sb.from('publicaciones_prestador')
        .select('id, titulo, descripcion, rubro, foto_url, creado, prestador_id, prestadores:prestador_id (nombre, rubro)')
        .eq('estado', 'pendiente')
        .order('creado', { ascending: true });
      if (error) { console.warn('[PronetDB] listarPubsPrestadorPendientes', error.message); return []; }
      return data || [];
    },

    /** Aprueba o rechaza un aviso. Sólo admin (lo valida el RPC), que además
     *  le avisa al prestador el resultado por notificación. */
    async resolverPubPrestador(id, aprobar, motivo) {
      if (!remoto) return { ok: false };
      const { error } = await sb.rpc('resolver_pub_prestador', {
        p_id: id, p_aprobar: !!aprobar, p_motivo: motivo || null,
      });
      if (error) { console.warn('[PronetDB] resolverPubPrestador', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    // ── FOTOS DE TRABAJO ─────────────────────────────────────────────────

    /** Lista las fotos de un trabajo específico. */
    async listarFotosTrabajo(chatId) {
      if (!remoto || !chatId) return [];
      const { data, error } = await sb.from('trabajo_fotos')
        .select('*').eq('chat_id', chatId).order('creado');
      if (error) { console.warn('[PronetDB] listarFotosTrabajo', error.message); return []; }
      return data || [];
    },

    /** Sube una foto a un trabajo. */
    async subirFotoTrabajo(chatId, file, descripcion = '') {
      if (!remoto || !chatId) return null;
      const uid = await this.usuarioIdActual();
      if (!uid) return null;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${chatId}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from('trabajos').upload(path, file, { upsert: false });
      if (upErr) { console.warn('[PronetDB] subirFotoTrabajo', upErr.message); return null; }
      // Bucket privado → URL firmada válida por 7 días
      const { data: signedData, error: signErr } = await sb.storage.from('trabajos').createSignedUrl(path, 604800);
      if (signErr || !signedData?.signedUrl) { console.warn('[PronetDB] subirFotoTrabajo signed', signErr?.message); return null; }
      const { data, error } = await sb.from('trabajo_fotos')
        .insert({ chat_id: chatId, subido_por: uid, url: signedData.signedUrl, storage_path: path, descripcion }).select().maybeSingle();
      if (error) {
        await sb.storage.from('trabajos').remove([path]).catch(() => {});
        console.warn('[PronetDB] trabajo_fotos insert', error.message);
        return null;
      }
      return data;
    },

    /** Sube las fotos de un pedido al bucket 'pedidos' y devuelve array de URLs firmadas. */
    async subirFotosPedido(pedidoId, archivos) {
      if (!remoto || !pedidoId || !archivos?.length) return [];
      const urls = [];
      for (const file of archivos) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${pedidoId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await sb.storage.from('pedidos').upload(path, file, { upsert: true });
        if (upErr) { console.warn('[PronetDB] subirFotosPedido', upErr.message); continue; }
        // Bucket privado → URL firmada válida por 7 días
        const { data: signedData, error: signErr } = await sb.storage.from('pedidos').createSignedUrl(path, 604800);
        if (!signErr && signedData?.signedUrl) urls.push(signedData.signedUrl);
        else console.warn('[PronetDB] subirFotosPedido signed', signErr?.message);
      }
      return urls;
    },

    /** Elimina una foto de un trabajo. */
    async eliminarFotoTrabajo(fotoId) {

      if (!remoto || !fotoId) return false;
      const { error } = await sb.from('trabajo_fotos').delete().eq('id', fotoId);
      return !error;
    },

    /** Lista el historial de trabajos del prestador actual (pedidos donde fue elegido). */
    async listarHistorialPrestador() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data: perfil } = await sb.from('perfiles').select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return [];
      // Traer propuestas elegidas con datos del pedido Y el chat vinculado
      const { data, error } = await sb.from('propuestas')
        .select('id, precio, precio_min, precio_max, modalidad_precio, creado, pedidos ( id, titulo, rubro, zona, usuario_id, creado ), chats_trabajo ( id, estado )')
        .eq('prestador_id', perfil.prestador_id)
        .eq('estado', 'elegida')
        .order('creado', { ascending: false });
      if (error) { console.warn('[PronetDB] listarHistorialPrestador', error.message); return []; }
      // Traer reseñas indexadas por chat_id (fix: evita colision cuando el mismo vecino
      // contrato al mismo prestador mas de una vez)
      const { data: resenas } = await sb.from('resenas')
        .select('chat_id, puntos, comentario')
        .eq('prestador_id', perfil.prestador_id);
      const resenasMap = {};
      (resenas||[]).forEach(r => { if (r.chat_id) resenasMap[r.chat_id] = r; });
      // Obtener nombres de los vecinos
      const usuarioIds = [...new Set((data||[]).map(p => p.pedidos?.usuario_id).filter(Boolean))];
      let nombresMap = {};
      if (usuarioIds.length > 0) {
        // perfiles_publicos: `perfiles` tiene RLS de lectura propia, así que
        // pedir las filas de otros usuarios devolvía vacío sin error.
        const { data: perfiles } = await sb.from('perfiles_publicos').select('id, nombre').in('id', usuarioIds);
        (perfiles||[]).forEach(p => { nombresMap[p.id] = p.nombre; });
      }
      return (data||[]).map(p => {
        const vecinoId = p.pedidos?.usuario_id;
        // Match exacto por chat_id
        const chatId = Array.isArray(p.chats_trabajo)
          ? p.chats_trabajo[0]?.id
          : p.chats_trabajo?.id;
        const resena = (chatId && resenasMap[chatId]) || null;
        return {
          id: p.id,
          pedido_id: p.pedidos?.id,
          chat_id: chatId || null,
          titulo: p.pedidos?.titulo || 'Trabajo',
          rubro: p.pedidos?.rubro || '',
          zona: p.pedidos?.zona || '',
          vecino_nombre: nombresMap[vecinoId] || 'Cliente',
          precio: p.modalidad_precio === 'fijo' ? p.precio : (p.precio_min || 0),
          precio_max: p.precio_max || 0,
          modalidad: p.modalidad_precio,
          creado: p.creado,
          resena: resena ? { estrellas: resena.puntos, comentario: resena.comentario } : null,
        };
      });
    },


    /** Inicia un chat de consulta antes de proponer (Etapa 7A).
     *  El prestador abre el chat desde el detalle del pedido. */
    /** Vecino inicia un chat de consulta directo desde el perfil del prestador (sin pedido previo). */
    async iniciarChatDirecto(prestadorId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      // Verificar si ya existe un chat activo entre este vecino y prestador
      const { data: existente } = await sb.from('chats_trabajo')
        .select('id, estado')
        .eq('vecino_id', uid)
        .eq('prestador_id', prestadorId)
        .in('estado', ['consulta', 'propuesta_enviada', 'activo', 'terminado_prestador', 'terminado_por_vecino'])
        .maybeSingle();
      if (existente) return { ok: true, chat_id: existente.id, estado: existente.estado };
      // Crear nuevo chat en estado consulta
      const { data, error } = await sb.from('chats_trabajo')
        .insert({
          pedido_id: null,
          propuesta_id: null,
          vecino_id: uid,
          prestador_id: prestadorId,
          estado: 'consulta',
          ultimo_evento_at: new Date().toISOString(),
        })
        .select().single();
      if (error) { console.warn('[PronetDB] iniciarChatDirecto', error.message); return { ok: false, error: error.message }; }
      return { ok: true, chat_id: data.id, estado: 'consulta' };
    },

    async iniciarConsulta(pedidoId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      // Usa RPC SECURITY DEFINER para evitar el bloqueo de RLS en INSERT
      const { data, error } = await sb.rpc('iniciar_consulta_prestador', { p_pedido_id: pedidoId });
      if (error) { console.warn('[PronetDB] iniciarConsulta rpc', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false, error: 'Respuesta vacía' };
    },

    /** Envía la propuesta formal desde el chat de consulta.
     *  Transiciona el chat de 'consulta' a 'propuesta_enviada'. */
    async enviarPropuestaDesdeChat(chatId, datosPropuesta) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: perfil } = await sb.from('perfiles').select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return { ok: false, error: 'Solo prestadores' };
      const { data: chat } = await sb.from('chats_trabajo').select('*').eq('id', chatId).maybeSingle();
      if (!chat) return { ok: false, error: 'Chat no encontrado' };
      if (chat.estado !== 'consulta') return { ok: false, error: 'El chat no está en estado consulta' };
      // Crear la propuesta en la tabla propuestas
      const { data: propuesta, error: propErr } = await sb.from('propuestas')
        .insert({
          pedido_id: chat.pedido_id,
          prestador_id: perfil.prestador_id,
          precio: datosPropuesta.precio || null,
          precio_min: datosPropuesta.precio_min || null,
          precio_max: datosPropuesta.precio_max || null,
          modalidad_precio: datosPropuesta.modalidad_precio || 'fijo',
          mensaje: datosPropuesta.mensaje || null,
          estado: 'pendiente',
        })
        .select().single();
      if (propErr) { console.warn('[PronetDB] enviarPropuestaDesdeChat propuesta', propErr.message); return { ok: false, error: propErr.message }; }
      // Actualizar el chat con propuesta_id y nuevo estado
      const { error: chatErr } = await sb.from('chats_trabajo')
        .update({
          propuesta_id: propuesta.id,
          estado: 'propuesta_enviada',
          ultimo_evento_at: new Date().toISOString(),
        })
        .eq('id', chatId);
      if (chatErr) { console.warn('[PronetDB] enviarPropuestaDesdeChat chat', chatErr.message); return { ok: false, error: chatErr.message }; }
      return { ok: true, propuesta_id: propuesta.id };
    },

    /** Marca el trabajo como terminado (lo hace el prestador).
     *  Transiciona a 'terminado_prestador', el vecino debe confirmar. */
    async marcarTerminado(chatId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data: chat } = await sb.from('chats_trabajo').select('estado').eq('id', chatId).maybeSingle();
      if (!chat) return { ok: false, error: 'Chat no encontrado' };
      if (!['activo', 'terminado_por_vecino'].includes(chat.estado)) {
        return { ok: false, error: 'El trabajo no está en estado activo' };
      }
      const { error } = await sb.from('chats_trabajo')
        .update({
          estado: 'terminado_prestador',
          terminado_prestador_at: new Date().toISOString(),
          ultimo_evento_at: new Date().toISOString(),
        })
        .eq('id', chatId);
      if (error) { console.warn('[PronetDB] marcarTerminado', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** El vecino confirma el cierre → transiciona a 'calificado' o abre la reseña.
     *  Si el vecino dice que no está terminado → vuelve a 'activo' (disputa diferida). */
    async confirmarCierre(chatId, confirma) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      if (confirma) {
        // Vecino confirma → deja el estado en 'terminado_prestador' para que
        // el flujo de reseña lo lleve a 'calificado' via dejarResena()
        return { ok: true, siguiente: 'dejar_resena' };
      } else {
        // Vecino dice que no está terminado → vuelve a activo
        const { error } = await sb.from('chats_trabajo')
          .update({
            estado: 'activo',
            terminado_prestador_at: null,
            ultimo_evento_at: new Date().toISOString(),
          })
          .eq('id', chatId);
        if (error) { console.warn('[PronetDB] confirmarCierre', error.message); return { ok: false, error: error.message }; }
        return { ok: true, siguiente: 'activo' };
      }
    },

    /** Vecino toma el control y marca terminado (aparece tras 7 días sin cierre del prestador). */
    async marcarTerminadoPorVecino(chatId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data: chat } = await sb.from('chats_trabajo')
        .select('estado, ultimo_evento_at')
        .eq('id', chatId).maybeSingle();
      if (!chat) return { ok: false, error: 'Chat no encontrado' };
      if (chat.estado !== 'activo') return { ok: false, error: 'El trabajo no está activo' };
      // Verificar que pasaron al menos 7 días desde el último evento
      const dias = (Date.now() - new Date(chat.ultimo_evento_at).getTime()) / 86400000;
      if (dias < 7) return { ok: false, error: 'Aún no pasaron 7 días de inactividad' };
      const { error } = await sb.from('chats_trabajo')
        .update({
          estado: 'terminado_por_vecino',
          cierre_omitido: true,
          ultimo_evento_at: new Date().toISOString(),
        })
        .eq('id', chatId);
      if (error) { console.warn('[PronetDB] marcarTerminadoPorVecino', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** Cancela un trabajo activo con motivo (cualquiera de las partes). */
    async cancelarChat(chatId, motivo, motivoTexto = '') {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: chat } = await sb.from('chats_trabajo').select('estado').eq('id', chatId).maybeSingle();
      if (!chat) return { ok: false, error: 'Chat no encontrado' };
      const estadosCancelables = ['activo', 'terminado_prestador', 'terminado_por_vecino'];
      if (!estadosCancelables.includes(chat.estado)) {
        return { ok: false, error: 'Este trabajo no se puede cancelar en su estado actual' };
      }
      const { error } = await sb.from('chats_trabajo')
        .update({
          estado: 'cancelado',
          motivo_cancelacion: motivo,
          motivo_cancelacion_texto: motivoTexto || null,
          cancelado_por: uid,
          ultimo_evento_at: new Date().toISOString(),
        })
        .eq('id', chatId);
      if (error) { console.warn('[PronetDB] cancelarChat', error.message); return { ok: false, error: error.message }; }
      return { ok: true };
    },

    /** Obtiene los datos completos de un chat (estado, participantes, pedido). */
    async obtenerChat(chatId) {
      if (!remoto) return null;
      const { data, error } = await sb.from('chats_trabajo')
        .select('*, pedidos(titulo, rubro, icono), prestadores(nombre)')
        .eq('id', chatId)
        .maybeSingle();
      if (error) { console.warn('[PronetDB] obtenerChat', error.message); return null; }
      // Nombre del vecino (no hay FK directa a perfiles). Vía perfiles_publicos:
      // desde la sesión del prestador, `perfiles` no deja leer la fila del
      // vecino y el nombre quedaba siempre en el fallback 'Vecino'.
      if (data?.vecino_id) {
        const { data: perfilVecino } = await sb.from('perfiles_publicos').select('nombre').eq('id', data.vecino_id).maybeSingle();
        data.vecino_nombre = perfilVecino?.nombre || 'Vecino';
      }
      return data;
    },


    /** Obtiene los puntos y nivel del usuario actual (tabla loyalty). */
    async obtenerLoyalty() {
      if (!remoto) return { puntos: 0, nivel: 'Bronce' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { puntos: 0, nivel: 'Bronce' };

      // Leer la fila consolidada de loyalty (fuente primaria, mantenida por triggers)
      const { data, error } = await sb.from('loyalty')
        .select('puntos, nivel')
        .eq('usuario_id', uid)
        .maybeSingle();

      // Fallback: si no hay fila o puntos = 0, calcular desde el historial
      if (!error && data && data.puntos > 0) return data;

      const { data: perfil } = await sb.from('perfiles')
        .select('prestador_id').eq('id', uid).maybeSingle();

      // Buscar historial por prestador_id (si es prestador) o por usuario_id (vecino)
      let histQ = sb.from('loyalty_historial').select('puntos');
      histQ = perfil?.prestador_id
        ? histQ.eq('prestador_id', perfil.prestador_id)
        : histQ.eq('usuario_id', uid);
      const { data: hist } = await histQ;

      const total = (hist || []).reduce((s, h) => s + h.puntos, 0);
      const nivel = total >= 10000 ? 'Élite' : total >= 5000 ? 'Oro' : total >= 1000 ? 'Plata' : 'Bronce';

      // No se persiste el total recalculado: el cliente ya no escribe `loyalty`
      // (ver supabase-canjes-rpc.sql). Esto es solo un fallback de lectura para
      // que la pantalla muestre el número correcto si la fila consolidada
      // quedara desincronizada. Reconciliarla es tarea del servidor.
      return { puntos: total, nivel };
    },

    // acreditarPuntos() se eliminó: el cliente ya no acredita puntos.
    // Los puntos por reseña los da el trigger trg_acreditar_por_resena y los
    // de canje el RPC resolver_canje(), ambos SECURITY DEFINER. Un saldo
    // escrito desde el navegador es falsificable por definición, y RLS no
    // puede impedirlo porque filtra filas, no valida valores.

    /**
     * Cuenta propuestas activas para un pedido usando RPC SECURITY DEFINER.
     * Bypasa RLS para que el prestador vea la competencia real sin exponer datos.
     */
    async contarPropuestasPedido(pedidoId) {
      if (remoto) {
        try {
          const { data, error } = await sb.rpc('contar_propuestas_pedido', { p_pedido_id: pedidoId });
          if (!error && typeof data === 'number') return data;
        } catch (e) { console.warn('[PronetDB] contarPropuestasPedido', e.message); }
      }
      // fallback local
      const props = leerLocal('propuestas');
      return props.filter(p => p.pedido_id === pedidoId && p.estado !== 'retirada').length;
    },

    /** Sube un adjunto de propuesta al bucket y devuelve la URL pública. */
    async subirAdjuntoPropuesta(file) {
      if (!remoto) return null;
      try {
        const uid = await this.usuarioIdActual();
        if (!uid) return null;
        const ext = file.name.split('.').pop().toLowerCase();
        const path = uid + '/' + Date.now() + '.' + ext;
        const { error } = await sb.storage.from('propuestas-adjuntos').upload(path, file, {
          contentType: file.type,
          upsert: false
        });
        if (error) throw error;
        const { data } = sb.storage.from('propuestas-adjuntos').getPublicUrl(path);
        return { url: data.publicUrl, tipo: ['pdf'].includes(ext) ? 'pdf' : 'imagen', nombre: file.name };
      } catch(e) { console.warn('[PronetDB] subirAdjuntoPropuesta', e.message); return null; }
    },

    /** Crea la ficha de prestador del usuario logueado, si no la tiene.
     *  Es la acción de "quiero ofrecer mis servicios": NO cambia `tipo`, así
     *  que un vecino que la llama queda con doble perfil en vez de perder su
     *  vista de vecino. Idempotente: una ficha por usuario. */
    async asegurarFichaPrestador() {
      if (!remoto) return { ok: false, error: 'modo local' };
      try {
        const { data, error } = await sb.rpc('asegurar_ficha_prestador');
        if (error) { console.warn('[PronetDB] asegurarFichaPrestador', error.message); return { ok: false, error: error.message }; }
        return data || { ok: false, error: 'sin respuesta' };
      } catch(e) {
        console.warn('[PronetDB] asegurarFichaPrestador', e.message);
        return { ok: false, error: e.message };
      }
    },

    /** Registra una vista al perfil de un prestador. */
    async registrarVista(prestadorId, origen = 'busqueda') {
      if (!remoto) return;
      // RPC valida el prestador, bloquea vistas propias y deduplica una por día
      // El builder de rpc() tampoco tiene `.catch()`: tiraba TypeError y la
      // vista no se registraba. El error viene en `error`.
      const { error } = await sb.rpc('fn_registrar_vista', { p_prestador_id: prestadorId, p_origen: origen });
      if (error) console.warn('[PronetDB] registrarVista', error.message);
    },

    /** Registra un contacto (click en botón Contactar) con un prestador. */
    async registrarContacto(prestadorId, origen = 'busqueda') {
      if (!remoto) return;
      let zona = null;
      try {
        const uid = await this.usuarioIdActual();
        if (uid) {
          const { data: perfil } = await sb.from('perfiles').select('zona').eq('id', uid).maybeSingle();
          zona = perfil?.zona || null;
        }
      } catch { /* zona queda null */ }
      // Ídem registrarVista: `.catch()` sobre el builder no existe.
      const { error } = await sb.rpc('fn_registrar_contacto', { p_prestador_id: prestadorId, p_origen: origen, p_zona: zona });
      if (error) console.warn('[PronetDB] registrarContacto', error.message);
    },

    /** Obtiene analítica completa del prestador logueado para un período dado. */
    async obtenerAnalitica(periodo = '30d') {
      if (!remoto) return null;
      const uid = await this.usuarioIdActual();
      if (!uid) return null;
      const { data: perfil } = await sb.from('perfiles')
        .select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return null;
      try {
        const { data, error } = await sb.rpc('obtener_analitica_prestador', {
          p_prestador_id: perfil.prestador_id,
          p_meses: periodo === '3m' ? 3 : 1
        });
        if (error) throw error;
        return data;
      } catch(e) {
        console.warn('[PronetDB] obtenerAnalitica', e.message);
        return null;
      }
    },

    /** Lista las reglas de puntos activas (públicas, sin auth). */
    async listarLoyaltyReglas() {
      if (!remoto) return [];
      const { data, error } = await sb.from('loyalty_reglas')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });
      if (error) { console.warn('[PronetDB] listarLoyaltyReglas', error.message); return []; }
      return data || [];
    },

    /** Lista el historial de puntos del usuario logueado (prestador o vecino). */
    async listarLoyaltyHistorial(limite = 30) {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data: perfil } = await sb.from('perfiles')
        .select('prestador_id').eq('id', uid).maybeSingle();

      // Prestadores: buscar por prestador_id (historial pre-existente)
      // Vecinos: buscar por usuario_id (historial nuevo post-migración)
      let q = sb.from('loyalty_historial').select('*')
        .order('creado', { ascending: false }).limit(limite);
      q = perfil?.prestador_id
        ? q.eq('prestador_id', perfil.prestador_id)
        : q.eq('usuario_id', uid);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarLoyaltyHistorial', error.message); return []; }
      return data || [];
    },

    /** Lista ítems del catálogo de canjes activos. tipo: 'prestador' | 'vecino' | 'ambos' */
    async listarCatalogoCanje(tipo = 'ambos') {
      if (!remoto) return [];
      let q = sb.from('loyalty_canjes').select('*').eq('activo', true).order('orden');
      if (tipo !== 'ambos') q = q.in('tipo', [tipo, 'ambos']);
      const { data, error } = await q;
      if (error) { console.warn('[PronetDB] listarCatalogoCanje', error.message); return []; }
      return data || [];
    },

    /** Lista TODOS los ítems del catálogo (activos e inactivos) — uso admin/ABM. */
    async listarCatalogoCanjeAdmin() {
      if (!remoto) return [];
      const { data, error } = await sb.from('loyalty_canjes').select('*').order('orden');
      if (error) { console.warn('[PronetDB] listarCatalogoCanjeAdmin', error.message); return []; }
      return data || [];
    },

    /** Crea o actualiza un ítem del catálogo de canjes (admin). */
    async guardarCanje(canje) {
      if (!remoto) return { ok: false };
      try {
        const payload = {
          nombre: canje.nombre,
          descripcion: canje.descripcion || null,
          icono: canje.icono || '🎁',
          costo_puntos: canje.costo_puntos,
          tipo: canje.tipo || 'ambos',
          activo: canje.activo !== false,
          orden: canje.orden || 0,
          tipo_beneficio: canje.tipo_beneficio || 'manual',
          valor_beneficio: canje.valor_beneficio || '',
        };
        if (canje.id) {
          const { error } = await sb.from('loyalty_canjes').update(payload).eq('id', canje.id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('loyalty_canjes').insert(payload);
          if (error) throw error;
        }
        return { ok: true };
      } catch(e) {
        console.warn('[PronetDB] guardarCanje', e.message);
        return { ok: false, error: e.message };
      }
    },

    /** Activa/desactiva un ítem del catálogo (admin). */
    async toggleCanjeActivo(id, activo) {
      if (!remoto) return { ok: false };
      try {
        const { error } = await sb.from('loyalty_canjes').update({ activo }).eq('id', id);
        if (error) throw error;
        return { ok: true };
      } catch(e) {
        console.warn('[PronetDB] toggleCanjeActivo', e.message);
        return { ok: false, error: e.message };
      }
    },

    /** Elimina un ítem del catálogo de canjes (admin). */
    async eliminarCanje(id) {
      if (!remoto) return { ok: false };
      try {
        const { error } = await sb.from('loyalty_canjes').delete().eq('id', id);
        if (error) throw error;
        return { ok: true };
      } catch(e) {
        console.warn('[PronetDB] eliminarCanje', e.message);
        return { ok: false, error: e.message };
      }
    },

    /** Lista las solicitudes de canje del usuario actual. */
    async listarMisSolicitudes() {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      const { data, error } = await sb.from('loyalty_solicitudes')
        .select('*').eq('usuario_id', uid).order('creado', { ascending: false }).limit(20);
      if (error) { console.warn('[PronetDB] listarMisSolicitudes', error.message); return []; }
      return data || [];
    },

    /** Descuenta puntos de loyalty por un canje y registra la solicitud pendiente. */
    /** Solicita un canje. El costo lo determina el servidor a partir del
     *  canje_id: no se manda por parámetro, porque un costo controlado por el
     *  cliente se podía mandar en 0 y obtener el beneficio gratis. */
    async canjearPuntos(canjeId) {
      if (!remoto) return { ok: false, error: 'modo local' };
      try {
        const { data, error } = await sb.rpc('canjear_puntos', { p_canje_id: canjeId });
        if (error) { console.warn('[PronetDB] canjearPuntos', error.message); return { ok: false, error: error.message }; }
        return data || { ok: false, error: 'sin respuesta' };
      } catch(e) {
        console.warn('[PronetDB] canjearPuntos', e.message);
        return { ok: false, error: e.message };
      }
    },

    /** Aprueba o rechaza un canje (solo admin, validado en el RPC).
     *  Aplica el beneficio o devuelve los puntos, de forma idempotente. */
    async resolverCanje(solicitudId, estado) {
      if (!remoto) return { ok: false, error: 'modo local' };
      try {
        const { data, error } = await sb.rpc('resolver_canje', {
          p_solicitud_id: solicitudId, p_estado: estado,
        });
        if (error) { console.warn('[PronetDB] resolverCanje', error.message); return { ok: false, error: error.message }; }
        return data || { ok: false, error: 'sin respuesta' };
      } catch(e) {
        console.warn('[PronetDB] resolverCanje', e.message);
        return { ok: false, error: e.message };
      }
    },

    // aplicarBeneficio() se eliminó: la aplicación del beneficio ahora vive
    // dentro del RPC resolver_canje(), junto con la transición de estado, para
    // que sea atómica. Antes eran dos pasos desde el cliente y un doble click
    // aplicaba el beneficio dos veces.

    /** Devuelve la suscripción activa del usuario (o base por defecto).
     *  Incluye `es_fundador_activo` para que el cliente aplique los límites
     *  correctos sin depender del valor codificado en config.js. */
    async obtenerSuscripcion() {
      if (!remoto) return { plan: 'base', estado: 'activo', es_fundador_activo: false };
      const uid = await this.usuarioIdActual();
      if (!uid) return { plan: 'base', estado: 'activo', es_fundador_activo: false };
      const { data } = await sb.from('suscripciones')
        .select('plan, estado, periodo, vence_en, activado_en')
        .eq('usuario_id', uid).maybeSingle();
      // Chequear estado de fundador (solo relevante para prestadores)
      let es_fundador_activo = false;
      try {
        const { data: pf } = await sb.from('perfiles').select('prestador_id').eq('id', uid).maybeSingle();
        if (pf?.prestador_id) {
          const { data: pr } = await sb.from('prestadores')
            .select('es_fundador, limites_fundador_hasta').eq('id', pf.prestador_id).maybeSingle();
          es_fundador_activo = !!(pr?.es_fundador &&
            (pr.limites_fundador_hasta === null || new Date(pr.limites_fundador_hasta) > new Date()));
        }
      } catch { /* es_fundador_activo queda false */ }
      if (!data) return { plan: 'base', estado: 'activo', es_fundador_activo };
      if (data.vence_en && new Date(data.vence_en) < new Date()) {
        return { ...data, plan: 'base', estado: 'vencido', es_fundador_activo };
      }
      return { ...data, es_fundador_activo };
    },

    /** Cuenta las denuncias pendientes (solo admin ve todas por RLS). */
    async contarDenunciasPendientes() {
      if (!remoto) return 0;
      const { count, error } = await sb.from('denuncias')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
      if (error) { console.warn('[PronetDB] contarDenuncias', error.message); return 0; }
      return count || 0;
    },

    /** Trae UN registro por id (consulta puntual, no toda la tabla). */
    async obtener(coleccion, id) {
      if (!id) return null;
      if (remoto) {
        const { data, error } = await sb.from(coleccion)
          .select('*').eq('id', id).maybeSingle();
        if (error) { console.warn('[PronetDB] obtener', coleccion, error.message); return null; }
        return data;
      }
      return leerLocal(coleccion).find((r) => r.id === id) || null;
    },

    /** Borra un registro por id. */
    async borrar(coleccion, id) {
      if (remoto) {
        const { error } = await sb.from(coleccion).delete().eq('id', id);
        if (error) { console.warn('[PronetDB] borrar', coleccion, error.message); return false; }
        return true;
      }
      const items = leerLocal(coleccion).filter((r) => r.id !== id);
      return escribirLocal(coleccion, items);
    },

    /** Actualiza nombre/teléfono/foto del propio perfil sin pedir la fila de
     *  vuelta. A propósito: el RETURNING de un UPDATE está sujeto al mismo
     *  grant de columna que un SELECT, y `telefono` está excluido de ese
     *  grant (ver supabase-fix-telefono-cosechable.sql) para que no sea
     *  cosechable por cualquier autenticado. Pedir la fila de vuelta acá
     *  rompería el guardado del propio teléfono sin necesidad — el llamador
     *  ya tiene los valores que mandó, no necesita que el server se los confirme. */
    async actualizarMiPerfilBasico(cambios) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { error } = await sb.from('perfiles').update(cambios).eq('id', uid);
      if (error) {
        console.warn('[PronetDB] actualizarMiPerfilBasico', error.message);
        // 23505 sobre idx_perfiles_telefono_unico: ese número ya está en otra
        // cuenta. Se distingue del resto porque es el único error de acá que
        // el usuario puede resolver — ver supabase-telefono-unico.sql.
        const dup = error.code === '23505' && /telefono/i.test(error.message || '');
        return { ok: false, error: error.message, codigo: dup ? 'telefono_duplicado' : error.code };
      }
      return { ok: true };
    },

    /** Actualiza un registro por id. Devuelve el registro actualizado. */
    async actualizar(coleccion, id, cambios) {
      if (remoto) {
        const { data, error } = await sb.from(coleccion).update(cambios).eq('id', id).select().single();
        if (error && esRechazoServidor(error)) throw error;
        if (error) { console.warn('[PronetDB] actualizar', coleccion, error.message); return null; }
        return data;
      }
      const items = leerLocal(coleccion);
      const idx = items.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      items[idx] = { ...items[idx], ...cambios };
      escribirLocal(coleccion, items);
      return items[idx];
    },

    /** Vacía una colección LOCAL. En modo remoto no borra el servidor:
     *  los datos compartidos se administran desde el panel de Supabase
     *  (Table Editor), para que un botón de demo no pueda vaciar la base
     *  que están usando otros dispositivos. */
    async vaciar(coleccion) {
      try { localStorage.removeItem(claveDe(coleccion)); } catch (e) {}
      return true;
    },

    /** Lista prestadores con filtros opcionales: {rubro, zona, premium, busqueda} */
    /** Busca prestadores vía RPC `buscar_prestadores`.
     *
     *  Antes se armaba con `.or()` concatenando el texto del usuario, y eso
     *  traía tres problemas: ILIKE **no** ignora acentos ("maria" nunca
     *  encontró a "María"), el índice trigram no se aplicaba, y una coma en
     *  la búsqueda partía el filtro de PostgREST en dos y rompía la
     *  consulta. El RPC recibe el texto como parámetro y busca sobre la
     *  misma expresión que indexa — ver supabase-busqueda-unaccent.sql. */
    async listarPrestadores(filtros = {}) {
      if (!remoto) return [];
      const { data, error } = await sb.rpc('buscar_prestadores', {
        p_texto:   filtros.busqueda || null,
        p_rubro:   filtros.rubro    || null,
        p_zona:    filtros.zona     || null,
        p_premium: filtros.premium ? true : null,
        p_limite:  filtros.limite   || 100,
      });
      if (error) { console.warn('[PronetDB] listarPrestadores', error.message); return []; }
      return data || [];
    },

    /** Renueva un pedido propio por otra ventana completa (7 días).
     *  La validación de propiedad está DENTRO del RPC (usuario_id =
     *  auth.uid()): mandarla desde acá permitiría revivir pedidos ajenos
     *  con sólo conocer el uuid. */
    async renovarPedido(pedidoId) {
      if (!remoto) return { ok: false, error: 'Requiere modo remoto' };
      const { data, error } = await sb.rpc('renovar_pedido', { p_pedido_id: pedidoId });
      if (error) { console.warn('[PronetDB] renovarPedido', error.message); return { ok: false, error: error.message }; }
      return data || { ok: false };
    },

    /** Obtiene la posición del prestador en el ranking por zona y rubro. */
    /** Posición del prestador en su rubro y en su zona, calculada en la
     *  base con rank(). Devuelve `{rubro, zona, pos_rubro, total_rubro,
     *  pos_zona, total_zona}` o null.
     *
     *  Antes se traían TODOS los prestadores y se buscaba el propio con
     *  findIndex(). Con un límite en la consulta eso rompe callado: el que
     *  queda fuera del corte da -1 y la tarjeta simplemente no se dibuja. */
    async obtenerPosicionPrestador(prestadorId) {
      if (!remoto || !prestadorId) return null;
      const { data, error } = await sb.rpc('posicion_prestador', { p_prestador_id: prestadorId });
      if (error) { console.warn('[PronetDB] obtenerPosicionPrestador', error.message); return null; }
      return (data && data[0]) || null;
    },

    async obtenerRankingPrestador(prestadorId, rubro) {
      if (!remoto) return [];
      // Traer todos los prestadores del mismo rubro ordenados por rating DESC
      const { data, error } = await sb.from('prestadores')
        .select('id, zona, rating, resenas')
        .eq('rubro', rubro)
        .eq('activo', true)
        .order('rating', { ascending: false })
        .order('resenas', { ascending: false });
      if (error || !data) return [];

      // Agrupar por zona y calcular posición
      const zonas = {};
      data.forEach((p, i) => {
        if (!zonas[p.zona]) zonas[p.zona] = [];
        zonas[p.zona].push(p);
      });

      const resultado = [];
      Object.entries(zonas).forEach(([zona, prestadores]) => {
        const pos = prestadores.findIndex(p => p.id === prestadorId) + 1;
        if (pos > 0) {
          resultado.push({
            zona,
            posicion: pos,
            total: prestadores.length,
            pct: Math.round(((prestadores.length - pos + 1) / prestadores.length) * 100)
          });
        }
      });

      return resultado.sort((a, b) => a.posicion - b.posicion);
    },

    /** Lista los chats activos */
    async listarChats() {
  if (!remoto) return leerLocal('chats');
  const uid = await this.usuarioIdActual();
  if (!uid) return [];
  const { data: perfil } = await sb.from('perfiles')
    .select('prestador_id').eq('id', uid).maybeSingle();
  const prestadorId = perfil?.prestador_id || null;
  let query = sb.from('chats_trabajo')
    .select(`id, estado, creado, vecino_id, prestador_id, pedido_id,
      pedidos ( titulo, rubro ),
      prestadores ( nombre ),
      mensajes_chat ( texto, creado )`)
    .order('creado', { ascending: false });
  if (prestadorId) {
    query = query.or(`vecino_id.eq.${uid},prestador_id.eq.${prestadorId}`);
  } else {
    query = query.eq('vecino_id', uid);
  }
  const { data, error } = await query;
  if (error) { console.warn('[PronetDB] listarChats', error.message); return []; }
  const chats = (data || []).map(c => {
    const msgs = (c.mensajes_chat || []).sort((a,b) => new Date(b.creado) - new Date(a.creado));
    const ultimo = msgs[0];
    const nombre = c.prestadores?.nombre || 'Prestador';
    return {
      id: c.id,
      estado: c.estado,
      vecino_id: c.vecino_id,
      prestador_id: c.prestador_id,
      // Hace falta para agrupar: dos chats del mismo pedido son un trabajo.
      pedido_id: c.pedido_id,
      // Una cuenta puede ser prestador en un chat y vecino en otro: quien
      // contrata a alguien sigue teniendo su propio perfil de prestador.
      soy_prestador: !!prestadorId && c.prestador_id === prestadorId,
      prestador_nombre: nombre,
      prestador_iniciales: nombre.slice(0,2).toUpperCase(),
      pedido_titulo: c.pedidos?.titulo || 'Trabajo',
      rubro: c.pedidos?.rubro || '',
      ultimo_mensaje: ultimo?.texto || 'Sin mensajes aún',
      hora_ultimo: ultimo ? new Date(ultimo.creado).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}) : '',
    };
  });

  // Nombre del vecino. No se puede embeber: `perfiles` tiene la lectura
  // limitada por RLS y no hay FK contra chats_trabajo. Sale de
  // perfiles_publicos, igual que en la lista de pedidos del prestador.
  const vecinoIds = [...new Set(chats.filter(c => c.soy_prestador).map(c => c.vecino_id).filter(Boolean))];
  if (vecinoIds.length) {
    const { data: prfs } = await sb.from('perfiles_publicos').select('id, nombre').in('id', vecinoIds);
    const mapa = {};
    (prfs || []).forEach(p => { mapa[p.id] = p.nombre; });
    chats.forEach(c => { if (c.soy_prestador) c.vecino_nombre = mapa[c.vecino_id] || 'Vecino'; });
  }

  // La lista mostraba SIEMPRE el nombre del prestador, así que un prestador
  // se veía a sí mismo en cada fila en vez de ver a quién le está hablando.
  chats.forEach(c => {
    c.contraparte_nombre = c.soy_prestador ? (c.vecino_nombre || 'Vecino') : c.prestador_nombre;
    c.contraparte_iniciales = c.contraparte_nombre.slice(0, 2).toUpperCase();
  });

  return chats;
},

    /** Vacía TODAS las colecciones locales (usado por "Reiniciar demo").
     *  Misma protección: nunca toca el servidor. */
    async vaciarTodo() {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(PREFIJO))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
      if (remoto) console.info('[PronetDB] Reinicio local: los datos del servidor se administran desde Supabase.');
      return true;
    },

    // ══════════════════════════════════════════════════════════════════
    // AUTENTICACIÓN (Supabase Auth)
    // ══════════════════════════════════════════════════════════════════

    /** Registra un usuario nuevo. tipo = 'cliente' | 'prestador' */
    /** `rubros` sólo aplica a tipo='prestador'. Viaja en el metadata del
     *  alta, que es lo que lee handle_new_user() para armar la ficha —
     *  sin esto el trigger caía en 'General' y la cuenta nacía invisible
     *  para las notificaciones y el filtro del vecino. */
    async registrar(email, password, nombre, tipo, zona, rubros, tycEn) {
      if (!remoto) {
        // Modo local: guardar un "usuario" simulado
        const user = { id: 'local-' + Date.now(), email, nombre, tipo: tipo || 'cliente', zona: zona || 'Escobar' };
        try { localStorage.setItem('pronet-usuario', JSON.stringify(user)); } catch (e) {}
        return { ok: true, user };
      }
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: {
          nombre, tipo: tipo || 'cliente', zona: zona || 'Escobar',
          // El consentimiento viaja en el metadata para que handle_new_user()
          // lo escriba en la MISMA transacción que crea el perfil. Grabarlo
          // después necesitaría una sesión, y con confirmación de email por
          // medio todavía no la hay — el consentimiento se perdería.
          ...(tycEn ? { tyc_aceptado_en: tycEn } : {}),
          ...(Array.isArray(rubros) && rubros.length
              ? { rubro: rubros[0], rubros }   // rubro = principal; rubros = todos
              : {}),
        } }
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, user: data.user };
    },

    /** Inicia sesión con email + password */
    async login(email, password) {
      if (!remoto) {
        try {
          const raw = localStorage.getItem('pronet-usuario');
          if (raw) { const u = JSON.parse(raw); if (u.email === email) return { ok: true, user: u }; }
        } catch (e) {}
        return { ok: false, error: 'Usuario no encontrado (modo local)' };
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true, user: data.user };
    },

    /** Cierra la sesión actual */
    async logout() {
      if (!remoto) { try { localStorage.removeItem('pronet-usuario'); } catch (e) {} return true; }
      await sb.auth.signOut();
      return true;
    },

    /** Inicia login con proveedor OAuth (google | apple).
     *  Redirige al proveedor; la vuelta la maneja restaurarSesion() automáticamente. */
    async loginConOAuth(provider) {
      if (!remoto) return { ok: false, error: 'OAuth requiere modo remoto' };
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo, scopes: 'email profile' },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    /** Devuelve el usuario logueado (con su perfil) o null */
    async usuarioActual() {
      if (!remoto) {
        try { const raw = localStorage.getItem('pronet-usuario'); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
      }
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      // Traer el perfil vinculado. Va por mi_perfil() (security definer) y no
      // por un select directo: la tabla perfiles tiene el teléfono excluido
      // del grant de columna genérico (supabase-fix-telefono-cosechable.sql)
      // para que no sea cosechable por cualquier autenticado — el dueño de la
      // cuenta sigue necesitando ver su propio teléfono para el form de edición.
      const { data: perfilesRpc } = await sb.rpc('mi_perfil');
      const perfil = Array.isArray(perfilesRpc) ? perfilesRpc[0] : perfilesRpc;
      // Autorreparación: prestador sin fila en `prestadores` (bug de registro).
      // Antes esto insertaba directo en `prestadores`, pero no hay policy de
      // INSERT ahí: RLS lo rechazaba con 403 y el error se descartaba, así que
      // fallaba en silencio y 4 de 5 prestadores quedaron sin ficha.
      if (perfil && perfil.tipo === 'prestador' && !perfil.prestador_id) {
        const r = await this.asegurarFichaPrestador();
        if (r.ok && r.prestador_id) perfil.prestador_id = r.prestador_id;
      }
      // Lazy expiry: si el plan ProMarket venció, lo apagamos en el momento
      if (perfil && perfil.es_pro_marketplace && perfil.pro_marketplace_hasta) {
        if (new Date(perfil.pro_marketplace_hasta) < new Date()) {
          // RPC en vez de update directo: la columna dejó de ser escribible
          // por el cliente (auditoría 2026-08-03, ver
          // supabase-fix-perfiles-columnas-sensibles.sql) para que nadie
          // pudiera activarse es_pro_marketplace propio desde la consola.
          // Sin `.catch()` colgado del builder: no existe y tiraba TypeError,
          // así que la expiración nunca llegaba a correr en el servidor.
          const { error } = await sb.rpc('expirar_mi_pro_marketplace');
          if (error) console.warn('[PronetDB] expirar_mi_pro_marketplace', error.message);
          perfil.es_pro_marketplace = false;
        }
      }
      return { id: user.id, email: user.email, ...(perfil || {}) };
    },

    /** Lista una tabla sin ORDER BY creado (para tablas sin esa columna) */
    async listarSimple(tabla) {
      if (remoto) {
        const { data, error } = await sb.from(tabla).select('*').eq('activo', true);
        if (error) { console.warn('[PronetDB] listarSimple', tabla, error.message); return []; }
        return data || [];
      }
      return leerLocal(tabla);
    },

    /** Llama a una función de Postgres (RPC). */
    async rpc(nombre, params={}) {
      if(remoto){
        const{data,error}=await sb.rpc(nombre,params);
        if(error){console.warn('[PronetDB] rpc',nombre,error.message);return{ok:false,error:error.message};}
        return(data&&typeof data==='object')?data:{ok:true,data};
      }
      if(nombre==='elegir_propuesta'){
        const props=leerLocal('propuestas');
        const elegida=props.find(p=>p.id===params.p_propuesta_id);
        if(!elegida||elegida.estado!=='pendiente') return{ok:false,error:'PROPUESTA_NO_ELEGIBLE'};
        props.forEach(p=>{if(p.pedido_id!==elegida.pedido_id)return;p.estado=(p.id===elegida.id)?'elegida':(p.estado==='pendiente'?'rechazada':p.estado);});
        escribirLocal('propuestas',props);
        const pedidos=leerLocal('pedidos'),ped=pedidos.find(p=>p.id===elegida.pedido_id);
        if(ped){ped.estado='Cerrado';escribirLocal('pedidos',pedidos);}
        return{ok:true,pedido_id:elegida.pedido_id,prestador_id:elegida.prestador_id};
      }
      return{ok:false,error:'RPC no disponible en modo local: '+nombre};
    },

    /** Realtime: suscribirse a cambios de una tabla. */
    suscribir(tabla, callback) {
      if(!remoto||!sb.channel) return()=>{};
      const canal=sb.channel('rt-'+tabla+'-'+Math.random().toString(36).slice(2,7)).on('postgres_changes',{event:'*',schema:'public',table:tabla},callback).subscribe();
      return()=>{try{sb.removeChannel(canal);}catch(e){}};
    },

    /** true si hay una sesión activa */
    async haySesion() {
      const u = await this.usuarioActual();
      return !!u;
    },
  };
})();

// Exponer para acceso desde consola y tests
window.PronetDB = PronetDB;
