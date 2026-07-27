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

    /** Crea un registro. Devuelve el registro con id y fecha asignados. */
    async crear(coleccion, datos) {
      if (remoto) {
        const { data, error } = await sb.from(coleccion)
          .insert(datos)     // id y creado los genera la base de datos
          .select()
          .single();
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
     *  opciones = { destino:'usuario'|'prestadores_rubro', usuario_id?, rubro?, tipo?, titulo, cuerpo?, url? } */
    async notificar(opciones) {
      if (!remoto) return { ok: false, error: 'Push requiere modo remoto' };
      try {
        // 1. Disparar el push (comportamiento original)
        const PUSH_EDGE_FN = 'enviar-push';
        const { data, error } = await sb.functions.invoke(PUSH_EDGE_FN, { body: opciones });
        if (error) { console.warn('[PronetDB] notificar', error.message); return { ok: false, error: error.message }; }

        // 2. Persistir en tabla notificaciones para la campanita in-app
        if (opciones.destino === 'usuario' && opciones.usuario_id) {
          try {
            await sb.from('notificaciones').insert({
              usuario_id: opciones.usuario_id,
              tipo: opciones.tipo || 'general',
              titulo: opciones.titulo,
              cuerpo: opciones.cuerpo || null,
              url: opciones.url || null,
            });
          } catch(e) { console.warn('[PronetDB] notificar insert', e.message); }
        } else if (opciones.destino === 'prestadores_rubro' && opciones.rubro) {
          try {
            const { data: subs } = await sb.from('push_suscripciones')
              .select('usuario_id').eq('rubro', opciones.rubro);
            if (subs?.length) {
              await sb.from('notificaciones').insert(
                subs.map(s => ({
                  usuario_id: s.usuario_id,
                  tipo: opciones.tipo || 'general',
                  titulo: opciones.titulo,
                  cuerpo: opciones.cuerpo || null,
                  url: opciones.url || null,
                }))
              );
            }
          } catch(e) { console.warn('[PronetDB] notificar insert rubro', e.message); }
        }

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
        await sb.from('notificaciones').insert({
          usuario_id: opciones.usuario_id,
          tipo: opciones.tipo || 'general',
          titulo: opciones.titulo,
          cuerpo: opciones.cuerpo || null,
          url: opciones.url || null,
        });
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
      const { data } = await sb.from('perfiles').select('id').eq('prestador_id', prestadorId).maybeSingle();
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

    /** Obtiene un servicio del catálogo por rubro (para el slider). */
    async obtenerFichaPorRubro(rubro) {
      if (!remoto || !rubro) return null;
      const { data, error } = await sb.from('catalogo_servicios').select('precio_ref_min,precio_ref_max,precio_unidad').eq('rubro', rubro).eq('activo', true).maybeSingle();
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
      if (error) { console.warn('[PronetDB] portfolio insert', error.message); return null; }
      return data;
    },

    /** Elimina una foto del portfolio. */
    async eliminarFotoPortfolio(fotoId) {
      if (!remoto || !fotoId) return false;
      const { error } = await sb.from('portfolio_fotos').delete().eq('id', fotoId);
      return !error;
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
      if (error) { console.warn('[PronetDB] trabajo_fotos insert', error.message); return null; }
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
        const { data: perfiles } = await sb.from('perfiles').select('id, nombre').in('id', usuarioIds);
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
      const uid = await this.usuarioIdActual();
      if (!uid) return { ok: false, error: 'Sin sesión' };
      const { data: perfil } = await sb.from('perfiles').select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return { ok: false, error: 'Solo prestadores pueden consultar' };
      // Verificar si ya existe un chat de este prestador para este pedido
      const { data: existente } = await sb.from('chats_trabajo')
        .select('id, estado')
        .eq('pedido_id', pedidoId)
        .eq('prestador_id', perfil.prestador_id)
        .maybeSingle();
      if (existente) return { ok: true, chat_id: existente.id, estado: existente.estado };
      // Traer vecino del pedido
      const { data: pedido } = await sb.from('pedidos').select('usuario_id').eq('id', pedidoId).maybeSingle();
      if (!pedido) return { ok: false, error: 'Pedido no encontrado' };
      const { data, error } = await sb.from('chats_trabajo')
        .insert({
          pedido_id: pedidoId,
          propuesta_id: null,
          vecino_id: pedido.usuario_id,
          prestador_id: perfil.prestador_id,
          estado: 'consulta',
          ultimo_evento_at: new Date().toISOString(),
        })
        .select().single();
      if (error) { console.warn('[PronetDB] iniciarConsulta', error.message); return { ok: false, error: error.message }; }
      return { ok: true, chat_id: data.id, estado: 'consulta' };
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
      // Traer el nombre del vecino desde perfiles (no hay FK directa a perfiles)
      if (data?.vecino_id) {
        const { data: perfilVecino } = await sb.from('perfiles').select('nombre').eq('id', data.vecino_id).maybeSingle();
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

      // Calcular desde historial
      const { data: perfil } = await sb.from('perfiles')
        .select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return { puntos: 0, nivel: 'Bronce' };

      const { data: hist } = await sb.from('loyalty_historial')
        .select('puntos')
        .eq('prestador_id', perfil.prestador_id);

      const total = (hist || []).reduce((s, h) => s + h.puntos, 0);
      const nivel = total >= 10000 ? 'Élite' : total >= 5000 ? 'Oro' : total >= 1000 ? 'Plata' : 'Bronce';

      // Actualizar la fila de loyalty para dejarla sincronizada
      if (total > 0) {
        await sb.from('loyalty').upsert({ usuario_id: uid, puntos: total, nivel })
          .catch(() => {});
      }

      return { puntos: total, nivel };
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

    /** Registra una vista al perfil de un prestador. */
    async registrarVista(prestadorId, origen = 'busqueda') {
      if (!remoto) return;
      try {
        const uid = await this.usuarioIdActual();
        let zona = null;
        if (uid) {
          const { data: perfil } = await sb.from('perfiles').select('zona').eq('id', uid).maybeSingle();
          zona = perfil?.zona || null;
        }
        await sb.from('perfil_vistas').insert({
          prestador_id: prestadorId,
          vecino_id: uid || null,
          origen,
          zona,
          fecha: new Date().toISOString().split('T')[0],
        });
      } catch(e) { console.warn('[PronetDB] registrarVista', e.message); }
    },

    /** Registra un contacto (click en botón Contactar) con un prestador. */
    async registrarContacto(prestadorId, origen = 'busqueda') {
      if (!remoto) return;
      try {
        const uid = await this.usuarioIdActual();
        await sb.from('perfil_contactos').insert({
          prestador_id: prestadorId,
          vecino_id: uid || null,
          origen,
          fecha: new Date().toISOString().split('T')[0],
        });
      } catch(e) { console.warn('[PronetDB] registrarContacto', e.message); }
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

    /** Lista el historial de puntos del prestador logueado. */
    async listarLoyaltyHistorial(limite = 30) {
      if (!remoto) return [];
      const uid = await this.usuarioIdActual();
      if (!uid) return [];
      // Buscar el prestador_id del usuario logueado
      const { data: perfil } = await sb.from('perfiles')
        .select('prestador_id').eq('id', uid).maybeSingle();
      if (!perfil?.prestador_id) return [];
      const { data, error } = await sb.from('loyalty_historial')
        .select('*')
        .eq('prestador_id', perfil.prestador_id)
        .order('creado', { ascending: false })
        .limit(limite);
      if (error) { console.warn('[PronetDB] listarLoyaltyHistorial', error.message); return []; }
      return data || [];
    },

    /** Descuenta puntos de loyalty por un canje y persiste en Supabase. */
    async canjearPuntos(costo, nombre) {
      if (!remoto) return { ok: false, error: 'modo local' };
      try {
        const uid = await this.usuarioIdActual();
        if (!uid) return { ok: false, error: 'sin sesión' };
        const { data: perfil } = await sb.from('perfiles')
          .select('prestador_id').eq('id', uid).maybeSingle();
        if (!perfil?.prestador_id) return { ok: false, error: 'sin perfil prestador' };

        // Verificar puntos disponibles antes de descontar
        const { data: loy } = await sb.from('loyalty')
          .select('puntos').eq('usuario_id', uid).maybeSingle();
        const ptsActuales = loy?.puntos || 0;
        if (ptsActuales < costo) return { ok: false, error: 'puntos insuficientes' };

        // Registrar en historial (negativo = canje)
        await sb.from('loyalty_historial').insert({
          prestador_id: perfil.prestador_id,
          puntos: -costo,
          tipo: 'canje',
          descripcion: 'Canje: ' + nombre,
        });

        // Actualizar tabla loyalty
        const nuevosPuntos = ptsActuales - costo;
        const nivel = nuevosPuntos >= 10000 ? 'Élite' : nuevosPuntos >= 5000 ? 'Oro' : nuevosPuntos >= 1000 ? 'Plata' : 'Bronce';
        await sb.from('loyalty').upsert({ usuario_id: uid, puntos: nuevosPuntos, nivel });

        return { ok: true, puntos: nuevosPuntos };
      } catch(e) {
        console.warn('[PronetDB] canjearPuntos', e.message);
        return { ok: false, error: e.message };
      }
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

    /** Actualiza un registro por id. Devuelve el registro actualizado. */
    async actualizar(coleccion, id, cambios) {
      if (remoto) {
        const { data, error } = await sb.from(coleccion).update(cambios).eq('id', id).select().single();
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
    async listarPrestadores(filtros = {}) {
      if (remoto) {
        let q = sb.from('prestadores').select('*').eq('activo', true);
        if (filtros.rubro)   q = q.eq('rubro', filtros.rubro);
        if (filtros.zona)    q = q.eq('zona', filtros.zona);
        if (filtros.premium) q = q.eq('premium', true);
        if (filtros.busqueda) {
          // Buscar en nombre Y en rubro (sin tilde, case-insensitive)
          q = q.or(
            'nombre.ilike.%' + filtros.busqueda + '%,' +
            'rubro.ilike.%' + filtros.busqueda + '%,' +
            'subrubro.ilike.%' + filtros.busqueda + '%'
          );
        }
        q = q.order('rating', { ascending: false });
        const { data, error } = await q;
        if (error) { console.warn('[PronetDB] listarPrestadores', error.message, '→ fallback local'); return []; }
        return data || [];
      }
      return [];
    },

    /** Obtiene la posición del prestador en el ranking por zona y rubro. */
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
    .select(`id, estado, creado, vecino_id, prestador_id,
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
  return (data || []).map(c => {
    const msgs = (c.mensajes_chat || []).sort((a,b) => new Date(b.creado) - new Date(a.creado));
    const ultimo = msgs[0];
    const nombre = c.prestadores?.nombre || 'Prestador';
    return {
      id: c.id,
      estado: c.estado,
      vecino_id: c.vecino_id,
      prestador_id: c.prestador_id,
      prestador_nombre: nombre,
      prestador_iniciales: nombre.slice(0,2).toUpperCase(),
      pedido_titulo: c.pedidos?.titulo || 'Trabajo',
      rubro: c.pedidos?.rubro || '',
      ultimo_mensaje: ultimo?.texto || 'Sin mensajes aún',
      hora_ultimo: ultimo ? new Date(ultimo.creado).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '',
    };
  });
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
    async registrar(email, password, nombre, tipo, zona) {
      if (!remoto) {
        // Modo local: guardar un "usuario" simulado
        const user = { id: 'local-' + Date.now(), email, nombre, tipo: tipo || 'cliente', zona: zona || 'Escobar' };
        try { localStorage.setItem('pronet-usuario', JSON.stringify(user)); } catch (e) {}
        return { ok: true, user };
      }
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { nombre, tipo: tipo || 'cliente', zona: zona || 'Escobar' } }
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
      // Traer el perfil vinculado
      const { data: perfil } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
      // Si es prestador sin fila en prestadores (bug de registro), crearla ahora
      if (perfil && perfil.tipo === 'prestador' && !perfil.prestador_id) {
        try {
          const { data: nuevoPrestador } = await sb.from('prestadores').insert({
            nombre: perfil.nombre || user.email,
            zona:   perfil.zona  || 'Escobar',
            rubro:  'General',
            activo: true,
          }).select('id').single();
          if (nuevoPrestador?.id) {
            await sb.from('perfiles').update({ prestador_id: nuevoPrestador.id }).eq('id', user.id);
            perfil.prestador_id = nuevoPrestador.id;
          }
        } catch(e) { console.warn('[PronetDB] auto-crear prestador', e.message); }
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
