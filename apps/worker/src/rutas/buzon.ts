/**
 * Buzón entre apps.
 *   POST /api/buzon          otra app deja un aviso (con la clave propia del buzón, sin el token de la app)
 *   GET  /api/buzon/destinos a qué apps se puede avisar (solo los nombres)
 *   POST /api/buzon/enviar   esta app le avisa a otra
 */
import { formatear } from '../../../../packages/core/src/index.ts';
import { agregarAviso, destinosDe, enviarAlBuzon, leerAviso } from '../buzon.ts';
import { mandarAviso } from '../avisos.ts';
import { D1Repo } from '../d1repo.ts';
import { json, tokenValido, type Env, type Ruta } from '../comun.ts';
import { conexionDe, intentosFallidos } from '../seguridad.ts';

/** El buzón de otras apps tiene su propia clave: solo sirve para dejar un aviso. Va ANTES de la autorización normal. */
export async function buzonPublico(req: Request, url: URL, env: Env): Promise<Response | null> {
  if (url.pathname !== '/api/buzon' || req.method !== 'POST') return null;
  if (!env.BUZON_CLAVE) return json({ error: 'No encontrado' }, 404);
  // la clave del buzón se protege igual que el token: tras varios intentos fallidos esa conexión espera
  const conexion = conexionDe(req);
  if (conexion && intentosFallidos.lleno(conexion)) return json({ error: 'Demasiadas peticiones. Espera un momento.', esperaS: intentosFallidos.esperaS(conexion) }, 429);
  if (!tokenValido(req, env.BUZON_CLAVE)) {
    if (conexion) intentosFallidos.anotar(conexion);
    console.warn('seguridad: clave de buzón equivocada'); // sin la clave ni la conexión en el registro
    return json({ error: 'No autorizado' }, 401);
  }
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return json({ error: 'Aviso demasiado grande' }, 413);
  const aviso = leerAviso(await req.json().catch(() => null));
  if (typeof aviso === 'string') return json({ error: aviso }, 400);
  const repo = new D1Repo(env.DB);
  await repo.setConfig('buzon', agregarAviso((await repo.cargar()).config, aviso));
  try {
    await mandarAviso(repo, { titulo: `Aviso de ${aviso.de}`, cuerpo: `${aviso.de}: ${formatear(aviso.monto)}${aviso.concepto ? ` · ${aviso.concepto}` : ''}${aviso.propuesta ? ' (trae una propuesta para anotar)' : ''}. Míralo en Más, Buzón.` });
  } catch (e) { console.error('avisos:', (e as Error).message); }
  return json({ ok: true });
}

export const rutaBuzon: Ruta = async ({ req, url, env }) => {
  if (url.pathname === '/api/buzon/destinos' && req.method === 'GET') return json({ destinos: Object.keys(destinosDe(env)) });
  if (url.pathname === '/api/buzon/enviar' && req.method === 'POST') {
    const c = (await req.json().catch(() => null)) as { destino?: unknown; monto?: unknown; concepto?: unknown; propuesta?: unknown } | null;
    const r = await enviarAlBuzon(env, { destino: String(c?.destino ?? ''), monto: Number(c?.monto), concepto: String(c?.concepto ?? ''), propuesta: typeof c?.propuesta === 'string' && c.propuesta.trim() ? c.propuesta : undefined });
    return json(r, r.ok ? 200 : 400);
  }
  return null;
};
