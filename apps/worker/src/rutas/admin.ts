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

export const rutaAdmin: Ruta = async ({ req, url, env, repo }) => {
  if (url.pathname === '/api/respaldo/probar' && req.method === 'POST') {
    return json(await respaldarEnGitHub(env, repo, new Date()));
  }

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
  return null;
};
