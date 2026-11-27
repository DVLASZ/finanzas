/**
 * Worker de Cloudflare: el "servidor" de cada instalación.
 *
 * Aquí solo está la puerta de entrada: el cron, la autorización y el reparto de las peticiones. Cada
 * dominio vive en su archivo de `rutas/`:
 *
 *   rutas/sync.ts     /api/datos, /api/salud, /api/sync
 *   rutas/fotos.ts    /api/foto/<id>
 *   rutas/push.ts     /api/push/*
 *   rutas/ia.ts       /api/interpretar
 *   rutas/ocr.ts      /api/ocr
 *   rutas/buzon.ts    /api/buzon*
 *   rutas/admin.ts    /api/respaldo/probar, /api/purgar, /api/borrar-todo
 *   (cualquier otra)  la app web (archivos estáticos)
 *
 * Seguridad: la API exige el token de la instalación (`API_TOKEN`). Los secretos se guardan con
 * `wrangler secret put`, nunca en el código. El bot vive en la app (core/), no aquí.
 */
import { D1Repo } from './d1repo.ts';
import { respaldarEnGitHub } from './respaldo.ts';
import { avisarAlCelular as avisarDeVerdad, avisarFotos, avisarRecordatorio, mandarAviso } from './avisos.ts';
import { json, tokenValido, type Contexto, type Env, type Ruta } from './comun.ts';
import { rutaAdmin } from './rutas/admin.ts';
import { buzonPublico, rutaBuzon } from './rutas/buzon.ts';
import { rutaFotos } from './rutas/fotos.ts';
import { rutaIA } from './rutas/ia.ts';
import { rutaOCR } from './rutas/ocr.ts';
import { rutaPush } from './rutas/push.ts';
import { rutaSync } from './rutas/sync.ts';
import { conCabecerasSeguras, conexionDe, intentosFallidos, limiteIA, peticiones } from './seguridad.ts';

export type { Env } from './comun.ts';

/** Compatibilidad: la tarea de avisos vive en avisos.ts; se deja aquí con la firma de siempre. */
export async function avisarAlCelular(env: Env, ahora = new Date(), momento: 'manana' | 'tarde' = 'manana'): Promise<{ enviados: number; quitados: number }> {
  return avisarDeVerdad(new D1Repo(env.DB), ahora, momento);
}

/** Las rutas autorizadas, en el orden en que se prueban. */
const RUTAS: Ruta[] = [rutaSync, rutaBuzon, rutaAdmin, rutaPush, rutaIA, rutaOCR, rutaFotos];

export default {
  async scheduled(_evento: unknown, env: Env): Promise<void> {
    const repo = new D1Repo(env.DB);
    // Un solo cron corre cada media hora (la plan gratis de Cloudflare deja 5 crons por cuenta y hay tres apps). Por la hora se
    // sabe qué toca: 13:00 UTC = 8 am y 23:00 UTC = 6 pm en Colombia; el recordatorio de la noche va a la hora que cada quien eligió.
    const ahora = new Date();
    try { await avisarRecordatorio(repo, ahora); } catch (e) { console.error('recordatorio:', (e as Error).message); }
    if (ahora.getUTCMinutes() >= 30) return;
    if (ahora.getUTCHours() === 23) {
      await avisarDeVerdad(repo, ahora, 'tarde');
      return;
    }
    if (ahora.getUTCHours() !== 13) return;
    await avisarDeVerdad(repo, new Date(), 'manana');
    try { await avisarFotos(repo); } catch (e) { console.error('avisos:', (e as Error).message); }
    // los domingos, la copia de seguridad en la nube (si está activada); si falla, se avisa al celular
    const hoy = new Date();
    if (hoy.getUTCDay() === 0) {
      let motivo: string | undefined;
      try {
        const r = await respaldarEnGitHub(env, repo, hoy);
        if (!r.hecho && r.motivo && !r.motivo.includes('no está activado')) motivo = r.motivo;
      } catch (e) {
        console.error('respaldo:', (e as Error).message);
        motivo = 'Error inesperado al armar la copia.';
      }
      if (motivo) await mandarAviso(repo, { titulo: 'La copia de seguridad falló', cuerpo: `${motivo} Revisa el token y la frase del respaldo.` });
    }
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    return conCabecerasSeguras(await atender(req, env));
  },
};

async function atender(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, url, env); } catch (e) {
        console.error('api:', url.pathname, (e as Error).message); // solo el motivo, para verlo con wrangler tail
        return json({ error: 'Error del servidor. Inténtalo de nuevo.' }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Finanzas: la app web aún no está desplegada.', { status: 404 });
}

/** Lo más grande que acepta la API en un cuerpo (2 MB). */
export const MAX_CUERPO = 2_000_000;

/** 429 con el aviso de cuánto esperar. */
function limitado(esperaS: number): Response {
  const r = json({ error: 'Demasiadas peticiones. Espera un momento.', esperaS }, 429);
  r.headers.set('Retry-After', String(esperaS));
  return r;
}

async function api(req: Request, url: URL, env: Env): Promise<Response> {
  // el buzón de otras apps tiene su propia clave y no pasa por la autorización de abajo
  const publico = await buzonPublico(req, url, env);
  if (publico) return publico;

  // freno a la fuerza bruta: tras 8 tokens equivocados en 10 minutos esa conexión espera, aunque después acierte
  const conexion = conexionDe(req);
  if (conexion && intentosFallidos.lleno(conexion)) return limitado(intentosFallidos.esperaS(conexion));
  const principal = tokenValido(req, env.API_TOKEN);
  const soloLectura = !principal && Boolean(env.API_TOKEN_LECTURA) && tokenValido(req, env.API_TOKEN_LECTURA ?? '');
  if (!principal && !soloLectura) {
    if (conexion) intentosFallidos.anotar(conexion);
    console.warn('seguridad: token equivocado en', req.method, url.pathname); // nunca el token ni lo que traía la petición
    return json({ error: 'No autorizado' }, 401);
  }
  // un cuerpo gigante se rechaza sin leerlo: la foto más grande son 300 KB y la sincronización más grande unos cientos
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && Number(req.headers.get('content-length') ?? 0) > MAX_CUERPO) return json({ error: 'La petición es demasiado grande.' }, 413);
  if (conexion) {
    if (!peticiones.anotar(conexion)) return limitado(peticiones.esperaS(conexion));
    // la IA y la lectura de comprobantes gastan la cuota gratis de Workers AI
    if ((url.pathname === '/api/interpretar' || url.pathname === '/api/ocr') && !limiteIA.anotar(conexion)) return limitado(limiteIA.esperaS(conexion));
  }
  if (soloLectura && !(req.method === 'GET' && (url.pathname === '/api/datos' || url.pathname === '/api/salud'))) return json({ error: 'Este acceso es de solo lectura.' }, 403);

  const contexto: Contexto = { req, url, env, repo: new D1Repo(env.DB) };
  for (const ruta of RUTAS) {
    const respuesta = await ruta(contexto);
    if (respuesta) return respuesta;
  }
  return json({ error: 'No encontrado' }, 404);
}
