/**
 * Alertas del banco pegadas tal cual (Nequi, Bancolombia, Banco de Bogotá): se lee el monto, si fue gasto o ingreso, el comercio
 * o la persona, la cuenta, la fecha y la hora, y se arma la frase que el bot ya entiende. Todo con reglas, sin IA y sin gastar
 * cuota. Nada se guarda: la frase pasa por la tarjeta de confirmación como cualquier otro mensaje.
 */
import { aLocal } from './fechas.ts';
import { limpiar, titulo } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Notificacion {
  tipo: 'gasto' | 'ingreso';
  monto: number;
  /** El comercio (si fue gasto) o quien mandó (si fue ingreso). */
  quien?: string;
  banco: 'nequi' | 'bancolombia' | 'bogota' | null;
  /** La cuenta de esta app que corresponde a ese banco, si la hay. */
  cuenta: string | null;
  /** 'dd/mm' si no es de hoy. */
  fecha?: string;
  /** «2:32 pm». */
  hora?: string;
  /** Lo que se le manda al bot. */
  frase: string;
  /** Para decirle a la persona qué se entendió y qué falta. */
  resumen: string;
}

const BANCOS: { id: NonNullable<Notificacion['banco']>; re: RegExp; clave: string }[] = [
  { id: 'nequi', re: /nequi/i, clave: 'nequi' },
  { id: 'bancolombia', re: /bancolombia/i, clave: 'bancolombia' },
  { id: 'bogota', re: /banco de bogot|bogot[aá]/i, clave: 'bogota' },
];

const INGRESO = /\b(recibiste|recibida|recibido|te (?:enviaron|envi[oó]|llegaron|lleg[oó]|consignaron|transfirieron|pagaron|abonaron)|abono|consignaci[oó]n|dep[oó]sito)\b/i;
const GASTO = /\b(compra|compraste|pagaste|pago|retiro|retiraste|d[eé]bito|cargo|enviaste|transferiste|transferencia|cobro)\b/i;

/** «$1.250.000», «$45.900,00», «$ 8.000»: el primer monto del mensaje en pesos. */
function montoDe(t: string): number | null {
  const m = /\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[,.]\d{2})?(?!\d)/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function horaDe(t: string): string | undefined {
  const m = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i.exec(t);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return undefined;
  const pm = m[3] ? /p/i.test(m[3]) : h >= 12;
  if (m[3] && h < 12 && pm) h += 12;
  if (m[3] && h === 12 && !pm) h = 0;
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${h >= 12 ? 'pm' : 'am'}`;
}

function fechaDe(t: string, ahora: Date): string | undefined {
  const m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (!m) return undefined;
  const dia = Number(m[1]), mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return undefined;
  const hoy = aLocal(ahora);
  if (dia === Number(hoy.slice(8, 10)) && mes === Number(hoy.slice(5, 7))) return undefined;
  return `${dia}/${mes}`;
}

/** Quién: «en TIENDA D1», «a Juan Pérez», «de Ana Gómez». Corta donde empieza otra cosa (hora, fecha, saldo, tarjeta). */
function quienDe(t: string, ingreso: boolean): string | undefined {
  const re = ingreso ? /\bde\s+(?!la\b|tu\b)([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.&' -]{1,40}?)(?=\s+(?:en|el|a las|con|por|desde)\b|\s*[.,;]|\s+\d|\s*$)/ : /\b(?:en|a)\s+(?!las\b|la cuenta\b|cta\b|tu\b|una\b)([A-Za-zÁÉÍÓÚÑ0-9][\wÁÉÍÓÚÑáéíóúñ.&' *-]{1,40}?)(?=\s+(?:el|a las|con|por|desde|saldo|t\.|tarjeta)\b|\s*[.,;]|\s+\d{1,2}[:/]|\s*$)/i;
  const m = re.exec(t);
  if (!m) return undefined;
  const q = m[1].replace(/\s+/g, ' ').trim().replace(/[*\d]{4,}$/, '').trim();
  return q ? titulo(q.toLowerCase()) : undefined;
}

export function leerNotificacion(texto: string, ctx: Pick<Contexto, 'cuentas' | 'ahora'>): Notificacion | null {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length < 12 || t.length > 600) return null;
  const monto = montoDe(t);
  if (!monto) return null;
  const esIngreso = INGRESO.test(t);
  if (!esIngreso && !GASTO.test(t)) return null;
  const banco = BANCOS.find(b => b.re.test(t))?.id ?? null;
  const clave = BANCOS.find(b => b.id === banco)?.clave;
  const cuenta = clave ? ctx.cuentas.find(c => c.tipo === 'dinero' && (c.clave === clave || limpiar(c.nombre).includes(clave)))?.clave ?? null : null;
  const hora = horaDe(t.replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, ' '));
  const fecha = fechaDe(t, ctx.ahora);
  const quien = quienDe(t.replace(/\$\s?[\d.,]+/g, ' '), esIngreso);
  const cuando = [fecha, hora].filter(Boolean).join(' ');
  const frase = esIngreso
    ? ['ingreso', monto, cuenta, limpiar(quien ?? '') || 'otros', cuando].filter(Boolean).join(' ')
    : [limpiar(quien ?? '') || 'compra', monto, cuenta, cuando].filter(Boolean).join(' ');
  const partes = [`${esIngreso ? 'Ingreso' : 'Gasto'} de $${monto.toLocaleString('es-CO')}`];
  if (quien) partes.push(esIngreso ? `de ${quien}` : `en ${quien}`);
  if (banco) partes.push(cuenta ? `en ${ctx.cuentas.find(c => c.clave === cuenta)?.nombre}` : `(${banco === 'bogota' ? 'Banco de Bogotá' : banco === 'nequi' ? 'Nequi' : 'Bancolombia'}: no encontré esa cuenta en esta app, revisa la cuenta en la tarjeta)`);
  if (cuando) partes.push(cuando);
  return { tipo: esIngreso ? 'ingreso' : 'gasto', monto, quien, banco, cuenta, fecha, hora, frase, resumen: partes.join(' · ') };
}
