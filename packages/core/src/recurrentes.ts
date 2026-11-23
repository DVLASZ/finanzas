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
import { limpiar, normalizar } from './texto.ts';
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
  /** En pausa: no cuenta en lo que falta, en Próximos 30 días, en el seguro ni en los avisos. */
  pausado?: boolean;
  /** Último día en que cuenta («AAAA-MM-DD»). Pasada esa fecha ya no se proyecta ni avisa. */
  fin?: string;
  /** Cuenta de dinero y categoría con que se anota (si faltan, salen de la frase). */
  cuentaId?: string;
  categoriaId?: string;
}

/** Los avisos empiezan dos días antes y siguen hasta que se registra. */
export const DIAS_DE_ANTICIPO = 2;

/** Los anuales siguen avisando hasta un mes después de la fecha; si no, quedarían pendientes todo el año. */
const DIAS_QUE_SIGUE_UN_ANUAL = 30;

const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const frecuenciaDe = (r: Recurrente): Frecuencia => r.frecuencia ?? 'mensual';

/** Un solo punto de verdad: ¿el pago fijo cuenta en esa fecha? Pausado nunca; con `fin`, hasta ese día inclusive. */
export const activoEn = (r: Recurrente, fecha: string): boolean => !r.pausado && (!r.fin || fecha.slice(0, 10) <= r.fin);

/** En qué punto está un pago fijo hoy. Si está pausado y además terminó, gana «terminado». */
export function estadoDeFijo(r: Recurrente, hoy: string): 'activo' | 'pausado' | 'terminado' {
  if (r.fin && r.fin < hoy.slice(0, 10)) return 'terminado';
  return r.pausado ? 'pausado' : 'activo';
}

/** El día de la semana de un nombre («lunes» → 1), o 0. */
export function diaDeSemana(nombre: string): number {
  return DIAS_SEMANA.indexOf(limpiar(nombre)) + 1;
}

export function leerRecurrentes(config: Record<string, string>): Recurrente[] {
  try {
    const l = JSON.parse(config.recurrentes ?? '[]');
    if (!Array.isArray(l)) return [];
    return l
      .filter((x): x is Recurrente => x && typeof x.frase === 'string' && typeof x.concepto === 'string' && Number.isInteger(x.dia) && Number(x.monto) > 0)
      // se conservan los pausados y terminados (sirven para reconocer movimientos); solo se limpian los campos mal formados
      .map(x => {
        const { pausado, fin, ...resto } = x;
        const r: Recurrente = { ...resto };
        if (pausado === true) r.pausado = true;
        if (typeof fin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fin)) r.fin = fin;
        return r;
      });
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
  if (r.pausado) return res;
  const tope = r.fin && r.fin < hasta ? r.fin : hasta;
  for (let f = desde; f <= tope && res.length < 400; f = sumarDias(f, 1)) if (coincide(r, f)) res.push(f);
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

/** Palabras del concepto que no distinguen un pago de otro: «Suscripción Claude» se reconoce por «claude». */
const GENERICAS = new Set(['suscripcion', 'pago', 'cuota', 'mensual', 'servicio', 'plan', 'cobro', 'de', 'del', 'la', 'el', 'los', 'las', 'mi']);
const raiz = (w: string): string => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

/** Las palabras de un texto, sin tildes ni plural final. */
export const palabrasRaiz = (t: string): Set<string> => new Set((normalizar(t).match(/[a-z]+/g) ?? []).map(raiz));

/** Las palabras que tiene que traer un texto para nombrar este pago fijo. */
export function clavesDeFijo(r: Recurrente): string[] {
  const todas = (normalizar(r.concepto).match(/[a-z]+/g) ?? []).filter(w => w.length >= 3);
  const propias = todas.filter(w => !GENERICAS.has(w));
  return (propias.length ? propias : todas).map(raiz);
}

/** ¿Este texto nombra al pago fijo? Vale el concepto entero o solo sus palabras distintivas («claude» para «Suscripción Claude»). */
export function nombraAlFijo(r: Recurrente, texto: string): boolean {
  if (limpiar(texto).includes(limpiar(r.concepto))) return true;
  const k = clavesDeFijo(r);
  if (!k.length) return false;
  const p = palabrasRaiz(texto);
  return k.every(w => p.has(w));
}

/** ¿Ya hay un movimiento de este recurrente en el periodo de `hoy` («AAAA-MM-DD HH:MM:SS»)? */
export function yaRegistrado(r: Recurrente, movs: Movimiento[], hoy: string): boolean {
  // el monto no importa (un cobro en dólares cambia con la TRM): basta con que el movimiento nombre al pago fijo
  const coincideConcepto = (m: Movimiento) => m.estado === 'ok' && nombraAlFijo(r, m.descripcion);
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
  if (r.pausado) return false;
  const dia = hoy.slice(0, 10);
  if (frecuenciaDe(r) === 'mensual') {
    return Number(dia.slice(8, 10)) >= r.dia - DIAS_DE_ANTICIPO && activoEn(r, `${dia.slice(0, 8)}${String(r.dia).padStart(2, '0')}`) && !yaRegistrado(r, movs, hoy);
  }
  const toca = vigente(r, dia);
  return toca !== null && activoEn(r, toca) && !yaRegistrado(r, movs, hoy);
}

/** Los que ya tocan y no se han registrado. */
export function recurrentesPendientes(config: Record<string, string>, movs: Movimiento[], hoy: string): Recurrente[] {
  return leerRecurrentes(config)
    .filter(r => estaPendiente(r, movs, hoy))
    .sort((a, b) => a.dia - b.dia);
}

/**
 * Las fechas que faltan por pagar desde hoy hasta `hasta` (AAAA-MM-DD). Es la única regla para saber qué ya está pagado:
 * la ocurrencia del periodo en curso se da por cubierta si `yaRegistrado` dice que sí; las demás cuentan. Una ocurrencia
 * vencida sin registrar sale con la fecha de hoy, porque hay que pagarla ya. La usan el seguro y la proyección de liquidez.
 */
export function fechasQueFaltan(r: Recurrente, movs: Movimiento[], hoy: string, hasta: string): string[] {
  if (r.pausado) return [];
  const dia = hoy.slice(0, 10);
  // la ocurrencia del periodo en curso: la del mes si es mensual, la vigente en las demás
  let actual: string | null;
  if (frecuenciaDe(r) === 'mensual') actual = `${dia.slice(0, 8)}${String(r.dia).padStart(2, '0')}`;
  else actual = vigente(r, dia);
  if (actual !== null && !activoEn(r, actual)) actual = null;
  const cubierta = actual !== null && yaRegistrado(r, movs, hoy);
  const res = ocurrencias(r, dia, hasta).filter(f => !(cubierta && f === actual));
  if (actual !== null && !cubierta && actual < dia) res.unshift(dia);
  return res;
}

/** Cuántas veces falta pagarlo lo que resta del mes (para el «seguro para gastar»). */
export function vecesQueFaltanEsteMes(r: Recurrente, movs: Movimiento[], hoy: string): number {
  const dia = hoy.slice(0, 10);
  const [a, m] = [Number(dia.slice(0, 4)), Number(dia.slice(5, 7))];
  return fechasQueFaltan(r, movs, hoy, deMs(Date.UTC(a, m, 0))).length;
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
