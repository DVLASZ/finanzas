/**
 * Dudas que se preguntan en vez de adivinar: decimales en pesos, nombres que son a la vez cuenta o categoría y
 * persona, montos enormes, y emojis sueltos como respuesta a la tarjeta pendiente.
 */
import type { Resultado } from './parser/tipos.ts';
import { normalizar } from './texto.ts';
import type { Contexto } from './tipos.ts';

/** Monto desde el cual la tarjeta avisa que revises los ceros (en pesos y en centavos de dólar). */
export const ALTO_COP = 100_000_000;
export const ALTO_USD = 10_000_000;

const conMiles = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * «12500.75» o «0.5 pesos»: en pesos casi no hay centavos y el punto puede ser de miles. Se pregunta en vez de
 * redondear en silencio. «12.500» (tres cifras) es de miles y «12,5k» o «2.5 millones» llevan su unidad: no entran.
 */
function decimalDudoso(texto: string): Resultado | null {
  const t = normalizar(texto);
  if (/usd|dolar|euro|eur\b|%|por ciento|\d\s?(?:am|pm)\b/.test(t)) return null;
  const m = /(?<![\d.,])(\d+)[.,](\d{1,2})(?![\d])(?!\s?(?:k\b|mil\b|m\b|millon|lucas?\b|palos?\b|barras?\b))/.exec(t);
  if (!m) return null;
  const entero = Number(m[1]);
  const pesos = /^\s?(?:pesos|cop)\b/.test(t.slice(m.index + m[0].length));
  const reemplazo = (n: number): string => normalizar(texto).replace(/(?<![\d.,])\d+[.,]\d{1,2}(?!\d)/, String(n));
  if (entero >= 1000) {
    const redondo = Math.round(Number(`${m[1]}.${m[2]}`));
    const opciones = [entero, redondo].filter((n, i, a) => a.indexOf(n) === i);
    return {
      clase: 'pregunta',
      mensaje: `¿Fueron $${conMiles(entero)}, $${conMiles(redondo)} o $${conMiles(entero)},${m[2]}? En pesos casi no hay centavos, dime cuál.`,
      opciones: opciones.map(n => ({ titulo: `$${conMiles(n)}`, frase: reemplazo(n) })),
    };
  }
  if (entero === 0 && pesos) {
    const a = Math.round(Number(`0.${m[2]}`) * 1000), b = a * 10;
    return {
      clase: 'pregunta',
      mensaje: `¿Quisiste decir $${conMiles(a)} o $${conMiles(b)}? En pesos no hay montos de menos de uno.`,
      opciones: [{ titulo: `$${conMiles(a)}`, frase: reemplazo(a) }, { titulo: `$${conMiles(b)}`, frase: reemplazo(b) }],
    };
  }
  return null;
}

const MONTO = /\d[\d.,]*\s?(?:k|mil)?\b/;

/**
 * Un nombre que es categoría o cuenta dicho como si fuera una persona: «le pagué 30k a Mercado», «me transfirió
 * Efectivo 50k». Si de verdad existe una persona con ese nombre no se pregunta.
 */
function nombreQueChoca(texto: string, ctx: Contexto): Resultado | null {
  const t = normalizar(texto).replace(/\s+/g, ' ').trim();
  const monto = MONTO.exec(t)?.[0].trim();
  if (!monto) return null;
  const personas = new Set(ctx.cuentas.filter(c => c.tipo === 'persona').map(c => c.clave));
  const de = (tipo: string) => ctx.cuentas.filter(c => c.tipo === tipo && c.clave && !personas.has(c.clave));

  // palabras de categoría que no son el nombre de ninguna (el diccionario lleva «mercado» a Comida)
  const nombres = [...de('categoria').map(c => ({ clave: c.clave, nombre: c.nombre })), { clave: 'mercado', nombre: 'Mercado' }].filter(c => !personas.has(c.clave));
  for (const c of nombres) {
    if (new RegExp(String.raw`\ble (?:pague|pagamos|preste|di|mande|envie|transferi|consigne|gire|abone)\b.*\ba (?:la |el )?${c.clave}\s*$`).test(t)) {
      return {
        clase: 'pregunta',
        mensaje: `¿${c.nombre} es una persona o la categoría? Si es el gasto, lo anoto en ${c.nombre}; si es alguien, escríbelo con su apellido.`,
        opciones: [{ titulo: `Gasto de ${c.nombre}`, frase: `${c.clave} ${monto}` }],
      };
    }
  }
  for (const c of de('dinero')) {
    if (new RegExp(String.raw`\bme (?:transfirio|pago|consigno|giro|envio|mando|abono|devolvio)\s+(?:la |el )?${c.clave}\b`).test(t)) {
      return {
        clase: 'pregunta',
        mensaje: `¿${c.nombre} es una de tus cuentas o una persona? Si es tu cuenta, ¿quieres anotar un ingreso de ${monto} en ${c.nombre}?`,
        opciones: [{ titulo: `Ingreso en ${c.nombre}`, frase: `me pagaron ${monto} en ${c.clave}` }],
      };
    }
  }
  return null;
}

/** Va al principio de `interpretar`: devuelve la pregunta si la frase tiene un número o un nombre ambiguo. */
export function dudaDeNumeroONombre(texto: string, ctx: Contexto): Resultado | null {
  return decimalDudoso(texto) ?? nombreQueChoca(texto, ctx);
}

/** Aviso para la tarjeta cuando el monto es casi seguro un error de ceros; null si es normal. */
export function avisoDeMontoAlto(monto: number, moneda: string | undefined): string | null {
  if (Math.abs(monto) < (moneda === 'USD' ? ALTO_USD : ALTO_COP)) return null;
  return 'Monto muy alto: revisa los ceros y confirma que la cifra es correcta antes de guardar.';
}

export type Reaccion = 'confirma' | 'cancela' | 'duda';

/**
 * Un emoji (o signos de pregunta) solo, como respuesta a la tarjeta pendiente. `limpiar` borra los emojis, así que
 * se mira el texto original, sin tonos de piel ni selectores de variante.
 */
export function reaccionSuelta(texto: string): Reaccion | null {
  const s = texto.replace(/[️‍\u{1F3FB}-\u{1F3FF}\s]/gu, '');
  if (!s) return null;
  if (/^(?:👍|👌|✅|☑|✔)+$/u.test(s)) return 'confirma';
  if (/^(?:❌|✖|🚫|👎|✘)+$/u.test(s)) return 'cancela';
  if (/^(?:🔄|🔁|🔃|[?¿])+$/u.test(s)) return 'duda';
  return null;
}
