/**
 * Fotos de recibos: /api/foto/<id del movimiento>. Todo el trabajo está en `../fotos.ts`.
 */
import { manejarFoto } from '../fotos.ts';
import { json, type Ruta } from '../comun.ts';

export const rutaFotos: Ruta = async ({ req, url, env }) => {
  const foto = url.pathname.match(/^\/api\/foto\/([\w-]{1,64})$/);
  return foto ? manejarFoto(req, env.DB, foto[1], json) : null;
};
