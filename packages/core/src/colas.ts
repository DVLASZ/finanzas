/**
 * Respuestas que tocan varios movimientos de la cola de una vez: «el primero sí, el segundo no», «sí al café, la comida no»,
 * «Faber sí, Jorge no», «los dos primeros sí, el bus no», «bus en efectivo, comida en Nequi», «el primero por Nequi y el segundo
 * en efectivo», «sí, pero los 20 eran 25». Esto solo lee la frase: decide qué movimiento nombra cada trozo y qué se dice de él.
 * Aplicarlo (confirmar, quitar, cambiar) lo hace el bot.
 */
import { buscarEnLista } from './aclaraciones.ts';
import { limpiar } from './texto.ts';

export interface ParteDeCola {
  /** Posición en la cola (0 es la tarjeta que se está mostrando). */
  i: number;
  decision?: 'si' | 'no';
  /** Algo para cambiar de ese movimiento, dicho como se le diría a la tarjeta («en efectivo», «fueron 25000»). */
  cambio?: string;
}

const ORDINAL: Record<string, number> = { primero: 0, primera: 0, primer: 0, segundo: 1, segunda: 1, tercero: 2, tercera: 2, tercer: 2, cuarto: 3, cuarta: 3, quinto: 4, ultimo: -1, ultima: -1 };
const RE_ORD = '(primero|primera|primer|segundo|segunda|tercero|tercera|tercer|cuarto|cuarta|quinto|ultimo|ultima)';
const SI = /^(?:si|sii|ok|dale|confirmo|confirma|va|listo|ese si|esa si)$/;
const NO = /^(?:no|todavia no|aun no|ya no|ese no|esa no|nel|nop)$/;

const decisionDe = (t: string): 'si' | 'no' | null => (SI.test(t) ? 'si' : NO.test(t) ? 'no' : null);

/** Quita artículos de adelante: «el de Faber», «la comida», «lo del café». */
const palabraDe = (t: string): string => t.replace(/^(?:(?:el|la|lo|los|las|del|de la|de|al|a la)\s+)+/, '').trim();

/**
 * Lee la frase como una orden sobre varios movimientos. `textos` son los nombres de los `n` movimientos de la cola
 * (concepto y lo que se escribió). Devuelve null si algún trozo no se entiende o apunta a un movimiento que no es uno solo.
 */
export function leerSelectivas(texto: string, textos: string[]): ParteDeCola[] | null {
  if (texto.length > 160 || textos.length > 8) return null; // una orden de cola es corta
  const n = textos.length;
  const trozos = texto.split(/[,;]|\s+y\s+(?=(?:el|la)\s+(?:primero|primera|segundo|segunda|tercero|ultimo|ultima)\b|\S+\s+(?:si|sí|no|en|por|con)\b)/i).map(limpiar).filter(Boolean);
  if (!trozos.length || trozos.length > 6) return null;
  const partes: ParteDeCola[] = [];
  let m: RegExpExecArray | null;
  const indice = (palabra: string): number | null => {
    const hay = buscarEnLista(palabra, textos);
    return hay.length === 1 ? hay[0] : null;
  };
  const ord = (o: string): number => { const v = ORDINAL[o]; return v === -1 ? n - 1 : v; };
  let ultimo = -1; // el último movimiento nombrado, para «sí, pero los 20 eran 25» y «no, fue en efectivo»
  for (let t of trozos) {
    t = t.replace(/^(?:y|pero|bueno|entonces|ah|mejor)\s+/, '');
    // «los dos primeros sí»
    if ((m = /^(?:los|las) (dos|tres|2|3) (primeros|primeras|ultimos|ultimas)\s+(.+)$/.exec(t))) {
      const k = m[1] === 'dos' || m[1] === '2' ? 2 : 3;
      const d = decisionDe(m[3]);
      if (!d || k > n) return null;
      const lista = m[2].startsWith('primer') ? Array.from({ length: k }, (_, j) => j) : Array.from({ length: k }, (_, j) => n - k + j);
      for (const i of lista) partes.push({ i, decision: d });
      continue;
    }
    // «el primero sí», «el segundo por nequi»
    if ((m = new RegExp(`^(?:el |la )?${RE_ORD}\\s+(.+)$`).exec(t))) {
      const i = ord(m[1]);
      if (i < 0 || i >= n) return null;
      const d = decisionDe(m[2]);
      partes.push(d ? { i, decision: d } : { i, cambio: m[2] });
      ultimo = i;
      continue;
    }
    // «sí al café», «no a la comida»
    if ((m = /^(si|no)(?: al| a la| a los| a las| a el)? (.+)$/.exec(t)) && !/^(?:pero|y)\b/.test(m[2])) {
      const i = indice(palabraDe(m[2]));
      if (i === null) return null;
      partes.push({ i, decision: m[1] as 'si' | 'no' });
      ultimo = i;
      continue;
    }
    // «Faber sí», «el bus no», «Paula todavía no», «el de Laura sí»
    if ((m = /^(.+?)\s+(si|no|todavia no|aun no|ya no)$/.exec(t))) {
      const i = indice(palabraDe(m[1]));
      if (i === null) return null;
      partes.push({ i, decision: decisionDe(m[2])! });
      ultimo = i;
      continue;
    }
    // «bus en efectivo», «taxi por nequi», «el libro es Universidad y lo pagué con Nequi»
    if ((m = /^(.+?)\s+((?:en|por|con|fue|fueron|es|va en)\s+.+)$/.exec(t))) {
      const i = indice(palabraDe(m[1]));
      if (i === null) return null;
      partes.push({ i, cambio: m[2] });
      ultimo = i;
      continue;
    }
    // «sí» solo, o «los 20 eran 25»: hablan del movimiento del que se venía hablando (o el de arriba)
    const d = decisionDe(t);
    if (d === 'si' && ultimo < 0 && partes.length === 0) { partes.push({ i: 0, decision: d }); ultimo = 0; continue; }
    if ((m = /^(?:los |el )?(\d[\d.,]*\s?(?:k|mil)?)\s+(?:eran|era|fueron|fue)\s+(\d[\d.,]*\s?(?:k|mil)?)$/.exec(t))) {
      partes.push({ i: ultimo >= 0 ? ultimo : 0, cambio: `eran ${m[2]}` });
      continue;
    }
    return null;
  }
  // una sola parte sin decisión ni cambio claro no es una orden sobre varios: la entienden las órdenes de siempre
  if (partes.length === 1 && !partes[0].decision) return null;
  return partes.length ? partes : null;
}
