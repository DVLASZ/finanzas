/**
 * Duplicar un movimiento: repetir un gasto o una compra parecida con la fecha de hoy, sin volver a escribirla.
 * El movimiento nuevo es otro (id nuevo) y no toca al original. Solo se duplican los que se arman solos con la misma
 * tarjeta: gasto, ingreso y transferencia. Un préstamo, una deuda o un gasto compartido arrastran a otras personas, y
 * ahí es mejor escribirlo en el chat para que el bot pregunte lo que falta.
 */
import { calcularSaldos } from './consultas.ts';
import { aLocal, describirFecha } from './fechas.ts';
import { avisoDeExistencias } from './existencias.ts';
import { construirMovimiento, saldoDe } from './asientos.ts';
import { formatear } from './dinero.ts';
import { contextoDe, type Datos, type Repo } from './repo.ts';
import type { Propuesta } from './parser/tipos.ts';
import type { Compromiso, Cuenta, Moneda, Movimiento } from './tipos.ts';

export type PrevisualizacionDuplicado =
  | { ok: false; motivo: string }
  | { ok: true; movimiento: Movimiento; cuentasNuevas: Cuenta[]; compromisos: Compromiso[]; resumen: string[]; avisos: string[] };

const MOTIVO_ATADO = 'Este movimiento arrastra a otras personas o deudas. Para repetirlo, escríbelo en el chat y el bot pregunta lo que falte.';

export function previsualizarDuplicado(datos: Datos, ahora: Date, id: string): PrevisualizacionDuplicado {
  const m = datos.movimientos.find(x => x.id === id);
  if (!m) return { ok: false, motivo: 'No encuentro ese movimiento.' };
  if (m.estado !== 'ok') return { ok: false, motivo: 'Un movimiento anulado no se duplica.' };
  if (m.tipo === 'apertura' || m.tipo === 'ajuste') return { ok: false, motivo: 'El saldo inicial y los arqueos no se duplican.' };
  const p0 = m.propuesta as Propuesta | undefined;
  if (!p0 || typeof p0 !== 'object' || typeof p0.monto !== 'number') return { ok: false, motivo: 'Este movimiento vino de un archivo y no guarda cómo se armó. Escríbelo en el chat.' };
  const atado = p0.custodia || p0.fiado || p0.pagoOtro || (p0.personas?.length ?? 0) > 0 || !['gasto', 'ingreso', 'transferencia'].includes(m.tipo) || (m.tipo === 'gasto' && Boolean(p0.persona));
  if (atado) return { ok: false, motivo: MOTIVO_ATADO };

  const cerrado = /^\d{4}-\d{2}-\d{2}$/.test(datos.config.cerrado_hasta ?? '') ? datos.config.cerrado_hasta! : null;
  const hoy = aLocal(ahora);
  if (cerrado && hoy.slice(0, 10) <= cerrado) return { ok: false, motivo: `Hoy cae en un tiempo cerrado (hasta el ${cerrado}). Escribe «abrir meses» en el chat si hace falta.` };

  const ctx = contextoDe(datos, ahora);
  const nuevoId = crypto.randomUUID();
  const p1: Propuesta = { ...p0, ocurridoEn: hoy, avisos: [], faltantes: [] };
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  let hecho;
  try {
    hecho = construirMovimiento(p1, ctx, calcularSaldos(datos.movimientos, apertura), nuevoId, 'app');
  } catch (e) {
    return { ok: false, motivo: `${(e as Error).message.replace(/[.]$/, '')}.` };
  }
  const movimiento: Movimiento = {
    ...hecho.movimiento, descripcion: m.descripcion, etiqueta: m.etiqueta ?? null, nota: m.nota ?? null, lugarDesde: m.lugarDesde ?? null, lugarHasta: m.lugarHasta ?? null,
    mensajeOriginal: m.mensajeOriginal ?? null, propuesta: p1, sinHora: false, editadoEn: null,
  };

  const nombre = (cid: string | undefined) => datos.cuentas.find(c => c.id === cid)?.nombre ?? cid ?? '';
  const moneda: Moneda = p0.moneda;
  const resumen = [
    m.descripcion,
    formatear(p0.monto, moneda),
    m.tipo === 'transferencia' ? `${nombre(p0.cuentaId ?? 'efectivo')} a ${nombre(p0.cuentaDestinoId)}` : [p0.cuentaId ? nombre(p0.cuentaId) : 'Efectivo', nombre(p0.categoriaId) || p0.fuente || ''].filter(Boolean).join(' · '),
    describirFecha(hoy, ahora, false),
  ];

  const avisos: string[] = [];
  const despues = calcularSaldos([...datos.movimientos, movimiento], apertura);
  const antes = calcularSaldos(datos.movimientos, apertura);
  for (const c of datos.cuentas.filter(x => x.tipo === 'dinero')) {
    const s = saldoDe(despues, c.id, c.moneda);
    if (s < 0 && s < saldoDe(antes, c.id, c.moneda)) avisos.push(`${c.nombre} quedaría en -${formatear(-s, c.moneda)}: no alcanza la plata.`);
  }
  if (p1.venta) {
    const a = avisoDeExistencias(datos.config, datos.movimientos, p1.venta);
    if (a) avisos.push(a);
  }
  return { ok: true, movimiento, cuentasNuevas: hecho.cuentasNuevas, compromisos: hecho.compromisos, resumen, avisos };
}

/** Guarda el duplicado. Devuelve el id del movimiento nuevo; lanza con el motivo si no se puede. */
export async function aplicarDuplicado(repo: Repo, ahora: Date, id: string): Promise<string> {
  const r = previsualizarDuplicado(await repo.cargar(), ahora, id);
  if (!r.ok) throw new Error(r.motivo);
  await repo.guardarMovimiento(r.movimiento, r.cuentasNuevas, r.compromisos);
  return r.movimiento.id;
}
