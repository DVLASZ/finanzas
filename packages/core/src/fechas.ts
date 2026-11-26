/**
 * Fechas en hora de Colombia (UTC-5, sin horario de verano).
 *
 * Internamente se trabaja con un `Date` "corrido" 5 horas hacia atrás y se leen sus campos UTC:
 * así los getters UTC devuelven la hora local de Colombia sin importar dónde corra el código
 * (Cloudflare, tu PC o el celular).
 */

import { RE_RELATIVA, relativa } from './fechasRelativas.ts';

const OFFSET_MS = -5 * 3600 * 1000;
const DIAS =['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const p2 = (n: number) => String(n).padStart(2, '0');

/** Instante real -> 'YYYY-MM-DD HH:MM:SS' en hora de Colombia. */
export function aLocal(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** 'YYYY-MM-DD HH:MM:SS' (Colombia) -> instante real. */
export function deLocal(s: string): Date {
  return new Date(s.replace(' ', 'T') + '-05:00');
}

/** Fecha corrida (campos UTC = hora local) -> texto local. */
function textoLocal(c: Date): string {
  return c.toISOString().slice(0, 19).replace('T', ' ');
}

/** Índice del mes (0-11) a partir de "octubre", "oct", etc. o -1. */
export function indiceMes(palabra: string): number {
  const i = MESES.indexOf(palabra);
  if (i >= 0) return i;
  const j = MESES_CORTOS.indexOf(palabra === 'sept' ? 'sep' : palabra);
  return j;
}

export interface FechaHallada {
  /** Fecha y hora local resultante ('YYYY-MM-DD HH:MM:SS'). */
  fecha: string;
  /** El texto sin la parte de fecha. */
  resto: string;
  /** true si el mensaje decía una fecha/hora; false = es "ahora". */
  explicita: boolean;
  /** true si dijo un día que no existe («31 de febrero», «99/99»): no se adivina otra fecha. */
  invalida?: boolean;
  /** Por qué no sirve la fecha o la hora (para decírselo a la persona). */
  motivo?: string;
}

const RE_MESES = MESES.concat(['sept', ...MESES_CORTOS]).join('|');

/** ¿Existe ese día en el calendario? (mes de 1 a 12) */
const existe = (anio: number, mes: number, dia: number): boolean => {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return mes >= 1 && mes <= 12 && dia >= 1 && d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

/** Hasta cuántos días en el futuro se acepta una fecha de un movimiento sin año antes de pensar que es del año pasado. */
const FUTURO_MAX_DIAS = 10;
const MSG_NO_EXISTE = 'Esa fecha no existe. Revísala (por ejemplo «el 15/10» o «ayer»).';
const MSG_FUTURO = 'Esa fecha está en el futuro y un movimiento solo se anota cuando ya pasó. Escribe el día en que ocurrió, o nada para que sea ahora.';
const MSG_HORA = 'Esa hora no existe. Escríbela como «a las 3pm» o «15:30».';

const NUMEROS: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const RE_DIAS = DIAS.join('|');
/** Lo que, pegado a un número, lo vuelve plata (para no confundir «el 15 mil» con el día 15). */
const PLATA = '(?:(?:k|mil|lucas?|lukas?|palos?|barras?|millon(?:es)?|usd|dolar(?:es)?|pesos?|cop|por ciento)\\b|%)';
/** Minutos de una hora: «:30» siempre; « 30» solo si lo que sigue no es plata («a las 12 15 mil» son las 12 y 15 mil pesos). */
const MINUTOS = `(?::(\\d{2})(?!\\d)|[ ](\\d{2})(?![\\d.,])(?! ?${PLATA}))`;

/**
 * Busca "ayer", "anteayer", "el lunes", "hace 3 dias", "15/10", "15 de octubre", "a las 3pm"...
 * en un texto normalizado. Sin nada de eso la fecha es el instante del mensaje.
 *
 * Una fecha sin año que caería a más de 10 días en el futuro es del año pasado («28/12» escrito en enero).
 * Con año explícito en el futuro, o con «mañana», no se adivina: se marca `invalida` con el motivo.
 */
export function hallarFecha(t: string, ahora: Date): FechaHallada {
  const c = new Date(ahora.getTime() + OFFSET_MS);
  const hoyMs = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
  let resto = t;
  let explicita = false;
  let invalida = false;
  let motivo: string | undefined;
  let conHora = false;
  let diaConPalabra = false;
  const falla = (m: string) => { invalida = true; motivo ??= m; };
  const quitar = (re: RegExp, ok?: (m: RegExpMatchArray) => boolean): RegExpMatchArray | null => {
    const m = resto.match(re);
    if (!m || (ok && !ok(m))) return null;
    resto = (resto.slice(0, m.index) + ' ' + resto.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim();
    return m;
  };
  const sumarDias = (n: number) => c.setUTCDate(c.getUTCDate() + n);
  /** Días que faltan para esa fecha desde hoy (negativo si ya pasó). */
  const faltan = (anio: number, mes: number, dia: number) => Math.round((Date.UTC(anio, mes - 1, dia) - hoyMs) / 86400000);
  const ponerDia = (anio: number, mes: number, dia: number) => c.setUTCFullYear(anio, mes - 1, dia);
  /** Día y mes sin año: el de este año, o el del pasado si caería a más de 10 días en el futuro. */
  const sinAnio = (mes: number, dia: number) => {
    let y = c.getUTCFullYear();
    if (!existe(y, mes, dia)) return falla(MSG_NO_EXISTE);
    if (faltan(y, mes, dia) > FUTURO_MAX_DIAS) y--;
    if (!existe(y, mes, dia)) return falla(MSG_NO_EXISTE);
    ponerDia(y, mes, dia);
  };
  const conAnio = (y: number, mes: number, dia: number) => {
    if (!existe(y, mes, dia)) return falla(MSG_NO_EXISTE);
    if (faltan(y, mes, dia) > FUTURO_MAX_DIAS) return falla(MSG_FUTURO);
    ponerDia(y, mes, dia);
  };
  const anioDe = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  const diaDe = (s: string) => (s === 'primero' ? 1 : Number(s));
  const mes = (s: string) => indiceMes(s) + 1;
  /** El último día N que ya llegó: este mes, o el más reciente anterior que lo tenga. */
  const ultimoDia = (dia: number, semana?: number) => {
    for (let k = 0; k < 14; k++) {
      const f = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - k, 1));
      const y = f.getUTCFullYear(), m = f.getUTCMonth() + 1;
      if (!existe(y, m, dia) || faltan(y, m, dia) > 0) continue;
      if (semana !== undefined && new Date(Date.UTC(y, m - 1, dia)).getUTCDay() !== semana) continue;
      return ponerDia(y, m, dia);
    }
    if (semana !== undefined) return ultimoDia(dia);
    falla(MSG_NO_EXISTE);
  };
  /** Una hora del día suelta («esta tarde», «anoche»): si todavía no llega, se queda en este instante. */
  const aHora = (h: number) => {
    if (conHora) return;
    const antes = c.getTime();
    c.setUTCHours(h, 0, 0, 0);
    if (c.getTime() > antes && Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()) === hoyMs) c.setTime(antes);
  };

  // Hora: "a las 3pm", "a las 15:30", "4 pm", "4:30pm", "a las 3 y media", "a las 8 de la noche", "12:30".
  // Sin "a las" exige am/pm o los dos puntos para no confundirla con una cifra de dinero. "a las 4" a secas
  // se toma como la tarde (nadie anota un gasto de madrugada con la hora a medias), y de noche si se habla de cena.
  // Los dos puntos llegan tal cual desde `limpiar` solo cuando son de una hora; con espacio también vale ("10 07 pm").
  const hora = quitar(new RegExp(`\\ba las (\\d{1,2})(?!\\d)(?:${MINUTOS})?(?: y (media|cuarto)| menos cuarto| en punto)?(?: ?(am|pm)\\b)?(?: (?:de|en|por) la (manana|tarde|noche|madrugada)\\b)?`))
    ?? quitar(new RegExp(`\\b(\\d{1,2})(?:${MINUTOS})? ?(am|pm)\\b`))
    ?? quitar(/(?<![\d:.,])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/);
  if (hora) {
    const aLas = hora[0].startsWith('a las');
    let h = Number(hora[1]);
    let min: number;
    let ampm: string | undefined;
    let periodo: string | undefined;
    if (aLas) {
      min = Number(hora[2] ?? hora[3] ?? 0);
      if (hora[4] === 'media') min = 30;
      else if (hora[4] === 'cuarto') min = 15;
      else if (/menos cuarto/.test(hora[0])) { min = 45; h -= 1; }
      ampm = hora[5];
      periodo = hora[6];
    } else if (hora[0].includes(':') && !/(am|pm)$/.test(hora[0])) {
      min = Number(hora[2]);
    } else {
      min = Number(hora[2] ?? hora[3] ?? 0);
      ampm = hora[4];
    }
    if (h < 0 || h > 23 || min > 59) falla(MSG_HORA);
    else {
      const pm = ampm === 'pm' || periodo === 'tarde' || periodo === 'noche';
      const am = ampm === 'am' || periodo === 'manana' || periodo === 'madrugada';
      if (pm && h < 12) h += 12;
      else if (am && h === 12) h = 0;
      else if (periodo === 'noche' && h === 12) h = 0;
      else if (!pm && !am && h >= 1 && h <= 6) h += 12;
      else if (!pm && !am && h >= 7 && h <= 11 && /\b(cena|cenar|noche)\b/.test(t)) h += 12;
      c.setUTCHours(h, min, 0, 0);
    }
    conHora = true;
    explicita = true;
  }

  let m: RegExpMatchArray | null;
  const PIDE_MES = `(${RE_MESES})`;
  const DIA_MES = '(\\d{1,2}|primero)';
  if ((m = quitar(RE_RELATIVA))) {
    // «anteanoche», «el 15 del mes pasado», «el último día del mes pasado» (ver fechasRelativas.ts)
    const r = relativa(m, c);
    if (!r) falla(MSG_NO_EXISTE);
    else { ponerDia(r.anio, r.mes, r.dia); if (r.noche) aHora(20); }
    explicita = true;
  } else if ((m = quitar(/\b(anteayer|antier|antes de ayer)\b/))) { sumarDias(-2); explicita = diaConPalabra = true; }
  else if ((m = quitar(/\bayer\b/))) { sumarDias(-1); explicita = diaConPalabra = true; }
  else if ((m = quitar(/\banoche\b/))) { sumarDias(-1); aHora(20); explicita = true; }
  else if ((m = quitar(/\bhoy\b/))) { explicita = diaConPalabra = true; }
  else if ((m = quitar(/\bhace (\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) (dias?|semanas?|meses|mes)\b/))) {
    const n = NUMEROS[m[1]] ?? Number(m[1]);
    if (m[2].startsWith('dia')) sumarDias(-n);
    else if (m[2].startsWith('semana')) sumarDias(-7 * n);
    else c.setUTCMonth(c.getUTCMonth() - n);
    explicita = true;
  } else if ((m = quitar(/\b(?:la )?semana pasada\b/))) { sumarDias(-7); explicita = true; }
  else if ((m = quitar(/\bpasado manana\b/)) ?? (m = quitar(/(?<!\b(?:la|esta|cada|toda|una) )\bmanana\b/))) { falla(MSG_FUTURO); explicita = true; }
  else if ((m = quitar(/\besta (manana|tarde|noche)\b/))) { aHora(m[1] === 'manana' ? 9 : m[1] === 'tarde' ? 15 : 20); explicita = true; }
  else if ((m = quitar(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, x => existe(Number(x[1]), Number(x[2]), Number(x[3]))))) {
    conAnio(Number(m[1]), Number(m[2]), Number(m[3]));
    explicita = true;
  } else if ((m = quitar(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    if (m[3]) conAnio(anioDe(m[3]), Number(m[2]), Number(m[1]));
    else sinAnio(Number(m[2]), Number(m[1]));
    explicita = true;
  } else if ((m = quitar(/(?<![\d/-])(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?(?![\d/-])/, x => (Boolean(x[3]) || Number(x[1]) > 12) && existe(x[3] ? anioDe(x[3]) : 2024, Number(x[2]), Number(x[1]))))) {
    if (m[3]) conAnio(anioDe(m[3]), Number(m[2]), Number(m[1]));
    else sinAnio(Number(m[2]), Number(m[1]));
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:(?:el )?(?:${RE_DIAS}) )?(?:el )?${DIA_MES} (?:de )?${PIDE_MES}(?: (?:de |del )?(\\d{4}))?\\b`)))) {
    if (m[3]) conAnio(Number(m[3]), mes(m[2]), diaDe(m[1]));
    else sinAnio(mes(m[2]), diaDe(m[1]));
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b${PIDE_MES} (\\d{1,2})(?: (?:de |del )?(\\d{4}))?\\b(?![.,]?\\d)(?! ?${PLATA})`)))) {
    if (m[3]) conAnio(Number(m[3]), mes(m[1]), Number(m[2]));
    else sinAnio(mes(m[1]), Number(m[2]));
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:el )?(${RE_DIAS})(?: pasado)? (\\d{1,2})\\b(?![.,]?\\d)(?! ?${PLATA})`)))) {
    ultimoDia(Number(m[2]), DIAS.indexOf(m[1]));
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:el )?pasado (${RE_DIAS})\\b`))) || (m = quitar(new RegExp(`\\b(?:el )?(${RE_DIAS})( pasado)?\\b`)))) {
    let atras = (c.getUTCDay() - DIAS.indexOf(m[1]) + 7) % 7;
    if (atras === 0 && (m[2] || /^(?:el )?pasado/.test(m[0]))) atras = 7;
    sumarDias(-atras);
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:el|dia) (\\d{1,2}|primero)\\b(?![.,]?\\d)(?! ?${PLATA})(?! de )`)))) {
    ultimoDia(diaDe(m[1]));
    explicita = true;
  } else if ((m = quitar(/\b(?:en|desde|a) la quincena\b/))) {
    // la quincena más reciente: el 15 o el último día del mes, lo que haya llegado después
    const dia = c.getUTCDate();
    if (dia >= 15) ponerDia(c.getUTCFullYear(), c.getUTCMonth() + 1, 15);
    else c.setUTCDate(0);
    explicita = true;
  } else if ((m = quitar(/\b(?:a |en |al )?(?:fin|final|finales) del? mes\b/))) {
    // el último día del mes que ya terminó (o de este mes si hoy es ese día)
    const ultimo = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)).getUTCDate();
    if (c.getUTCDate() === ultimo) { /* hoy es fin de mes */ } else c.setUTCDate(0);
    explicita = true;
  }
  // «ayer por la tarde», «hoy en la mañana»: la hora de esa parte del día, si no dijeron una
  if (diaConPalabra && (m = quitar(/\b(?:por|en|de) la (manana|tarde|noche)\b/))) aHora(m[1] === 'manana' ? 9 : m[1] === 'tarde' ? 15 : 20);
  return { fecha: textoLocal(c), resto, explicita, invalida, ...(motivo ? { motivo } : {}) };
}

/**
 * Fecha límite de una deuda: "antes del 31 de octubre", "para el 31/10", "para el 20", "hasta fin de mes".
 * Devuelve 'YYYY-MM-DD' o null. Sin año vale el de este año, o el que viene si ese día ya pasó
 * («antes del 15 de enero» escrito en diciembre). Una fecha que no existe («31 de febrero») no se
 * quita del texto: así la lee `hallarFecha` y avisa que no existe.
 */
export function hallarFechaLimite(t: string, ahora: Date): { fecha: string | null; resto: string } {
  const c = new Date(ahora.getTime() + OFFSET_MS);
  const anio = c.getUTCFullYear();
  const hoyMs = Date.UTC(anio, c.getUTCMonth(), c.getUTCDate());
  const re1 = new RegExp(`\\b(?:antes del?|para el|hasta el|el)\\s+(\\d{1,2})\\s+de\\s+(${RE_MESES})(?:\\s+(?:de|del)\\s+(\\d{4}))?\\b`);
  const re2 = /\b(?:antes del?|para el|hasta el)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const re3 = /\b(?:antes de|hasta|para)\s+(?:que\s+)?(?:fin|final|acabe|termine)(?:\s+del?)?\s+(?:el\s+)?mes\b|\bfin de mes\b|\bfinal del mes\b/;
  const re4 = new RegExp(`\\b(?:antes del?|para el|hasta el)\\s+(\\d{1,2})\\b(?![.,/]?\\d)(?!\\s*(?:de\\b|${PLATA}))`);
  const p2 = (n: number) => String(n).padStart(2, '0');
  /** Día y mes, con año o sin él: sin año, el próximo que no haya pasado. */
  const armar = (dia: number, mes: number, anioDicho?: number): string | null => {
    let y = anioDicho ?? anio;
    if (!existe(y, mes, dia)) return null;
    if (anioDicho === undefined && Date.UTC(y, mes - 1, dia) < hoyMs) { y++; if (!existe(y, mes, dia)) return null; }
    return `${y}-${p2(mes)}-${p2(dia)}`;
  };
  let m: RegExpMatchArray | null;
  let fecha: string | null = null;
  if ((m = t.match(re1))) fecha = armar(Number(m[1]), indiceMes(m[2]) + 1, m[3] ? Number(m[3]) : undefined);
  else if ((m = t.match(re2))) fecha = armar(Number(m[1]), Number(m[2]), m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined);
  else if ((m = t.match(re3))) {
    const ultimo = new Date(Date.UTC(anio, c.getUTCMonth() + 1, 0)).getUTCDate();
    fecha = `${anio}-${p2(c.getUTCMonth() + 1)}-${p2(ultimo)}`;
  } else if ((m = t.match(re4))) {
    // solo el día: el de este mes si todavía no pasa, o el del que viene
    const dia = Number(m[1]);
    for (let k = 0; k < 3 && !fecha; k++) {
      const f = new Date(Date.UTC(anio, c.getUTCMonth() + k, 1));
      const y = f.getUTCFullYear(), mm = f.getUTCMonth() + 1;
      if (existe(y, mm, dia) && Date.UTC(y, mm - 1, dia) >= hoyMs) fecha = `${y}-${p2(mm)}-${p2(dia)}`;
    }
  }
  // fecha imposible: no se toca el texto para que `hallarFecha` diga que no existe
  if (!m || !fecha) return { fecha: null, resto: t };
  return { fecha, resto: (t.slice(0, m.index) + ' ' + t.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim() };
}

function hora12(local: string): string {
  const h = Number(local.slice(11, 13));
  return `${h % 12 || 12}:${local.slice(14, 16)} ${h < 12 ? 'am' : 'pm'}`;
}

/** "hoy 3:42 pm", "ayer 3:42 pm", "lun 12 oct 3:42 pm" (sin hora si solo se conoce el día). */
export function describirFecha(local: string, ahora: Date, sinHora = false): string {
  const hoy = aLocal(ahora).slice(0, 10);
  const dia = local.slice(0, 10);
  const diff = Math.round((Date.parse(hoy) - Date.parse(dia)) / 86400000);
  const h = sinHora ? '' : ' ' + hora12(local);
  if (diff === 0) return 'hoy' + h;
  if (diff === 1) return 'ayer' + h;
  const f = new Date(Date.parse(dia));
  const anio = dia.slice(0, 4) === hoy.slice(0, 4) ? '' : ` ${dia.slice(0, 4)}`;
  return `${DIAS_CORTOS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES_CORTOS[f.getUTCMonth()]}${anio}${h}`;
}

/** 'YYYY-MM-DD' -> "31 oct". */
export function describirDia(dia: string): string {
  return `${Number(dia.slice(8, 10))} ${MESES_CORTOS[Number(dia.slice(5, 7)) - 1]}`;
}

/** Rango [desde, hasta) del periodo que contiene `ahora`: semana (lunes a domingo), mes o año. */
export function rangoPeriodo(periodo: 'semana' | 'mes' | 'anio', ahora: Date): { desde: string; hasta: string } {
  const c = new Date(ahora.getTime() + OFFSET_MS);
  const dia = (d: Date) => d.toISOString().slice(0, 10) + ' 00:00:00';
  if (periodo === 'mes') {
    return {
      desde: dia(new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1))),
      hasta: dia(new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1))),
    };
  }
  if (periodo === 'anio') {
    return {
      desde: dia(new Date(Date.UTC(c.getUTCFullYear(), 0, 1))),
      hasta: dia(new Date(Date.UTC(c.getUTCFullYear() + 1, 0, 1))),
    };
  }
  const atras = (c.getUTCDay() + 6) % 7; // lunes = 0
  const lunes = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() - atras));
  const siguiente = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate() - atras + 7));
  return { desde: dia(lunes), hasta: dia(siguiente) };
}

/** Nombre del mes: "octubre". */
export function nombreMes(local: string): string {
  return MESES[Number(local.slice(5, 7)) - 1];
}
