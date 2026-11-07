/**
 * Gastos que se repiten cada mes («cada mes el 5 internet 60000»). Se guardan en la config, como la
 * lista de compras, así se sincronizan sin cambiar la base. No registran nada solos: avisan cuando
 * llega el día y todavía no escribiste ese gasto en el mes.
 */
import { limpiar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

export interface Recurrente {
  /** Día del mes en que toca (1 a 28). */
  dia: number;
  /** Lo que se escribe para registrarlo: «internet 60000». */
  frase: string;
  /** Cómo queda el concepto al registrarlo («Internet»): con eso se sabe si ya se registró. */
  concepto: string;
  /** Monto en pesos. */
  monto: number;
}

/** Los avisos empiezan dos días antes y siguen hasta que se registra. */
export const DIAS_DE_ANTICIPO = 2;

export function leerRecurrentes(config: Record<string, string>): Recurrente[] {
  try {
    const l = JSON.parse(config.recurrentes ?? '[]');
    if (!Array.isArray(l)) return [];
    return l.filter((x): x is Recurrente => x && typeof x.frase === 'string' && typeof x.concepto === 'string' && Number.isInteger(x.dia) && Number(x.monto) > 0);
  } catch { return []; }
}

/** ¿Ya hay un movimiento de este recurrente en el mes de `hoy` («AAAA-MM-DD HH:MM:SS»)? */
export function yaRegistrado(r: Recurrente, movs: Movimiento[], hoy: string): boolean {
  const mes = hoy.slice(0, 7);
  const clave = limpiar(r.concepto);
  return movs.some(m => m.estado === 'ok' && m.ocurridoEn.startsWith(mes) && limpiar(m.descripcion).includes(clave));
}

/** Los que ya tocan (faltan `DIAS_DE_ANTICIPO` días o menos, o ya pasó el día) y no se han registrado este mes. */
export function recurrentesPendientes(config: Record<string, string>, movs: Movimiento[], hoy: string): Recurrente[] {
  const dia = Number(hoy.slice(8, 10));
  return leerRecurrentes(config)
    .filter(r => dia >= r.dia - DIAS_DE_ANTICIPO && !yaRegistrado(r, movs, hoy))
    .sort((a, b) => a.dia - b.dia);
}
