/**
 * Gastos que se repiten («cada mes el 5 internet 60000», «cada lunes bus 12000»). Se guardan en la config, como la
 * lista de compras, así se sincronizan sin cambiar la base. No registran nada solos: avisan cuando
 * llega el día y todavía no escribiste ese gasto en el periodo.
 *
 * Hay cuatro frecuencias. El campo `dia` cambia de significado según cuál sea:
 *   mensual   el día del mes (1 a 28)
 *   quincenal el día de la primera quincena (1 a 13); la segunda cae 15 días después
 *   semanal   el día de la semana (1 lunes a 7 domingo)
 *   anual     el día del mes, junto con `mes` (1 a 12)
 */
import { limpiar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

export type Frecuencia = 'mensual' | 'quincenal' | 'semanal' | 'anual';

export interface Recurrente {
  /** Día en que toca; ver arriba qué significa según la frecuencia. */
  dia: number;
  /** Lo que se escribe para registrarlo: «internet 60000». */
  frase: string;
  /** Cómo queda el concepto al registrarlo («Internet»): con eso se sabe si ya se registró. */
  concepto: string;
  /** Monto en pesos. */
  monto: number;
  /** Cada cuánto. Si falta, es mensual (así eran todos los que se guardaron antes). */
  frecuencia?: Frecuencia;
  /** Solo anual: el mes (1 a 12). */
  mes?: number;
}

/** Los avisos empiezan dos días antes y siguen hasta que se registra. */
export const DIAS_DE_ANTICIPO = 2;

/** Los anuales siguen avisando hasta un mes después de la fecha; si no, quedarían pendientes todo el año. */
const DIAS_QUE_SIGUE_UN_ANUAL = 30;

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const frecuenciaDe = (r: Recurrente): Frecuencia => r.frecuencia ?? 'mensual';

/** El día de la semana de un nombre («lunes» → 1), o 0. */
export function diaDeSemana(nombre: string): number {
  return DIAS_SEMANA.indexOf(limpiar(nombre)) + 1;
}

export function leerRecurrentes(config: Record<string, string>): Recurrente[] {
  try {
    const l = JSON.parse(config.recurrentes ?? '[]');
    if (!Array.isArray(l)) return [];
    return l.filter((x): x is Recurrente => x && typeof x.frase === 'string' && typeof x.concepto === 'string' && Number.isInteger(x.dia) && Number(x.monto) > 0);
  } catch { return []; }
}

// ---------------------------------------------------------------- fechas de calendario ('AAAA-MM-DD')
const DIA_MS = 86_400_000;
const aMs = (f: string): number => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
const deMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const sumarDias = (f: string, n: number): string => deMs(aMs(f) + n * DIA_MS);
const semanaDe = (f: string): number => ((new Date(aMs(f)).getUTCDay() + 6) % 7) + 1;

/** ¿Toca ese día, según la frecuencia? */
function coincide(r: Recurrente, f: string): boolean {
  const dom = Number(f.slice(8, 10));
  switch (frecuenciaDe(r)) {
    case 'mensual': return dom === r.dia;
    case 'quincenal': return dom === r.dia || dom === r.dia + 15;
    case 'semanal': return semanaDe(f) === r.dia;
    case 'anual': return Number(f.slice(5, 7)) === r.mes && dom === r.dia;
  }
}

/** Las fechas en que toca entre `desde` y `hasta` (las dos incluidas). */
export function ocurrencias(r: Recurrente, desde: string, hasta: string): string[] {
  const res: string[] = [];
  for (let f = desde; f <= hasta && res.length < 400; f = sumarDias(f, 1)) if (coincide(r, f)) res.push(f);
  return res;
}

/** La fecha que toca ahora: la más reciente que ya está a `DIAS_DE_ANTICIPO` días o menos. Nula si no hay (un anual lejano). */
function vigente(r: Recurrente, dia: string): string | null {
  for (let f = sumarDias(dia, DIAS_DE_ANTICIPO), n = 0; n < 400; f = sumarDias(f, -1), n++) {
    if (!coincide(r, f)) continue;
    if (frecuenciaDe(r) === 'anual' && aMs(dia) - aMs(f) > DIAS_QUE_SIGUE_UN_ANUAL * DIA_MS) return null;
    return f;
  }
  return null;
}

const fechaDe = (m: Movimiento): string => m.ocurridoEn.slice(0, 10);

/** ¿Ya hay un movimiento de este recurrente en el periodo de `hoy` («AAAA-MM-DD HH:MM:SS»)? */
export function yaRegistrado(r: Recurrente, movs: Movimiento[], hoy: string): boolean {
  const clave = limpiar(r.concepto);
  const coincideConcepto = (m: Movimiento) => m.estado === 'ok' && limpiar(m.descripcion).includes(clave);
  if (frecuenciaDe(r) === 'mensual') {
    const mes = hoy.slice(0, 7);
    return movs.some(m => m.ocurridoEn.startsWith(mes) && coincideConcepto(m));
  }
  const toca = vigente(r, hoy.slice(0, 10));
  if (!toca) return true;
  const desde = sumarDias(toca, -DIAS_DE_ANTICIPO);
  return movs.some(m => fechaDe(m) >= desde && coincideConcepto(m));
}

/** ¿Ya toca (o ya pasó la fecha) y todavía no se ha registrado? */
export function estaPendiente(r: Recurrente, movs: Movimiento[], hoy: string): boolean {
  const dia = hoy.slice(0, 10);
  if (frecuenciaDe(r) === 'mensual') return Number(dia.slice(8, 10)) >= r.dia - DIAS_DE_ANTICIPO && !yaRegistrado(r, movs, hoy);
  return vigente(r, dia) !== null && !yaRegistrado(r, movs, hoy);
}

/** Los que ya tocan y no se han registrado. */
export function recurrentesPendientes(config: Record<string, string>, movs: Movimiento[], hoy: string): Recurrente[] {
  return leerRecurrentes(config)
    .filter(r => estaPendiente(r, movs, hoy))
    .sort((a, b) => a.dia - b.dia);
}

/** Cuántas veces falta pagarlo lo que resta del mes (para el «seguro para gastar»): la pendiente de ahora más las que caen después. */
export function vecesQueFaltanEsteMes(r: Recurrente, movs: Movimiento[], hoy: string): number {
  const dia = hoy.slice(0, 10);
  if (frecuenciaDe(r) === 'mensual') return yaRegistrado(r, movs, hoy) ? 0 : 1;
  const [a, m] = [Number(dia.slice(0, 4)), Number(dia.slice(5, 7))];
  const finDeMes = deMs(Date.UTC(a, m, 0));
  const futuras = ocurrencias(r, sumarDias(dia, DIAS_DE_ANTICIPO + 1), finDeMes).length;
  return (estaPendiente(r, movs, hoy) ? 1 : 0) + futuras;
}

/** «cada mes, el 5», «cada semana, los lunes»... para mostrar. */
export function describirFrecuencia(r: Recurrente): string {
  switch (frecuenciaDe(r)) {
    case 'mensual': return `cada mes, el ${r.dia}`;
    case 'quincenal': return `cada quincena, el ${r.dia} y el ${r.dia + 15}`;
    case 'semanal': return `cada semana, los ${DIAS_SEMANA[r.dia - 1] ?? '?'}`;
    case 'anual': return `cada año, el ${r.dia} de ${MESES[(r.mes ?? 1) - 1] ?? '?'}`;
  }
}

/** «este mes», «esta semana»...: de qué periodo es el aviso. */
export function periodoDe(r: Recurrente): string {
  return { mensual: 'este mes', quincenal: 'esta quincena', semanal: 'esta semana', anual: 'este año' }[frecuenciaDe(r)];
}

/** El mes de un nombre («marzo» → 3), o 0. */
export function mesDeNombre(nombre: string): number {
  const n = limpiar(nombre);
  const i = MESES.indexOf(n === 'setiembre' ? 'septiembre' : n);
  return i >= 0 ? i + 1 : 0;
}
