/**
 * Lo que hace el teclado del celular y su autocorrector: «gaste15mil», «nequi50mil a Jorge», «neki», «targeta», «resivo de la lus».
 * Corre al principio, después de sanitizar.ts, y devuelve el mismo mensaje ya limpio o una pregunta cuando adivinar sería
 * peligroso («mkl», «quitas», «mecsto», «una playa de 50k», una transferencia sin decir si salió o llegó).
 *
 * Reglas para no inventar: las correcciones seguras son palabras que no existen en español («resivo», «lus»); las dudosas
 * se preguntan; «playa» nunca se cambia por «plata» (solo se pregunta cuando la frase suena a plata que llegó). Solo mira
 * frases sueltas: un mensaje largo o de varias líneas (una alerta del banco) pasa sin tocarse.
 */
import { conoceLaPalabra } from './fuzzy.ts';
import { formatear, hallarMontos } from './dinero.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Movil {
  texto: string;
  pregunta?: { mensaje: string; opciones: { titulo: string; frase: string }[] };
}

const UNIDAD = '(?:k|mil|lucas?|lukas?|palos?|millones|millon)';
const MONTO = String.raw`\d[\d.,]*(?:\s?${UNIDAD})?`;

const FUNCION = new Set(['me', 'te', 'le', 'lo', 'la', 'los', 'las', 'de', 'del', 'en', 'a', 'y', 'por', 'pa', 'para', 'con', 'un', 'una', 'que', 'se', 'mi', 'su', 'al', 'unos', 'unas', 'el']);

/** Palabras que no existen y se corrigen sin preguntar (clave sin tildes). */
const SEGURAS: Record<string, string> = {
  neki: 'nequi', nekii: 'nequi', dabiplata: 'daviplata', daviplta: 'daviplata', targeta: 'tarjeta', tarjetas: 'tarjetas', efecivo: 'efectivo', efectio: 'efectivo',
  trsnferencia: 'transferencia', tranferencia: 'transferencia', transferenia: 'transferencia', debovio: 'devolvio', devia: 'debia',
  resivo: 'recibo', resivos: 'recibos', resibo: 'recibo', resibos: 'recibos', lus: 'luz', trasporte: 'transporte', enerjia: 'energia',
  farmasia: 'farmacia', parquedero: 'parqueadero', natual: 'natural', asosiasion: 'asociacion', comuda: 'comida', serca: 'cerca', yego: 'llego', yegaron: 'llegaron',
};

/**
 * Parte una tira de letras pegadas en palabras: las conocidas o de función, y como mucho una desconocida de 3 letras o más
 * («cafesde» es «cafes» y «de»). Devuelve null si no se puede cubrir entera o si ninguna pieza es conocida.
 */
function partir(tira: string, conoce: (w: string) => boolean): string[] | null {
  const plano = [...tira].map(ch => ch.normalize('NFD')[0]).join('').toLowerCase();
  const n = plano.length;
  // mejor[i][u]: la partición más corta de los primeros i caracteres con u palabras desconocidas
  const mejor: (string[] | null)[][] = Array.from({ length: n + 1 }, () => [null, null]);
  mejor[0][0] = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      const pieza = plano.slice(j, i);
      const conocida = FUNCION.has(pieza) || (pieza.length >= 3 && conoce(pieza));
      for (const u of [0, 1]) {
        const antes = mejor[j][u];
        if (!antes) continue;
        const u2 = conocida ? u : u + 1;
        if (u2 > 1 || (!conocida && pieza.length < 3)) continue;
        const previa = mejor[i][u2];
        if (!previa || antes.length + 1 < previa.length) mejor[i][u2] = [...antes, tira.slice(j, i)];
      }
    }
  }
  const sol = mejor[n][0] ?? mejor[n][1];
  return sol && (sol.length > 1 || mejor[n][0]) ? sol : null;
}

/** «gaste15mil» -> «gaste 15 mil»; «20kcomida» -> «20k comida»; solo tocan las palabras con cifra + unidad pegadas a letras. */
function separarPegadas(texto: string, conoce: (w: string) => boolean): string {
  return texto.split(/(\s+)/).map(tok => {
    if (!/\p{L}/u.test(tok) || !/\d/.test(tok) || tok.length < 5) return tok;
    if (!new RegExp(String.raw`\d${UNIDAD}(?![\d])`, 'iu').test(tok)) return tok;
    const runs = tok.match(/\p{L}+|\d[\d.,]*/gu);
    if (!runs || runs.length < 2) return tok;
    const salida: string[] = [];
    let tras = false;
    for (const r of runs) {
      if (/^\d/.test(r)) { salida.push(r); tras = true; continue; }
      let resto = r;
      if (tras) {
        // la unidad pegada al número («mil», «k»): la más larga que deja un resto que se pueda leer
        const opciones = ['millones', 'millon', 'lucas', 'luca', 'lukas', 'luka', 'palos', 'palo', 'mil', 'k'].filter(x => r.toLowerCase().startsWith(x));
        const elegida = opciones.find(x => { const sobra = r.slice(x.length); return !sobra || partir(sobra, conoce); });
        // sin unidad pegada («2cafes»): el número queda solo y las letras se leen como palabras
        if (elegida === 'k') salida[salida.length - 1] += 'k'; else if (elegida) salida.push(r.slice(0, elegida.length));
        resto = elegida ? r.slice(elegida.length) : r;
      }
      tras = false;
      if (resto) {
        const trozos = conoce(resto.toLowerCase()) ? [resto] : partir(resto, conoce);
        if (!trozos) return tok;
        salida.push(...trozos);
      }
    }
    return salida.join(' ');
  }).join('');
}

/** «2 millones 300» es 2.300.000 («2 millones 300 mil» también). */
function millonesHablados(texto: string): string {
  return texto.replace(/(\d+)\s*millon(?:es)?\s+(\d{1,3})(?:\s*(?:mil|k))?(?![\d.,]*\s*(?:mil|k)\b)/giu, (_m, a: string, b: string) => String(Number(a) * 1_000_000 + Number(b) * 1000));
}

function corregirSeguras(texto: string): string {
  return texto.split(/(\s+)/).map((tok, i, todo) => {
    const m = /^([^\p{L}\p{N}]*)(\p{L}+)([^\p{L}\p{N}]*)$/u.exec(tok);
    if (!m) return tok;
    const w = limpiar(m[2]);
    const previa = limpiar(todo[i - 2] ?? '');
    let nueva = SEGURAS[w];
    if (!nueva && w === 'marcado' && /^(?:en|de|del|el)$/.test(previa)) nueva = 'mercado';
    if (!nueva && w === 'consigno' && previa === 'me') nueva = 'consignó';
    if (!nueva) return tok;
    return m[1] + (/^\p{Lu}/u.test(m[2]) ? nueva[0].toUpperCase() + nueva.slice(1) : nueva) + m[3];
  }).join('');
}

const monto = (t: string): number | null => hallarMontos(limpiar(t))[0]?.valor ?? null;
const peso = (n: number): string => formatear(n, 'COP');

/** Lo que llegó para guardar, entregar o pagar algo de otro no es un ingreso: se anota como lo que se le debe a quien lo dejó. */
function custodia(texto: string): string | null {
  const re = new RegExp(String.raw`^(.*?)\bme\s+(?:mando|giro|dio|consigno|envio|paso|dejo|transfirio|mandaron|giraron|dieron|consignaron)\s+(${MONTO})(?:\s+(?:por|en|de|desde)\s+\p{L}+)?\s+(?:pa|para)\s+(?:que\s+)?(?:se\s+)?(?:(?:los|las|lo|la)\s+)?(?:guard\p{L}*|entreg\p{L}*|pagar)\b[^,;]*`, 'iu');
  const m = re.exec(limpiarTildes(texto));
  if (!m) return null;
  const quien = texto.slice(0, m[1].length).trim().replace(/^(?:y|pero|luego|despues)\s+/i, '').replace(/^(?:la|el|mi|mis)\s+/i, '');
  if (!quien || quien.split(/\s+/).length > 3 || /\d/.test(quien)) return null;
  return `me presto ${quien} ${m[2]}${texto.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
}

/** Para que los índices del texto con tildes y sin tildes coincidan se cambia letra por letra. */
function limpiarTildes(s: string): string {
  return [...s].map(ch => ch.normalize('NFD')[0]).join('');
}

const PERSONA = String.raw`(\p{L}{3,}(?:\s\p{L}{3,})?)`;

export function normalizarMovil(original: string, ctx: Contexto): Movil {
  if (original.length > 200 || /\n/.test(original)) return { texto: original };
  const conoce = conoceLaPalabra(ctx);
  let texto = separarPegadas(original, conoce);
  texto = millonesHablados(texto);
  texto = corregirSeguras(texto);
  texto = texto.replace(new RegExp(String.raw`\b(saque|retire|saco|retiro)\s+(${MONTO})\s+cajero\b`, 'iu'), '$1 $2 del cajero'); // «saque 100 mil cajero» sin «del» es el retiro de siempre
  const t = limpiar(texto);

  // plata que llegó para guardar, entregar o pagar algo de otro: custodia (una deuda con quien la dejó)
  const guardada = custodia(texto);
  if (guardada) return { texto: guardada };

  // «me giraron una playa de 50k»: casi seguro era «plata», pero se pregunta; «gasté 80 mil en la playa» no se toca
  const regalo = new RegExp(String.raw`\b(giraron|mandaron|consignaron|dieron|enviaron|transfirieron|regalaron|prestaron)\s+(?:una|la)\s+playa\s+de\s+(${MONTO})`, 'iu').exec(limpiarTildes(texto));
  if (regalo) {
    const v = monto(regalo[2]);
    return {
      texto,
      pregunta: {
        mensaje: `¿Te ${regalo[1].toLowerCase()} ${v ? peso(v) : regalo[2]} de dinero, o estás hablando de un gasto en una playa?`,
        opciones: [
          { titulo: 'Fue plata', frase: `me ${regalo[1].toLowerCase()} ${regalo[2]}` },
          { titulo: 'Un gasto en la playa', frase: `gaste ${regalo[2]} en la playa` },
        ],
      },
    };
  }
  const playaDe = /\bplaya de (comida|mercado|mecato|arriendo|ropa|salud|transporte|servicios|gasolina|recargas|universidad)\b/.exec(t);
  if (playaDe && /\d/.test(t)) {
    const m = hallarMontos(t)[0];
    const dicho = m ? `${m.valor % 1000 === 0 ? m.valor / 1000 + ' mil' : m.valor}` : '';
    return {
      texto,
      pregunta: {
        mensaje: `No entendí «playa de ${playaDe[1]}». ¿Fue un gasto de ${playaDe[1]} o un gasto en una playa?`,
        opciones: [
          { titulo: `Gasto de ${playaDe[1]}`, frase: `gaste ${dicho} en ${playaDe[1]}` },
          { titulo: 'Gasto en la playa', frase: `gaste ${dicho} en la playa` },
        ],
      },
    };
  }

  // «25 mkl», «40 mok», «18 mli»: parece «mil», pero la tecla pudo ser otra: se confirma
  const raro = new RegExp(String.raw`(\d[\d.,]*)\s*(mkl|mok|mli|mik|mlil)\b`, 'i').exec(texto);
  if (raro) {
    const arreglada = texto.replace(raro[0], `${raro[1]} mil`);
    return { texto, pregunta: { mensaje: `«${raro[2]}» parece «mil». ¿Quisiste decir «${arreglada.trim()}»?`, opciones: [{ titulo: `Sí, ${raro[1]} mil`, frase: arreglada }] } };
  }
  // «a 6 quitas de 150 mil»: seis cuotas de 150 mil; se anota la compra por el total
  const cuotas = /\b(?:a\s+)?(\d{1,2})\s+quitas\s+de\s+(\d[\d.,]*)\s*(k|mil)?/i.exec(texto);
  if (cuotas) {
    const v = monto(`${cuotas[2]} ${cuotas[3] ?? ''}`);
    if (v) {
      const total = Number(cuotas[1]) * v;
      return {
        texto,
        pregunta: {
          mensaje: `¿Quisiste decir ${cuotas[1]} cuotas de ${peso(v)}, un total de ${peso(total)}? Anoto la compra por el total.`,
          opciones: [{ titulo: `Sí, ${peso(total)}`, frase: texto.replace(cuotas[0], `de ${total}`) }],
        },
      };
    }
  }
  if (/\bmecsto\b/i.test(texto)) {
    const arreglada = texto.replace(/\bmecsto\b/i, 'mecato');
    return { texto, pregunta: { mensaje: `«mecsto» parece «mecato». ¿Quisiste decir «${arreglada.trim()}»?`, opciones: [{ titulo: 'Sí, mecato', frase: arreglada }] } };
  }

  // plata que se mueve con una persona sin decir para qué ni en qué sentido: no se adivina
  const cuenta = String.raw`(?:\s+por\s+(\p{L}+))?`;
  const enviada = new RegExp(String.raw`^(?:y\s+)?(?:le\s+)?(?:mande|envie|transferi)\s+(${MONTO})${cuenta}\s+a\s+${PERSONA}$`, 'iu').exec(limpiarTildes(texto.trim()));
  const transf = new RegExp(String.raw`^(?:una\s+|la\s+)?(?:transferencia|giro|consignacion)\s+de\s+(${MONTO})\s+(?:a|de|para)\s+${PERSONA}$`, 'iu').exec(limpiarTildes(texto.trim()));
  const cuentaPrimero = new RegExp(String.raw`^(nequi|daviplata|bancolombia|davivienda|efectivo)\s+(${MONTO})\s+(?:a|de)\s+${PERSONA}$`, 'iu').exec(limpiarTildes(texto.trim()));
  let m = enviada ? { v: enviada[1], c: enviada[2], p: enviada[3] } : transf ? { v: transf[1], c: undefined, p: transf[2] } : cuentaPrimero ? { v: cuentaPrimero[2], c: cuentaPrimero[1], p: cuentaPrimero[3] } : null;
  if (m && esPersona(m.p, ctx, conoce)) {
    const por = m.c ? ` por ${m.c.toLowerCase()}` : '';
    const v = monto(m.v);
    return {
      texto,
      pregunta: {
        mensaje: `Veo ${v ? peso(v) : m.v} con ${m.p}${por}. ¿Qué fue?`,
        opciones: [
          { titulo: `Le pagué a ${m.p}`, frase: `le pague ${m.v} a ${m.p}${por}` },
          { titulo: `Le presté a ${m.p}`, frase: `le preste ${m.v} a ${m.p}${por}` },
          { titulo: `${m.p} me pagó`, frase: `${m.p} me pago ${m.v}${por}` },
        ],
      },
    };
  }
  const llego = new RegExp(String.raw`^me\s+(?:llego|llegaron)\s+(?:una\s+|la\s+)?(?:transferencia|consignacion|giro|plata|dinero)\s+de\s+(${MONTO})\s+(?:de|desde)\s+${PERSONA}$`, 'iu').exec(limpiarTildes(texto.trim()));
  if (llego && esPersona(llego[2], ctx, conoce)) {
    const v = monto(llego[1]);
    return {
      texto,
      pregunta: {
        mensaje: `${llego[2]} te mandó ${v ? peso(v) : llego[1]}. ¿Qué fue?`,
        opciones: [
          { titulo: `Me pagó lo que debía`, frase: `${llego[2]} me pago ${llego[1]}` },
          { titulo: 'Me prestó', frase: `me presto ${llego[2]} ${llego[1]}` },
          { titulo: 'Es un ingreso', frase: `ingreso ${llego[1]} de ${llego[2]}` },
        ],
      },
    };
  }
  return { texto };
}

/** ¿Parece el nombre de una persona? Una conocida, o con mayúscula, o una palabra suelta que el bot no tiene como otra cosa. */
function esPersona(nombre: string, ctx: Contexto, conoce: (w: string) => boolean): boolean {
  const clave = limpiar(nombre);
  if (ctx.cuentas.some(c => c.tipo === 'persona' && (c.clave === clave || clave.split(' ')[0] === c.clave))) return true;
  if (ctx.cuentas.some(c => c.tipo !== 'persona' && c.clave === clave)) return false;
  return /^\p{Lu}/u.test(nombre) || !conoce(clave);
}
