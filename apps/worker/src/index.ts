/**
 * Worker de Cloudflare: el "servidor" de cada instalación.
 *
 *   POST /api/sync           la app envía sus cambios y recibe todos los datos
 *   GET  /api/datos          todos los datos
 *   POST /api/purgar         borra definitivamente lo anulado (con PIN)
 *   POST /api/borrar-todo    borra todo (con PIN y frase de confirmación)
 *   (cualquier otra ruta)    la app web (archivos estáticos)
 *
 * Seguridad: la API exige el token de la instalación (`API_TOKEN`). Los secretos se guardan con
 * `wrangler secret put`, nunca en el código. El bot vive en la app (core/), no aquí.
 */
import {
  aLocal, aplicarOps, deLocal, ESQUEMA_IA, formatear, MARGEN_PARCIAL_SEGUNDOS, MAX_DIAS_PARCIAL, frasesDeRespuesta, instruccionesIA, TOPE_IA_POR_DIA, usoDeIA, validarOps,
  type PeticionSync, type RespuestaSync,
} from '../../../packages/core/src/index.ts';
import { D1Repo, type D1Like } from './d1repo.ts';
import { manejarFoto } from './fotos.ts';
import { agregarAviso, destinosDe, enviarAlBuzon, leerAviso, type EnvBuzon } from './buzon.ts';
import { respaldarEnGitHub, type EnvRespaldo } from './respaldo.ts';
import { calcularAlertas } from '../../../packages/core/src/index.ts';
import { suscripcionValida, enviarAviso, type Suscripcion } from './push.ts';
import { avisarAlCelular as avisarDeVerdad, avisarMetas, avisarTopes, llavesVapid, mandarAviso } from './avisos.ts';

export interface Env extends EnvRespaldo, EnvBuzon {
  DB: D1Like;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Token que la app usa para hablar con la API (secreto). */
  API_TOKEN: string;
  /** Token opcional de solo lectura: ve los datos pero no puede escribir ni borrar (secreto). */
  API_TOKEN_LECTURA?: string;
  /** PIN para los borrados definitivos (secreto). Sin PIN el borrado queda desactivado. */
  PIN_BORRADO?: string;
  /** Workers AI (plan gratuito). Sin este binding la ayuda de la IA no existe. */
  AI?: { run(modelo: string, entrada: unknown): Promise<unknown> };
  /** Tope de ayudas de la IA por día. Por defecto 30. */
  IA_TOPE?: string;
  /** Otro modelo de Workers AI, si el de siempre se retira. */
  IA_MODELO?: string;
}

/** Modelo de Workers AI que reescribe las frases. Cloudflare retira modelos: se puede cambiar con IA_MODELO sin tocar el código. */
const MODELO_IA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const json = (datos: unknown, status = 200): Response =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Comparación en tiempo constante (no filtra información por el tiempo de respuesta). */
function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function tokenValido(req: Request, esperado: string): boolean {
  const h = req.headers.get('Authorization') ?? '';
  const dado = h.startsWith('Bearer ') ? h.slice(7) : '';
  return Boolean(esperado) && igualesSeguro(dado, esperado);
}

/** Compatibilidad: la tarea de avisos vive en avisos.ts; se deja aquí con la firma de siempre. */
export async function avisarAlCelular(env: Env, ahora = new Date(), momento: 'manana' | 'tarde' = 'manana'): Promise<{ enviados: number; quitados: number }> {
  return avisarDeVerdad(new D1Repo(env.DB), ahora, momento);
}

export default {
  async scheduled(_evento: unknown, env: Env): Promise<void> {
    const repo = new D1Repo(env.DB);
    // Un solo cron corre dos veces al día (13:00 y 23:00 UTC = 8 am y 6 pm en Colombia): la plan gratis
    // de Cloudflare deja 5 crons por cuenta y hay tres apps. Por la hora se sabe cuál toca.
    if (new Date().getUTCHours() >= 18) {
      await avisarDeVerdad(repo, new Date(), 'tarde');
      return;
    }
    await avisarDeVerdad(repo, new Date(), 'manana');
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
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, url, env); } catch (e) {
        console.error('api:', url.pathname, (e as Error).message); // solo el motivo, para verlo con wrangler tail
        return json({ error: 'Error del servidor. Inténtalo de nuevo.' }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Finanzas: la app web aún no está desplegada.', { status: 404 });
  },
};

// ---------------------------------------------------------------------------------------
// API para la app
// ---------------------------------------------------------------------------------------

async function api(req: Request, url: URL, env: Env): Promise<Response> {
  // El buzón de otras apps tiene su propia clave: solo sirve para dejar un aviso.
  if (url.pathname === '/api/buzon' && req.method === 'POST') {
    if (!env.BUZON_CLAVE) return json({ error: 'No encontrado' }, 404);
    if (!tokenValido(req, env.BUZON_CLAVE)) return json({ error: 'No autorizado' }, 401);
    const aviso = leerAviso(await req.json().catch(() => null));
    if (typeof aviso === 'string') return json({ error: aviso }, 400);
    const buzonRepo = new D1Repo(env.DB);
    await buzonRepo.setConfig('buzon', agregarAviso((await buzonRepo.cargar()).config, aviso));
    try {
      await mandarAviso(buzonRepo, { titulo: `Aviso de ${aviso.de}`, cuerpo: `${aviso.de}: ${formatear(aviso.monto)}${aviso.concepto ? ` · ${aviso.concepto}` : ''}. Míralo en Más, Buzón.` });
    } catch (e) { console.error('avisos:', (e as Error).message); }
    return json({ ok: true });
  }
  const principal = tokenValido(req, env.API_TOKEN);
  const soloLectura = !principal && Boolean(env.API_TOKEN_LECTURA) && tokenValido(req, env.API_TOKEN_LECTURA ?? '');
  if (!principal && !soloLectura) return json({ error: 'No autorizado' }, 401);
  if (soloLectura && !(req.method === 'GET' && (url.pathname === '/api/datos' || url.pathname === '/api/salud'))) return json({ error: 'Este acceso es de solo lectura.' }, 403);
  const repo = new D1Repo(env.DB);

  if (url.pathname === '/api/datos' && req.method === 'GET') {
    return json({ datos: await repo.cargar(), servidorEn: aLocal(new Date()) } satisfies RespuestaSync);
  }

  // Para que el dueño vea de un vistazo cómo va cada instalación (npm run salud). No devuelve datos personales.
  if (url.pathname === '/api/salud' && req.method === 'GET') {
    const d = await repo.cargar();
    const activos = d.movimientos.filter(m => m.estado === 'ok');
    const subs = (await repo.leerSecreto<Suscripcion[]>('suscripciones')) ?? [];
    const f = await env.DB.prepare('SELECT COUNT(*) n, COALESCE(SUM(LENGTH(datos)), 0) b FROM fotos').first<{ n: number; b: number }>();
    return json({
      fotos: { cantidad: f?.n ?? 0, kb: Math.round((f?.b ?? 0) / 1024) },
      movimientos: activos.length,
      ultimoMovimiento: activos.reduce((x, m) => (m.ocurridoEn > x ? m.ocurridoEn : x), '') || null,
      desdeCuando: d.config.fecha_apertura ?? null,
      celularesConAvisos: subs.length,
      ia: { encendida: d.config.ia !== '0' && Boolean(env.AI), uso: d.config.ia_uso ?? null },
      ahora: aLocal(new Date()),
    });
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    // La petición viene de fuera: se valida su forma antes de tocar la base (ver `validarOps`).
    const cuerpo = (await req.json().catch(() => null)) as Partial<PeticionSync> | null;
    const motivo = validarOps(cuerpo?.ops);
    if (motivo) return json({ error: motivo }, 400);
    const rechazadas = await aplicarOps(repo, cuerpo!.ops!);
    // la app que ya tiene todo pide solo lo que cambió; si se purgó o borró algo (otra «generación»), o hace mucho
    // que no se sincroniza, se le manda todo como siempre
    let datos: Awaited<ReturnType<typeof repo.cargar>>;
    let parcial = false;
    const desde = typeof cuerpo?.desde === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cuerpo.desde) ? cuerpo.desde : null;
    if (desde && deLocal(aLocal(new Date())).getTime() - deLocal(desde).getTime() < MAX_DIAS_PARCIAL * 86400000) {
      const margen = aLocal(new Date(deLocal(desde).getTime() - MARGEN_PARCIAL_SEGUNDOS * 1000));
      datos = await repo.cargar(margen);
      parcial = (datos.config.generacion ?? '0') === (cuerpo?.generacion ?? '0');
      if (!parcial) datos = await repo.cargar();
    } else {
      datos = await repo.cargar();
    }
    // un aviso que no sale nunca debe tumbar la sincronización
    try { await avisarTopes(repo, datos, cuerpo!.ops!); await avisarMetas(repo, datos, cuerpo!.ops!); } catch (e) { console.error('avisos:', (e as Error).message); }
    return json({ datos, servidorEn: aLocal(new Date()), ...(parcial ? { parcial: true } : {}), ...(rechazadas.length ? { rechazadas } : {}) } satisfies RespuestaSync);
  }

  // Buzón: a qué apps se puede avisar (solo los nombres) y el envío.
  if (url.pathname === '/api/buzon/destinos' && req.method === 'GET') return json({ destinos: Object.keys(destinosDe(env)) });
  if (url.pathname === '/api/buzon/enviar' && req.method === 'POST') {
    const c = (await req.json().catch(() => null)) as { destino?: unknown; monto?: unknown; concepto?: unknown } | null;
    const r = await enviarAlBuzon(env, { destino: String(c?.destino ?? ''), monto: Number(c?.monto), concepto: String(c?.concepto ?? '') });
    return json(r, r.ok ? 200 : 400);
  }

  // Prueba del respaldo en la nube: lo sube ahora y dice si salió bien (sin mostrar claves).
  if (url.pathname === '/api/respaldo/probar' && req.method === 'POST') {
    return json(await respaldarEnGitHub(env, repo, new Date()));
  }

  // Avisos al celular: la app pide la llave pública, se suscribe y el servidor guarda el celular.
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

  // Ayuda de la IA: reescribe una frase que las reglas no entendieron. No guarda nada.
  if (url.pathname === '/api/interpretar' && req.method === 'POST') {
    if (!env.AI) return json({ error: 'Este servidor no tiene la ayuda de la IA.' }, 501);
    const cuerpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
    const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : '';
    if (!texto || texto.length > 400) return json({ error: 'Escribe una frase de hasta 400 letras.' }, 400);
    const datos = await repo.cargar();
    if (datos.config.ia === '0') return json({ error: 'La ayuda de la IA está apagada.' }, 403);
    const tope = Number(env.IA_TOPE) > 0 ? Number(env.IA_TOPE) : TOPE_IA_POR_DIA;
    const nuevo = usoDeIA(datos.config.ia_uso, aLocal(new Date()).slice(0, 10), tope);
    if (!nuevo) return json({ error: 'Hoy ya usaste todas las ayudas. Escríbelo de forma más simple.' }, 429);
    await repo.setConfig('ia_uso', nuevo);
    try {
      const r = (await env.AI.run(env.IA_MODELO || MODELO_IA, {
        messages: [{ role: 'system', content: instruccionesIA(datos) }, { role: 'user', content: texto }],
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: ESQUEMA_IA },
      })) as { response?: unknown };
      // la frase de la persona no se guarda en ningún registro
      return json({ frases: frasesDeRespuesta(r?.response ?? r) });
    } catch (e) {
      console.error('ia:', (e as Error).message); // solo el motivo, nunca la frase
      return json({ error: 'La ayuda no respondió. Inténtalo otra vez.', motivo: (e as Error).message.slice(0, 200) }, 502);
    }
  }

  // Borrados definitivos: PIN SIEMPRE obligatorio y frase de confirmación. Si PIN_BORRADO no está
  // configurado el borrado queda desactivado (falla cerrado) en vez de pedir solo la frase.
  if (url.pathname === '/api/purgar' || url.pathname === '/api/borrar-todo') {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const cuerpo = (await req.json().catch(() => ({}))) as { pin?: string; confirmacion?: string };
    if (!env.PIN_BORRADO || typeof cuerpo.pin !== 'string' || !igualesSeguro(cuerpo.pin, env.PIN_BORRADO)) {
      return json({ error: 'PIN incorrecto o no configurado' }, 403);
    }
    if (url.pathname === '/api/purgar') {
      if (cuerpo.confirmacion !== 'PURGAR ANULADOS') return json({ error: 'Falta la frase de confirmación' }, 400);
      return json({ borrados: await repo.purgarAnulados() });
    }
    if (cuerpo.confirmacion !== 'BORRAR TODO MIS DATOS') return json({ error: 'Falta la frase de confirmación' }, 400);
    await repo.borrarTodo();
    return json({ ok: true });
  }

  const foto = url.pathname.match(/^\/api\/foto\/([\w-]{1,64})$/);
  if (foto) return manejarFoto(req, env.DB, foto[1], json);

  return json({ error: 'No encontrado' }, 404);
}
