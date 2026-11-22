/**
 * Proyección de liquidez a 30 días: cruza el saldo de cada cuenta con los pagos fijos que van a tocar para avisar, con tiempo,
 * si una cuenta se va a quedar corta antes de un cobro. No toca ningún saldo ni mueve plata: solo mira hacia adelante.
 *
 * De qué cuenta sale cada pago fijo se lee de su frase («internet 60000 nequi»): la misma regla de siempre del bot, así que sin
 * cuenta dicha sale de Efectivo. Los dólares no entran: nunca se convierten solos. Los ingresos futuros tampoco se suponen.
 */
import { calcularSaldos } from './consultas.ts';
import { aLocal } from './fechas.ts';
import { interpretar } from './parser.ts';
import { fechasQueFaltan, leerRecurrentes } from './recurrentes.ts';
import type { Datos } from './repo.ts';
import { contextoDe } from './repo.ts';
import { formatear } from './dinero.ts';

export interface PagoProyectado { fecha: string; concepto: string; monto: number; cuentaId: string }
export interface CuentaProyectada {
  cuentaId: string;
  nombre: string;
  saldo: number;
  /** El peor saldo que va a tener en el periodo. */
  minimo: number;
  /** La primera fecha en que no alcanza, con lo que falta. */
  corta: { fecha: string; concepto: string; faltan: number } | null;
  pagos: PagoProyectado[];
}

const DIA = 86400000;
const sumarDias = (f: string, n: number): string => new Date(Date.parse(`${f}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/** Los pagos fijos de los próximos `dias` días (desde hoy), con la cuenta de la que salen. Los ya registrados de este periodo no se cuentan; el vencido sin registrar sí. */
export function pagosProximos(datos: Datos, ahora: Date, dias = 30): PagoProyectado[] {
  const hoy = aLocal(ahora).slice(0, 10);
  const hasta = sumarDias(hoy, dias);
  const ctx = contextoDe(datos, ahora);
  const res: PagoProyectado[] = [];
  for (const r of leerRecurrentes(datos.config)) {
    const q = interpretar(r.frase, ctx);
    const cuentaId = q.clase === 'movimiento' && q.propuesta.cuentaId ? q.propuesta.cuentaId : 'efectivo';
    // la misma regla del seguro: lo ya pagado este periodo no sale, y lo vencido sin pagar sale con la fecha de hoy
    for (const f of fechasQueFaltan(r, datos.movimientos, aLocal(ahora), hasta)) res.push({ fecha: f, concepto: r.concepto, monto: r.monto, cuentaId });
  }
  return res.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Cómo va a quedar cada cuenta de dinero en pesos si solo ocurren los pagos fijos. Devuelve las que tienen pagos por delante. */
export function proyeccionLiquidez(datos: Datos, ahora: Date, dias = 30): CuentaProyectada[] {
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const saldos = calcularSaldos(datos.movimientos, apertura);
  const pagos = pagosProximos(datos, ahora, dias);
  const res: CuentaProyectada[] = [];
  for (const c of datos.cuentas.filter(x => x.tipo === 'dinero' && x.moneda === 'COP' && x.id !== 'monedas' && x.id !== 'alcancia')) {
    const suyos = pagos.filter(p => p.cuentaId === c.id);
    if (!suyos.length) continue;
    const saldo = saldos.get(`${c.id}|COP`) ?? 0;
    let corriente = saldo, minimo = saldo;
    let corta: CuentaProyectada['corta'] = null;
    for (const p of suyos) {
      corriente -= p.monto;
      minimo = Math.min(minimo, corriente);
      if (corriente < 0 && !corta) corta = { fecha: p.fecha, concepto: p.concepto, faltan: -corriente };
    }
    res.push({ cuentaId: c.id, nombre: c.nombre, saldo, minimo, corta, pagos: suyos });
  }
  return res;
}

/** Los avisos de «esta cuenta se queda corta», de la que antes se queda sin plata a la que después. */
export function avisosDeLiquidez(datos: Datos, ahora: Date, dias = 30): { cuentaId: string; texto: string }[] {
  return proyeccionLiquidez(datos, ahora, dias).filter(c => c.corta).sort((a, b) => a.corta!.fecha.localeCompare(b.corta!.fecha)).map(c => {
    const [, mes, dia] = c.corta!.fecha.split('-');
    return {
      cuentaId: c.cuentaId,
      texto: `${c.nombre} se queda corta el ${Number(dia)}/${Number(mes)} por ${c.corta!.concepto}: tienes ${formatear(c.saldo)} y los pagos fijos suman ${formatear(c.saldo - c.minimo)}. Faltarían ${formatear(c.corta!.faltan)}.`,
    };
  });
}
