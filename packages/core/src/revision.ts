/**
 * Revisión del mes: junta en un solo lugar lo que conviene mirar y casi nunca se mira. Cada punto
 * dice qué pasa y, cuando hay algo que hacer, trae el texto que se manda al chat.
 */
import { calcularAlertas } from './alertas.ts';
import { calcularSaldos, estadoPresupuesto, gastoPorCategoria } from './consultas.ts';
import { formatear } from './dinero.ts';
import { aLocal, describirDia, rangoPeriodo } from './fechas.ts';
import type { Datos } from './repo.ts';

export type TipoPunto = 'saldo-inicial' | 'saldo-negativo' | 'deuda' | 'arqueo' | 'descuadre' | 'otros' | 'cobro' | 'anulados' | 'tope';

export interface PuntoRevision {
  nivel: 'urgente' | 'aviso' | 'info';
  /** De qué trata: la app lo usa para ofrecer el botón que lleva a donde se arregla. */
  tipo: TipoPunto;
  /** Un título corto. */
  titulo: string;
  texto: string;
  accion?: { titulo: string; texto: string };
  /** La categoría de la que habla el punto (descuadre, Otros, un tope), para abrir los movimientos filtrados. */
  categoriaId?: string;
}

const DIAS_SIN_CONTAR = 15;
const DESCUADRE_GRANDE = 20000;
const COBRO_VIEJO_DIAS = 30;

const dias = (desde: string, hasta: string): number => Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 86400000);

export function revisarMes(d: Datos, ahora: Date): PuntoRevision[] {
  const res: PuntoRevision[] = [];
  const hoy = aLocal(ahora);
  const apertura = d.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const { desde, hasta } = rangoPeriodo('mes', ahora);

  if (apertura.startsWith('2000')) {
    res.push({ nivel: 'urgente', tipo: 'saldo-inicial', titulo: 'Falta el saldo inicial', texto: 'Todavía no dijiste cuánta plata tenías al empezar, así que los saldos no son de fiar.', accion: { titulo: 'Poner el saldo inicial', texto: 'saldo inicial efectivo ' } });
    return res;
  }

  // cuentas en negativo y deudas por vencer: lo que ya avisan las alertas
  for (const a of calcularAlertas(d, ahora)) {
    if (a.id === 'saldo-negativo' || (a.nivel === 'urgente' && /deuda/i.test(a.texto))) res.push({ nivel: 'urgente', tipo: a.id === 'saldo-negativo' ? 'saldo-negativo' : 'deuda', titulo: a.id === 'saldo-negativo' ? 'Una cuenta está en negativo' : 'Deuda por vencer', texto: a.texto, accion: a.acciones?.[0] });
  }

  // cuánto hace que no se cuenta la billetera
  const arqueos = d.movimientos.filter(m => m.estado === 'ok' && m.tipo === 'ajuste' && !(m.propuesta as { cuadra?: unknown } | undefined)?.cuadra).map(m => m.ocurridoEn).sort();
  const ultimo = arqueos.at(-1);
  const sinContar = ultimo ? dias(ultimo, hoy) : dias(apertura, hoy);
  if (sinContar >= DIAS_SIN_CONTAR) {
    res.push({
      nivel: 'aviso',
      tipo: 'arqueo',
      titulo: 'Billetera sin contar',
      texto: ultimo ? `Hace ${sinContar} días que no cuentas la plata de verdad (el último arqueo fue el ${describirDia(ultimo.slice(0, 10))}).` : `Nunca has contado la plata de verdad desde el saldo inicial (hace ${sinContar} días).`,
      accion: { titulo: 'Contar la plata', texto: 'arqueo efectivo ' },
    });
  }

  // descuadres de este mes
  const gastos = gastoPorCategoria(d.movimientos, d.cuentas, desde, hasta);
  const descuadre = gastos.find(g => g.cuenta.id === 'cat:descuadre')?.total ?? 0;
  if (Math.abs(descuadre) >= DESCUADRE_GRANDE) {
    res.push({ nivel: 'aviso', tipo: 'descuadre', titulo: 'Descuadre del mes', categoriaId: 'cat:descuadre', texto: `Este mes el descuadre suma ${formatear(Math.abs(descuadre))} ${descuadre > 0 ? 'de plata que faltó' : 'de plata que sobró'}. Casi siempre es algo que no se anotó.` });
  }

  // demasiado en «Otros»: es señal de que falta ponerle categoría a las cosas
  const total = gastos.filter(g => g.cuenta.id !== 'cat:descuadre').reduce((s, g) => s + g.total, 0);
  const otros = gastos.find(g => g.cuenta.id === 'cat:otros')?.total ?? 0;
  if (total > 0 && otros / total >= 0.2 && otros >= 20000) {
    res.push({ nivel: 'info', tipo: 'otros', titulo: 'Mucho gasto en Otros', categoriaId: 'cat:otros', texto: `${Math.round((otros / total) * 100)}% de lo gastado este mes (${formatear(otros)}) quedó en Otros. Si ya tienes una categoría para eso, conviene usarla.` });
  }

  // topes que ya se pasaron este mes
  for (const id of Object.keys(d.presupuestos)) {
    const e = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, id, desde, hasta, d.config.tope_arrastra === '1');
    if (!e || e.porcentaje < 100) continue;
    const nombre = d.cuentas.find(c => c.id === id)?.nombre ?? id;
    res.push({ nivel: 'aviso', tipo: 'tope', titulo: 'Tope superado', categoriaId: id, texto: `Superaste el tope de ${nombre}: ${formatear(e.gastado)} de ${formatear(e.tope)} (${e.porcentaje} %).` });
  }

  // cobros que se enfriaron
  const saldos = calcularSaldos(d.movimientos, apertura);
  for (const c of d.compromisos) {
    if (c.estado !== 'activa' || c.direccion !== 'me_deben') continue;
    const edad = dias(c.creadoEn, hoy);
    if (edad < COBRO_VIEJO_DIAS || (saldos.get(`${c.personaId}|${c.moneda}`) ?? 0) <= 0) continue;
    const persona = d.cuentas.find(x => x.id === c.personaId)?.nombre ?? 'Alguien';
    res.push({ nivel: 'aviso', tipo: 'cobro', titulo: 'Cobro que se enfrió', texto: `${persona} te debe ${formatear(c.monto, c.moneda)} desde hace ${edad} días.` });
  }

  // lo anulado este mes: unos pocos es normal; muchos, señal de que algo se está anotando mal
  const anulados = d.movimientos.filter(m => m.estado === 'anulado' && m.ocurridoEn >= desde && m.ocurridoEn < hasta).length;
  if (anulados >= 8) res.push({ nivel: 'info', tipo: 'anulados', titulo: 'Muchos movimientos anulados', texto: `Este mes anulaste ${anulados} movimientos. Si algo no se está entendiendo bien, cuéntamelo para ajustarlo.` });

  return res;
}

export function textoRevision(d: Datos, ahora: Date): string {
  const puntos = revisarMes(d, ahora);
  if (!puntos.length) return '✅ Revisé el mes y todo está en orden: saldos al día, sin descuadres grandes y sin cobros viejos.';
  return ['🔎 Revisión del mes', ...puntos.map(p => `${p.nivel === 'urgente' ? '❗' : p.nivel === 'aviso' ? '⚠️' : '•'} ${p.texto}`)].join('\n');
}
