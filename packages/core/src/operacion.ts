/**
 * Control operativo: la cuota semanal de una meta de ahorro, el stock mínimo por producto y el corte de turno (ventas, gastos,
 * utilidad y existencias bajas de un día o una semana). Cuentas sobre lo que ya hay: no guardan nada.
 */
import { gastoPorCategoria, totalIngresos } from './consultas.ts';
import { formatear } from './dinero.ts';
import { aLocal, describirDia, rangoPeriodo } from './fechas.ts';
import { existencias } from './existencias.ts';
import type { Meta } from './metas.ts';
import type { Datos } from './repo.ts';
import { leerCatalogo } from './ventas.ts';

const DIA = 86400000;

// ---------------------------------------------------------------- metas con fecha

export interface CuotaDeMeta { faltan: number; semanas: number; porSemana: number; vencida: boolean }

/** Cuánto apartar por semana para llegar a la meta en su fecha. Null si la meta no tiene fecha o ya se logró. */
export function cuotaSemanal(m: Pick<Meta, 'meta' | 'apartado'> & { fecha?: string }, hoy: string): CuotaDeMeta | null {
  const faltan = m.meta - m.apartado;
  if (!m.fecha || faltan <= 0) return null;
  const dias = Math.round((Date.parse(`${m.fecha}T00:00:00Z`) - Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)) / DIA);
  if (dias <= 0) return { faltan, semanas: 0, porSemana: faltan, vencida: true };
  const semanas = Math.max(1, Math.ceil(dias / 7));
  return { faltan, semanas, porSemana: Math.ceil(faltan / semanas), vencida: false };
}

// ---------------------------------------------------------------- stock mínimo

export interface StockBajo { producto: string; quedan: number; minimo: number }

/** Los productos que llevan cuenta y que ya están en su mínimo o por debajo (el mínimo se fija por producto en el catálogo). */
export function stockBajo(config: Record<string, string>, movs: Datos['movimientos']): StockBajo[] {
  const catalogo = leerCatalogo({ config });
  if (!catalogo) return [];
  const minimos = new Map(catalogo.productos.map(p => [p.id, (p as { minimo?: number }).minimo]));
  return existencias(config, movs)
    .filter(x => { const min = minimos.get(x.producto.id); return typeof min === 'number' && min > 0 && x.quedan <= min; })
    .map(x => ({ producto: x.producto.nombre, quedan: x.quedan, minimo: minimos.get(x.producto.id) as number }));
}

// ---------------------------------------------------------------- corte de turno

export interface Corte {
  periodo: 'dia' | 'semana';
  desde: string;
  hasta: string;
  ventas: number;
  gastos: number;
  utilidad: number;
  movimientos: number;
  porFuente: { nombre: string; total: number }[];
  porCategoria: { nombre: string; total: number }[];
  stock: StockBajo[];
}

/** El corte de hoy (o de lo que va de la semana): ventas, gastos, utilidad neta y lo que se está acabando. */
export function corteDeTurno(datos: Datos, ahora: Date, periodo: 'dia' | 'semana' = 'dia'): Corte {
  const hoy = aLocal(ahora).slice(0, 10);
  const r = periodo === 'semana' ? rangoPeriodo('semana', ahora) : { desde: `${hoy} 00:00:00`, hasta: `${aLocal(new Date(ahora.getTime() + DIA)).slice(0, 10)} 00:00:00` };
  const ventas = totalIngresos(datos.movimientos, datos.cuentas, r.desde, r.hasta);
  const gastos = gastoPorCategoria(datos.movimientos, datos.cuentas, r.desde, r.hasta);
  const total = gastos.reduce((s, x) => s + x.total, 0);
  const fuentes = new Map<string, number>();
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || m.ocurridoEn < r.desde || m.ocurridoEn >= r.hasta) continue;
    for (const a of m.asientos) {
      const c = datos.cuentas.find(x => x.id === a.cuentaId);
      if (c?.tipo === 'fuente' && a.moneda === 'COP' && a.monto < 0) fuentes.set(c.nombre, (fuentes.get(c.nombre) ?? 0) - a.monto);
    }
  }
  return {
    periodo, desde: r.desde, hasta: r.hasta, ventas, gastos: total, utilidad: ventas - total,
    movimientos: datos.movimientos.filter(m => m.estado === 'ok' && m.ocurridoEn >= r.desde && m.ocurridoEn < r.hasta && m.tipo !== 'apertura' && m.tipo !== 'ajuste').length,
    porFuente: [...fuentes.entries()].map(([nombre, t]) => ({ nombre, total: t })).sort((a, b) => b.total - a.total),
    porCategoria: gastos.map(x => ({ nombre: x.cuenta.nombre, total: x.total })),
    stock: stockBajo(datos.config, datos.movimientos),
  };
}

/** El corte como texto para compartir o pegar en un chat. */
export function textoCorte(c: Corte, nombreApp = 'Corte'): string {
  const dia = c.periodo === 'dia' ? describirDia(c.desde.slice(0, 10)) : `semana desde el ${describirDia(c.desde.slice(0, 10))}`;
  const l = [`${nombreApp}: ${dia}`, '', `Ventas e ingresos: ${formatear(c.ventas)}`, `Gastos: ${formatear(c.gastos)}`, `Utilidad neta: ${formatear(c.utilidad)}`];
  if (c.porFuente.length) l.push('', 'Ingresos por fuente:', ...c.porFuente.slice(0, 6).map(x => `- ${x.nombre}: ${formatear(x.total)}`));
  if (c.porCategoria.length) l.push('', 'Gastos por categoría:', ...c.porCategoria.slice(0, 6).map(x => `- ${x.nombre}: ${formatear(x.total)}`));
  if (c.stock.length) l.push('', 'Se está acabando:', ...c.stock.map(x => `- ${x.producto}: quedan ${x.quedan} (mínimo ${x.minimo})`));
  l.push('', `${c.movimientos} movimiento(s) en el periodo.`);
  return l.join('\n');
}
