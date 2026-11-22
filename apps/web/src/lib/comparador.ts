/**
 * Cuentas puras de tres cosas nuevas del Resumen: el gasto por día de la semana, el comparador de dos rangos de fechas y los
 * datos del reporte para imprimir. No tocan la pantalla, así se prueban solas. Los rangos de fechas son «AAAA-MM-DD» con los dos
 * extremos incluidos; hacia el núcleo se pasan como [desde, hasta) con hora, igual que el resto de la app.
 */
import {
  agruparCategorias, deudasPorPersona, gastoPorCategoria, ingresosPorFuente, leerMetas, totalIngresos,
  type Cuenta, type Datos, type Meta, type Movimiento,
} from '../../../../packages/core/src/index.ts';
import { gastoDe, movimientosDeCategoria, movimientosDeTipos } from './grupos.ts';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** «los lunes», «los sábados»: el plural de cada día para las frases. */
export const DIAS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

const utc = (f: string): number => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
const masNuevosPrimero = (a: Movimiento, b: Movimiento): number => b.ocurridoEn.localeCompare(a.ocurridoEn);

/** El día siguiente a «AAAA-MM-DD». */
export const diaDespues = (fecha: string): string => new Date(utc(fecha) + 86_400_000).toISOString().slice(0, 10);

/** El día de la semana de una fecha «AAAA-MM-DD», con 0 = lunes y 6 = domingo. */
export const diaDeSemana = (fecha: string): number => (new Date(utc(fecha)).getUTCDay() + 6) % 7;

/** Cuántos días hay entre dos fechas «AAAA-MM-DD», con los dos extremos incluidos. */
export const diasEntre = (inicio: string, fin: string): number => Math.round((utc(fin) - utc(inicio)) / 86_400_000) + 1;

const esFecha = (f: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(utc(f)).toISOString().slice(0, 10) === f;

// ---------------------------------------------------------------------------------------------------------------
// Gasto por día de la semana
// ---------------------------------------------------------------------------------------------------------------

export interface GastoDia {
  /** 0 = lunes ... 6 = domingo. */
  indice: number;
  nombre: string;
  corto: string;
  total: number;
  /** Cuántos días de esta clase (cuántos lunes) entran en el periodo. */
  veces: number;
  /** Lo que se gasta en promedio un día de estos. */
  promedio: number;
  movimientos: Movimiento[];
}

/** Los gastos del periodo [desde, hasta) repartidos por día de la semana, lunes a domingo. */
export function gastoPorDiaSemana(datos: Fuente, desde: string, hasta: string): GastoDia[] {
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const dias: GastoDia[] = DIAS_SEMANA.map((nombre, indice) => ({ indice, nombre, corto: DIAS_CORTOS[indice], total: 0, veces: 0, promedio: 0, movimientos: [] }));
  const ini = desde.slice(0, 10), fin = hasta.slice(0, 10);
  for (let f = ini, n = 0; f < fin && n < 3700; f = diaDespues(f), n++) dias[diaDeSemana(f)].veces++;
  for (const m of movimientosDeTipos(datos, ['gasto', 'compartido', 'deuda'], desde, hasta)) {
    const g = gastoDe(m, cats);
    if (g <= 0) continue;
    const d = dias[diaDeSemana(m.ocurridoEn.slice(0, 10))];
    d.total += g;
    d.movimientos.push(m);
  }
  for (const d of dias) { d.promedio = d.veces > 0 ? Math.round(d.total / d.veces) : 0; d.movimientos.sort(masNuevosPrimero); }
  return dias;
}

/** El día de la semana en que más se gasta (por promedio), o null si no hay gasto. */
export function diaMasCaro(dias: GastoDia[]): GastoDia | null {
  const mejor = dias.reduce((a, d) => (d.promedio > a.promedio ? d : a), dias[0]);
  return mejor && mejor.promedio > 0 ? mejor : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Comparador de dos rangos
// ---------------------------------------------------------------------------------------------------------------

export interface Rango { inicio: string; fin: string }
export const MAX_DIAS_RANGO = 731;

/** Un mensaje claro si el rango no sirve, o null si está bien. `nombre` es «A» o «B». */
export function validarRango(r: Rango, nombre: string): string | null {
  if (!r.inicio || !r.fin) return `Falta una fecha en el rango ${nombre}.`;
  if (!esFecha(r.inicio) || !esFecha(r.fin)) return `El rango ${nombre} tiene una fecha que no existe.`;
  if (r.fin < r.inicio) return `En el rango ${nombre} la fecha final es anterior a la inicial.`;
  if (diasEntre(r.inicio, r.fin) > MAX_DIAS_RANGO) return `El rango ${nombre} pasa de 2 años. Acórtalo.`;
  return null;
}

/** El rango como [desde, hasta) con hora, listo para las consultas del núcleo. */
export const aDesdeHasta = (r: Rango): { desde: string; hasta: string } => ({ desde: `${r.inicio} 00:00:00`, hasta: `${diaDespues(r.fin)} 00:00:00` });

export interface TotalesRango { gastos: number; ingresos: number; balance: number }
export interface FilaCategoria { id: string; nombre: string; a: number; b: number; variacion: number | null }
export interface Comparacion { a: TotalesRango; b: TotalesRango; categorias: FilaCategoria[] }

function totales(datos: Fuente, r: Rango): TotalesRango {
  const { desde, hasta } = aDesdeHasta(r);
  const gastos = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta).reduce((s, x) => s + x.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  return { gastos, ingresos, balance: ingresos - gastos };
}

/** El cambio de B respecto de A en porcentaje, o null si A está en cero (no hay contra qué medir). */
export const variacionPct = (a: number, b: number): number | null => (a > 0 ? Math.round(((b - a) / a) * 100) : null);

/** Compara dos rangos: totales de cada uno y, categoría por categoría, lo de A, lo de B y cuánto cambió. */
export function compararRangos(datos: Fuente, ra: Rango, rb: Rango): Comparacion {
  const A = aDesdeHasta(ra), B = aDesdeHasta(rb);
  const filas = new Map<string, FilaCategoria>();
  // cada fila es una categoría principal con lo de sus subcategorías, igual que la ventana que se abre al tocarla
  const agrupado = (r: { desde: string; hasta: string }) => agruparCategorias(gastoPorCategoria(datos.movimientos, datos.cuentas, r.desde, r.hasta), datos.config, datos.cuentas);
  for (const x of agrupado(A)) filas.set(x.cuenta.id, { id: x.cuenta.id, nombre: x.cuenta.nombre, a: x.total, b: 0, variacion: null });
  for (const x of agrupado(B)) {
    const f = filas.get(x.cuenta.id) ?? { id: x.cuenta.id, nombre: x.cuenta.nombre, a: 0, b: 0, variacion: null };
    f.b = x.total;
    filas.set(x.cuenta.id, f);
  }
  const categorias = [...filas.values()].filter(f => f.a > 0 || f.b > 0).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  for (const f of categorias) f.variacion = variacionPct(f.a, f.b);
  return { a: totales(datos, ra), b: totales(datos, rb), categorias };
}

// ---------------------------------------------------------------------------------------------------------------
// Datos del reporte
// ---------------------------------------------------------------------------------------------------------------

export interface DatosReporte {
  titulo: string;
  periodo: string;
  gastos: number;
  ingresos: number;
  balance: number;
  categorias: { nombre: string; total: number; pct: number }[];
  fuentes: { nombre: string; total: number }[];
  mayores: { fecha: string; descripcion: string; monto: number }[];
  deudas: { nombre: string; saldo: number; moneda: 'COP' | 'USD' }[];
  metas: Meta[];
  comparacion?: { rotuloA: string; rotuloB: string; datos: Comparacion };
}

/** Lo que lleva el reporte del periodo [desde, hasta): totales, categorías, los gastos más grandes, deudas y metas. */
export function armarReporte(datos: Datos, titulo: string, periodo: string, desde: string, hasta: string): DatosReporte {
  const cats = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const gastos = cats.reduce((s, x) => s + x.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  const ids = new Set(datos.cuentas.filter((c: Cuenta) => c.tipo === 'categoria').map(c => c.id));
  const mayores = movimientosDeTipos(datos, ['gasto', 'compartido', 'deuda'], desde, hasta)
    .map(m => ({ fecha: m.ocurridoEn.slice(0, 10), descripcion: m.descripcion, monto: gastoDe(m, ids) }))
    .filter(x => x.monto > 0).sort((a, b) => b.monto - a.monto).slice(0, 8);
  const deudas = deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, datos.config.fecha_apertura ?? '2000-01-01 00:00:00')
    .map(d => ({ nombre: d.persona.nombre, saldo: d.saldo, moneda: d.moneda })).slice(0, 8);
  return {
    titulo, periodo, gastos, ingresos, balance: ingresos - gastos,
    categorias: cats.map(x => ({ nombre: x.cuenta.nombre, total: x.total, pct: gastos ? Math.round((x.total / gastos) * 100) : 0 })),
    fuentes: ingresosPorFuente(datos.movimientos, datos.cuentas, desde, hasta).filter(x => x.total !== 0).map(x => ({ nombre: x.cuenta.nombre, total: x.total })),
    mayores, deudas, metas: leerMetas(datos.config),
  };
}

/** Los movimientos de una categoría en un rango de fechas «AAAA-MM-DD» (para la ventana del comparador). */
export const movimientosDeRango = (datos: Fuente, categoriaId: string, r: Rango): Movimiento[] => {
  const { desde, hasta } = aDesdeHasta(r);
  return movimientosDeCategoria(datos, categoriaId, desde, hasta);
};

/** «12 oct» para un «AAAA-MM-DD», con el año si no es el actual. */
export const etiquetaDia = (f: string, anioActual: number): string => {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const a = Number(f.slice(0, 4));
  return `${Number(f.slice(8, 10))} ${meses[Number(f.slice(5, 7)) - 1]}${a === anioActual ? '' : ` ${a}`}`;
};
export const etiquetaRango = (r: Rango, anioActual: number): string => `${etiquetaDia(r.inicio, anioActual)} a ${etiquetaDia(r.fin, anioActual)}`;
