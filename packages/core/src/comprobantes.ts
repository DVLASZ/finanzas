/**
 * Recibos, facturas y tirillas pegados como texto (lo que sale de leer una foto): «Subtotal $42.000 / Propina $4.200 / TOTAL $46.200».
 * Se anota UN gasto por lo que de verdad se pagó, con el concepto y la fecha del recibo. Lo demás son datos de la liquidación
 * (subtotal, IVA, descuento, efectivo recibido, cambio, abonos futuros) y no se suman. Si el comprobante dice que no se pagó
 * (cotización, factura a crédito, compra anulada), se explica y no se anota; si el total está borroso o se contradice, se pregunta.
 */
import { formatear, hallarMontos } from './dinero.ts';
import { aLocal } from './fechas.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Leido { frases: string[]; respuesta?: string }

const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const monto = (linea: string): number | null => hallarMontos(limpiar(linea)).find(m => m.explicito && !m.negativo)?.valor ?? null;
const dos = (n: number): string => String(n).padStart(2, '0');

/** Lo que se pagó, en orden de preferencia: la línea del total que de verdad se cobró. */
const TOTALES = [
  /^abono recibido\b/, /^total (?:pagado|cobrado|tarjeta|a pagar|compra)\b/, /^valor pagado\b/, /^cuenta total\b/, /^total(?: cop)?\b(?! antes| factura)/, /^total factura\b/,
];

export function leerComprobante(texto: string, ctx: Contexto): Leido | null {
  if (texto.length > 900 || !/\n/.test(texto)) return null;
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lineas.length < 3) return null;
  const n = lineas.map(sinTildes);
  if (/cotizacion|proforma/.test(n.join('\n')) && lineas.some(l => /\$\s*\d/.test(l))) return { frases: [], respuesta: 'Eso es una cotización: todavía no se pagó nada, así que no anoto ningún gasto. Cuando la aceptes y la pagues, escribe el pago.' };
  if (/anulad|reverso aprobado/.test(n.join('\n')) && lineas.some(l => /\$\s*\d/.test(l))) return { frases: [], respuesta: 'Esa compra aparece anulada con su reverso: no queda ningún gasto. Si ya la habías anotado, anúlala.' };
  const hayTotal = n.some(l => /^(?:total|abono recibido|valor pagado|cuenta total)\b/.test(l));
  if (!hayTotal || !lineas.some(l => /\$\s*\d/.test(l))) return null;
  const todo = n.join('\n');

  if (/cotizacion|proforma|pendiente de aceptacion/.test(todo)) return { frases: [], respuesta: 'Eso es una cotización: todavía no se pagó nada, así que no anoto ningún gasto. Cuando la aceptes y la pagues, escribe el pago.' };
  if (/anulad|reverso aprobado/.test(todo)) return { frases: [], respuesta: 'Esa compra aparece anulada con su reverso: no queda ningún gasto. Si ya la habías anotado, anúlala.' };
  if (/credito\s*\/?\s*pendiente|estado de pago:?\s*(?:credito|pendiente)|pendiente de pago/.test(todo)) {
    return { frases: [], respuesta: 'Esa factura está a crédito (pendiente de pago): todavía no sale plata. Si es una deuda tuya, anótala con «le debo … a …»; cuando la pagues, escribe el pago.' };
  }
  // un total borroso: se muestra lo que sí se ve y se pregunta
  if (/\[(?:borroso|ilegible)\]/.test(todo)) {
    const suma = lineas.map(monto).filter((m): m is number => m !== null).reduce((s, m) => s + m, 0);
    return { frases: [], respuesta: `El total está borroso. Lo que se alcanza a leer suma ${formatear(suma, 'COP')}: ¿ese fue el total que pagaste, o hubo otros cargos? Escríbelo con el monto («gasté ${suma} en …») y lo anoto.` };
  }
  // dos totales que no cuadran sin que un renglón los explique
  const simple = lineas.find((l, i) => /^total\b(?! antes| pagado| cobrado| tarjeta| a pagar| factura| compra)/.test(n[i]) && monto(l) !== null);
  const pagado = lineas.find((l, i) => /^total (?:pagado|cobrado|tarjeta|a pagar)\b/.test(n[i]) && monto(l) !== null);
  if (simple && pagado && monto(simple) !== monto(pagado) && !n.some(l => /propina|impuesto|iva|descuento|recargo|domicilio/.test(l))) {
    return { frases: [], respuesta: `El recibo trae dos totales distintos (${formatear(monto(simple) as number, 'COP')} y ${formatear(monto(pagado) as number, 'COP')}). ¿Cuál fue el que pagaste? Escríbelo con el monto y lo anoto.` };
  }
  let pagadoReal: number | null = null;
  for (const re of TOTALES) {
    const i = n.findIndex((l, k) => re.test(l) && monto(lineas[k]) !== null);
    if (i >= 0) { pagadoReal = monto(lineas[i]); break; }
  }
  if (!pagadoReal) return null;

  const hoy = aLocal(ctx.ahora).slice(0, 10);
  const f = todo.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  let fecha = '';
  if (f) {
    const d = Number(f[1]), m = Number(f[2]), a = Number(f[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && `${a}-${dos(m)}-${dos(d)}` <= hoy) fecha = ` el ${dos(d)}/${dos(m)}/${a}`;
  }
  const concepto = lineas.map(l => l.match(/^concepto:\s*(.+)$/i)?.[1]).find(Boolean)
    ?? (lineas[0] && !/\d/.test(lineas[0]) && lineas[0].length <= 30 ? lineas[0] : 'compra');
  return { frases: [`gasté ${pagadoReal} en ${limpiar(concepto) || 'compra'}${fecha}`] };
}
