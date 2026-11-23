/**
 * Los números de las tres gráficas nuevas del Resumen: el ritmo del mes contra el presupuesto, las semanas de ingresos y gastos
 * y el avance de metas y topes. Todo sale de las mismas consultas del núcleo que ya dibujan el resto del Resumen, así que
 * cada cifra coincide con la que se ve en otra tarjeta.
 */
import {
  aLocal, describirDia, filtrarMovimientos, gastoPorCategoria, leerMetas, rangoPeriodo, estadoPresupuesto, totalIngresos,
  type Datos, type Meta, type Movimiento,
} from '../../../../packages/core/src/index.ts';
import { descendientes, leerSubcategorias } from '../../../../packages/core/src/subcategorias.ts';
import { gastoDeCategoria } from './grupos.ts';
import { fechaAtras } from './periodos.ts';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

const p2 = (x: number) => String(x).padStart(2, '0');
const sumaGasto = (datos: Fuente, desde: string, hasta: string): number => gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta).reduce((s, x) => s + x.total, 0);
const masNuevosPrimero = (a: Movimiento, b: Movimiento): number => b.ocurridoEn.localeCompare(a.ocurridoEn);
/** El día siguiente a «AAAA-MM-DD». */
export const diaSiguiente = (fecha: string): string => new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)) + 1)).toISOString().slice(0, 10);

export interface DiaRitmo { dia: number; fecha: string; gasto: number; acumulado: number; proyectado: number; futuro: boolean }
export interface Ritmo {
  dias: DiaRitmo[];
  hoy: number;
  llevo: number;
  /** Lo que se habrá gastado a fin de mes si sigue este ritmo diario. */
  proyeccion: number;
  /** La suma de los topes por categoría, o null si no hay ninguno. */
  presupuesto: number | null;
  /** El gasto acumulado del mes anterior, día por día (sirve de referencia cuando no hay topes). */
  anterior: number[];
  /** 'segura', 'cerca' o 'alerta' según la proyección contra la referencia. */
  zona: 'segura' | 'cerca' | 'alerta';
  /** Contra qué se compara: el presupuesto de los topes o el mes anterior. */
  referencia: number;
}

/** El ritmo de gasto del mes que contiene `ahora`: acumulado real, proyección lineal hasta fin de mes y el tope o el mes anterior. */
export function ritmoDelMes(datos: Fuente, ahora: Date): Ritmo {
  const { desde } = rangoPeriodo('mes', ahora);
  const anio = Number(desde.slice(0, 4)), mes = Number(desde.slice(5, 7));
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hoy = Math.min(diasMes, Math.max(1, Number(aLocal(ahora).slice(8, 10))));
  const gastos: number[] = [];
  for (let d = 1; d <= diasMes; d++) {
    const f = `${anio}-${p2(mes)}-${p2(d)}`;
    gastos.push(d <= hoy ? sumaGasto(datos, `${f} 00:00:00`, `${diaSiguiente(f)} 00:00:00`) : 0);
  }
  let suma = 0;
  const reales = gastos.map(g => (suma += g));
  const llevo = reales[hoy - 1] ?? 0;
  const porDia = llevo / hoy;
  const dias: DiaRitmo[] = gastos.map((g, i) => ({
    dia: i + 1, fecha: `${anio}-${p2(mes)}-${p2(i + 1)}`, gasto: g, acumulado: i + 1 <= hoy ? reales[i] : llevo + porDia * (i + 1 - hoy),
    proyectado: llevo + porDia * (i + 1 - hoy), futuro: i + 1 > hoy,
  }));
  const proyeccion = Math.round(porDia * diasMes);

  // el mes anterior, día por día
  const previo = rangoPeriodo('mes', fechaAtras(ahora, 'mes', 1));
  const nPrev = new Date(Date.UTC(Number(previo.desde.slice(0, 4)), Number(previo.desde.slice(5, 7)), 0)).getUTCDate();
  let sp = 0;
  const anterior = Array.from({ length: nPrev }, (_, i) => {
    const f = `${previo.desde.slice(0, 8)}${p2(i + 1)}`;
    sp += sumaGasto(datos, `${f} 00:00:00`, `${diaSiguiente(f)} 00:00:00`);
    return sp;
  });

  // si una categoría y una de sus subcategorías tienen tope, el de la hija ya está dentro del de la madre: no se suma dos veces
  const mapa = leerSubcategorias(datos.config);
  const conPresupuesto = Object.entries(datos.presupuestos).filter(([, v]) => v > 0);
  const raices = conPresupuesto.filter(([id]) => !conPresupuesto.some(([otro]) => otro !== id && descendientes(mapa, otro).includes(id)));
  const presupuesto = raices.length ? raices.reduce((s, [, v]) => s + v, 0) : null;
  const referencia = presupuesto ?? anterior[anterior.length - 1] ?? 0;
  // con topes se compara solo el gasto de las categorías que tienen tope, no el de todo el mes
  let proyComparada = proyeccion;
  if (presupuesto !== null && llevo > 0) {
    const delMes = filtrarMovimientos(datos, { desde: `${desde.slice(0, 8)}01`, hasta: diaSiguiente(`${anio}-${p2(mes)}-${p2(hoy)}`), tipos: ['gasto', 'compartido', 'deuda'] });
    const conTope = raices.reduce((s, [id]) => s + gastoDeCategoria(datos, id, delMes), 0);
    proyComparada = Math.round(proyeccion * Math.min(1, conTope / llevo));
  }
  const zona = referencia <= 0 ? 'segura' : proyComparada > referencia ? 'alerta' : proyComparada > referencia * 0.85 ? 'cerca' : 'segura';
  return { dias, hoy, llevo, proyeccion, presupuesto, anterior, zona, referencia };
}

/** Los gastos de un día, de lo más nuevo a lo más viejo. */
export function movimientosDelDia(datos: Fuente, fecha: string): Movimiento[] {
  return filtrarMovimientos(datos, { desde: fecha, hasta: diaSiguiente(fecha), tipos: ['gasto', 'compartido', 'deuda'] }).sort(masNuevosPrimero);
}

export interface SemanaIG { desde: string; hasta: string; ingresos: number; gastos: number; etiqueta: string; actual: boolean }

/** Las últimas `n` semanas (lunes a domingo, la actual al final) con lo que entró y lo que salió. */
export function semanasIngresosGastos(datos: Fuente, ahora: Date, n = 6): SemanaIG[] {
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    const { desde, hasta } = rangoPeriodo('semana', fechaAtras(ahora, 'semana', k));
    const fin = new Date(Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    return {
      desde, hasta, ingresos: totalIngresos(datos.movimientos, datos.cuentas, desde, hasta), gastos: sumaGasto(datos, desde, hasta),
      etiqueta: `${describirDia(desde.slice(0, 10))} al ${describirDia(fin)}`, actual: k === 0,
    };
  });
}

/** Los ingresos y gastos de una semana, de lo más nuevo a lo más viejo. */
export function movimientosDeSemana(datos: Fuente, s: Pick<SemanaIG, 'desde' | 'hasta'>): Movimiento[] {
  return filtrarMovimientos(datos, { desde: s.desde, hasta: s.hasta, tipos: ['gasto', 'compartido', 'ingreso'] }).sort(masNuevosPrimero);
}

export interface AvanceMeta { meta: Meta; pct: number; falta: number }
export interface AvanceTope { id: string; nombre: string; gastado: number; tope: number; pct: number }

/** Cuánto lleva cada meta de ahorro. */
export function avanceMetas(datos: Fuente): AvanceMeta[] {
  return leerMetas(datos.config).map(m => ({ meta: m, pct: Math.min(100, Math.round((m.apartado / m.meta) * 100)), falta: Math.max(0, m.meta - m.apartado) }));
}

/** El gasto del mes contra el tope de cada categoría que tiene uno, lo más cerca del tope primero. */
export function avanceTopes(datos: Fuente, ahora: Date): AvanceTope[] {
  const { desde, hasta } = rangoPeriodo('mes', ahora);
  return Object.keys(datos.presupuestos).map(id => {
    const e = estadoPresupuesto(datos.movimientos, datos.cuentas, datos.presupuestos, id, desde, hasta, datos.config.tope_arrastra === '1', datos.config);
    return e ? { id, nombre: datos.cuentas.find(c => c.id === id)?.nombre ?? id, gastado: e.gastado, tope: e.tope, pct: e.porcentaje } : null;
  }).filter((x): x is AvanceTope => Boolean(x)).sort((a, b) => b.pct - a.pct);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Gráficas que siguen el periodo que se ve en el Resumen (semana, mes, año, todo o fechas), no el mes de hoy.

export type Vista = 'semana' | 'mes' | 'anio' | 'todo';

const MS_DIA = 86400000;
const d10 = (s: string): string => s.slice(0, 10);
const ini = (s: string): string => `${d10(s)} 00:00:00`;
const tDia = (f: string): number => Date.parse(`${d10(f)}T00:00:00Z`);
const sumaDias = (f: string, n: number): string => new Date(tDia(f) + n * MS_DIA).toISOString().slice(0, 10);
/** Días entre dos fechas (el fin no cuenta). */
export const diasEntre = (desde: string, hasta: string): number => Math.max(0, Math.round((tDia(hasta) - tDia(desde)) / MS_DIA));

/** Qué familia de gráficas toca: un rango suelto se trata como semana si dura 14 días o menos, como mes hasta 92, como año hasta 400 y si no como todo. */
export function vistaDe(periodo: string, desde: string, hasta: string): Vista {
  if (periodo === 'semana' || periodo === 'mes' || periodo === 'anio' || periodo === 'todo') return periodo;
  const dias = diasEntre(desde, hasta);
  return dias <= 14 ? 'semana' : dias <= 92 ? 'mes' : dias <= 400 ? 'anio' : 'todo';
}

/** Ingresos y gastos de un rango [desde, hasta). */
export function totalesPeriodo(datos: Fuente, desde: string, hasta: string): { ingresos: number; gastos: number } {
  return { ingresos: totalIngresos(datos.movimientos, datos.cuentas, ini(desde), ini(hasta)), gastos: sumaGasto(datos, ini(desde), ini(hasta)) };
}

/** El periodo de antes con la misma forma: meses enteros si el rango lo es (un mes o un año), si no los mismos días hacia atrás. */
export function rangoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const a = d10(desde), b = d10(hasta);
  if (a.slice(8) === '01' && b.slice(8) === '01' && b > a) {
    const meses = (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
    const mover = (f: string) => `${new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1 - meses, 1)).toISOString().slice(0, 10)} 00:00:00`;
    return { desde: mover(a), hasta: mover(b) };
  }
  const n = diasEntre(a, b);
  return { desde: ini(sumaDias(a, -n)), hasta: ini(a) };
}

export interface DiaFlujo { fecha: string; gasto: number; ingreso: number }

/** Lo gastado y lo ingresado cada día de [desde, hasta). */
export function serieDiaria(datos: Fuente, desde: string, hasta: string): DiaFlujo[] {
  const salida: DiaFlujo[] = [];
  for (let f = d10(desde); f < d10(hasta) && salida.length < 400; f = sumaDias(f, 1)) {
    const t = totalesPeriodo(datos, f, sumaDias(f, 1));
    salida.push({ fecha: f, gasto: t.gastos, ingreso: t.ingresos });
  }
  return salida;
}

/** Una fecha dentro del mes de `desde` para pedirle su ritmo a un mes ya cerrado: el último día, a mediodía de Colombia. */
export function finDeMes(desde: string): Date {
  const ultimo = new Date(Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)), 0)).getUTCDate();
  return new Date(Date.parse(`${desde.slice(0, 8)}${p2(ultimo)}T17:00:00Z`));
}

/** Las semanas (lunes a domingo) que tocan [desde, hasta), recortadas al rango. `ahora` marca la que contiene hoy. */
export function semanasDelRango(datos: Fuente, desde: string, hasta: string, ahora: Date): SemanaIG[] {
  const hoy = aLocal(ahora).slice(0, 10);
  const a = d10(desde), b = d10(hasta);
  let lunes = sumaDias(a, -((new Date(`${a}T12:00:00Z`).getUTCDay() + 6) % 7));
  const lista: SemanaIG[] = [];
  while (lunes < b && lista.length < 60) {
    const domingoSig = sumaDias(lunes, 7);
    const dd = lunes < a ? a : lunes, hh = domingoSig > b ? b : domingoSig;
    lista.push({
      desde: ini(dd), hasta: ini(hh), ingresos: totalIngresos(datos.movimientos, datos.cuentas, ini(dd), ini(hh)), gastos: sumaGasto(datos, ini(dd), ini(hh)),
      etiqueta: `${describirDia(dd)} al ${describirDia(sumaDias(hh, -1))}`, actual: hoy >= lunes && hoy < domingoSig,
    });
    lunes = domingoSig;
  }
  return lista;
}

export interface BarraPeriodo { clave: string; etiqueta: string; ingresos: number; gastos: number; desde: string; hasta: string }

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Un mes por barra, de enero a diciembre o los que toque el rango. Con `soloConDatos` salen únicamente los meses que tienen algo. */
export function barrasPorMes(datos: Fuente, desde: string, hasta: string, soloConDatos = false): BarraPeriodo[] {
  const lista: BarraPeriodo[] = [];
  let y = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7));
  const fin = d10(hasta);
  while (`${y}-${p2(m)}-01` < fin && lista.length < 600) {
    const sy = m === 12 ? y + 1 : y, sm = m === 12 ? 1 : m + 1;
    const dd = `${y}-${p2(m)}-01 00:00:00`, hh = `${sy}-${p2(sm)}-01 00:00:00`;
    const t = totalesPeriodo(datos, dd, hh);
    if (!soloConDatos || t.ingresos || t.gastos) lista.push({ clave: `${y}-${p2(m)}`, etiqueta: MESES_CORTOS[m - 1], ingresos: t.ingresos, gastos: t.gastos, desde: dd, hasta: hh });
    y = sy; m = sm;
  }
  return lista;
}

/** Todo el histórico: una barra por mes con datos y, si pasan de 12, una por año. */
export function barrasHistorico(datos: Fuente): BarraPeriodo[] {
  const fechas = datos.movimientos.map(m => m.ocurridoEn).filter(Boolean).sort();
  if (!fechas.length) return [];
  const meses = barrasPorMes(datos, `${fechas[0].slice(0, 7)}-01`, sumaDias(fechas[fechas.length - 1].slice(0, 10), 1), true);
  if (meses.length <= 12) return meses.map(b => ({ ...b, etiqueta: `${b.etiqueta} ${b.clave.slice(2, 4)}` }));
  const anios = new Map<string, BarraPeriodo>();
  for (const b of meses) {
    const y = b.clave.slice(0, 4);
    const a = anios.get(y) ?? { clave: y, etiqueta: y, ingresos: 0, gastos: 0, desde: `${y}-01-01 00:00:00`, hasta: `${Number(y) + 1}-01-01 00:00:00` };
    a.ingresos += b.ingresos; a.gastos += b.gastos;
    anios.set(y, a);
  }
  return [...anios.values()];
}

/** El gasto de cada categoría con tope contra su tope escalado al rango (un mes, un año o los días que sean). */
export function avanceTopesRango(datos: Fuente, desde: string, hasta: string): AvanceTope[] {
  return Object.keys(datos.presupuestos).map(id => {
    const e = estadoPresupuesto(datos.movimientos, datos.cuentas, datos.presupuestos, id, ini(desde), ini(hasta), datos.config.tope_arrastra === '1', datos.config);
    return e ? { id, nombre: datos.cuentas.find(c => c.id === id)?.nombre ?? id, gastado: e.gastado, tope: e.tope, pct: e.porcentaje } : null;
  }).filter((x): x is AvanceTope => Boolean(x)).sort((a, b) => b.pct - a.pct);
}
