/**
 * Datos y sincronización:
 *   GET  /api/datos   todos los datos
 *   GET  /api/salud   cómo va la instalación (sin datos personales)
 *   POST /api/sync    la app envía sus cambios y recibe lo que cambió (o todo)
 */
import {
  aLocal, aplicarOps, deLocal, MARGEN_PARCIAL_SEGUNDOS, MAX_DIAS_PARCIAL, validarOps,
  type PeticionSync, type RespuestaSync,
} from '../../../../packages/core/src/index.ts';
import { avisarMetas, avisarTopes } from '../avisos.ts';
import type { Suscripcion } from '../push.ts';
import { json, type Ruta } from '../comun.ts';

export const rutaSync: Ruta = async ({ req, url, env, repo }) => {
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
  return null;
};
