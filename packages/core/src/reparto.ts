/**
 * Gastos que se reparten con alguien, dichos en el orden en que se habla y no en el de la ayuda. La forma que el
 * intérprete conoce es «pizza 9000 pagué por ivan 3000» (la persona y luego su parte). Al dictar, la gente dice
 * indistintamente:
 *
 *   «almuerzo 25000 pagué 20000 por marta»   (parte, «por», persona)
 *   «almuerzo 25000 por marta 20000»         (sin «pagué»)
 *   «almuerzo 25000 20000 de marta»
 *   «almuerzo 25000 marta 20000»
 *
 * Todas significan lo mismo: el gasto fue de 25000, y de eso 20000 son de Marta. Aquí se reescriben a la forma
 * conocida. Sin esto, la frase se leía como dos montos sueltos y la IA la partía en un gasto y en un «pagué 20000 a
 * Marta», que es un pago de deuda y es lo contrario de lo que se quería decir.
 */
import { hallarMontos } from './dinero.ts';
import { personaAlInicio } from './entidades.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

/**
 * El dictado de Android escribe «25,000» (y a veces «1,250,000»): con coma de miles. Se quita la coma para que sea
 * un solo monto. Un decimal como «2,5» no se toca, porque los miles siempre llevan tres cifras.
 */
export function quitarComasDeMiles(texto: string): string {
  return texto.replace(/\d{1,3}(?:,\d{3})+(?![\d,])/g, m => m.replace(/,/g, ''));
}

const MONTO = String.raw`\d[\d.]*(?:\s?(?:k|mil))?`;

/** El valor de un monto escrito («20000», «20k», «20.000»). */
const valor = (m: string): number => hallarMontos(m)[0]?.valor ?? 0;

/** ¿`nombre` es exactamente una persona que ya conoces (o su apodo)? */
function esPersonaConocida(nombre: string, ctx: Contexto): boolean {
  const tokens = limpiar(nombre).split(' ').filter(Boolean);
  if (!tokens.length || tokens.length > 3) return false;
  const p = personaAlInicio(tokens, ctx);
  return Boolean(p) && p!.palabras === tokens.length;
}

/**
 * Lleva a la forma «concepto TOTAL pagué por PERSONA PARTE» las frases con la parte antes o sin «pagué». Solo aplica a
 * una persona y cuando su parte es menor que el total; si no se está seguro, el texto queda como llegó.
 * Las formas sin «pagué ... por» piden que la persona ya exista: una palabra suelta no se toma por un nombre.
 */
export function repartoEnOtroOrden(texto: string, ctx: Contexto): string {
  const t = texto.trim();
  const como = (concepto: string, total: string, persona: string, parte: string): string | null => {
    if (!(valor(parte) > 0 && valor(parte) < valor(total))) return null;
    return `${concepto} ${total} pagué por ${persona.trim()} ${parte}`;
  };

  // «almuerzo 25000 pagué 20000 por marta»
  let m = t.match(new RegExp(String.raw`^(.*?\S)\s+(${MONTO})\s+pagu[eé]\s+(${MONTO})\s+por\s+(\S+(?:\s+\S+){0,2})$`, 'i'));
  if (m && !/\s(y|e)\s|,/i.test(m[4])) return como(m[1], m[2], m[4], m[3]) ?? texto;

  // «almuerzo 25000 por marta 20000»
  m = t.match(new RegExp(String.raw`^(.*?\S)\s+(${MONTO})\s+por\s+(\S+(?:\s+\S+){0,2}?)\s+(${MONTO})$`, 'i'));
  if (m && esPersonaConocida(m[3], ctx)) return como(m[1], m[2], m[3], m[4]) ?? texto;

  // «almuerzo 25000 20000 de marta»
  m = t.match(new RegExp(String.raw`^(.*?\S)\s+(${MONTO})\s+(${MONTO})\s+de\s+(\S+(?:\s+\S+){0,2})$`, 'i'));
  if (m && esPersonaConocida(m[4], ctx)) return como(m[1], m[2], m[4], m[3]) ?? texto;

  // «almuerzo 25000 marta 20000»
  m = t.match(new RegExp(String.raw`^(.*?\S)\s+(${MONTO})\s+(\S+(?:\s+\S+){0,2}?)\s+(${MONTO})$`, 'i'));
  if (m && esPersonaConocida(m[3], ctx)) return como(m[1], m[2], m[3], m[4]) ?? texto;

  return texto;
}
