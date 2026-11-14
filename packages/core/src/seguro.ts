/**
 * «Seguro para gastar hoy»: lo que queda libre después de apartar lo que ya está comprometido, repartido
 * entre los días que le faltan al mes. Es una guía, no un tope: no bloquea nada.
 *
 *   libre = disponible - pagos fijos que faltan este mes - lo apartado para metas
 */
import { leerMetas, totalApartado } from './metas.ts';
import { leerRecurrentes, vecesQueFaltanEsteMes } from './recurrentes.ts';
import { resumenSaldos } from './consultas.ts';
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
  /** Lo seguro para hoy. */
  porDia: number;
  /** Lo que ya se gastó hoy. */
  gastadoHoy: number;
  /** ¿Los compromisos ya se comen todo lo disponible? */
  enRojo: boolean;
}

export function seguroParaGastar(datos: Datos, ahora: Date): SeguroHoy {
  const hoy = aLocal(ahora);
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const disponible = resumenSaldos(datos.movimientos, datos.cuentas, apertura).disponibleCop;
  const fijos = leerRecurrentes(datos.config).reduce((s, r) => s + r.monto * vecesQueFaltanEsteMes(r, datos.movimientos, hoy), 0);
  const apartado = totalApartado(leerMetas(datos.config));
  const crudo = disponible - fijos - apartado;
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dias = Math.max(1, diasDelMes - Number(hoy.slice(8, 10)) + 1);
  const dia = hoy.slice(0, 10);
  let gastadoHoy = 0;
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || !m.ocurridoEn.startsWith(dia)) continue;
    for (const a of m.asientos) if (a.moneda === 'COP' && cats.has(a.cuentaId)) gastadoHoy += a.monto;
  }
  const libre = Math.max(0, crudo);
  return { disponible, fijos, apartado, libre, dias, porDia: Math.floor(libre / dias), gastadoHoy, enRojo: crudo <= 0 };
}
