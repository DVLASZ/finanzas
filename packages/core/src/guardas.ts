/**
 * Guarda contra saldos que no pueden existir: una cuenta de dinero (efectivo, monedas, alcancía,
 * un banco) no baja de cero. Si un movimiento la dejaría en negativo, casi siempre es que falta
 * anotar algo antes (un vuelto, un depósito, una transferencia). La app avisa en la tarjeta con
 * los números y ofrece arreglarlo, pero no inventa nada por su cuenta.
 */
import { construirMovimiento, errorDePago, saldoDe, type Saldos } from './asientos.ts';
import { calcularSaldos } from './consultas.ts';
import { formatear } from './dinero.ts';
import { normalizar } from './texto.ts';
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

/** Marcas de los avisos de un abono (para quitarlos y volverlos a calcular cuando cambia la tarjeta). */
export const AVISO_EXCESO = 'Es más de lo que ';
export const AVISO_MONEDA = 'No se puede: ';

export interface Exceso { nombre: string; moneda: Moneda; debido: number; sobra: number; aviso: string }

/** Un abono mayor que lo que se debe: lo que sobra acabaría como una deuda al revés. Un abono a quien no debe nada no entra aquí. */
export function excesoDePago(p: Propuesta, ctx: Contexto, saldos: Saldos): Exceso | null {
  if (p.tipo !== 'pago' || !p.persona || p.montoOtro !== undefined || errorDePago(p, ctx, saldos)) return null;
  const clave = normalizar(p.persona);
  const per = ctx.cuentas.find(c => c.tipo === 'persona' && c.clave === clave);
  if (!per) return null;
  const s = saldoDe(saldos, per.id, p.moneda);
  const yoPago = p.direccion === 'yo_pago';
  const debido = yoPago ? -s : s;
  if (debido <= 0 || p.monto <= debido) return null;
  const sobra = p.monto - debido;
  const f = (n: number) => formatear(n, p.moneda);
  const aviso = yoPago
    ? `${AVISO_EXCESO}le debes a ${per.nombre}: le debes ${f(debido)} y esto son ${f(p.monto)}. Si guardas igual, los ${f(sobra)} de más quedan a tu favor (${per.nombre} te los debería).`
    : `${AVISO_EXCESO}te debe ${per.nombre}: te debe ${f(debido)} y esto son ${f(p.monto)}. Si guardas igual, los ${f(sobra)} de más quedan a favor de ${per.nombre} (se los debes).`;
  return { nombre: per.nombre, moneda: p.moneda, debido, sobra, aviso };
}

/**
 * Abonos activos que quedarían huérfanos si se anularan estos movimientos: pagos hechos después de un préstamo, una
 * deuda o un compartido que, sin ese movimiento, dejarían a la persona con una deuda al revés.
 */
export function abonosHuerfanos(movs: Movimiento[], cuentas: Cuenta[], apertura: string, ids: string[]): { abono: Movimiento; persona: string }[] {
  const fuera = new Set(ids);
  const sin = calcularSaldos(movs.filter(m => !fuera.has(m.id)), apertura);
  const res = new Map<string, { abono: Movimiento; persona: string }>();
  for (const id of ids) {
    const m = movs.find(x => x.id === id);
    if (!m || !['prestamo', 'deuda', 'compartido', 'ingreso'].includes(m.tipo)) continue;
    const aportes = new Map<string, number>(); // lo que este movimiento dejó con cada persona
    for (const a of m.asientos) {
      if (cuentas.some(c => c.id === a.cuentaId && c.tipo === 'persona')) aportes.set(`${a.cuentaId}|${a.moneda}`, (aportes.get(`${a.cuentaId}|${a.moneda}`) ?? 0) + a.monto);
    }
    for (const [k, d] of aportes) {
      const resto = sin.get(k) ?? 0;
      if (d === 0 || resto === 0 || Math.sign(resto) !== -Math.sign(d)) continue;
      const [personaId, moneda] = k.split('|');
      for (const x of movs) {
        if (x.estado !== 'ok' || x.tipo !== 'pago' || fuera.has(x.id) || x.creadoEn < m.creadoEn) continue;
        const toca = x.asientos.some(a => a.cuentaId === personaId && a.moneda === moneda && Math.sign(a.monto) === -Math.sign(d));
        if (toca) res.set(x.id, { abono: x, persona: cuentas.find(c => c.id === personaId)?.nombre ?? '' });
      }
    }
  }
  return [...res.values()];
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
