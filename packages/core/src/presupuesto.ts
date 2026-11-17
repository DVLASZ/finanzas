/**
 * «Cuánto puedo gastar esta semana»: lo libre del mes (disponible menos pagos fijos que faltan y lo apartado para
 * metas) repartido en los días que quedan, por siete. Usa las mismas cuentas que «Seguro para gastar hoy».
 */
import { gastoPorCategoria } from './consultas.ts';
import { formatear } from './dinero.ts';
import { aLocal, rangoPeriodo } from './fechas.ts';
import type { Datos } from './repo.ts';
import { seguroParaGastar } from './seguro.ts';

export interface PresupuestoSemana {
  /** Lo que se puede gastar en una semana completa a este ritmo. */
  porSemana: number;
  /** Lo que queda para los días que faltan de esta semana. */
  restoDeLaSemana: number;
  /** Cuántos días quedan de esta semana (contando hoy), sin pasar del fin de mes. */
  diasDeLaSemana: number;
  /** Lo ya gastado en lo que va de la semana. */
  gastadoSemana: number;
  /** Los pagos fijos que faltan del mes (ya descontados). */
  fijos: number;
  /** ¿Los compromisos ya se comen todo lo disponible? */
  enRojo: boolean;
}

const DIA = 86400000;

export function presupuestoSemanal(datos: Datos, ahora: Date): PresupuestoSemana {
  const s = seguroParaGastar(datos, ahora);
  const sem = rangoPeriodo('semana', ahora);
  const hoy = aLocal(ahora).slice(0, 10);
  const finSemana = Date.parse(`${sem.hasta.slice(0, 10)}T00:00:00Z`);
  const diasSemana = Math.max(1, Math.round((finSemana - Date.parse(`${hoy}T00:00:00Z`)) / DIA));
  const diasDeLaSemana = Math.min(diasSemana, s.dias);
  const gastadoSemana = gastoPorCategoria(datos.movimientos, datos.cuentas, sem.desde, sem.hasta).reduce((t, x) => t + x.total, 0);
  return {
    porSemana: s.enRojo ? 0 : Math.floor((s.libre / s.dias) * 7),
    restoDeLaSemana: s.enRojo ? 0 : s.porDia * diasDeLaSemana,
    diasDeLaSemana,
    gastadoSemana,
    fijos: s.fijos,
    enRojo: s.enRojo,
  };
}

export function textoPresupuestoSemana(datos: Datos, ahora: Date): string {
  const p = presupuestoSemanal(datos, ahora);
  if (p.enRojo) return 'Esta semana: tus pagos fijos y lo apartado para metas ya cubren todo lo que tienes disponible.';
  const dias = p.diasDeLaSemana === 1 ? 'el día que queda' : `los ${p.diasDeLaSemana} días que quedan`;
  return [
    `🗓️ Esta semana puedes gastar ${formatear(p.restoDeLaSemana)} en ${dias}.`,
    `A este ritmo, una semana completa son ${formatear(p.porSemana)}. Ya llevas ${formatear(p.gastadoSemana)} gastados esta semana.`,
    p.fijos > 0 ? `Ya descontamos ${formatear(p.fijos)} de pagos fijos que faltan este mes.` : '',
  ].filter(Boolean).join('\n');
}
