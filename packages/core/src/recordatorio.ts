/**
 * El recordatorio de la noche: «¿Anotaste los gastos de hoy?». La hora se guarda en la config `recordatorio` («20:30», en
 * punto o y media, hora de Colombia). El servidor revisa cada media hora y avisa solo si no hay nada anotado hoy.
 */
import { aLocal } from './fechas.ts';
import type { Movimiento } from './tipos.ts';

/** La hora configurada, o null si está apagado o mal escrito. */
export function horaDeRecordatorio(valor: string | undefined): string | null {
  return valor && /^([01]\d|2[0-3]):(00|30)$/.test(valor) ? valor : null;
}

/** ¿Toca avisar en este momento? Cuando esta media hora es la configurada y hoy todavía no se anotó nada. */
export function tocaRecordar(valor: string | undefined, movs: Movimiento[], ahora: Date): boolean {
  const hora = horaDeRecordatorio(valor);
  if (!hora) return false;
  const local = aLocal(ahora);
  const turno = `${local.slice(11, 13)}:${Number(local.slice(14, 16)) < 30 ? '00' : '30'}`;
  if (turno !== hora) return false;
  const hoy = local.slice(0, 10);
  return !movs.some(m => m.estado === 'ok' && m.origen !== 'excel' && m.creadoEn.startsWith(hoy) && m.tipo !== 'apertura');
}
