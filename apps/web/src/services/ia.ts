/** Ayuda de la IA del servidor: frases que las reglas no entendieron, con o sin internet. */
import { leerFrasesIA, validarFrasesIA } from '../../../../packages/core/src/index.ts';
import { ctx as contexto } from '../state/store.ts';
import { leer, escribir } from './almacen.ts';
import { hayServidor } from './estado.ts';
import { cabeceraJson, urlBase } from './http.ts';

/** Cuánto se espera a la IA antes de seguir con el chat. */
const ESPERA_MS = 15_000;

export interface AyudaIA {
  frases: string[];
  error?: string;
  /** La IA no pudo ahora (sin red, tardó, 429 o 502): la frase vale la pena intentarla más tarde. */
  reintentar?: boolean;
}

/**
 * Pide ayuda a la IA del servidor para una frase que las reglas no entendieron. Devuelve las frases
 * reescritas, o un mensaje si no se pudo. Nunca lanza. Aunque el servidor ya las revisó, aquí se
 * revisan otra vez: solo pasan movimientos que cuadran con lo que la persona escribió.
 */
export async function pedirAyudaIA(texto: string): Promise<AyudaIA> {
  try {
    const r = await fetch(`${urlBase()}/api/interpretar`, {
      method: 'POST',
      headers: cabeceraJson(),
      body: JSON.stringify({ texto }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    const d = (await r.json().catch(() => ({}))) as { frases?: string[]; error?: string };
    if (!r.ok) return { frases: [], error: d.error, reintentar: r.status === 429 || r.status >= 500 };
    const c = contexto.peek();
    const frases = leerFrasesIA({ frases: d.frases }) ?? [];
    return { frases: c ? validarFrasesIA(frases, texto, c) : [] };
  } catch {
    return { frases: [], reintentar: true };
  }
}

/** Frases que las reglas no entendieron cuando no había internet: se piensan cuando vuelva. */
export interface FraseEnCola { texto: string; cuando: string }
const MAX_COLA_IA = 10;
/** Una frase que lleva más de una semana esperando ya no se acuerda nadie de ella. */
const VIDA_COLA_MS = 7 * 86400000;

export async function encolarFraseIA(texto: string): Promise<void> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  await escribir('ia_cola', [...cola, { texto, cuando: new Date().toISOString() }].slice(-MAX_COLA_IA));
}

/**
 * Si hay internet, la IA piensa las frases guardadas. Devuelve las que entendió. Las que la IA no pudo
 * pensar ahora (sin respuesta, 429 o 502) se quedan en la cola para otro intento; las que sí respondió
 * sin entender se sueltan.
 */
export async function atenderColaIA(): Promise<(FraseEnCola & { frases: string[] })[]> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  if (!cola.length || !hayServidor() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
  const listas: (FraseEnCola & { frases: string[] })[] = [];
  const quedan: FraseEnCola[] = [];
  const hoy = Date.now();
  let parar = false;
  for (const f of cola) {
    if (hoy - Date.parse(f.cuando) > VIDA_COLA_MS) continue;
    if (parar) { quedan.push(f); continue; }
    const a = await pedirAyudaIA(f.texto);
    if (a.frases.length) listas.push({ ...f, frases: a.frases });
    else if (a.reintentar) { quedan.push(f); parar = true; } // si la IA está caída o sin cupo, no se insiste con el resto
  }
  await escribir('ia_cola', quedan);
  return listas;
}
