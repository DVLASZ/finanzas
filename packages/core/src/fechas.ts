/**
 * Fechas en hora de Colombia (UTC-5, sin horario de verano).
 *
 * Internamente se trabaja con un `Date` "corrido" 5 horas hacia atrás y se leen sus campos UTC:
 * así los getters UTC devuelven la hora local de Colombia sin importar dónde corra el código
 * (Cloudflare, tu PC o el celular).
 */

const OFFSET_MS = -5 * 3600 * 1000;
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
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
}

const RE_MESES = MESES.concat(['sept', ...MESES_CORTOS]).join('|');

/**
 * Busca "ayer", "anteayer", "el lunes", "hace 3 dias", "15/10", "15 de octubre", "a las 3pm"...
 * en un texto normalizado. Sin nada de eso la fecha es el instante del mensaje.
 */
export function hallarFecha(t: string, ahora: Date): FechaHallada {
  const c = new Date(ahora.getTime() + OFFSET_MS);
  let resto = t;
  let explicita = false;
  let invalida = false;
  const existe = (anio: number, mes: number, dia: number): boolean => {
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    return mes >= 1 && mes <= 12 && dia >= 1 && d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
  };
  const quitar = (re: RegExp): RegExpMatchArray | null => {
    const m = resto.match(re);
    if (m) resto = (resto.slice(0, m.index) + ' ' + resto.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim();
    return m;
  };
  const sumarDias = (n: number) => c.setUTCDate(c.getUTCDate() + n);

  // Hora: "a las 3pm", "a las 15:30", "4 pm", "4:30pm". Sin "a las" exige am/pm para no
  // confundirla con una cifra de dinero. "a las 4" a secas se toma como la tarde (nadie
  // anota un gasto de madrugada con la hora a medias).
  // El bot limpia el texto antes de llegar aquí y los dos puntos se vuelven espacio ("10:07 pm" llega
  // como "10 07 pm"), así que el separador de los minutos puede ser cualquiera de los dos.
  const hora = quitar(/\ba las (\d{1,2})(?:[: ](\d{2}))?\s?(am|pm)?\b/) ?? quitar(/\b(\d{1,2})(?:[: ](\d{2}))?\s?(am|pm)\b/);
  if (hora) {
    let h = Number(hora[1]);
    if (hora[3] === 'pm' && h < 12) h += 12;
    else if (hora[3] === 'am' && h === 12) h = 0;
    else if (!hora[3] && h >= 1 && h <= 6) h += 12;
    c.setUTCHours(h, Number(hora[2] ?? 0), 0, 0);
    explicita = true;
  }

  let m: RegExpMatchArray | null;
  if ((m = quitar(/\b(anteayer|antier|antes de ayer)\b/))) { sumarDias(-2); explicita = true; }
  else if ((m = quitar(/\bayer\b/))) { sumarDias(-1); explicita = true; }
  else if ((m = quitar(/\bhoy\b/))) { explicita = true; }
  else if ((m = quitar(/\bhace (\d{1,3}) dias?\b/))) { sumarDias(-Number(m[1])); explicita = true; }
  else if ((m = quitar(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : c.getUTCFullYear();
    if (existe(anio, Number(m[2]), Number(m[1]))) c.setUTCFullYear(anio, Number(m[2]) - 1, Number(m[1]));
    else invalida = true;
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:el )?(\\d{1,2}) de (${RE_MESES})\\b`)))) {
    if (existe(c.getUTCFullYear(), indiceMes(m[2]) + 1, Number(m[1]))) c.setUTCMonth(indiceMes(m[2]), Number(m[1]));
    else invalida = true;
    explicita = true;
  } else if ((m = quitar(new RegExp(`\\b(?:el )?(${DIAS.join('|')})( pasado)?\\b`)))) {
    let atras = (c.getUTCDay() - DIAS.indexOf(m[1]) + 7) % 7;
    if (atras === 0 && m[2]) atras = 7;
    sumarDias(-atras);
    explicita = true;
  }
  return { fecha: textoLocal(c), resto, explicita, invalida };
}

/**
 * Fecha límite de una deuda: "antes del 31 de octubre", "para el 31/10", "hasta fin de mes".
 * Devuelve 'YYYY-MM-DD' o null.
 */
export function hallarFechaLimite(t: string, ahora: Date): { fecha: string | null; resto: string } {
  const c = new Date(ahora.getTime() + OFFSET_MS);
  const anio = c.getUTCFullYear();
  const re1 = new RegExp(`\\b(?:antes del?|para el|hasta el|el)\\s+(\\d{1,2})\\s+de\\s+(${RE_MESES})\\b`);
  const re2 = /\b(?:antes del?|para el|hasta el)\s+(\d{1,2})\/(\d{1,2})\b/;
  const re3 = /\b(?:antes de|hasta|para)\s+(?:que\s+)?(?:fin|final|acabe|termine)(?:\s+del?)?\s+(?:el\s+)?mes\b|\bfin de mes\b|\bfinal del mes\b/;
  let m: RegExpMatchArray | null;
  let fecha: string | null = null;
  let resto = t;
  if ((m = t.match(re1))) fecha = `${anio}-${p2(indiceMes(m[2]) + 1)}-${p2(Number(m[1]))}`;
  else if ((m = t.match(re2))) fecha = `${anio}-${p2(Number(m[2]))}-${p2(Number(m[1]))}`;
  else if ((m = t.match(re3))) {
    const ultimo = new Date(Date.UTC(anio, c.getUTCMonth() + 1, 0)).getUTCDate();
    fecha = `${anio}-${p2(c.getUTCMonth() + 1)}-${p2(ultimo)}`;
  }
  if (m) resto = (t.slice(0, m.index) + ' ' + t.slice(m.index! + m[0].length)).replace(/\s+/g, ' ').trim();
  return { fecha, resto };
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
