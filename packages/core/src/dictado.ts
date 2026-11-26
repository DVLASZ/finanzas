/**
 * Lo que trae el dictado por voz y no trae el teclado: muletillas, números en letras, el mismo monto dicho dos veces,
 * un teléfono dictado en medio y correcciones habladas («no espere, fueron 55 mil», «a Mateo, digo, a Marta»).
 * limpiarDictado deja la frase como se habría escrito; dudaDeDictado detecta lo que no se puede adivinar y lo pregunta.
 */
import { hallarCuentas } from './entidades.ts';
import { limpiar } from './texto.ts';
import { numerosDeDinero } from './voz.ts';
import type { Resultado } from './parser/tipos.ts';
import type { Contexto } from './tipos.ts';

const MONTO = String.raw`\d[\d.,]*(?:\s*(?:mil|k|lucas?))?`;
// Lo que se dice al corregirse: «no espere», «ah no mentiras», «no perdón», «no mejor».
const CORRIGE = /\b(?:ah+\s+)?no,?\s+(?:mentiras?|espera|espere|perd[oó]n|mejor|digo)\b,?\s*/i;
const DECENAS = String.raw`(?:veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|diez|once|doce|trece|catorce|quince|dieci\w+)`;
const UNIDAD = String.raw`(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)`;
const DIAS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno'];
const PALABRAS = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];

/** La última corrección dictada manda: reemplaza el monto o la cuenta que venían antes. Sin corrección, devuelve el texto igual. */
function aplicarCorreccion(texto: string, ctx?: Contexto): string {
  const m = CORRIGE.exec(texto);
  if (!m) return texto;
  const cabeza = texto.slice(0, m.index).replace(/\s+/g, ' ').replace(/,$/, '').trim();
  const cola = texto.slice(m.index + m[0].length).trim();
  if (cabeza.split(' ').length < 2 || !cola) return texto;

  const monto = new RegExp(String.raw`^(?:fue|fueron|era|eran|es|son)?\s*(${MONTO})\s*(.*)$`, 'i').exec(cola);
  if (monto && new RegExp(MONTO, 'i').test(cabeza)) {
    const nuevo = cabeza.replace(new RegExp(MONTO, 'i'), () => monto[1].trim());
    return monto[2] ? `${nuevo} ${monto[2]}` : nuevo;
  }

  if (ctx) {
    const colaT = limpiar(cola);
    const deCola = hallarCuentas(colaT, ctx);
    const deCabeza = hallarCuentas(limpiar(cabeza), ctx);
    if (deCola.length === 1 && deCabeza.length && colaT.split(' ').length <= 5) {
      let sin = cabeza;
      for (const c of [...deCabeza].sort((a, b) => b.inicio - a.inicio)) {
        const antes = sin.slice(0, c.inicio).replace(/\b(?:con|en|por|de|desde)\s+$/i, '');
        sin = `${antes}${sin.slice(c.fin)}`;
      }
      return `${sin.replace(/\s+/g, ' ').trim()} en ${cola.slice(deCola[0].inicio, deCola[0].fin)}`;
    }
  }
  return texto;
}

/** Pasa el dictado a como se escribiría. Solo toca lo que es de voz: lo escrito normal sale igual. */
export function limpiarDictado(texto: string, ctx?: Contexto): string {
  if (texto.length > 1000) return texto; // un mensaje así no es un dictado, y las expresiones no deben tardar
  let t = texto;
  // «eeeh pues anota...»: la muletilla del comienzo
  t = t.replace(/^\s*(?:e+h+m*|mm+|hmm+)[\s,]+(?:pues[\s,]+)?/i, '');
  t = t.replace(/\bde el\b/gi, 'del');
  // un teléfono dictado en medio («a Juan al» seguido de diez dígitos) no es un monto ni una cuenta
  t = t.replace(/(?:\b(?:al|el|numero|número|celular|cel)\s+)?(?<![\d.,])3\d{9}(?![\d.,])/gi, ' ');
  // «18 mil de almuerzo y treinta y cinco de gasolina»: el segundo monto, dicho corto, hereda el «mil»
  if (/\b\d+\s*mil\b/i.test(t)) {
    t = t.replace(new RegExp(String.raw`(\by\s+${DECENAS}(?:\s+y\s+${UNIDAD})?)(\s+(?:de|en|para)\s)`, 'gi'), '$1 mil$2');
  }
  // «el quince de noviembre»: el día dicho en letras
  t = t.replace(new RegExp(String.raw`\b(${DIAS.join('|')})(\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b)`, 'gi'), (_m, d: string, resto: string) => `${DIAS.indexOf(d.toLowerCase()) + 1}${resto}`);
  t = numerosDeDinero(t);
  // el mismo monto en cifra y en letras: «25.000 veinticinco mil» es uno solo
  t = t.replace(/(?<![\d.,])(\d[\d.,]{3,})\s+(\d[\d.,]{3,})(?![\d.,])/g, (m, a: string, b: string) => (a.replace(/\D/g, '') === b.replace(/\D/g, '') ? a : m));
  // «compré 3000 de pan y 2000 de queso»: dos movimientos; el verbo del primero vale para el segundo
  const dos = new RegExp(String.raw`^((?:anota\w*|compr\w+|pagu\w+|gast\w+)\s+${MONTO}\s+de\s+.+?)\s+y\s+(${MONTO}\s+de\s+.+)$`, 'i').exec(t.trim());
  // (con otro «y monto» después es una lista de tres o más, que parte la lógica de siempre)
  if (dos && !/\sy\s+\d/i.test(`${dos[1]} ${dos[2]}`)) t = `${dos[1]}; ${/^\S+/.exec(dos[1])![0]} ${dos[2]}`;
  // «a Mateo, digo, a Marta»: manda el último nombre
  t = t.replace(/\b(a|para|con)\s+[\p{L}]+,?\s+digo,?\s+(?:a|para|con)\s+/giu, '$1 ');
  return aplicarCorreccion(t, ctx).replace(/[ \t]+/g, ' ').trim();
}

const opcion = (titulo: string, frase: string): { titulo: string; frase: string } => ({ titulo, frase });

/**
 * Lo que dictado así no se puede adivinar y se pregunta: «siento veinte mil» (¿ciento?), «dos de veinte mil de arroz»
 * (¿cada uno o el total?) y «debe haber 70 mil en nequi» (una suposición de saldo, no un movimiento).
 * Se llama con el texto ya limpio de limpiarDictado.
 */
export function dudaDeDictado(texto: string): Resultado | null {
  const t = limpiar(texto);
  const siento = /\bsiento (\d+)\b/.exec(t);
  if (siento && Number(siento[1]) >= 1000 && Number(siento[1]) < 100000) {
    const n = Number(siento[1]);
    const con = (v: number): string => t.replace(siento[0], String(v));
    return { clase: 'pregunta', mensaje: `¿«siento ${n}» es ${100000 + n} (ciento) o ${n}?`, opciones: [opcion(`${100000 + n}`, con(100000 + n)), opcion(`${n}`, con(n))] };
  }
  const veces = /^(?:\S+\s)?(\d{1,2}|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) de (\d{4,}) de (.+)$/.exec(t);
  if (veces) {
    const [, palabra, precio, que] = veces;
    const k = PALABRAS.indexOf(palabra) >= 0 ? PALABRAS.indexOf(palabra) + 1 : Number(palabra);
    return {
      clase: 'pregunta',
      mensaje: `¿Cada uno de los ${k} costó ${precio}, o ${precio} fue el total?`,
      opciones: [opcion(`Cada uno (${k * Number(precio)})`, `${que} ${k * Number(precio)}`), opcion(`Total ${precio}`, `${que} ${precio}`)],
    };
  }
  if (/\b(?:debe|deberia|creo que|supongo que|tal vez|quiza|a lo mejor)\s+(?:de\s+)?(?:haber|hay|tener|tengo|quedar|queda)\b/.test(t) && /\d/.test(t)) {
    return { clase: 'pregunta', mensaje: 'Eso suena a un saldo que supones, no a un movimiento, así que no anoté nada. Si quieres cuadrar la cuenta con esa cifra, escribe «arqueo» y la cuenta con el monto.', opciones: [] };
  }
  return null;
}
