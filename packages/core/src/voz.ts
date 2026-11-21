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
  // en femenino, como se dice antes de «mil» y de «lucas»: «doscientas mil», «quinientas lucas»
  doscientas: 200, trescientas: 300, cuatrocientas: 400, quinientas: 500,
  seiscientas: 600, setecientas: 700, ochocientas: 800, novecientas: 900,
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
  let trasMil = false; // lo último fue «mil»: si sigue «millones» es «mil millones», no mil y luego un millón
  const esMedio = (x: string | undefined): boolean => x === 'medio' || x === 'media';
  /** «y medio» tras «mil» o «millón»: suma la mitad de esa unidad. */
  const yMedio = (mitad: number): void => {
    if (p[j] === 'y' && esMedio(p[j + 1])) { total += mitad; j += 2; }
  };
  /** «treinta y cinco», «diez y seis», «treinta y un mil»: la «y» solo une una decena con una unidad. */
  const yUnidad = (): number => {
    if (p[j] !== 'y') return 0;
    const u = p[j + 1];
    if (u in UNIDADES) { j += 2; return UNIDADES[u]; }
    const sig = p[j + 2];
    if ((u === 'un' || u === 'una') && (esMil(sig) || esMillon(sig) || SUFIJOS_DE_PLATA.has(sig))) { j += 2; return 1; }
    return 0;
  };
  while (j < p.length) {
    const w = p[j];
    const sig = p[j + 1];
    if (esMil(w)) {
      total += (grupo || 1) * 1000; grupo = 0; leyo = true; j++;
      if (esMil(p[j])) break; // «mil mil» no existe
      yMedio(500);
      trasMil = true;
      continue;
    }
    if (esMillon(w)) {
      if (trasMil && grupo === 0) total *= 1_000_000; // «dos mil millones»
      else total += (grupo || 1) * 1_000_000;
      grupo = 0; leyo = true; j++; trasMil = false;
      yMedio(500_000);
      continue;
    }
    trasMil = false;
    if (esMedio(w) && esMillon(sig) && grupo === 0) { total += 500_000; leyo = true; j += 2; continue; }
    if ((w === 'un' || w === 'una') && (esMil(sig) || esMillon(sig))) { grupo = 1; leyo = true; j++; continue; }
    if (w in CENTENAS && grupo === 0) { grupo = CENTENAS[w]; leyo = true; j++; continue; }
    if (w in ESPECIALES && grupo % 100 === 0) {
      grupo += ESPECIALES[w]; leyo = true; j++;
      if (w === 'diez' || w === 'veinte') grupo += yUnidad(); // «diez y seis», «veinte y cinco»
      continue;
    }
    if (w in DECENAS && grupo % 100 === 0) {
      grupo += DECENAS[w]; leyo = true; j++;
      grupo += yUnidad();
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

/** «neki», «banco colombia», «davi plata»: las cuentas como las deja el dictado, a como se escriben. */
export function corregirCuentasMalOidas(texto: string): string {
  let t = texto;
  for (const [re, bien] of MAL_OIDAS) t = t.replace(re, bien);
  return t;
}

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

/**
 * «2 millones y medio», «una luca y media», «media luca», «un cuarto de millón»: lo que viene con cifras o con «luca»
 * se pasa a su valor antes de leer el resto. Lo que viene en palabras («dos millones y medio») lo resuelve leerNumero.
 */
function conMedios(texto: string): string {
  return texto
    .replace(/(?<![\d.,])(\d+|una?)\s*(mil|lucas?|lukas?|barras?)\s+y\s+medi[oa]\b/gi, (_m, n: string) => String((/^un/i.test(n) ? 1 : Number(n)) * 1000 + 500))
    .replace(/(?<![\d.,])(\d+)\s+mill[oó]n(?:es)?\s+y\s+medio\b/gi, (_m, n: string) => String(Number(n) * 1_000_000 + 500_000))
    .replace(/\bmedia\s+(?:luca|luka|barra)\b/gi, '500')
    .replace(/\bun\s+cuarto\s+de\s+mill[oó]n\b/gi, '250000');
}

const SUFIJOS_DE_PLATA = new Set(['lucas', 'luca', 'lukas', 'luka', 'barras', 'barra', 'palos', 'palo', 'pesos', 'peso']);

/**
 * Los números en palabras que son plata, también al escribir: «sesenta mil» -> 60000, «treinta lucas» -> 30 lucas, «quince
 * quinientos» -> 15500. Solo toca los que traen «mil», «millón» o van antes de «lucas», «barras», «palos» o «pesos»: «dos leches»
 * y «tres empanadas» se quedan como están, porque ahí el número no es plata.
 */
export function numerosDeDinero(texto: string): string {
  const originales = conMedios(texto).split(' ');
  const claves = originales.map(base);
  const salida: string[] = [];
  for (let i = 0; i < originales.length;) {
    // «80 mil»: ese «mil» ya es la jerga de un número escrito con cifras, no un «mil» a convertir en 1000
    if ((esMil(claves[i]) || esMillon(claves[i])) && /\d$/.test(originales[i - 1] ?? '')) { salida.push(originales[i]); i++; continue; }
    const n = leerNumero(claves, i);
    if (n && n.fin > i) {
      const corrida = claves.slice(i, n.fin);
      const plata = corrida.some(w => esMil(w) || esMillon(w)) || SUFIJOS_DE_PLATA.has(claves[n.fin] ?? '');
      if (plata) { salida.push(String(n.valor)); i = n.fin; continue; }
      // «quince quinientos»: los miles y quinientos, dicho a la colombiana
      if (n.valor < 100 && claves[n.fin] === 'quinientos') { salida.push(String(n.valor * 1000 + 500)); i = n.fin + 1; continue; }
    }
    salida.push(originales[i]);
    i++;
  }
  return salida.join(' ').replace(/(\d)\s+pesos?\b/gi, '$1');
}
