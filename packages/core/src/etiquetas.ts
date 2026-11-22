/**
 * Etiquetas transversales (#viaje #claude): se escriben en cualquier parte de una frase y se guardan en
 * `Movimiento.etiqueta` como texto separado por espacios, en minúscula, sin tildes ni «#» ("viaje claude").
 * Así no hace falta migración: un valor viejo de una sola palabra sigue siendo una etiqueta válida.
 */
import { idPersona } from './entidades.ts';
import { normalizar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

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

/** Lo que se sabe de un movimiento a medio hacer para sugerirle etiquetas. */
export interface BaseDeSugerencia { concepto?: string; persona?: string; categoriaId?: string; etiquetas?: string[] }

const DIA_MS = 86_400_000;

/**
 * Hasta `n` etiquetas para ofrecer en la tarjeta: primero las que llevaron antes los movimientos parecidos
 * (mismo concepto, misma persona o misma categoría; pesa más el concepto), de más usada a menos y con desempate
 * por la más reciente. Si no alcanzan, las más usadas del último mes. Nunca devuelve una que ya está puesta.
 */
export function sugerirEtiquetas(movs: Movimiento[], base: BaseDeSugerencia, n = 2, hoy?: string): string[] {
  const puestas = new Set((base.etiquetas ?? []).flatMap(e => tokensDeEtiqueta(e)));
  const claveConcepto = new Set(normalizar(base.concepto ?? '').match(/[a-z0-9]{3,}/g) ?? []);
  const persona = base.persona ? idPersona(base.persona) : '';
  const ok = movs.filter(m => m.estado === 'ok' && tokensDeEtiqueta(m.etiqueta).length);

  const puntos = new Map<string, { p: number; n: number; ultima: string }>();
  const sumar = (m: Movimiento, peso: number) => {
    for (const e of new Set(tokensDeEtiqueta(m.etiqueta))) {
      const x = puntos.get(e) ?? { p: 0, n: 0, ultima: '' };
      x.p += peso; x.n++;
      if (m.ocurridoEn > x.ultima) x.ultima = m.ocurridoEn;
      puntos.set(e, x);
    }
  };
  for (const m of ok) {
    let peso = 0;
    const desc = new Set(normalizar(m.descripcion).match(/[a-z0-9]{3,}/g) ?? []);
    if ([...claveConcepto].some(w => desc.has(w))) peso += 4;
    if (persona && m.asientos.some(a => a.cuentaId === persona)) peso += 2;
    if (base.categoriaId && m.asientos.some(a => a.cuentaId === base.categoriaId)) peso += 1;
    if (peso) sumar(m, peso);
  }
  const orden = (a: [string, { p: number; n: number; ultima: string }], b: [string, { p: number; n: number; ultima: string }]) =>
    b[1].p - a[1].p || b[1].n - a[1].n || b[1].ultima.localeCompare(a[1].ultima) || a[0].localeCompare(b[0]);
  const salida = [...puntos].sort(orden).map(([e]) => e).filter(e => !puestas.has(e));

  if (salida.length < n) {
    const limite = new Date((hoy ? Date.parse(`${hoy.slice(0, 10)}T12:00:00Z`) : Date.now()) - 30 * DIA_MS).toISOString().slice(0, 10);
    puntos.clear();
    for (const m of ok) if (m.ocurridoEn.slice(0, 10) >= limite) sumar(m, 1);
    for (const [e] of [...puntos].sort(orden)) if (!puestas.has(e) && !salida.includes(e)) salida.push(e);
  }
  return salida.slice(0, n);
}
