/**
 * Gastos hormiga: compras chicas que se repiten (el tinto, el mecato, la recarga de mil pesos). Cada una es poca
 * plata, pero juntas pesan. Se agrupan por concepto y se proyecta lo que sumarían en un año.
 */
import { limpiar } from './texto.ts';
import type { Cuenta, Movimiento } from './tipos.ts';

/** Una compra se considera chica si no pasa de este valor (en pesos). */
export const TOPE_HORMIGA = 15_000;
/** Un concepto es hormiga si se repite al menos esta cantidad de veces en el periodo. */
export const VECES_HORMIGA = 3;

export interface Hormiga { concepto: string; veces: number; total: number }
export interface ResumenHormiga { total: number; compras: number; proyeccionAnual: number; top: Hormiga[] }

/** `desde` y `hasta` acotan el periodo («AAAA-MM-DD HH:MM:SS»); `dias` es cuántos días tiene, para proyectar al año. */
export function gastosHormiga(movs: Movimiento[], cuentas: Cuenta[], desde: string, hasta: string, dias: number): ResumenHormiga {
  const cats = new Set(cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const grupos = new Map<string, Hormiga>();
  for (const m of movs) {
    if (m.estado !== 'ok' || m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    const monto = m.asientos.filter(a => a.moneda === 'COP' && cats.has(a.cuentaId)).reduce((s, a) => s + a.monto, 0);
    if (monto <= 0 || monto > TOPE_HORMIGA) continue;
    const clave = limpiar(m.descripcion).replace(/\d+/g, '').trim() || limpiar(m.descripcion);
    const g = grupos.get(clave) ?? { concepto: m.descripcion, veces: 0, total: 0 };
    g.veces++; g.total += monto;
    grupos.set(clave, g);
  }
  const lista = [...grupos.values()].filter(g => g.veces >= VECES_HORMIGA).sort((a, b) => b.total - a.total);
  const total = lista.reduce((s, g) => s + g.total, 0);
  return {
    total,
    compras: lista.reduce((s, g) => s + g.veces, 0),
    proyeccionAnual: Math.round((total / Math.max(1, dias)) * 365),
    top: lista.slice(0, 3),
  };
}
