/**
 * Cómo se ven las respuestas del bot en el chat: la tarjeta «Entendí» / «Guardado» con estructura
 * (tipo, monto grande, datos en pastillas, notas aparte) y los botones con íconos propios.
 * El bot sigue entregando texto; aquí solo se dibuja de forma clara.
 */
import type { Boton } from '../../../packages/core/src/index.ts';
import { icono } from './iconos.ts';

/** Escapa texto para meterlo en HTML. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const EMOJI_INICIAL = /^[\p{Extended_Pictographic}️‍\s]+/u;
const sinEmoji = (t: string): string => t.replace(EMOJI_INICIAL, '').trim();

/** Un botón del chat: sin emojis (el dibujo es propio) y con el principal bien a la vista. */
export function botonHtml(x: Boton, activo: boolean): string {
  const ico = x.id === 'ok' ? 'check' : x.id === 'no' ? 'x' : x.id.startsWith('edit') ? 'lapiz' : x.id.startsWith('undo') ? 'deshacer' : '';
  const clase = x.id === 'ok' ? 'principal' : x.id === 'no' ? 'no' : x.id.startsWith('edit') || x.id.startsWith('undo') ? 'fantasma' : '';
  return `<button class="chip ${clase} ${activo ? '' : 'inactivo'}" data-boton="${esc(x.id)}" ${activo ? '' : 'disabled'}>${ico ? icono(ico) : ''}${esc(sinEmoji(x.titulo))}</button>`;
}

const nota = (clase: string, ico: string, texto: string): string =>
  `<div class="nota ${clase}">${icono(ico)}<span>${esc(texto)}</span></div>`;

/** La tarjeta del bot con estructura, o null si el texto no es una tarjeta (se muestra como texto normal). */
export function cartaHtml(texto: string, botones: string): string | null {
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

  const notas = lineas.slice(2).filter(x => x.trim()).map(x => {
    const t = sinEmoji(x);
    if (x.startsWith('⚠️')) return nota('aviso', 'alerta', t);
    if (x.startsWith('❓')) return nota('pregunta', 'ayuda', t);
    if (/^(Pagas con|Pagaste justo|Entregaste|No tenías monedas)/.test(t)) return nota('', 'info', t);
    if (/^[🎉📊🚨]/u.test(x)) return nota('ok', x.startsWith('🎉') ? 'check' : 'grafica', t);
    return `<div class="suelta">${esc(t)}</div>`;
  }).join('');

  const cabecera = `<div class="cab"><b>${icono(guardado ? 'check' : 'info')}${guardado ? 'Guardado' : 'Entendí'}</b><span class="tipo">${esc(tipo)}</span></div>`;
  const montoHtml = monto ? `<div class="monto-g">${esc(monto)}</div>` : '';
  const pildorasHtml = pildoras.length ? `<div class="pildoras">${pildoras.map(p => `<span class="pildora">${esc(p)}</span>`).join('')}</div>` : '';
  return cabecera + montoHtml + pildorasHtml + notas + botones;
}
