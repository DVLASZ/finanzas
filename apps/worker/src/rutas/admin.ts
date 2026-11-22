/**
 * Cosas de dueño de la instalación:
 *   POST /api/respaldo/probar   sube ahora la copia de seguridad a GitHub y dice si salió bien (sin mostrar claves)
 *   POST /api/purgar            borra definitivamente lo anulado (con PIN y frase)
 *   POST /api/borrar-todo       borra todo (con PIN y frase)
 *
 * Borrados definitivos: PIN SIEMPRE obligatorio y frase de confirmación. Si PIN_BORRADO no está
 * configurado el borrado queda desactivado (falla cerrado) en vez de pedir solo la frase.
 */
import { respaldarEnGitHub } from '../respaldo.ts';
import { igualesSeguro, json, type Ruta } from '../comun.ts';
import { conexionDe } from '../seguridad.ts';

/**
 * Freno al PIN de borrado: 5 PIN equivocados seguidos desde la misma conexión la bloquean 10 minutos; cada bloqueo
 * nuevo dura el doble (hasta un día). Acertar borra la cuenta. Vive en la memoria de la instancia, como los otros frenos:
 * es un freno de mejor esfuerzo, no una garantía exacta. Sin conexión conocida (pruebas) no se aplica.
 */
const FALLOS_PARA_BLOQUEO = 5;
const BLOQUEO_BASE_MS = 10 * 60_000;
const BLOQUEO_MAX_MS = 24 * 3600_000;
const pinFallido = new Map<string, { n: number; rondas: number; hasta: number }>();

/** Segundos que faltan para poder intentar el PIN otra vez (0 si ya se puede). */
function esperaPin(clave: string, ahora = Date.now()): number {
  const e = pinFallido.get(clave);
  return e && e.hasta > ahora ? Math.ceil((e.hasta - ahora) / 1000) : 0;
}

function anotarPinFallido(clave: string, ahora = Date.now()): void {
  if (pinFallido.size > 1000) for (const [k, v] of pinFallido) if (v.hasta < ahora && v.n === 0) pinFallido.delete(k);
  const e = pinFallido.get(clave) ?? { n: 0, rondas: 0, hasta: 0 };
  e.n++;
  if (e.n >= FALLOS_PARA_BLOQUEO) {
    e.hasta = ahora + Math.min(BLOQUEO_BASE_MS * 2 ** e.rondas, BLOQUEO_MAX_MS);
    e.rondas++;
    e.n = 0;
  }
  pinFallido.set(clave, e);
}

export const reiniciarFrenoPin = (): void => pinFallido.clear();

export const rutaAdmin: Ruta = async ({ req, url, env, repo }) => {
  if (url.pathname === '/api/respaldo/probar' && req.method === 'POST') {
    return json(await respaldarEnGitHub(env, repo, new Date()));
  }

  if (url.pathname === '/api/purgar' || url.pathname === '/api/borrar-todo') {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const conexion = conexionDe(req);
    const espera = conexion ? esperaPin(conexion) : 0;
    if (espera) {
      const r = json({ error: `Demasiados PIN equivocados. Espera ${Math.ceil(espera / 60)} min e inténtalo otra vez.`, esperaS: espera }, 429);
      r.headers.set('Retry-After', String(espera));
      return r;
    }
    const cuerpo = (await req.json().catch(() => ({}))) as { pin?: string; confirmacion?: string };
    if (!env.PIN_BORRADO || typeof cuerpo.pin !== 'string' || !igualesSeguro(cuerpo.pin, env.PIN_BORRADO)) {
      if (conexion) anotarPinFallido(conexion);
      return json({ error: 'PIN incorrecto o no configurado' }, 403);
    }
    if (conexion) pinFallido.delete(conexion);
    if (url.pathname === '/api/purgar') {
      if (cuerpo.confirmacion !== 'PURGAR ANULADOS') return json({ error: 'Falta la frase de confirmación' }, 400);
      return json({ borrados: await repo.purgarAnulados() });
    }
    if (cuerpo.confirmacion !== 'BORRAR TODO MIS DATOS') return json({ error: 'Falta la frase de confirmación' }, 400);
    await repo.borrarTodo();
    return json({ ok: true });
  }
  return null;
};
