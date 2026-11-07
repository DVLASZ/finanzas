/**
 * Pagos a trabajadores: cuánto se le pagó a cada uno en un periodo. Cuenta los gastos que traen una
 * persona del grupo «trabajadores», o cualquier gasto de la categoría Jornales con persona.
 */
import { formatear } from './dinero.ts';
import { describirDia, rangoPeriodo } from './fechas.ts';
import { limpiar } from './texto.ts';
import type { Contexto, Cuenta, Movimiento } from './tipos.ts';

export interface PagoTrabajador { nombre: string; total: number; veces: number; ultimo: string }

export type CuandoJornales = 'semana' | 'pasada' | 'mes';

/** ¿Esta instalación tiene trabajadores? (sirve para mostrar u ocultar la pantalla) */
export function hayTrabajadores(cuentas: Cuenta[], movs: Movimiento[]): boolean {
  return cuentas.some(c => c.tipo === 'persona' && c.grupo === 'trabajadores')
    || movs.some(m => m.estado === 'ok' && m.tipo === 'gasto' && (m.propuesta as { categoriaId?: string } | undefined)?.categoriaId === 'cat:jornales');
}

export function pagosATrabajadores(movs: Movimiento[], cuentas: Cuenta[], desde: string, hasta: string): PagoTrabajador[] {
  const porNombre = new Map<string, PagoTrabajador>();
  for (const m of movs) {
    if (m.estado !== 'ok' || m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    // los movimientos importados del Excel no traen propuesta
    const p = (m.propuesta ?? {}) as { persona?: string; categoriaId?: string; monto?: number; moneda?: string };
    if (!p.persona || p.moneda === 'USD') continue;
    const cuenta = cuentas.find(c => c.tipo === 'persona' && c.clave === limpiar(p.persona!));
    if (cuenta?.grupo !== 'trabajadores' && p.categoriaId !== 'cat:jornales') continue;
    const nombre = cuenta?.nombre ?? p.persona;
    const monto = p.monto ?? 0;
    const previo = porNombre.get(nombre) ?? { nombre, total: 0, veces: 0, ultimo: m.ocurridoEn };
    previo.total += monto;
    previo.veces += 1;
    if (m.ocurridoEn > previo.ultimo) previo.ultimo = m.ocurridoEn;
    porNombre.set(nombre, previo);
  }
  return [...porNombre.values()].sort((a, b) => b.total - a.total);
}

/** El rango de fechas de «esta semana», «la semana pasada» o «este mes». */
export function rangoJornales(cuando: CuandoJornales, ahora: Date): { desde: string; hasta: string; titulo: string } {
  if (cuando === 'mes') return { ...rangoPeriodo('mes', ahora), titulo: 'este mes' };
  if (cuando === 'pasada') return { ...rangoPeriodo('semana', new Date(ahora.getTime() - 7 * 86400000)), titulo: 'la semana pasada' };
  return { ...rangoPeriodo('semana', ahora), titulo: 'esta semana' };
}

export function textoJornales(cuando: CuandoJornales, movs: Movimiento[], ctx: Contexto): string {
  const r = rangoJornales(cuando, ctx.ahora);
  const lista = pagosATrabajadores(movs, ctx.cuentas, r.desde, r.hasta);
  if (!lista.length) return `👷 No hay pagos a trabajadores ${r.titulo}.`;
  const total = lista.reduce((s, x) => s + x.total, 0);
  return [
    `👷 Pagos a trabajadores ${r.titulo}: ${formatear(total)}`,
    ...lista.map(x => `• ${x.nombre}: ${formatear(x.total)} (${x.veces} ${x.veces === 1 ? 'pago' : 'pagos'}, el último ${describirDia(x.ultimo.slice(0, 10))})`),
  ].join('\n');
}
