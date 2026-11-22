/**
 * Una frase corta que nombra un pago fijo («claude 65000») usa la cuenta y la categoría con que ese pago
 * se anota siempre. Lo escrito en la frase gana: si dices «claude 65000 efectivo», sale en efectivo.
 * Las funciones son puras: el parser solo tiene que preguntar y usar lo que devuelvan.
 */
import { hallarMontos, type MontoHallado } from './dinero.ts';
import { borrarTramos, categorizar, hallarCuentas } from './entidades.ts';
import { leerRecurrentes, type Recurrente } from './recurrentes.ts';
import { normalizar } from './texto.ts';
import type { Contexto, Moneda } from './tipos.ts';

/** Palabras del concepto que no distinguen un pago de otro: «Suscripción Claude» se reconoce por «claude». */
const GENERICAS = new Set(['suscripcion', 'pago', 'cuota', 'mensual', 'servicio', 'plan', 'cobro', 'de', 'del', 'la', 'el', 'los', 'las', 'mi']);

const raiz = (w: string): string => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const palabras = (t: string): string[] => normalizar(t).match(/[a-z]+/g) ?? [];

/** Las palabras que tiene que traer la frase para nombrar este pago fijo. */
function claves(r: Recurrente): string[] {
  const todas = palabras(r.concepto).filter(w => w.length >= 3);
  const propias = todas.filter(w => !GENERICAS.has(w));
  return (propias.length ? propias : todas).map(raiz);
}

/** El pago fijo que la frase nombra (todas las palabras distintivas de su concepto, enteras), o null. Gana el más específico. */
export function fijoParaFrase(texto: string, recurrentes: Recurrente[]): Recurrente | null {
  const enFrase = new Set(palabras(texto).map(raiz));
  let mejor: Recurrente | null = null;
  let mejorN = 0;
  for (const r of recurrentes) {
    const k = claves(r);
    if (k.length && k.length >= mejorN && k.every(w => enFrase.has(w))) {
      if (k.length > mejorN || !mejor) { mejor = r; mejorN = k.length; }
    }
  }
  return mejor;
}

export interface HerenciaDeFijo { fijo: Recurrente; cuentaId?: string; categoriaId?: string }

/** Lo que una frase hereda del pago fijo que nombra: su cuenta habitual y su categoría, si esta instalación las tiene. */
export function heredarDeFijo(texto: string, ctx: Contexto): HerenciaDeFijo | null {
  const fijo = fijoParaFrase(texto, leerRecurrentes(ctx.config));
  if (!fijo) return null;
  const frase = normalizar(fijo.frase);
  const cuenta = hallarCuentas(frase, ctx)[0];
  const sinCuenta = borrarTramos(frase, cuenta ? [cuenta] : []).replace(/[\d.,$]+/g, ' ').replace(/\s+/g, ' ').trim();
  const categoriaId = categorizar(sinCuenta, ctx) ?? categorizar(normalizar(fijo.concepto), ctx) ?? undefined;
  return { fijo, cuentaId: cuenta?.id, categoriaId };
}

export interface AjusteDeFijo { monto: number; moneda: Moneda; cuentaNombre?: string }

/** El monto escrito en la frase del pago fijo: el que está marcado como plata, o si no el primero que haya. */
function montoDeFrase(frase: string): MontoHallado | undefined {
  const l = hallarMontos(frase);
  return l.find(m => m.explicito) ?? l[0];
}

/**
 * Lo que la hoja de ajuste muestra de un pago fijo: el monto de su frase, en la moneda de su cuenta. Un cobro en dólares
 * (Claude, por ejemplo) se queda en dólares: nunca se convierte a pesos.
 */
export function ajusteDeFijo(r: Recurrente, ctx: Pick<Contexto, 'cuentas' | 'config'>): AjusteDeFijo {
  const frase = normalizar(r.frase);
  const cuenta = hallarCuentas(frase, ctx as Contexto)[0];
  const c = cuenta ? ctx.cuentas.find(x => x.id === cuenta.id) : undefined;
  const m = montoDeFrase(frase);
  const moneda: Moneda = c?.moneda === 'USD' || m?.moneda === 'USD' ? 'USD' : 'COP';
  return { monto: m?.valor ?? r.monto, moneda, cuentaNombre: c?.nombre };
}

/** La frase del pago fijo con otro monto; todo lo demás (concepto, cuenta) queda igual para que cuente como el pago del mes. */
export function fraseConMonto(r: Recurrente, monto: number): string {
  const base = normalizar(r.frase);
  const m = montoDeFrase(base);
  const nuevo = `${monto}${m?.moneda === 'USD' ? ' usd' : ''}`;
  if (!m) return `${base} ${nuevo}`.trim();
  return `${base.slice(0, m.inicio)}${nuevo}${base.slice(m.fin)}`.replace(/\s+/g, ' ').trim();
}
