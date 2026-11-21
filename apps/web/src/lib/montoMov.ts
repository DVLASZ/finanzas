/** Qué monto mostrar para un movimiento en una lista y de qué clase es (gasto, ingreso o movimiento entre cuentas). */
import type { Cuenta, Movimiento } from '../../../../packages/core/src/index.ts';
import { formatear } from './formatear.ts';

export function montoVisible(m: Movimiento, cuentas: Cuenta[]): { texto: string; clase: 'mal' | 'bien' | 'neutro' } {
  if (m.tipo === 'apertura') return { texto: '', clase: 'neutro' };
  const tipoDe = (id: string) => cuentas.find(c => c.id === id)?.tipo;
  const cop = (f: (t: string | undefined) => boolean) => m.asientos.filter(a => a.moneda === 'COP' && f(tipoDe(a.cuentaId))).reduce((s, a) => s + a.monto, 0);
  const gasto = cop(t => t === 'categoria');
  if (gasto !== 0) return { texto: formatear(gasto), clase: gasto > 0 ? 'mal' : 'bien' };
  const ingreso = -cop(t => t === 'fuente');
  if (ingreso !== 0) return { texto: '+' + formatear(ingreso), clase: 'bien' };
  const mayor = [...m.asientos].filter(a => tipoDe(a.cuentaId) !== 'sistema').sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0];
  return mayor ? { texto: formatear(Math.abs(mayor.monto), mayor.moneda), clase: 'neutro' } : { texto: '', clase: 'neutro' };
}
