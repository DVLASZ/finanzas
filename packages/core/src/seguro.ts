/**
 * «Seguro para gastar hoy»: lo que queda libre después de apartar lo que ya está comprometido, repartido
 * entre los días que le faltan al mes. Es una guía, no un tope: no bloquea nada.
 *
 *   libre = disponible - plata de otros - pagos fijos que faltan este mes - lo apartado para metas
 */
import { leerMetas, totalApartado } from './metas.ts';
import { leerRecurrentes, vecesQueFaltanEsteMes } from './recurrentes.ts';
import { resumenSaldos, type ResumenSaldos } from './consultas.ts';
import { aLocal } from './fechas.ts';
import type { Datos } from './repo.ts';

export interface SeguroHoy {
  disponible: number;
  /** Pagos fijos de este mes que todavía no se registran. */
  fijos: number;
  /** Lo apartado para metas (ya está dentro de los saldos, pero no es para gastar). */
  apartado: number;
  /** Lo que queda libre en todo el mes (nunca negativo). */
  libre: number;
  /** Días que faltan del mes, contando hoy. */
  dias: number;
  /** El tope de hoy, fijado en la mañana: no baja cuando gastas. */
  porDia: number;
  /** Lo que ya se gastó hoy (tu parte, de plata que salió de tus cuentas). */
  gastadoHoy: number;
  /** Lo que queda del tope de hoy: `porDia` menos lo gastado hoy (nunca negativo). */
  quedaHoy: number;
  /** Plata de otros que tienes en las manos: está en el disponible pero no se cuenta como libre. */
  deOtros: number;
  /** ¿Los compromisos ya se comen todo lo disponible? */
  enRojo: boolean;
}

export function seguroParaGastar(datos: Datos, ahora: Date): SeguroHoy {
  const hoy = aLocal(ahora);
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const saldos = resumenSaldos(datos.movimientos, datos.cuentas, apertura);
  const disponible = saldos.disponibleCop;
  const fijos = leerRecurrentes(datos.config).reduce((s, r) => s + r.monto * vecesQueFaltanEsteMes(r, datos.movimientos, hoy), 0);
  const apartado = totalApartado(leerMetas(datos.config));
  // la plata que te mandaron para gastarla por otros está en el disponible, pero no es para tus gastos
  const deOtros = saldos.deOtros;
  const crudo = disponible - deOtros - fijos - apartado;
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dias = Math.max(1, diasDelMes - Number(hoy.slice(8, 10)) + 1);
  const dia = hoy.slice(0, 10);
  // lo gastado hoy: tu parte de los gastos y gastos compartidos que de verdad sacaron plata de tus cuentas.
  // Las compras a crédito, los pagos de deuda y los cuadres no cuentan: no son plata que salió hoy.
  let gastadoHoy = 0;
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const dinero = new Set(datos.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP').map(c => c.id));
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || !m.ocurridoEn.startsWith(dia) || (m.tipo !== 'gasto' && m.tipo !== 'compartido')) continue;
    if (!m.asientos.some(a => a.moneda === 'COP' && dinero.has(a.cuentaId) && a.monto < 0)) continue;
    for (const a of m.asientos) if (a.moneda === 'COP' && cats.has(a.cuentaId)) gastadoHoy += a.monto;
  }
  const libre = Math.max(0, crudo);
  // el tope del día se fija en la mañana: lo libre de ahora más lo que ya se gastó hoy, repartido entre los días que quedan
  const porDia = Math.max(0, Math.floor((crudo + gastadoHoy) / dias));
  return { disponible, deOtros, fijos, apartado, libre, dias, porDia, gastadoHoy, quedaHoy: Math.max(0, porDia - gastadoHoy), enRojo: crudo <= 0 };
}

export interface Patrimonio {
  /** Disponible en pesos sin la plata de otros. Puede ser negativo: no se recorta. */
  liquidez: number;
  /** Lo que tienes aparte del disponible (monedas, alcancías de dinero), en pesos. */
  aparte: number;
  cobrar: number;
  pagar: number;
  /** Todo lo que tienes menos lo que debes. */
  neto: number;
}

/** «Salud patrimonial». Neto = todo lo que tienes (también monedas y alcancía) más lo que te deben, menos lo que debes. Sin dólares ni plata ajena. */
export function patrimonio(r: ResumenSaldos): Patrimonio {
  const liquidez = r.disponibleCop - r.deOtros;
  const aparte = r.cuentas.filter(x => x.cuenta.moneda === 'COP' && (x.cuenta.enDisponible === false || x.cuenta.id === 'monedas')).reduce((s, x) => s + x.saldo, 0);
  const cobrar = Math.abs(r.teDeben.COP), pagar = Math.abs(r.debes.COP);
  return { liquidez, aparte, cobrar, pagar, neto: liquidez + aparte + cobrar - pagar };
}
