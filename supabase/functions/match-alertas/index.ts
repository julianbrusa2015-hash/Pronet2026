// Edge Function: match-alertas
// Busca alertas activas que coincidan con una nueva publicación y crea notificaciones.
// Llamada desde el cliente (best-effort) después de crear una publicación
// (datos.js: sb.functions.invoke reenvía automáticamente el JWT de la sesión).
//
// Sin chequeo de identidad, cualquiera con la anon key pública podía invocar
// esta función directo con el publicacion_id de cualquier publicación
// existente y hacer que se re-envíen notificaciones a todos los suscriptores
// de alertas que matcheen, tantas veces como quisiera (spam de push).
// Por eso se exige que quien llama sea el autor real de la publicación.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('unauthorized', { status: 401 });

  let publicacion_id: string;
  try {
    const body = await req.json();
    publicacion_id = body.publicacion_id;
    if (!publicacion_id) return new Response('missing publicacion_id', { status: 400 });
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return new Response('unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Obtener la publicación
  const { data: pub, error: pubErr } = await supabase
    .from('publicaciones')
    .select('titulo, descripcion, autor_id')
    .eq('id', publicacion_id)
    .single();

  if (pubErr || !pub) {
    console.error('[match-alertas] publicacion no encontrada', pubErr?.message);
    return new Response('not found', { status: 404 });
  }

  if (pub.autor_id !== user.id) {
    return new Response('forbidden', { status: 403 });
  }

  const texto = ((pub.titulo || '') + ' ' + (pub.descripcion || '')).toLowerCase();

  // Traer todas las alertas activas (excepto del propio autor)
  const { data: alertas } = await supabase
    .from('alertas_busqueda')
    .select('id, usuario_id, termino')
    .eq('activa', true)
    .neq('usuario_id', pub.autor_id);

  if (!alertas?.length) return new Response('ok — sin alertas', { status: 200 });

  const matches = alertas.filter(a => texto.includes(a.termino.toLowerCase()));
  if (!matches.length) return new Response('ok — sin coincidencias', { status: 200 });

  // Insertar una notificación por cada suscriptor que coincide
  const notis = matches.map(a => ({
    usuario_id: a.usuario_id,
    tipo: 'alerta_busqueda',
    titulo: `Nuevo en ProMarket: ${pub.titulo}`,
    cuerpo: `Hay una publicación nueva que coincide con tu búsqueda "${a.termino}".`,
    url: null,
  }));

  const { error: notiErr } = await supabase.from('notificaciones').insert(notis);
  if (notiErr) {
    console.error('[match-alertas] error insertando notificaciones', notiErr.message);
    return new Response('error', { status: 500 });
  }

  console.log(`[match-alertas] ${matches.length} notificaciones enviadas para "${pub.titulo}"`);
  return new Response('ok', { status: 200 });
});
