/**
 * Frases donde la plata no se movió, no se sabe cuánto fue o se corrige en la misma frase. Va antes que el resto del
 * intérprete porque el resto lee el primer verbo y el primer monto y saca una tarjeta aunque la frase diga «iba a»:
 *   «iba a gastar 50k pero no fui», «no me acuerdo si le di 30k a Luis»   ->  no se anota nada
 *   «gasté 20k no 2k», «pagué 30 y me devolvieron 10»                       ->  se anota el monto que vale
 *   «le pagué 80k a Faber y solo le debía 50k»                             ->  pregunta cuál fue el pago
 */
import { error, type Resultado } from './parser/tipos.ts';
import { limpiar, normalizar } from './texto.ts';

// Un monto escrito: «30», «30.000», «20k», «15 mil», «12 lucas»
const MONTO = String.raw`\d[\d.]*(?:\s?(?:k|mil|lucas?|barras?)\b)?`;

/** Valor en pesos de un monto escrito. Con «k» o «mil» son miles, y «pagué 30» también: nadie paga 30 pesos. */
function valor(m: string): number {
  const n = Number((/\d[\d.]*/.exec(m)?.[0] ?? '0').replace(/\./g, ''));
  return /[a-z]/.test(m) || n < 1000 ? n * 1000 : n;
}

const conMiles = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const HIPOTESIS = 'Eso suena a algo que no ha pasado, así que no anoté nada. Cuando pase, escríbelo como ya hecho, por ejemplo «gasté 50k en comida».';
const DUDA = 'Como no estás seguro, no anoté nada. Cuando lo confirmes, escríbelo con el monto, por ejemplo «le di 30k a Luis».';
const COBRO_DE_MAS = 'No anoté nada: un cobro de más que todavía no te devuelven puede que ya esté en el gasto que anotaste. Si es plata aparte que perdiste, escribe por ejemplo «gasto 15000 cobro de más».';
const SIN_MONTO = '¿Cuánto fue? No anoté nada todavía: escríbelo con el monto, por ejemplo «mamá me dio 20k».';
const NETO_CERO = 'Pagaste y te devolvieron lo mismo: queda en cero, así que no anoté nada.';

/** Intenciones, condiciones y plata que todavía no llega: nada de eso movió plata. */
function esHipotesis(t: string): boolean {
  return /^(?:(?:hoy|ayer|manana|parce|mk|uy|yo)\s+)*(?:iba|ibamos|pensaba|pensabamos|queria|queriamos|quisiera|planeaba)\s+(?:a\s+)?[a-z]/.test(t)
    // solo en primera persona: «me van a pagar 50k» ya se anota como ingreso
    || /\b(?:voy|vamos) a (?:gastar|comprar|pagar|prestar|pedir|mandar|transferir|pasar|sacar|retirar|consignar|ahorrar)\b/.test(t)
    || /^si (?:me )?(?:pagan|paga|pago|llega|llegan|dan|da|consignan|consigna)\b/.test(t)
    || /\b(?:todavia|aun) no (?:me |nos )?(?:lleg|ha llegado|han llegado)\w*|\bno (?:me )?(?:ha|han) llegado\b/.test(t);
}

/** «no me acuerdo si», «no sé si»: duda sin una orden de anotar («anota 15k» manda sobre la duda). */
function esDuda(t: string): boolean {
  return /\bno (?:me acuerdo|recuerdo|estoy segur[oa]|se) si\b/.test(t) && !ORDEN_DE_ANOTAR.test(t);
}

const ORDEN_DE_ANOTAR = /\b(?:anota|anotalo|apunta|apuntalo|pon|ponle|registra|guarda)\b/;
const DUDOSO = /\b(?:como|unos|unas|tipo|mas o menos|creo|no se|no me acuerdo)\b/g;

/** «gasté como 10 o 12 en mecato, no sé»: dos montos posibles. Se pregunta cuál fue; nunca se escoge uno solo. */
function rangoDudoso(t: string): Resultado | null {
  const m = t.match(new RegExp(String.raw`\b(${MONTO})\s+o\s+(${MONTO})(?=\s|$)`));
  if (!m || ORDEN_DE_ANOTAR.test(t) || !new RegExp(DUDOSO.source).test(t)) return null;
  const [a, b] = [valor(m[1]), valor(m[2])];
  if (a === b) return null;
  const con = (n: number): string => t.replace(m[0], String(n)).replace(DUDOSO, ' ').replace(/\s+/g, ' ').trim();
  return { clase: 'pregunta', mensaje: `¿Fueron ${conMiles(a)} o ${conMiles(b)}?`, opciones: [
    { titulo: conMiles(a), frase: con(a) },
    { titulo: conMiles(b), frase: con(b) },
  ] };
}

/** «le pagué 80k a Faber y solo le debía 50k»: dos montos que pueden ser el pago. Se pregunta con un botón por cada uno. */
function pagoContraDeuda(t: string): Resultado | null {
  const m = t.match(new RegExp(String.raw`^(.*\b(?:me pago|me pagaron|le pague|pague)\b.*?)\s*(?:,|\by\b|\bpero\b)\s+(?:yo\s+)?(?:solo\s+)?(?:le\s+|me\s+)?(?:debia|debo|debe)\s+(${MONTO})`));
  if (!m) return null;
  const x = m[1].match(new RegExp(MONTO));
  if (!x) return null;
  const a = valor(x[0]);
  const b = valor(m[2]);
  if (a === b) return null;
  return { clase: 'pregunta', mensaje: `Veo dos montos: ${conMiles(a)} y ${conMiles(b)}. ¿Cuánto fue el pago?`, opciones: [
    { titulo: `Fueron ${conMiles(a)}`, frase: m[1].trim() },
    { titulo: `Fueron ${conMiles(b)}`, frase: m[1].replace(x[0], m[2]).trim() },
  ] };
}

/**
 * Lo que no se anota: hipótesis, dudas, un cobro de más sin devolver, un neto de cero y un pago que choca con lo que se
 * debía. Devuelve null si la frase no es de esas y el intérprete sigue normal.
 */
export function incertidumbre(texto: string): Resultado | null {
  const t = limpiar(texto);
  if (/[?¿]/.test(texto)) return null;
  if (esHipotesis(t)) return error(HIPOTESIS);
  if (esDuda(t)) return error(DUDA);
  if (/\bcobraron de mas\b/.test(t) && /\bno\b/.test(t)) return error(COBRO_DE_MAS);
  if (!/\d/.test(t) && /\bno (?:se|me acuerdo|recuerdo) (?:de )?cuant[oa]s?\b/.test(t)) return error(SIN_MONTO);
  if (/\b(?:gaste|pague|compre|gasto|ingreso)\s+0+(?:[.,]0+)?(?![\d.,])/.test(t)) return error('El monto tiene que ser mayor que cero.');
  const rango = rangoDudoso(t);
  if (rango) return rango;
  if (neto(normalizar(texto)) === 0) return error(NETO_CERO);
  return pagoContraDeuda(t);
}

const NETO = new RegExp(String.raw`^(.*?\b(?:pague|gaste|compre)\s+)(${MONTO})(.*?)\s*(?:,|\by\b)\s+(?:luego\s+|despues\s+)?me\s+(?:devolvieron|regresaron|descontaron|hicieron (?:un )?descuento de)\s+(?:los mismos\s+|las mismas\s+)?(${MONTO})(?:\s+de (?:vueltas?|vuelto|devuelta|descuento))?(.*)$`);

/** «pagué 30 y me devolvieron 10»: lo que de verdad salió. null si la frase no es de esas. */
function neto(t: string): number | null {
  const m = t.match(NETO);
  if (!m) return null;
  return valor(m[2]) - valor(m[4]);
}

/**
 * Correcciones en la misma frase, que se anotan ya corregidas:
 *   «gasté 20k no 2k en comida»                   ->  «gasté 20k en comida» (manda el primero; el del «no» se descarta)
 *   «pagué 30.000 y me hicieron descuento de 5.000»  ->  «pagué 25000»
 */
export function corregida(texto: string): string {
  const t = normalizar(texto);
  const auto = new RegExp(String.raw`\b(${MONTO})\s*,?\s+no\s*,?\s+(${MONTO})(?=\s|$)`);
  if (auto.test(t)) return t.replace(auto, '$1');
  const m = t.match(NETO);
  const n = neto(t);
  if (m && n !== null && n > 0) return `${m[1]}${n}${m[3]}${m[5]}`.replace(/\s+/g, ' ').trim();
  return texto;
}
