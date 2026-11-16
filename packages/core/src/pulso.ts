/**
 * El «pulso» de la parte de arriba del chat: cuánto se gastó cada uno de los últimos días y cómo va el ritmo del día y
 * del mes. Son cuentas sobre lo que ya hay en pantalla (el gasto por día, lo seguro para hoy y la comparativa del mes),
 * sin guardar nada.
 */
import { gastoPorCategoria } from './consultas.ts';
import { aLocal } from './fechas.ts';
import type { Datos } from './repo.ts';
import type { ComparativaMensual } from './comparativa.ts';
import type { SeguroHoy } from './seguro.ts';

export interface GastoDia {
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** 0 = domingo ... 6 = sábado */
  diaSemana: number;
  total: number;
}

/** El gasto de cada uno de los últimos `dias` días, del más viejo al de hoy. */
export function gastoDiario(datos: Pick<Datos, 'movimientos' | 'cuentas'>, ahora: Date, dias = 7): GastoDia[] {
  return Array.from({ length: dias }, (_, k) => {
    const d = new Date(ahora.getTime() - (dias - 1 - k) * 86400000);
    const sig = new Date(d.getTime() + 86400000);
    const fecha = aLocal(d).slice(0, 10);
    const total = gastoPorCategoria(datos.movimientos, datos.cuentas, `${fecha} 00:00:00`, `${aLocal(sig).slice(0, 10)} 00:00:00`).reduce((s, x) => s + x.total, 0);
    return { fecha, diaSemana: new Date(`${fecha}T12:00:00Z`).getUTCDay(), total };
  });
}

export type EstadoRitmo = 'bien' | 'cerca' | 'tope';

/** Pasado este porcentaje sobre el mes anterior, el ritmo del mes preocupa. */
const MARGEN_MES = 15;
/** Desde esta parte de lo seguro para hoy ya estás cerca del tope. */
const CERCA_DEL_TOPE = 0.8;

/**
 * Verde si vas bien, ámbar si te acercas al tope de hoy (o el mes va 15 % por encima del pasado) y coral si ya lo pasaste
 * o los compromisos se comen lo disponible. Sin límite de hoy no inventa alarmas.
 */
export function estadoRitmo(seguro: SeguroHoy, comparativa: Pick<ComparativaMensual, 'proyeccionVsMesAnterior'>): { estado: EstadoRitmo; texto: string } {
  const peso = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
  const mes = comparativa.proyeccionVsMesAnterior;
  if (seguro.enRojo) return { estado: 'tope', texto: 'Tus pagos fijos y metas ya cubren todo lo disponible.' };
  if (seguro.porDia > 0 && seguro.gastadoHoy > seguro.porDia) return { estado: 'tope', texto: `Hoy pasaste lo seguro por ${peso(seguro.gastadoHoy - seguro.porDia)}.` };
  if (seguro.porDia > 0 && seguro.gastadoHoy >= seguro.porDia * CERCA_DEL_TOPE) return { estado: 'cerca', texto: `Ya llevas ${peso(seguro.gastadoHoy)} de ${peso(seguro.porDia)} seguros para hoy.` };
  if (mes !== null && mes >= MARGEN_MES) return { estado: 'cerca', texto: `A este ritmo cerrarías el mes ${mes} % por encima del pasado.` };
  if (seguro.porDia <= 0) return { estado: 'bien', texto: 'Aún no hay con qué calcular lo seguro para hoy.' };
  return { estado: 'bien', texto: `Vas bien: te quedan ${peso(seguro.porDia - seguro.gastadoHoy)} seguros para hoy.` };
}
