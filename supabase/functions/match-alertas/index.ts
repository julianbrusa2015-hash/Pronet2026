// Edge Function: match-alertas
// Busca alertas activas que coincidan con una nueva publicación y crea notificaciones.
// Llamada desde el cliente (best-effort) después de crear una publicación.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  let publicacion_id: string;
  try {
    const body = await req.json();
    publicacion_id = body.publicacion_id;
    if (!publicacion_id) return new Response('missing publicacion_id', { status: 400 });
  } catch {
    return new Response('bad request', { status: 400 });
  }

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
