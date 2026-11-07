/**
 * Fotos de recibos: una por movimiento, guardadas en la misma base (tabla `fotos`). La app las reduce
 * antes de subirlas, así que pesan unos 100 KB. No viajan con los datos de siempre: la app pide la de un
 * movimiento solo cuando lo abre. Tampoco entran al respaldo de GitHub.
 *
 *   PUT    /api/foto/<id del movimiento>   cuerpo: el JPEG tal cual
 *   GET    /api/foto/<id del movimiento>
 *   DELETE /api/foto/<id del movimiento>
 */
import type { D1Like } from './d1repo.ts';

export const MAX_FOTO = 300_000; // bytes
const MAX_FOTOS = 3000; // para que una instalación no llene sola la base gratis

const aBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};

export async function manejarFoto(
  req: Request, db: D1Like, id: string, json: (d: unknown, status?: number) => Response,
): Promise<Response> {
  if (req.method === 'GET') {
    const f = await db.prepare('SELECT datos FROM fotos WHERE movimiento_id = ?').bind(id).first<{ datos: string }>();
    if (!f) return json({ error: 'Sin foto' }, 404);
    return new Response(Uint8Array.from(atob(f.datos), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  }
  if (req.method === 'DELETE') {
    await db.prepare('DELETE FROM fotos WHERE movimiento_id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (req.method !== 'PUT') return json({ error: 'Método no permitido' }, 405);

  if (Number(req.headers.get('content-length') ?? 0) > MAX_FOTO) return json({ error: 'La foto es muy pesada.' }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_FOTO) return json({ error: 'La foto es muy pesada.' }, 413);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: 'Tiene que ser un JPEG.' }, 400);
  const total = (await db.prepare('SELECT COUNT(*) n FROM fotos WHERE movimiento_id <> ?').bind(id).first<{ n: number }>())?.n ?? 0;
  if (total >= MAX_FOTOS) return json({ error: 'Ya hay demasiadas fotos guardadas.' }, 507);
  await db.prepare("INSERT INTO fotos (movimiento_id, datos) VALUES (?, ?) ON CONFLICT(movimiento_id) DO UPDATE SET datos = excluded.datos, subida_en = datetime('now','-5 hours')")
    .bind(id, aBase64(bytes)).run();
  return json({ ok: true });
}
