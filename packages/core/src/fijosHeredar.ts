/**
 * Una frase corta que nombra un pago fijo («claude 65000») usa la cuenta y la categoría con que ese pago
 * se anota siempre. Lo escrito en la frase gana: si dices «claude 65000 efectivo», sale en efectivo.
 * Las funciones son puras: el parser solo tiene que preguntar y usar lo que devuelvan.
 */
import { hallarMontos, type MontoHallado } from './dinero.ts';
import { borrarTramos, categorizar, hallarCuentas } from './entidades.ts';
import { clavesDeFijo as claves, leerRecurrentes, palabrasRaiz, type Recurrente } from './recurrentes.ts';
import { limpiar, normalizar } from './texto.ts';
import type { Contexto, Moneda } from './tipos.ts';


/** El pago fijo que la frase nombra (todas las palabras distintivas de su concepto, enteras), o null. Gana el más específico. */
export function fijoParaFrase(texto: string, recurrentes: Recurrente[]): Recurrente | null {
  const enFrase = palabrasRaiz(texto);
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
  // lo guardado en el pago fijo manda; la frase solo completa lo que falte (o lo que ya no exista en esta instalación)
  const cuentaGuardada = fijo.cuentaId && ctx.cuentas.some(c => c.id === fijo.cuentaId) ? fijo.cuentaId : undefined;
  const categoriaGuardada = fijo.categoriaId && ctx.cuentas.some(c => c.id === fijo.categoriaId) ? fijo.categoriaId : undefined;
  const categoriaId = categoriaGuardada ?? categorizar(sinCuenta, ctx) ?? categorizar(normalizar(fijo.concepto), ctx) ?? undefined;
  return { fijo, cuentaId: cuentaGuardada ?? cuenta?.id, categoriaId };
}

/** Cambia campos de un pago fijo (se busca por concepto, sin tildes ni mayúsculas). Si cambia el monto, la frase lo sigue. */
export function cambiarFijo(lista: Recurrente[], concepto: string, cambios: Partial<Recurrente>): Recurrente[] {
  const clave = limpiar(concepto);
  let visto = false;
  return lista.map(r => {
    if (visto || limpiar(r.concepto) !== clave) return r;
    visto = true;
    const nuevo: Recurrente = { ...r, ...cambios };
    // el concepto es la llave: no se cambia por aquí
    nuevo.concepto = r.concepto;
    if (cambios.monto !== undefined && cambios.monto !== r.monto && cambios.frase === undefined) nuevo.frase = fraseConMonto(r, cambios.monto);
    return nuevo;
  });
}

/** Quita un pago fijo de la lista por su concepto. */
export function quitarFijo(lista: Recurrente[], concepto: string): Recurrente[] {
  const clave = limpiar(concepto);
  return lista.filter(r => limpiar(r.concepto) !== clave);
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
