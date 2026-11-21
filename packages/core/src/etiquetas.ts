/**
 * Etiquetas transversales (#viaje #claude): se escriben en cualquier parte de una frase y se guardan en
 * `Movimiento.etiqueta` como texto separado por espacios, en minúscula, sin tildes ni «#» ("viaje claude").
 * Así no hace falta migración: un valor viejo de una sola palabra sigue siendo una etiqueta válida.
 */
import { normalizar } from './texto.ts';

export const MAX_LARGO_ETIQUETA = 24;
export const MAX_ETIQUETAS = 5;

export interface Etiquetado { texto: string; etiquetas: string[]; error?: string }

/** Valida y deja únicas, en orden, las etiquetas ya normalizadas. */
function validar(brutas: string[]): { etiquetas: string[]; error?: string } {
  const etiquetas: string[] = [];
  for (const b of brutas) {
    const e = normalizar(b).replace(/^#/, '');
    if (!e) continue;
    if (!/^[a-z0-9_-]+$/.test(e)) return { etiquetas, error: `La etiqueta «${b}» solo puede llevar letras, números y guion bajo.` };
    if (e.length > MAX_LARGO_ETIQUETA) return { etiquetas, error: `La etiqueta #${e.slice(0, 12)}... es muy larga (máximo ${MAX_LARGO_ETIQUETA} caracteres).` };
    if (!etiquetas.includes(e)) etiquetas.push(e);
  }
  if (etiquetas.length > MAX_ETIQUETAS) return { etiquetas, error: `Máximo ${MAX_ETIQUETAS} etiquetas por movimiento.` };
  return { etiquetas };
}

/** Saca de una frase todos los #hashtags (en cualquier posición) y devuelve la frase sin ellos. */
export function extraerEtiquetas(texto: string): Etiquetado {
  const brutas: string[] = [];
  const sin = texto.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_t, pre: string, e: string) => { brutas.push(e); return pre; });
  if (!brutas.length) return { texto, etiquetas: [] };
  const v = validar(brutas);
  return { texto: sin.replace(/\s+/g, ' ').trim(), etiquetas: v.etiquetas, error: v.error };
}

/** Las palabras de una etiqueta guardada («viaje claude» da ['viaje', 'claude']); tolera un «#» y comas. */
export function tokensDeEtiqueta(valor: string | null | undefined): string[] {
  return normalizar(valor ?? '').split(/[\s,]+/).map(t => t.replace(/^#/, '')).filter(Boolean);
}

/** ¿El valor guardado lleva todas estas etiquetas? Se compara por palabra completa, no por trozo de texto. */
export function tieneEtiquetas(valor: string | null | undefined, buscadas: string[]): boolean {
  const mias = tokensDeEtiqueta(valor);
  return buscadas.every(b => mias.includes(normalizar(b).replace(/^#/, '')));
}

/** Lo que escribe una persona en un campo de etiquetas («#Viaje, claude») pasa a su forma guardada, o error. */
export function etiquetasDeTexto(texto: string): { valor: string | null; error?: string } {
  const v = validar(texto.split(/[\s,]+/).filter(Boolean));
  return { valor: v.etiquetas.length ? v.etiquetas.join(' ') : null, error: v.error };
}

/** Para mostrar: «viaje claude» da «#viaje #claude». */
export function conNumeral(valor: string | null | undefined): string {
  return tokensDeEtiqueta(valor).map(t => `#${t}`).join(' ');
}
