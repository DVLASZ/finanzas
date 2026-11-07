/**
 * Montos: encontrar cantidades en un texto ("5k", "5 mil", "$5.000", "8 usd") y darles formato.
 */
import { DECIMALES, type Moneda } from './tipos.ts';

export interface MontoHallado {
  /** Valor en unidades "grandes" (pesos o dólares). */
  valor: number;
  /** Moneda solo si el texto la dice ("usd", "dólares", "us$"). */
  moneda: Moneda | null;
  /**
   * true si el texto lo marca claramente como plata ($, k, mil, usd, miles con punto) o es
   * >= 100. Los números sueltos y pequeños ("3 empanadas") no son explícitos.
   */
  explicito: boolean;
  inicio: number;
  fin: number;
  /** Venía con un "-" delante ("-30k"): se usa para devoluciones. */
  negativo: boolean;
}

const MULTIPLICADOR: Record<string, number> = {
  k: 1000,
  mil: 1000,
  luca: 1000,
  lucas: 1000,
  luka: 1000,
  lukas: 1000,
  millon: 1_000_000,
  millones: 1_000_000,
};
const MARCA_USD = new Set(['usd', 'dolar', 'dolares', 'dlls', 'dll', 'us']);

const RE_MONTO =
  /(?<![a-z0-9.,/])(us\$|\$)?\s?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?:\s?(k|mil|lucas?|lukas?|millon(?:es)?|usd|dolar(?:es)?|dlls?|us)(?![a-z]))?/g;

/** Busca todos los montos de un texto ya normalizado (ver `limpiar`). */
export function hallarMontos(t: string): MontoHallado[] {
  const res: MontoHallado[] = [];
  for (const m of t.matchAll(RE_MONTO)) {
    const [completo, simbolo, numero, sufijo] = m;
    const inicio = m.index ?? 0;
    let valor: number;
    if (/^\d{1,3}([.,]\d{3})+$/.test(numero)) valor = Number(numero.replace(/[.,]/g, ''));
    else valor = Number(numero.replace(',', '.'));
    if (!Number.isFinite(valor)) continue;

    let moneda: Moneda | null = simbolo === 'us$' ? 'USD' : null;
    let marcado = simbolo !== undefined || /^\d{1,3}([.,]\d{3})+$/.test(numero);
    if (sufijo) {
      marcado = true;
      if (MARCA_USD.has(sufijo)) moneda = 'USD';
      else valor *= MULTIPLICADOR[sufijo] ?? 1;
    }
    const antes = t.slice(Math.max(0, inicio - 2), inicio);
    res.push({
      valor,
      moneda,
      explicito: marcado || valor >= 100,
      inicio,
      fin: inicio + completo.length,
      negativo: /(^|\s)-$/.test(antes),
    });
  }
  return res;
}

/** Pasa a la unidad mínima: 8 USD -> 800, 5000 COP -> 5000. */
export function aMinor(valor: number, moneda: Moneda): number {
  return Math.round(valor * 10 ** DECIMALES[moneda]);
}

function conMiles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 5000 -> "$5.000" · 800 USD -> "US$8,00". Sin depender de la configuración regional. */
export function formatear(monto: number, moneda: Moneda = 'COP'): string {
  const signo = monto < 0 ? '-' : '';
  const abs = Math.abs(monto);
  if (moneda === 'USD') {
    const enteros = Math.floor(abs / 100);
    const cent = String(abs % 100).padStart(2, '0');
    return `${signo}US$${conMiles(enteros)},${cent}`;
  }
  return `${signo}$${conMiles(abs)}`;
}
