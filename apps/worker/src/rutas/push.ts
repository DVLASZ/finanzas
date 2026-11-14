/**
 * Avisos al celular: la app pide la llave pública, se suscribe y el servidor guarda el celular.
 *   GET  /api/push/clave
 *   POST /api/push/suscribir
 *   POST /api/push/baja
 *   POST /api/push/probar
 */
import { llavesVapid } from '../avisos.ts';
import { enviarAviso, suscripcionValida, type Suscripcion } from '../push.ts';
import { json, type Ruta } from '../comun.ts';

export const rutaPush: Ruta = async ({ req, url, repo }) => {
  if (url.pathname === '/api/push/clave' && req.method === 'GET') {
    return json({ clave: (await llavesVapid(repo)).publica });
  }
  if (url.pathname === '/api/push/suscribir' && req.method === 'POST') {
    const cuerpo = (await req.json().catch(() => null)) as { suscripcion?: unknown } | null;
    if (!suscripcionValida(cuerpo?.suscripcion)) return json({ error: 'Esa suscripción no sirve.' }, 400);
    const s = cuerpo!.suscripcion as Suscripcion;
    const otras = ((await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? []).filter(x => x.endpoint !== s.endpoint);
    await repo.guardarSecreto('suscripciones', [...otras, { endpoint: s.endpoint, keys: s.keys }].slice(-10));
    return json({ ok: true });
  }
  if (url.pathname === '/api/push/baja' && req.method === 'POST') {
    const cuerpo = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const quedan = ((await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? []).filter(x => x.endpoint !== cuerpo?.endpoint);
    await repo.guardarSecreto('suscripciones', quedan);
    return json({ ok: true });
  }
  if (url.pathname === '/api/push/probar' && req.method === 'POST') {
    const subs = (await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? [];
    const llaves = await llavesVapid(repo);
    let enviados = 0;
    for (const s of subs) if ((await enviarAviso(s, { titulo: 'Prueba de avisos', cuerpo: 'Si ves esto, los avisos funcionan en este celular.' }, llaves)) === 'ok') enviados++;
    return json({ enviados, suscritos: subs.length });
  }
  return null;
};
