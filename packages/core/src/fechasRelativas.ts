/**
 * Fechas relativas que `hallarFecha` no lee sola y fechas que no se pueden adivinar:
 *   «anteanoche», «el 15 del mes pasado», «el último día del mes pasado»     se resuelven con el reloj
 *   «el 04/05», «el fin de semana pasado», «a las doce de la noche» sin día   se pregunta
 */
import type { Contexto } from './tipos.ts';
import type { Resultado } from './parser/tipos.ts';
import { limpiar } from './texto.ts';

const OFFSET_MS = -5 * 3600 * 1000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Lo que resuelve `relativa`: el grupo 1 es el día de «el 15 del mes pasado». */
export const RE_RELATIVA = /\banteanoche\b|\bel (\d{1,2}|primero) del mes pasado\b|\b(?:el )?ultimo dia del mes pasado\b/;

/** Día de la coincidencia de RE_RELATIVA, con `c` en hora local corrida. null si el día no existe. `noche` pide las 8 pm. */
export function relativa(m: RegExpMatchArray, c: Date): { anio: number; mes: number; dia: number; noche?: boolean } | null {
  const y = c.getUTCFullYear(), mo = c.getUTCMonth();
  const de = (d: Date) => ({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() });
  if (m[0] === 'anteanoche') return { ...de(new Date(Date.UTC(y, mo, c.getUTCDate() - 2))), noche: true };
  if (m[1]) {
    const dia = m[1] === 'primero' ? 1 : Number(m[1]);
    const f = new Date(Date.UTC(y, mo - 1, dia));
    // «el 31 del mes pasado» en un mes de 30 días no existe: no se corre al mes siguiente
    return f.getUTCMonth() === (mo + 11) % 12 ? de(f) : null;
  }
  return de(new Date(Date.UTC(y, mo, 0)));
}

/** Días desde esa fecha hasta hoy (positivo si ya pasó). */
const diasAtras = (hoy: Date, anio: number, mes: number, dia: number) =>
  Math.round((Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) - Date.UTC(anio, mes - 1, dia)) / 86400000);

/** El año de un día sin año, como lo toma `hallarFecha`: este, o el pasado si caería a más de 10 días en el futuro. */
const anioDe = (hoy: Date, mes: number, dia: number) => (diasAtras(hoy, hoy.getUTCFullYear(), mes, dia) < -10 ? hoy.getUTCFullYear() - 1 : hoy.getUTCFullYear());

const DIA_SEMANA = /\b(?:hoy|ayer|anoche|anteanoche|anteayer|antier|hace|lunes|martes|miercoles|jueves|viernes|sabado|domingo|el \d{1,2}|\d{1,2}\/\d{1,2})\b/;
const RE_MES = new RegExp(`\\b(?:${MESES.join('|')})\\b`);

/**
 * Fechas que no se adivinan: se pregunta con botones que traen la frase ya con la fecha clara. null si no hay duda.
 * Va antes del resto del intérprete porque la frase sin la duda resuelta se anotaría con una fecha inventada.
 */
export function dudaDeFecha(texto: string, ctx: Contexto): Resultado | null {
  const t = limpiar(texto);
  if (/[?¿]/.test(texto)) return null;
  const hoy = new Date(ctx.ahora.getTime() + OFFSET_MS);
  const con = (de: string, por: string) => t.replace(de, por).replace(/\s+/g, ' ').trim();

  // «el 04/05»: si ninguna de las dos lecturas es reciente, no se sabe si es 4 de mayo o 5 de abril
  const am = t.match(/\bel (\d{1,2})\/(\d{1,2})\b(?!\/)/);
  if (am) {
    const a = Number(am[1]), b = Number(am[2]);
    const reciente = (mes: number, dia: number) => { const d = diasAtras(hoy, anioDe(hoy, mes, dia), mes, dia); return d >= -10 && d <= 45; };
    if (a >= 1 && b >= 1 && a <= 12 && b <= 12 && a !== b && !reciente(b, a) && !reciente(a, b)) {
      const uno = `${a} de ${MESES[b - 1]}`, otro = `${b} de ${MESES[a - 1]}`;
      return { clase: 'pregunta', mensaje: `¿«${am[1]}/${am[2]}» es el ${uno} o el ${otro}?`, opciones: [
        { titulo: `${a} de ${MESES[b - 1]}`, frase: con(am[0], `el ${uno}`) },
        { titulo: `${b} de ${MESES[a - 1]}`, frase: con(am[0], `el ${otro}`) },
      ] };
    }
  }

  // «el fin de semana pasado»: no se inventa cuánto fue el sábado y cuánto el domingo
  const fin = t.match(/\b(?:el )?fin de semana pasado\b/);
  if (fin) {
    const atras = (hoy.getUTCDay() + 1) % 7 || 7; // días hasta el sábado anterior
    const sab = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - atras));
    const dom = new Date(sab.getTime() + 86400000);
    const dia = (d: Date) => `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
    return { clase: 'pregunta', mensaje: '¿Qué día del fin de semana fue? Si fue en los dos días, anótalo por partes, por ejemplo «el sábado 70k salida» y «el domingo 50k salida».', opciones: [
      { titulo: `Sábado ${dia(sab)}`, frase: con(fin[0], `el ${dia(sab)}`) },
      { titulo: `Domingo ${dia(dom)}`, frase: con(fin[0], `el ${dia(dom)}`) },
    ] };
  }

  // «a las doce y media de la noche» sin decir el día: puede ser anoche o cualquier otra noche
  const noche = t.match(/\ba las? (?:doce|una|dos|tres|cuatro|12|1|2|3|4)\b(?:[ :][a-z0-9]+){0,3}? de la (?:noche|madrugada)\b/);
  if (noche && !DIA_SEMANA.test(t) && !RE_MES.test(t)) {
    return { clase: 'pregunta', mensaje: '¿De qué noche fue? Si no fue anoche, escribe el día, por ejemplo «el 20 de noviembre a las 12:30 am».', opciones: [
      { titulo: 'Anoche', frase: `anoche ${t}` },
    ] };
  }
  return null;
}
