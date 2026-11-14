/**
 * Dictado por voz: el micrófono entrega texto como se habla («mecato cinco mil quinientos») y esto lo
 * deja como se escribe («mecato 5500») para que el intérprete de siempre lo lea. Entiende los números
 * en palabras (hasta miles de millones), los nombres de cuentas que el reconocedor parte o escribe raro
 * («banco colombia», «davi plata») y quita la puntuación que el reconocedor agrega.
 */
import { limpiar } from './texto.ts';
import { quitarComasDeMiles } from './reparto.ts';

const UNIDADES: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const ESPECIALES: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
const esMil = (p: string | undefined): boolean => p === 'mil';
const esMillon = (p: string | undefined): boolean => p === 'millon' || p === 'millones';

/** Una palabra suelta sin tildes, mayúsculas ni signos. */
const base = (t: string): string => limpiar(t).replace(/[^a-z0-9]/g, '');

/**
 * Lee un número en palabras que empiece en `i`. Devuelve su valor y el índice donde termina,
 * o null si ahí no hay un número. «ciento veinte mil trescientos» = 120.300.
 */
function leerNumero(p: string[], i: number): { valor: number; fin: number } | null {
  let total = 0;
  let grupo = 0; // lo que va de 0 a 999 dentro del grupo actual
  let j = i;
  let leyo = false;
  while (j < p.length) {
    const w = p[j];
    const sig = p[j + 1];
    if (esMil(w)) {
      total += (grupo || 1) * 1000; grupo = 0; leyo = true; j++;
      if (esMil(p[j])) break; // «mil mil» no existe
      continue;
    }
    if (esMillon(w)) {
      total += (grupo || 1) * 1_000_000; grupo = 0; leyo = true; j++;
      continue;
    }
    if ((w === 'un' || w === 'una') && (esMil(sig) || esMillon(sig))) { grupo = 1; leyo = true; j++; continue; }
    if (w in CENTENAS && grupo === 0) { grupo = CENTENAS[w]; leyo = true; j++; continue; }
    if (w in ESPECIALES && grupo % 100 === 0) { grupo += ESPECIALES[w]; leyo = true; j++; continue; }
    if (w in DECENAS && grupo % 100 === 0) {
      grupo += DECENAS[w]; leyo = true; j++;
      // «treinta y cinco»: la «y» solo une una decena con una unidad
      if (p[j] === 'y' && p[j + 1] in UNIDADES) j++;
      continue;
    }
    if (w in UNIDADES && (grupo % 100 === 0 || (grupo % 100 >= 30 && grupo % 10 === 0))) { grupo += UNIDADES[w]; leyo = true; j++; continue; }
    break;
  }
  return leyo ? { valor: total + grupo, fin: j } : null;
}

/** Cómo suelen quedar escritas las cuentas cuando el reconocedor las oye mal o las parte. */
const MAL_OIDAS: [RegExp, string][] = [
  [/\bbanco colombia\b/gi, 'bancolombia'],
  [/\bdavi ?plata\b/gi, 'daviplata'],
  [/\b(?:neki|nequy|neque|nekki|neqi)\b/gi, 'nequi'],
  [/\bal ?can[sz]?[ií]a\b/gi, 'alcancía'],
  [/\bme cato\b/gi, 'mecato'],
];

/** Pasa lo dictado a como se escribe. Lo que no es número ni cuenta mal oída queda igual. */
export function normalizarDictado(dictado: string): string {
  const crudo = dictado.replace(/[¿?¡!;]/g, ' ').replace(/[.,]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!crudo) return '';
  const originales = crudo.split(' ');
  const claves = originales.map(base);
  const salida: string[] = [];
  for (let i = 0; i < originales.length;) {
    const n = leerNumero(claves, i);
    if (n && n.fin > i) { salida.push(String(n.valor)); i = n.fin; continue; }
    salida.push(originales[i]);
    i++;
  }
  let t = quitarComasDeMiles(salida.join(' ')).replace(/(\d)\s+pesos\b/gi, '$1');
  for (const [re, bien] of MAL_OIDAS) t = t.replace(re, bien);
  return t;
}
