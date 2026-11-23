/**
 * Metas de ahorro («meta moto 2000000», «ahorré 50000 para moto»). La plata no se mueve de cuenta:
 * la meta solo la aparta en cuenta aparte, como una etiqueta, y por eso los saldos no cambian. Se
 * guarda en la config, como la lista de compras, y se sincroniza igual.
 */
import { formatear } from './dinero.ts';
import { limpiar } from './texto.ts';

export interface Meta {
  nombre: string;
  /** Lo que se quiere juntar, en pesos. */
  meta: number;
  /** Lo que ya está apartado, en pesos. */
  apartado: number;
  /** Lo apartado y sacado, con su fecha («AAAA-MM-DD»): sirve para estimar cuándo se llega. */
  aportes?: { f: string; m: number }[];
  /** El último aporte hecho por el chat (solo en una meta a la vez): deja deshacerlo con un botón. `n` es cuántos movimientos había entonces. */
  ultimo?: { id: string; m: number; n: number };
  /** La fecha en que se quiere tenerla («AAAA-MM-DD»): con ella se calcula cuánto apartar cada semana. */
  fecha?: string;
  /** Identificador estable: no cambia al renombrar. Las metas viejas lo reciben al leerlas, derivado del nombre. */
  id?: string;
  /** En pausa: no cuenta en lo apartado ni en el «seguro para gastar», y no pide cuota. */
  pausada?: boolean;
}

const idDeNombre = (nombre: string): string => limpiar(nombre).replace(/\s+/g, '-') || 'meta';

/** Id nuevo para una meta que se crea ahora: el nombre más un sufijo corto, para no chocar con uno borrado. */
export const idNuevoDeMeta = (nombre: string): string => `${idDeNombre(nombre)}-${Math.random().toString(36).slice(2, 6)}`;

export function leerMetas(config: Record<string, string>): Meta[] {
  try {
    const l = JSON.parse(config.metas ?? '[]');
    if (!Array.isArray(l)) return [];
    return l
      .filter((x): x is Meta => x && typeof x.nombre === 'string' && Number(x.meta) > 0 && Number(x.apartado) >= 0)
      .map(m => ({ ...m, id: typeof m.id === 'string' && m.id ? m.id : idDeNombre(m.nombre) }));
  } catch { return []; }
}

/** Lo apartado de las metas activas: una meta en pausa no se descuenta del dinero libre. */
export const totalApartado = (metas: Meta[]): number => metas.reduce((s, m) => s + (m.pausada ? 0 : m.apartado), 0);

/** Cambia el nombre de una meta (por id). Falla si queda vacío o si ya existe otra con ese nombre. */
export function renombrarMeta(metas: Meta[], id: string, nuevo: string): { ok: boolean; error?: string } {
  const m = metas.find(x => x.id === id);
  const n = nuevo.trim().slice(0, 30);
  if (!m) return { ok: false, error: 'No encontré esa alcancía.' };
  if (!n) return { ok: false, error: 'El nombre no puede quedar vacío.' };
  if (metas.some(x => x !== m && limpiar(x.nombre) === limpiar(n))) return { ok: false, error: 'Ya tienes una alcancía con ese nombre.' };
  m.nombre = n.charAt(0).toUpperCase() + n.slice(1);
  return { ok: true };
}

/** Deshace un aporte concreto (índice en `aportes`): lo quita del historial y revierte lo apartado. */
export function quitarAporte(metas: Meta[], id: string, indice: number): { ok: boolean; error?: string } {
  const m = metas.find(x => x.id === id);
  const a = m?.aportes?.[indice];
  if (!m || !a) return { ok: false, error: 'No encontré ese aporte.' };
  const resto = m.apartado - a.m;
  if (resto < 0) return { ok: false, error: 'Deshacerlo dejaría lo apartado en negativo.' };
  m.apartado = resto;
  m.aportes = m.aportes!.filter((_, i) => i !== indice);
  m.ultimo = undefined;
  return { ok: true };
}

const porcentaje = (m: Meta): number => (m.apartado >= m.meta ? 100 : Math.min(99, Math.round((m.apartado / m.meta) * 100)));

export function textoMetas(metas: Meta[]): string {
  if (!metas.length) return '🎯 No tienes metas. Crea una así: «meta moto 2000000».';
  const l = ['🎯 Metas de ahorro:'];
  for (const m of metas) {
    const falta = m.meta - m.apartado;
    l.push(`• ${m.nombre}: ${formatear(m.apartado)} de ${formatear(m.meta)} (${porcentaje(m)} %)${falta > 0 ? `, faltan ${formatear(falta)}` : ', ¡lograda!'}`);
  }
  l.push('', 'Para apartar: «ahorré 50000 para moto». Para sacar: «saqué 20000 de la meta moto».');
  return l.join('\n');
}

export const textoAvance = (m: Meta, antes: string): string => `${antes} ${m.nombre}: llevas ${formatear(m.apartado)} de ${formatear(m.meta)} (${porcentaje(m)} %).`;

/**
 * Cuántos días faltan para llegar a la meta al ritmo de los últimos 60 días. Devuelve null si no hay aportes
 * recientes con qué calcular, o si la meta ya se logró.
 */
export function diasParaMeta(m: Meta, hoy: string): number | null {
  if (m.apartado >= m.meta) return null;
  const desde = new Date(Date.parse(hoy.slice(0, 10) + 'T00:00:00Z') - 60 * 86400000).toISOString().slice(0, 10);
  const neto = (m.aportes ?? []).filter(a => a.f >= desde).reduce((s, a) => s + a.m, 0);
  if (neto <= 0) return null;
  return Math.ceil(((m.meta - m.apartado) / neto) * 60);
}
