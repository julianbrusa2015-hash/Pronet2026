// @ts-check
// Corre antes de todos los tests: limpia datos de test y resetea rate limits.

const SUPABASE_URL      = 'https://zgmwtyxtygnjfakeriiz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnbXd0eXh0eWduamZha2VyaWl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NDkzMDUsImV4cCI6MjA5OTIyNTMwNX0.CKv9L3py6fbidKhBfNe6ZVNtS_U7gyMshLLLSS257Ac';
const VECINO_EMAIL      = 'vecino_test@pronet.test';
const VECINO_PW         = 'Test1234!';
const PRESTADOR_EMAIL   = 'prestador_test@pronet.test';
const PRESTADOR_PW      = '12345678';

async function supabaseAuth(email, pw) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: pw }),
  });
  const d = await res.json();
  return { token: d?.access_token || null, userId: null };
}

async function getUserId(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  const d = await res.json();
  return d?.id || null;
}

async function supabaseGet(token, table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=id`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  const d = await res.json();
  return Array.isArray(d) ? d : [];
}

async function supabaseDelete(token, table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=minimal',
    },
  });
  return res.status;
}

/** Borra los pedidos de prueba por la Management API.
 *
 *  Las cascadas se llevan propuestas, chats y mensajes solas. Lo único que
 *  hay que sacar antes es `trabajo_fotos`, cuya FK contra chats_trabajo es
 *  NO ACTION y aborta el borrado del pedido entero.
 *
 *  El filtro es siempre `titulo like 'Test E2E%'`: esto corre como dueño de
 *  la base, así que el alcance lo pone la consulta y nada más. */
async function limpiarPedidosDePrueba(token) {
  const pat = process.env.SUPABASE_PAT;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!pat || !ref) {
    const st = await supabaseDelete(token, 'pedidos', 'titulo=like.Test%20E2E%25');
    return `sin SUPABASE_PAT, DELETE parcial como vecino (status ${st})`;
  }
  const sql = `
    delete from public.trabajo_fotos where chat_id in (
      select ct.id from public.chats_trabajo ct
        join public.pedidos pe on pe.id = ct.pedido_id
       where pe.titulo like 'Test E2E%');
    delete from public.denuncias where pedido_id in (
      select id from public.pedidos where titulo like 'Test E2E%');
    delete from public.pedidos where titulo like 'Test E2E%';`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) return `Management API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  return 'ok (Management API)';
}

module.exports = async function globalSetup() {
  // ── Autenticar como vecino_test ──────────────────────────────────────────
  const { token } = await supabaseAuth(VECINO_EMAIL, VECINO_PW);
  if (!token) {
    console.warn('[setup] No se pudo autenticar como vecino_test — tests pueden fallar por rate limit');
    return;
  }
  const userId = await getUserId(token);
  console.log('[setup] vecino_test userId:', userId);

  // 1. Borrar pedidos Test E2E del vecino
  //
  // Ya no alcanza con el DELETE del cliente: desde
  // supabase-borrar-pedido-sin-propuestas.sql, un pedido que tiene
  // propuestas vivas no se puede borrar, y varios tests justamente le
  // mandan propuestas. La limpieza pasa a la Management API, que corre como
  // dueño de la base y no pasa por RLS.
  //
  // Con fallback al camino viejo: sin SUPABASE_PAT (una CI sin el secreto)
  // igual limpia los pedidos sin propuestas, que es mejor que no limpiar
  // nada y mucho mejor que abortar la corrida entera.
  const s1 = await limpiarPedidosDePrueba(token);
  const pedidosRestantes = await supabaseGet(token, 'pedidos', `usuario_id=eq.${userId}`);
  console.log(`[setup] limpieza pedidos Test E2E: ${s1} → quedan ${pedidosRestantes.length} pedidos`);

  // 2. Limpiar entradas de rate_limits para crear_pedido del vecino
  const s2 = await supabaseDelete(token, 'rate_limits', `user_id=eq.${userId}&accion=eq.crear_pedido`);
  // Verificar que realmente se borraron (si RLS bloquea el DELETE silenciosamente)
  const rlRes = await supabaseGet(token, 'rate_limits', `user_id=eq.${userId}&accion=eq.crear_pedido`);
  console.log(`[setup] DELETE rate_limits: status ${s2} → quedan ${rlRes.length} entradas`);

  if (rlRes.length > 0) {
    console.warn('[setup] rate_limits NO se limpió (RLS bloquea DELETE para vecino).');
    console.warn('[setup] Ejecutá en Supabase SQL Editor para resetear:');
    console.warn(`  DELETE FROM public.rate_limits WHERE user_id = '${userId}' AND accion = 'crear_pedido';`);
    console.warn('[setup] O agregá esta política en Supabase → Authentication → Policies → rate_limits:');
    console.warn('  DELETE: auth.uid() = user_id');
  }

  // 2b. Lo mismo para denuncias. C10 crea una denuncia real por corrida, así
  // que el vecino agota el límite y el insert vuelve con
  // "P0001 RATE_LIMIT_CREAR_DENUNCIA". El síntoma no dice "rate limit": la UI
  // sólo deja #denuncia-exito oculto y el test falla en un toBeVisible.
  const s2b = await supabaseDelete(token, 'rate_limits', `user_id=eq.${userId}&accion=eq.crear_denuncia`);
  const rlDen = await supabaseGet(token, 'rate_limits', `user_id=eq.${userId}&accion=eq.crear_denuncia`);
  console.log(`[setup] DELETE rate_limits (crear_denuncia): status ${s2b} → quedan ${rlDen.length} entradas`);
  if (rlDen.length > 0) {
    console.warn('[setup] rate_limits de crear_denuncia NO se limpió para vecino_test.');
    console.warn(`  DELETE FROM public.rate_limits WHERE user_id = '${userId}' AND accion = 'crear_denuncia';`);
  }

  // ── Autenticar como prestador_test y limpiar su rate limit de propuestas ──
  const { token: tokenPrestador } = await supabaseAuth(PRESTADOR_EMAIL, PRESTADOR_PW);
  if (!tokenPrestador) {
    console.warn('[setup] No se pudo autenticar como prestador_test — tests de propuestas pueden fallar por rate limit');
    return;
  }
  const prestadorUserId = await getUserId(tokenPrestador);
  const s3 = await supabaseDelete(tokenPrestador, 'rate_limits', `user_id=eq.${prestadorUserId}&accion=eq.enviar_propuesta`);
  const rlPrestador = await supabaseGet(tokenPrestador, 'rate_limits', `user_id=eq.${prestadorUserId}&accion=eq.enviar_propuesta`);
  console.log(`[setup] DELETE rate_limits (prestador, enviar_propuesta): status ${s3} → quedan ${rlPrestador.length} entradas`);
  if (rlPrestador.length > 0) {
    console.warn('[setup] rate_limits de enviar_propuesta NO se limpió para prestador_test.');
    console.warn(`  DELETE FROM public.rate_limits WHERE user_id = '${prestadorUserId}' AND accion = 'enviar_propuesta';`);
  }
};
