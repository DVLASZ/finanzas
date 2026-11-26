/**
 * Préstamos cruzados y deudas que se arreglan sin plata: vencimiento de un préstamo («le presté 90k a Pipe hasta el
 * viernes»), abonos dichos junto con la deuda («le debía 200 mil a Diana y le pasé 75») y frases que no mueven
 * efectivo (perdonar una deuda, intereses, pesos contra dólares). Lo que no se puede anotar bien se explica y se
 * pregunta: nunca sale un gasto o un ingreso que no pasó.
 */
import { hallarFechaLimite } from './fechas.ts';
import { formatear, hallarMontos } from './dinero.ts';
import { capitalizar, limpiar, normalizar } from './texto.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIA_EN_LETRAS = ['primero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis',
  'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno'];
const RE_DIA = `(\\d{1,2}|${[...DIA_EN_LETRAS].reverse().join('|')}|uno)`;
const RE_SEMANA = `(${DIAS.join('|')})`;
// «hasta el», «para el», «antes del», o «me los paga el», «me lo devuelve el»
const ANTES = `(?:(?:hasta|para|antes de|antes del)(?: el)?|me (?:(?:lo|la|los|las) )?(?:paga|pagara|va a pagar|devuelve|devolvera|va a devolver|regresa|cancela)(?: el| para el| antes del?| hasta el)?)`;

const LOCAL_MS = -5 * 3600 * 1000; // Colombia no cambia de hora

/**
 * La fecha límite de un préstamo que tú hiciste: la frase sin ese pedazo (con las palabras como se escribieron) y la
 * fecha AAAA-MM-DD. Un día de la semana es el próximo (hoy no cuenta); «el quince» es el próximo 15 que no haya pasado.
 */
export function vencimientoDePrestamo(texto: string, ahora: Date): { fecha: string; resto: string } | null {
  const palabras = texto.trim().split(/\s+/);
  const norm = palabras.map(w => normalizar(w).replace(/[^a-z0-9/]/g, ''));
  const t = norm.join(' ');
  if (!/\b(?:preste|prestamo|le solte|le pase|le di|le fie)\b/.test(t) || /\bme (?:presto|prestaron)\b/.test(t)) return null;
  let m: RegExpMatchArray | null;
  let fecha: string | null = null;
  if ((m = t.match(new RegExp(`\\b${ANTES} ${RE_SEMANA}\\b`)))) {
    const c = new Date(ahora.getTime() + LOCAL_MS);
    const adelante = ((DIAS.indexOf(m[1]) - c.getUTCDay() + 7) % 7) || 7;
    fecha = new Date(c.getTime() + adelante * 86400000).toISOString().slice(0, 10);
  } else if ((m = t.match(new RegExp(`\\b${ANTES} ${RE_DIA}(?: de ([a-z]+)(?: de (\\d{4}))?)?\\b(?! ?(?:k|mil|lucas?|barras?|pesos?)\\b)`)))) {
    const dia = /^\d/.test(m[1]) ? Number(m[1]) : m[1] === 'uno' ? 1 : DIA_EN_LETRAS.indexOf(m[1]) + 1;
    fecha = hallarFechaLimite(`para el ${dia}${m[2] ? ` de ${m[2]}` : ''}${m[3] ? ` de ${m[3]}` : ''}`, ahora).fecha;
  } else if ((m = t.match(/\b(?:hasta|para|antes de) (?:fin|final) del? mes\b/)) || (m = t.match(new RegExp(`\\b${ANTES} \\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b`)))) {
    fecha = hallarFechaLimite(m[0].replace(new RegExp(`^${ANTES}`), 'para el'), ahora).fecha;
  }
  if (!m || !fecha) return null;
  // de índice de letra a índice de palabra, para quitar el pedazo de la frase original
  const desde = t.slice(0, m.index).split(' ').length - 1;
  const hasta = desde + m[0].split(' ').length;
  return { fecha, resto: [...palabras.slice(0, desde), ...palabras.slice(hasta)].join(' ') };
}

type Pregunta = { mensaje: string; opciones: { titulo: string; frase: string }[] };

/** «75» junto a «200 mil» son 75 mil: un número suelto y pequeño toma la escala de la otra cifra. */
function escalar(segundo: number, primero: number): number {
  return segundo < 1000 && primero >= 1000 ? segundo * 1000 : segundo;
}

const pesos = (n: number): string => formatear(n, 'COP');

/**
 * Frases de deudas que no se anotan tal como vienen. Devuelve una frase para leer en su lugar o una pregunta;
 * null si no es una de estas.
 */
export function cruzado(texto: string): { texto?: string; pregunta?: Pregunta } | null {
  const t = limpiar(texto);
  const montos = hallarMontos(t);
  if (!montos.length) return null;
  const MONTO = String.raw`(\d[\d.,]*(?:\s?(?:k|mil|lucas?|barras?))?)`;
  const valor = (s: string): number => hallarMontos(s)[0]?.valor ?? 0;

  // «perdónale los 15k que me debía Pedro», «de los 80 mil que me debe Felipe le perdono 20»: perdonar no mueve plata
  if (/\b(?:perdono|perdone|perdonale|perdonarle|perdonar|perdonamos|condono|condone|condonar|condonale)\b/.test(t) && /\b(?:debe|debia|deuda|preste)\b/.test(t)) {
    const nombre = t.match(/\b(?:me debe|me debia|preste \S+ a|deuda de) ([a-z]+)\b/)?.[1];
    const quien = nombre ? capitalizar(nombre) : 'esa persona';
    return { pregunta: {
      mensaje: `Perdonar una deuda no mueve plata, así que no lo anoto como gasto ni como ingreso. Si perdonas todo lo que te debe ${quien}, escribe «saldar la deuda con ${quien}». Si es solo una parte, ¿cuánto te queda debiendo?`,
      opciones: nombre ? [{ titulo: `Saldar con ${quien}`, frase: `saldar la deuda con ${nombre}` }] : [],
    } };
  }

  // «le presté 100 dólares a Andrés y me devolvió 200 mil pesos»: sin una tasa no se cierra una deuda en otra moneda
  const enDolares = montos.find(x => x.moneda === 'USD');
  const enPesos = montos.find(x => x.moneda === null && x.explicito);
  if (/\bpreste\b/.test(t) && enDolares && enPesos && enDolares.inicio < enPesos.inicio && /\bme (?:devolvio|pago|abono|regreso)\b/.test(t)) {
    const prestamo = t.slice(0, t.search(/\s+y\s+(?:me|el|ella)\b/)).trim();
    return { pregunta: {
      mensaje: `Le prestaste en dólares y te devolvió en pesos. Sin una tasa no puedo cerrar la deuda ni pasar los pesos a dólares. ¿Anoto solo el préstamo y el pago lo escribes en dólares?`,
      opciones: prestamo ? [{ titulo: 'Solo el préstamo', frase: prestamo }] : [],
    } };
  }

  // «me debía 100k y me pagó 110k porque acordamos 10 de interés»: el capital y el interés van por separado
  const interes = t.match(new RegExp(`${MONTO} (?:de |por )?(?:interes|intereses)\\b`));
  if (interes && montos.length >= 2 && /\bme (?:debia|debe|pago|devolvio|abono)\b/.test(t)) {
    const capital = montos[0].valor;
    const extra = escalar(valor(interes[1]), capital);
    const nombre = t.match(/^([a-z]+) me (?:debia|debe)\b/)?.[1];
    const quien = nombre ? capitalizar(nombre) : 'Ana';
    return { pregunta: {
      mensaje: `El capital y el interés van separados: ${pesos(capital)} de abono a la deuda y ${pesos(extra)} de ingreso por intereses. ${nombre ? '¿Los anoto así?' : '¿Quién te pagó? Escríbelo en dos líneas, por ejemplo:'} «${quien} me pagó ${capital}» y «ingreso ${extra} intereses».`,
      opciones: nombre ? [{ titulo: 'Anotar los dos', frase: `${nombre} me pagó ${capital}\ningreso ${extra} intereses` }] : [],
    } };
  }

  // «le pasé 100k a Mateo y me devolvió 25 al rato»: un préstamo y un abono, o un pago y su vuelto; se pregunta
  const pasoYVolvio = t.match(new RegExp(`^(?:hoy |ayer )?le (?:pase|di|mande|preste) ${MONTO} a ([a-z]+) y (?:el |ella )?me (?:devolvio|regreso|abono) ${MONTO}`));
  if (pasoYVolvio) {
    const salio = valor(pasoYVolvio[1]);
    const volvio = escalar(valor(pasoYVolvio[3]), salio);
    const n = pasoYVolvio[2];
    return { pregunta: {
      mensaje: `¿Le prestaste ${pesos(salio)} a ${capitalizar(n)} y te devolvió ${pesos(volvio)}?`,
      opciones: [
        { titulo: 'Sí, préstamo y abono', frase: `le presté ${salio} a ${n}\n${n} me devolvió ${volvio}` },
        { titulo: 'No, le pagué', frase: `pagué ${salio - volvio} a ${n}` },
      ],
    } };
  }

  // «le debía 200 mil a Diana y le pasé 75 hoy»: lo que se paga hoy es un abono a esa deuda, no un gasto
  const abono = t.match(new RegExp(`^(?:a ([a-z]+) )?(?:yo )?le debia ${MONTO}(?: a ([a-z]+))? y (?:hoy |ya )?(?:le )?(?:pase|pague|abone|di|devolvi|mande) ${MONTO}(.*)$`));
  const nombreAbono = abono ? abono[1] ?? abono[3] : undefined;
  if (abono && nombreAbono) {
    const pagado = escalar(valor(abono[4]), valor(abono[2]));
    return { texto: `pagué ${pagado} a ${nombreAbono}${abono[5]}`.trim() };
  }

  // «entre mi hermana y yo debíamos 120k de la luz yo pagué 90»: solo es tuyo lo que pagaste tú
  const parte = t.match(new RegExp(`\\bdebiamos ${MONTO} (?:de |del |de la |por )?(?:la |el )?([a-z ]+?) (?:y )?(?:yo )?(?:pague|puse) ${MONTO}(.*)$`));
  if (parte) {
    const mio = escalar(valor(parte[3]), valor(parte[1]));
    return { texto: `${parte[2]} ${mio}${parte[4]}`.trim() };
  }
  return null;
}
