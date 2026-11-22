// Lo que usan todas las reglas: la base del mensaje, palabras de relleno, nombres de personas y montos de personas.
import { type Propuesta } from './tipos.ts';
import { gasto } from './movimientos.ts';
import { hallarMontos, aMinor, type MontoHallado } from '../dinero.ts';
import { type Reparto } from '../efectivo.ts';
import { borrarTramos, hallarCuentas, personaAlInicio, resolverPersona, type CuentaMencionada } from '../entidades.ts';
import { hallarFecha } from '../fechas.ts';
import { limpiar, palabrasOriginales, titulo } from '../texto.ts';
import { type Contexto, type Cuenta, type Moneda, type TipoMovimiento } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Palabras de relleno
// ---------------------------------------------------------------------------------------

/** Verbos y palabras que no aportan al concepto: "compré trident" -> "trident". */
export const RELLENO = new Set([
  'compre', 'compro', 'comprar', 'gaste', 'gasto', 'gastamos', 'pague', 'pagamos', 'pagar', 'fue', 'fueron',
  'costo', 'cuesta', 'cuestan', 'valio', 'valor', 'total', 'pesos', 'peso', 'cop', 'mi', 'mis', 'hoy',
]);
/** Palabras que sobran al principio o al final del concepto. */
export const BORDE = new Set([
  'a', 'al', 'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'en', 'por', 'para', 'con',
  'y', 'e', 'me', 'lo', 'le', 'que', 'se',
]);
// medios de pago que cualquiera nombra aunque su app no tenga esa cuenta (alguien escribe «a Nequi»)
export const MEDIOS = ['nequi', 'daviplata', 'davivienda', 'bancolombia', 'bogota', 'nu', 'paypal'];
export const VEHICULOS = ['moto', 'taxi', 'bus', 'carro', 'uber', 'colectivo', 'bicitaxi', 'camioneta', 'mototaxi', 'pasaje', 'pasajes'];

// ---------------------------------------------------------------------------------------
// Preparación común
// ---------------------------------------------------------------------------------------

export interface Base {
  original: string;
  /** Texto limpio, sin etiqueta ni fecha. Las posiciones de `cuentas` y `montos` son sobre este texto. */
  t: string;
  ocurridoEn: string;
  etiqueta?: string;
  cuentas: CuentaMencionada[];
  montos: MontoHallado[];
  originales: Map<string, string>;
  /** Dijo una fecha que no existe. */
  fechaInvalida?: boolean;
  /** Por qué no sirve la fecha o la hora que dijo. */
  fechaMotivo?: string;
}

export function prepararBase(original: string, t0: string, ctx: Contexto): Base {
  let t = t0;
  let etiqueta: string | undefined;
  const et = t.match(/(?:^|\s)#([a-z0-9-]+)/) ?? t.match(/\betiqueta ([a-z0-9-]+)/);
  if (et) {
    etiqueta = et[1];
    t = (t.slice(0, et.index) + ' ' + t.slice(et.index! + et[0].length)).replace(/\s+/g, ' ').trim();
  }
  const f = hallarFecha(t, ctx.ahora);
  t = f.resto;
  return {
    original, t, ocurridoEn: f.fecha, etiqueta, fechaInvalida: f.invalida, fechaMotivo: f.motivo,
    cuentas: hallarCuentas(t, ctx), montos: hallarMontos(t), originales: palabrasOriginales(original),
  };
}

export function propuestaBase(b: Base, tipo: TipoMovimiento, concepto: string, monto: number, moneda: Moneda): Propuesta {
  return {
    tipo, ocurridoEn: b.ocurridoEn, concepto, monto, moneda, etiqueta: b.etiqueta,
    mensajeOriginal: b.original, avisos: [], faltantes: [],
  };
}

/** Palabras que quedan al borrar tramos y relleno. */
export function palabrasLibres(t: string, tramos: { inicio: number; fin: number }[]): string[] {
  return borrarTramos(t, tramos).split(' ').filter(w => w && !RELLENO.has(w));
}

/** Quita palabras de borde al principio y al final. */
export function recortarBordes(ws: string[]): string[] {
  let i = 0;
  let j = ws.length;
  while (i < j && BORDE.has(ws[i])) i++;
  while (j > i && BORDE.has(ws[j - 1])) j--;
  return ws.slice(i, j);
}

/** Vuelve a poner tildes y mayúsculas a palabras ya normalizadas. */
export function conOriginales(ws: string[], b: Base): string {
  return ws.map(w => b.originales.get(w) ?? w).join(' ');
}

export function tramosDe(montos: MontoHallado[]): { inicio: number; fin: number }[] {
  return montos.map(m => ({ inicio: m.inicio, fin: m.fin }));
}

/** Nombre de persona o fuente: hasta 2 palabras de las libres (usa personas conocidas si puede). */
export function nombreEn(ws: string[], ctx: Contexto, b: Base, max = 2): { escrito: string; usadas: string[] } | null {
  for (let i = 0; i < ws.length; i++) {
    const conocida = personaAlInicio(ws.slice(i), ctx);
    if (conocida) return { escrito: conocida.cuenta.nombre, usadas: ws.slice(i, i + conocida.palabras) };
  }
  const libres = recortarBordes(ws).filter(w => !BORDE.has(w));
  if (!libres.length) return null;
  const usadas = libres.slice(0, max);
  return { escrito: conocidaTitulo(usadas, b), usadas };
}
const conocidaTitulo = (ws: string[], b: Base) => titulo(conOriginales(ws, b));

/** Resuelve un nombre contra las personas conocidas y registra la duda si la hay. */
export function resolverNombre(escrito: string, ctx: Contexto, p: Propuesta): string {
  const r = resolverPersona(escrito, ctx);
  if (r.candidatas?.length) {
    p.faltantes.push({
      campo: 'persona', dato: escrito,
      pregunta: `¿A quién te refieres con «${escrito}»?`,
      opciones: [...r.candidatas.map(c => c.nombre), `${escrito} (nuevo)`],
    });
  }
  return r.nombre;
}

export function listaCategorias(ctx: Contexto): string[] {
  return ctx.cuentas.filter(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre').map(c => c.nombre);
}

/** Lo que queda del concepto sin el nombre de la persona: «Ivan empanadas» -> «empanadas». */
export function sinNombre(concepto: string, nombre: string): string {
  const quitar = new Set(limpiar(nombre).split(' '));
  return concepto.split(' ').filter(w => !quitar.has(limpiar(w))).join(' ').trim();
}

// ---------------------------------------------------------------------------------------
// Pago en efectivo: «con 5k», «con 2k y 800 en monedas», «vuelto 2k y 200 monedas», «justo»
// ---------------------------------------------------------------------------------------

export const total = (r: Reparto): number => r.billetes + r.monedas;
export const dentroDe = (c: { inicio: number }, tramos: { inicio: number; fin: number }[]): boolean =>
  tramos.some(t => c.inicio >= t.inicio && c.inicio < t.fin);

// ---------------------------------------------------------------------------------------
// Préstamos, deudas y pagos entre personas
// ---------------------------------------------------------------------------------------

/** Monto en COP/USD y, si hay dos montos (pesos + dólares), el monto "otro" para pagos cruzados. */
export function montosDePersona(b: Base, cuentaId: string): { monto: number; moneda: Moneda; otro?: number; monedaOtra?: Moneda } | string {
  const ex = b.montos.filter(m => m.explicito || cuentaId === 'arq' || m.moneda === 'USD');
  if (ex.length === 0) return 'Me falta el monto.';
  if (ex.length === 1) {
    const m = ex[0];
    const moneda: Moneda = cuentaId === 'arq' ? 'USD' : (m.moneda ?? 'COP');
    return { monto: aMinor(m.valor, moneda), moneda };
  }
  if (ex.length === 2) {
    const usd = ex.find(m => m.moneda === 'USD');
    const cop = ex.find(m => m !== usd);
    if (usd && cop && cop.moneda === null) {
      return { monto: aMinor(usd.valor, 'USD'), moneda: 'USD', otro: aMinor(cop.valor, 'COP'), monedaOtra: 'COP' };
    }
  }
  return 'Veo varios montos. Manda un movimiento por mensaje.';
}

export function personaDe(b: Base, ctx: Contexto, quitar: string[], cortarEn: string[] = []): { escrito: string } | null {
  const todas = palabrasLibres(b.t, [...b.cuentas, ...tramosDe(b.montos)]);
  let ws = todas.filter(w => !quitar.includes(w));
  // «para cámara» dice para qué fue, no a quién: se buscan nombres antes de esas palabras. Solo si
  // después viene un «a» («para cámara a la unidad») el nombre puede estar más adelante.
  const corte = todas.findIndex(w => cortarEn.includes(w));
  if (corte >= 0 && !todas.slice(corte).includes('a')) ws = ws.filter(w => todas.indexOf(w) < corte);
  const n = nombreEn(ws, ctx, b);
  return n ? { escrito: n.escrito } : null;
}

/** Las palabras del nombre de una persona, ya normalizadas. */
export const personaDeNombre = (nombre: string): string[] => limpiar(nombre).split(' ');

/** Cambia por espacios las partes del texto ya leídas, sin mover las posiciones del resto. */
export function blanquear(t: string, tramos: { inicio: number; fin: number }[]): string {
  let s = t;
  for (const { inicio, fin } of tramos) s = s.slice(0, inicio) + ' '.repeat(Math.max(0, fin - inicio)) + s.slice(fin);
  return s;
}

