/**
 * Exportaciones sencillas para sacar los datos de la app: movimientos en CSV o JSON (lo que se está viendo con los
 * filtros) y un resumen del periodo en texto para compartir. El Excel completo está en `exportar.ts`.
 */
import { gastoPorCategoria, ingresosPorFuente, totalIngresos } from './consultas.ts';
import { formatear } from './dinero.ts';
import type { Datos } from './repo.ts';
import type { Cuenta, Movimiento } from './tipos.ts';

const COLUMNAS = ['fecha', 'hora', 'tipo', 'descripcion', 'categoria', 'cuenta', 'monto', 'moneda', 'etiqueta', 'estado', 'nota'] as const;

/** Entre comillas si trae coma, comilla o salto de línea; y sin fórmulas: Excel ejecuta lo que empieza con = + - @. */
function celda(v: string | number): string {
  let t = String(v);
  // también las que empiezan por tabulación o retorno de carro, que Excel salta antes de leer la fórmula
  if (/^[=+@\t\r]/.test(t) || (/^-/.test(t) && typeof v === 'string')) t = `'${t}`;
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** El monto con el que se muestra un movimiento: lo gastado, lo ingresado o el asiento más grande entre cuentas. Con signo: gasto negativo. */
function montoDe(m: Movimiento, cuentas: Cuenta[]): { monto: number; moneda: string } {
  const tipoDe = (id: string) => cuentas.find(c => c.id === id)?.tipo;
  const suma = (f: (t: string | undefined) => boolean, moneda: string) => m.asientos.filter(a => a.moneda === moneda && f(tipoDe(a.cuentaId))).reduce((s, a) => s + a.monto, 0);
  const moneda = m.asientos.find(a => tipoDe(a.cuentaId) !== 'sistema')?.moneda ?? 'COP';
  const gasto = suma(t => t === 'categoria', moneda);
  if (gasto !== 0) return { monto: -gasto, moneda };
  const ingreso = -suma(t => t === 'fuente', moneda);
  if (ingreso !== 0) return { monto: ingreso, moneda };
  const mayor = [...m.asientos].filter(a => tipoDe(a.cuentaId) !== 'sistema').sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0];
  return { monto: mayor ? Math.abs(mayor.monto) : 0, moneda };
}

function filaDe(m: Movimiento, cuentas: Cuenta[]): Record<(typeof COLUMNAS)[number], string | number> {
  const cs = m.asientos.map(a => cuentas.find(c => c.id === a.cuentaId)).filter((c): c is Cuenta => Boolean(c));
  const { monto, moneda } = montoDe(m, cuentas);
  return {
    fecha: m.ocurridoEn.slice(0, 10), hora: m.sinHora ? '' : m.ocurridoEn.slice(11, 16), tipo: m.tipo, descripcion: m.descripcion,
    categoria: cs.find(c => c.tipo === 'categoria')?.nombre ?? '', cuenta: cs.find(c => c.tipo === 'dinero')?.nombre ?? '',
    monto, moneda, etiqueta: m.etiqueta ?? '', estado: m.estado, nota: m.nota ?? '',
  };
}

/** Los movimientos como CSV (una fila por movimiento, con encabezados). */
export function movimientosACsv(movs: Movimiento[], cuentas: Cuenta[]): string {
  const filas = movs.map(m => filaDe(m, cuentas));
  return [COLUMNAS.join(','), ...filas.map(f => COLUMNAS.map(c => celda(f[c])).join(','))].join('\n') + '\n';
}

/** Los movimientos como JSON legible, con los mismos campos que el CSV más los asientos. */
export function movimientosAJson(movs: Movimiento[], cuentas: Cuenta[]): string {
  const nombre = (id: string) => cuentas.find(c => c.id === id)?.nombre ?? id;
  return JSON.stringify(movs.map(m => ({ ...filaDe(m, cuentas), id: m.id, asientos: m.asientos.map(a => ({ cuenta: nombre(a.cuentaId), monto: a.monto, moneda: a.moneda })) })), null, 2);
}

/** Un resumen corto de un periodo, listo para pegar en un mensaje: ingresos, gastos, balance y en qué se fue. */
export function resumenEnTexto(datos: Datos, titulo: string, desde: string, hasta: string): string {
  const gastos = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const total = gastos.reduce((s, x) => s + x.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  const fuentes = ingresosPorFuente(datos.movimientos, datos.cuentas, desde, hasta).filter(x => x.total !== 0);
  const pct = (v: number) => (total ? ` (${Math.round((v / total) * 100)} %)` : '');
  const lineas = [
    `Resumen de ${titulo}`,
    `Ingresos: ${formatear(ingresos)}`,
    `Gastos: ${formatear(total)}`,
    `Balance: ${formatear(ingresos - total)}`,
  ];
  if (gastos.length) lineas.push('', 'Dónde se fue:', ...gastos.slice(0, 8).map(x => `- ${x.cuenta.nombre}: ${formatear(x.total)}${pct(x.total)}`));
  if (fuentes.length) lineas.push('', 'De dónde vino:', ...fuentes.map(x => `- ${x.cuenta.nombre}: ${formatear(Math.abs(x.total))}`));
  return lineas.join('\n') + '\n';
}
