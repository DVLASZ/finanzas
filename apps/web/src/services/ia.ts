/** Ayuda de la IA del servidor: frases que las reglas no entendieron, con o sin internet. */
import { leer, escribir } from './almacen.ts';
import { hayServidor } from './estado.ts';
import { cabeceraJson, urlBase } from './http.ts';

/**
 * Pide ayuda a la IA del servidor para una frase que las reglas no entendieron. Devuelve las frases
 * reescritas, o un mensaje si no se pudo. Nunca lanza.
 */
export async function pedirAyudaIA(texto: string): Promise<{ frases: string[]; error?: string }> {
  try {
    const r = await fetch(`${urlBase()}/api/interpretar`, {
      method: 'POST',
      headers: cabeceraJson(),
      body: JSON.stringify({ texto }),
    });
    const d = (await r.json().catch(() => ({}))) as { frases?: string[]; error?: string };
    return r.ok ? { frases: d.frases ?? [] } : { frases: [], error: d.error };
  } catch {
    return { frases: [] };
  }
}

/** Frases que las reglas no entendieron cuando no había internet: se piensan cuando vuelva. */
export interface FraseEnCola { texto: string; cuando: string }
const MAX_COLA_IA = 10;

export async function encolarFraseIA(texto: string): Promise<void> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  await escribir('ia_cola', [...cola, { texto, cuando: new Date().toISOString() }].slice(-MAX_COLA_IA));
}

/** Si hay internet, la IA piensa las frases guardadas. Devuelve las que entendió; las que no se pudo preguntar se quedan. */
export async function atenderColaIA(): Promise<(FraseEnCola & { frases: string[] })[]> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  if (!cola.length || !hayServidor() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
  const listas: (FraseEnCola & { frases: string[] })[] = [];
  const quedan: FraseEnCola[] = [];
  for (const f of cola) {
    const a = await pedirAyudaIA(f.texto);
    if (a.frases.length) listas.push({ ...f, frases: a.frases });
    else if (!a.error) quedan.push(f); // sin respuesta (la red se cayó): se intenta otra vez
  }
  await escribir('ia_cola', quedan);
  return listas;
}
