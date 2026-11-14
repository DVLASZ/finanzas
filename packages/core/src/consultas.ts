/**
 * Consultas sobre los movimientos: saldos, gasto por categoría, deudas, presupuestos.
 *
 * Todo se calcula en memoria a partir de la lista de movimientos. Con el volumen de una
 * persona (unos cientos al año) es instantáneo y permite usar el mismo código en el Worker y
 * en la app sin conexión.
 */
import { limpiar } from './texto.ts';
import type { Saldos } from './asientos.ts';
import type { Compromiso, Cuenta, Moneda, Movimiento } from './tipos.ts';

const activos = (movs: Movimiento[]) => movs.filter(m => m.estado === 'ok');

/**
 * Saldo por cuenta desde la fecha de apertura (lo anterior es solo historial de gastos).
 * Clave: `${cuentaId}|${moneda}`.
 */
export function calcularSaldos(movs: Movimiento[], fechaApertura: string): Saldos {
  const saldos: Saldos = new Map();
  for (const m of activos(movs)) {
    if (m.ocurridoEn < fechaApertura) continue;
    for (const a of m.asientos) {
      const k = `${a.cuentaId}|${a.moneda}`;
      saldos.set(k, (saldos.get(k) ?? 0) + a.monto);
    }
  }
  return saldos;
}

export interface ResumenSaldos {
  cuentas: { cuenta: Cuenta; saldo: number }[];
  /**
   * Efectivo + Nequi + Daviplata, en pesos. NO incluye las monedas ni la cuenta en dólares: el dólar fluctúa y
   * convertirlo con una tasa vieja daría un número engañoso, así que esa cuenta se muestra aparte en USD.
   */
  disponibleCop: number;
  monedasCop: number;
  arqUsd: number;
  teDeben: { COP: number; USD: number };
  /** Lo que le debes a otros SIN contar la plata que tienes de otros para gastarla por ellos. */
  debes: { COP: number; USD: number };
  /** Plata de otros que tienes en tus manos (ya está dentro del disponible, pero no es tuya). */
  deOtros: number;
}

export function resumenSaldos(movs: Movimiento[], cuentas: Cuenta[], fechaApertura: string): ResumenSaldos {
  const saldos = calcularSaldos(movs, fechaApertura);
  const dinero = cuentas.filter(c => c.tipo === 'dinero');
  const lista = dinero.map(c => ({ cuenta: c, saldo: saldos.get(`${c.id}|${c.moneda}`) ?? 0 }));
  const get = (id: string) => lista.find(x => x.cuenta.id === id)?.saldo ?? 0;
  const arqUsd = get('arq');
  const disponibleBase = lista.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP').reduce((s, x) => s + x.saldo, 0);
  const teDeben = { COP: 0, USD: 0 };
  const debes = { COP: 0, USD: 0 };
  for (const c of cuentas.filter(x => x.tipo === 'persona')) {
    for (const mon of ['COP', 'USD'] as Moneda[]) {
      const s = saldos.get(`${c.id}|${mon}`) ?? 0;
      if (s > 0) teDeben[mon] += s;
      if (s < 0) debes[mon] += -s;
    }
  }
  const deOtros = plataDeOtros(movs, cuentas, fechaApertura).reduce((s, x) => s + x.monto, 0);
  debes.COP = Math.max(0, debes.COP - deOtros);
  return {
    cuentas: lista,
    deOtros,
    disponibleCop: disponibleBase,
    monedasCop: get('monedas'),
    arqUsd,
    teDeben,
    debes,
  };
}

/** Total gastado por categoría en [desde, hasta) (solo COP; incluye Descuadre). */
export function gastoPorCategoria(movs: Movimiento[], cuentas: Cuenta[], desde: string, hasta: string): { cuenta: Cuenta; total: number }[] {
  const cats = new Map(cuentas.filter(c => c.tipo === 'categoria').map(c => [c.id, c]));
  const acum = new Map<string, number>();
  for (const m of activos(movs)) {
    if (m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    for (const a of m.asientos) {
      if (a.moneda === 'COP' && cats.has(a.cuentaId)) acum.set(a.cuentaId, (acum.get(a.cuentaId) ?? 0) + a.monto);
    }
  }
  return [...acum.entries()]
    .map(([id, total]) => ({ cuenta: cats.get(id)!, total }))
    .filter(x => x.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/** Lo que se gasta normalmente en una categoría: promedio por gasto de los últimos 180 días antes de `hasta`. */
export function gastoHabitual(movs: Movimiento[], cuentas: Cuenta[], categoriaId: string, hasta: string): { promedio: number; n: number } {
  const desde = new Date(Date.parse(hasta.replace(' ', 'T') + 'Z') - 180 * 86400000).toISOString().slice(0, 10) + ' 00:00:00';
  const montos: number[] = [];
  for (const m of activos(movs)) {
    if (m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    const v = m.asientos.filter(a => a.cuentaId === categoriaId && a.moneda === 'COP').reduce((s, a) => s + a.monto, 0);
    if (v > 0) montos.push(v);
  }
  return { promedio: montos.length ? montos.reduce((s, x) => s + x, 0) / montos.length : 0, n: montos.length };
}

/** Lo recibido por fuente (el producto vendido, la persona, el sueldo...) en [desde, hasta), de mayor a menor. */
export function ingresosPorFuente(movs: Movimiento[], cuentas: Cuenta[], desde: string, hasta: string): { cuenta: Cuenta; total: number }[] {
  const fuentes = new Map(cuentas.filter(c => c.tipo === 'fuente').map(c => [c.id, c]));
  const acum = new Map<string, number>();
  for (const m of activos(movs)) {
    if (m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    for (const a of m.asientos) if (a.moneda === 'COP' && fuentes.has(a.cuentaId)) acum.set(a.cuentaId, (acum.get(a.cuentaId) ?? 0) - a.monto);
  }
  return [...acum.entries()].map(([id, total]) => ({ cuenta: fuentes.get(id)!, total })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
}

/** Total de ingresos (netos) en [desde, hasta). */
export function totalIngresos(movs: Movimiento[], cuentas: Cuenta[], desde: string, hasta: string): number {
  const fuentes = new Set(cuentas.filter(c => c.tipo === 'fuente').map(c => c.id));
  let total = 0;
  for (const m of activos(movs)) {
    if (m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    for (const a of m.asientos) if (fuentes.has(a.cuentaId) && a.moneda === 'COP') total += -a.monto;
  }
  return total;
}

/** Movimientos de un evento (#etiqueta) con su total gastado. */
export function porEtiqueta(movs: Movimiento[], cuentas: Cuenta[], etiqueta: string) {
  const cats = new Set(cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const lista = activos(movs).filter(m => m.etiqueta === etiqueta);
  const total = lista.reduce((s, m) => s + m.asientos.filter(a => cats.has(a.cuentaId) && a.moneda === 'COP').reduce((x, a) => x + a.monto, 0), 0);
  return { movimientos: lista.sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn)), total };
}

/**
 * Plata de otros que tienes en tus manos: te la mandaron para pagar o comprar algo de ellos («plata de
 * hugo para juego 31000») y todavía no se ha gastado. No es deuda tuya ni ingreso: es plata ajena.
 */
export function plataDeOtros(movs: Movimiento[], cuentas: Cuenta[], fechaApertura: string): { persona: Cuenta; monto: number; motivo?: string }[] {
  const saldos = calcularSaldos(movs, fechaApertura);
  const recibido = new Map<string, { monto: number; motivo?: string }>();
  for (const m of activos(movs)) {
    const p = m.propuesta as { custodia?: boolean; persona?: string; monto?: number; moneda?: string; motivo?: string } | undefined;
    if (!p?.custodia || (m.tipo !== 'deuda' && m.tipo !== 'pago') || !p.persona || p.moneda === 'USD' || m.ocurridoEn < fechaApertura) continue;
    const persona = cuentas.find(c => c.tipo === 'persona' && c.clave === limpiar(p.persona!));
    if (!persona) continue;
    const previo = recibido.get(persona.id) ?? { monto: 0 };
    // lo que mandó suma; lo que se gastó con su plata resta
    recibido.set(persona.id, { monto: previo.monto + (m.tipo === 'deuda' ? 1 : -1) * (p.monto ?? 0), motivo: p.motivo ?? previo.motivo });
  }
  const res: { persona: Cuenta; monto: number; motivo?: string }[] = [];
  for (const [id, r] of recibido) {
    const persona = cuentas.find(c => c.id === id)!;
    // lo que sigue sin gastar: lo que se le debe, sin pasar de lo que mandó para custodiar
    const monto = Math.min(-(saldos.get(`${id}|COP`) ?? 0), r.monto);
    if (monto > 0) res.push({ persona, monto, motivo: r.motivo });
  }
  return res.sort((a, b) => b.monto - a.monto);
}

export interface DeudaPersona {
  persona: Cuenta;
  moneda: Moneda;
  /** > 0: te debe. < 0: le debes. */
  saldo: number;
  compromisos: Compromiso[];
  /** De lo que le debes, cuánto es plata suya que tienes para gastarla por ella (no es deuda de verdad). */
  deOtros: number;
}

/** Saldo neto con cada persona (solo las que no están en cero). */
export function deudasPorPersona(movs: Movimiento[], cuentas: Cuenta[], compromisos: Compromiso[], fechaApertura: string): DeudaPersona[] {
  const saldos = calcularSaldos(movs, fechaApertura);
  const res: DeudaPersona[] = [];
  const otros = plataDeOtros(movs, cuentas, fechaApertura);
  for (const p of cuentas.filter(c => c.tipo === 'persona')) {
    for (const moneda of ['COP', 'USD'] as Moneda[]) {
      const saldo = saldos.get(`${p.id}|${moneda}`) ?? 0;
      if (saldo === 0) continue;
      res.push({
        persona: p, moneda, saldo,
        compromisos: compromisos.filter(c => c.personaId === p.id && c.moneda === moneda && c.estado === 'activa'),
        deOtros: moneda === 'COP' ? otros.find(x => x.persona.id === p.id)?.monto ?? 0 : 0,
      });
    }
  }
  return res.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
}

/**
 * Marca como saldados los compromisos cuya persona ya quedó en paz:
 * "debo" se salda cuando el saldo de la persona llega a 0 o más; "me_deben" cuando llega a 0 o menos.
 */
export function compromisosSaldados(movs: Movimiento[], cuentas: Cuenta[], compromisos: Compromiso[], fechaApertura: string): Compromiso[] {
  const saldos = calcularSaldos(movs, fechaApertura);
  const cambiados: Compromiso[] = [];
  for (const c of compromisos) {
    if (c.estado !== 'activa') continue;
    const s = saldos.get(`${c.personaId}|${c.moneda}`) ?? 0;
    if ((c.direccion === 'debo' && s >= 0) || (c.direccion === 'me_deben' && s <= 0)) cambiados.push({ ...c, estado: 'saldada' });
  }
  void cuentas;
  return cambiados;
}

/** Cuánto llevas gastado de una categoría en el mes de `ahoraLocal` y el tope si lo hay. */
export function estadoPresupuesto(
  movs: Movimiento[], cuentas: Cuenta[], presupuestos: Record<string, number>, categoriaId: string,
  desde: string, hasta: string, arrastra = false,
): { gastado: number; tope: number; porcentaje: number } | null {
  const base = presupuestos[categoriaId];
  if (!base) return null;
  let tope = base;
  // con arrastre, lo que sobró del mes pasado se suma (solo si la app se usó ese mes, si no no hay nada que arrastrar)
  if (arrastra && desde.slice(8, 10) === '01' && hasta.slice(8, 10) === '01') {
    const y = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7));
    const antes = m === 1 ? `${y - 1}-12-01 00:00:00` : `${y}-${String(m - 1).padStart(2, '0')}-01 00:00:00`;
    if (activos(movs).some(x => x.ocurridoEn >= antes && x.ocurridoEn < desde)) {
      const gAntes = gastoPorCategoria(movs, cuentas, antes, desde).find(x => x.cuenta.id === categoriaId)?.total ?? 0;
      tope += Math.max(0, base - gAntes);
    }
  }
  const g = gastoPorCategoria(movs, cuentas, desde, hasta).find(x => x.cuenta.id === categoriaId)?.total ?? 0;
  return { gastado: g, tope, porcentaje: Math.round((g / tope) * 100) };
}

/** Días desde el último movimiento registrado (o null si no hay): para avisar si pasan muchos. */
export function diasSinRegistros(movs: Movimiento[], ahoraLocal: string): number | null {
  const ult = activos(movs).filter(m => m.origen !== 'excel').map(m => m.creadoEn).sort().pop();
  if (!ult) return null;
  return Math.floor((Date.parse(ahoraLocal.slice(0, 10)) - Date.parse(ult.slice(0, 10))) / 86400000);
}
