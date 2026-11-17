/**
 * Metas de ahorro («meta moto 2000000», «ahorré 50000 para moto»). La plata no se mueve de cuenta:
 * la meta solo la aparta en cuenta aparte, como una etiqueta, y por eso los saldos no cambian. Se
 * guarda en la config, como la lista de compras, y se sincroniza igual.
 */
import { formatear } from './dinero.ts';

export interface Meta {
  nombre: string;
  /** Lo que se quiere juntar, en pesos. */
  meta: number;
  /** Lo que ya está apartado, en pesos. */
  apartado: number;
  /** Lo apartado y sacado, con su fecha («AAAA-MM-DD»): sirve para estimar cuándo se llega. */
  aportes?: { f: string; m: number }[];
  /** La fecha en que se quiere tenerla («AAAA-MM-DD»): con ella se calcula cuánto apartar cada semana. */
  fecha?: string;
}

export function leerMetas(config: Record<string, string>): Meta[] {
  try {
    const l = JSON.parse(config.metas ?? '[]');
    if (!Array.isArray(l)) return [];
    return l.filter((x): x is Meta => x && typeof x.nombre === 'string' && Number(x.meta) > 0 && Number(x.apartado) >= 0);
  } catch { return []; }
}

export const totalApartado = (metas: Meta[]): number => metas.reduce((s, m) => s + m.apartado, 0);

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
