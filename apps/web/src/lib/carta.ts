/**
 * Lo que queda de la antigua tarjeta en HTML: el escape de texto (lo usan las pantallas que todavía arman HTML)
 * y la lectura de la respuesta del bot. El bot sigue entregando texto; `ui/Carta.tsx` lo dibuja.
 */

/** Escapa texto para meterlo en HTML. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const EMOJI_INICIAL = /^[\p{Extended_Pictographic}️‍\s]+/u;
export const sinEmoji = (t: string): string => t.replace(EMOJI_INICIAL, '').trim();

export interface NotaCarta { clase: 'aviso' | 'pregunta' | 'ok' | 'info' | 'suelta'; texto: string; celebra?: boolean }
export interface DatosCarta { guardado: boolean; tipo: string; monto: string; pildoras: string[]; notas: NotaCarta[] }

/** Lee un texto del bot: si es una tarjeta «Entendí» o «Guardado», devuelve sus partes; si no, null (se muestra como texto). */
export function parsearCarta(texto: string): DatosCarta | null {
  const lineas = texto.split('\n');
  const guardado = lineas[0].startsWith('✅ Guardado');
  if (lineas[0] !== 'Entendí:' && !guardado) return null;

  const partes = (lineas[1] ?? '').split(' · ');
  const tipo = partes.shift() ?? '';
  let monto = '';
  const pildoras: string[] = [];
  for (const p of partes) {
    const t = p.trim();
    if (!monto && /^-?(US)?\$[\d.,]+$/.test(t)) monto = t;
    else if (t) pildoras.push(t);
  }

  const notas = lineas.slice(2).filter(x => x.trim()).map((x): NotaCarta => {
    const t = sinEmoji(x);
    if (x.startsWith('⚠️')) return { clase: 'aviso', texto: t };
    if (x.startsWith('❓')) return { clase: 'pregunta', texto: t };
    if (/^(Pagas con|Pagaste justo|Entregaste|No tenías monedas)/.test(t)) return { clase: 'info', texto: t };
    if (/^[🎉📊🚨]/u.test(x)) return { clase: 'ok', texto: t, celebra: x.startsWith('🎉') };
    return { clase: 'suelta', texto: t };
  });
  return { guardado, tipo, monto, pildoras, notas };
}

/** Si la tarjeta es de un gasto, de un ingreso o de otra cosa: decide el color del monto. */
export function sentidoDelMonto(c: DatosCarta): 'gasto' | 'ingreso' | 'neutro' {
  const t = c.tipo.toLowerCase();
  if (/^(gasto|plata de .* para)/.test(t) && !t.startsWith('plata de')) return 'gasto';
  if (/^(ingreso|venta)/.test(t)) return 'ingreso';
  if (/^pago/.test(t)) return c.pildoras.some(p => /te paga/.test(p)) ? 'ingreso' : c.pildoras.some(p => /le pagas/.test(p)) ? 'gasto' : 'neutro';
  if (/^préstamo|^deuda/.test(t)) return c.pildoras.some(p => /te presta/.test(p)) ? 'ingreso' : 'neutro';
  return 'neutro';
}

/** Quita todos los emojis de un texto (la interfaz usa íconos vectoriales). Los que trae el bot en sus respuestas no se muestran. */
export const quitarEmojis = (t: string): string =>
  t.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').trim();
