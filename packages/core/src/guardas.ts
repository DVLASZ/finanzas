/**
 * Guarda contra saldos que no pueden existir: una cuenta de dinero (efectivo, monedas, alcancía,
 * un banco) no baja de cero. Si un movimiento la dejaría en negativo, casi siempre es que falta
 * anotar algo antes (un vuelto, un depósito, una transferencia). La app avisa en la tarjeta con
 * los números y ofrece arreglarlo, pero no inventa nada por su cuenta.
 */
import { construirMovimiento, saldoDe, type Saldos } from './asientos.ts';
import { calcularSaldos } from './consultas.ts';
import type { Propuesta } from './parser.ts';
import type { Contexto, Cuenta, Moneda, Movimiento } from './tipos.ts';

export interface Falta {
  cuentaId: string;
  nombre: string;
  moneda: Moneda;
  /** Lo que hay anotado ahora. */
  tiene: number;
  /** Lo que este movimiento saca de esa cuenta. */
  sale: number;
  /** Lo que falta para que no quede en negativo. */
  faltan: number;
}

/** Marca de los avisos que pone esta guarda (para poder quitarlos y volverlos a calcular). */
export const AVISO_FALTA = 'Falta plata en ';

export function faltaPlata(p: Propuesta, ctx: Contexto, saldos: Saldos): Falta[] {
  if (p.tipo === 'apertura' || p.tipo === 'ajuste') return [];
  // sin saldo inicial no hay saldos de verdad: todo daría negativo y el aviso sería puro ruido
  const apertura = ctx.config.fecha_apertura;
  if (!apertura || apertura.startsWith('2000-01-01')) return [];
  // un movimiento anterior al saldo inicial no mueve ningún saldo
  if (p.ocurridoEn < apertura) return [];

  let cambio = new Map<string, number>();
  try {
    for (const a of construirMovimiento(p, ctx, saldos, 'guarda', 'bot').movimiento.asientos) {
      const k = `${a.cuentaId}|${a.moneda}`;
      cambio.set(k, (cambio.get(k) ?? 0) + a.monto);
    }
  } catch {
    cambio = new Map(); // un movimiento que no se puede armar ya se explica por otro lado
  }

  const faltas: Falta[] = [];
  for (const [k, delta] of cambio) {
    const [cuentaId, moneda] = k.split('|') as [string, Moneda];
    const cuenta = ctx.cuentas.find(c => c.id === cuentaId);
    if (cuenta?.tipo !== 'dinero' || delta >= 0) continue;
    const tiene = saldoDe(saldos, cuentaId, moneda);
    const queda = tiene + delta;
    // si ya estaba en negativo y el movimiento no lo empeora, no se vuelve a regañar
    if (queda >= 0 || queda >= tiene) continue;
    faltas.push({ cuentaId, nombre: cuenta.nombre, moneda, tiene, sale: -delta, faltan: -queda });
  }
  return faltas;
}

/** Cuentas de dinero que quedarían en negativo si se anularan estos movimientos (porque otros dependen de ellos). */
export function quedaNegativoSin(movs: Movimiento[], cuentas: Cuenta[], apertura: string, ids: string[]): Falta[] {
  const con = calcularSaldos(movs, apertura);
  const sin = calcularSaldos(movs.filter(m => !ids.includes(m.id)), apertura);
  const faltas: Falta[] = [];
  for (const c of cuentas.filter(c => c.tipo === 'dinero')) {
    const antes = saldoDe(con, c.id, c.moneda);
    const despues = saldoDe(sin, c.id, c.moneda);
    if (despues >= 0 || despues >= antes) continue;
    faltas.push({ cuentaId: c.id, nombre: c.nombre, moneda: c.moneda, tiene: antes, sale: antes - despues, faltan: -despues });
  }
  return faltas;
}

/** Marca del aviso de un segundo saldo inicial. */
export const AVISO_APERTURA = 'Ya hay un saldo inicial';

/**
 * Un segundo «saldo inicial» borra del cálculo todo lo anterior: los movimientos que ya hay dejan
 * de contar. Devuelve cuántos movimientos se perderían de vista (0 = no hay riesgo).
 */
export function movimientosQueSePierden(movs: Movimiento[], apertura: string | undefined): number {
  if (!apertura || apertura.startsWith('2000-01-01')) return 0;
  return movs.filter(m => m.estado === 'ok' && m.tipo !== 'apertura' && m.ocurridoEn >= apertura).length;
}
