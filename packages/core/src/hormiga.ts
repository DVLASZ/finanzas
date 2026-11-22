/**
 * Gastos hormiga: compras chicas que se repiten (el tinto, el mecato, la recarga de mil pesos). Cada una es poca
 * plata, pero juntas pesan. Se agrupan por concepto y se proyecta lo que sumarían en un año.
 */
import { aLocal } from './fechas.ts';
import { limpiar } from './texto.ts';
import type { Cuenta, Movimiento } from './tipos.ts';

/** Una compra se considera chica si no pasa de este valor (en pesos). */
export const TOPE_HORMIGA = 15_000;
/** Un concepto es hormiga si se repite al menos esta cantidad de veces en el periodo. */
export const VECES_HORMIGA = 3;

export interface Hormiga { concepto: string; veces: number; total: number }
export interface ResumenHormiga { total: number; compras: number; proyeccionAnual: number; top: Hormiga[] }

const aMs = (f: string): number => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));

/**
 * Los días del periodo [desde, hasta) que ya pasaron, contando hoy (mínimo 1). Con el mes a medias, proyectar sobre el
 * mes entero reparte lo gastado entre días que aún no llegan y subestima el año.
 */
export function diasTranscurridos(desde: string, hasta: string, ahora: Date): number {
  const inicio = aMs(desde), fin = aMs(hasta), hoy = aMs(aLocal(ahora));
  return Math.max(1, Math.round((Math.min(hoy + 86_400_000, fin) - inicio) / 86_400_000));
}

/** `desde` y `hasta` acotan el periodo («AAAA-MM-DD HH:MM:SS»); `dias` son los días transcurridos de él (ver `diasTranscurridos`), para proyectar al año. */
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
