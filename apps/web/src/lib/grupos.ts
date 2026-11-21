/**
 * Los movimientos que forman cada grupo de una pantalla de resumen: lo que se escondió detrás de una fila del ranking, de una
 * categoría o de un medio de pago. Usan las mismas claves que el núcleo (concepto sin números, categoría con subcategorías), así que
 * la suma de la lista coincide con la cifra que se tocó.
 */
import { filtrarMovimientos, limpiar, TOPE_HORMIGA, type Datos, type Movimiento } from '../../../../packages/core/src/index.ts';
import { conSubcategorias } from '../../../../packages/core/src/subcategorias.ts';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config'>;

const masNuevosPrimero = (a: Movimiento, b: Movimiento): number => b.ocurridoEn.localeCompare(a.ocurridoEn);
const claveDe = (d: string): string => limpiar(d).replace(/\d+/g, '').trim() || limpiar(d);

/** Lo que bajó de las categorías en un gasto (la parte de quien pagó). */
export function gastoDe(m: Movimiento, categorias: Set<string>): number {
  return m.asientos.filter(a => a.moneda === 'COP' && categorias.has(a.cuentaId)).reduce((s, a) => s + a.monto, 0);
}

/** Los gastos de un concepto («almuerzo», «taxi») en el periodo. Con `soloChicos`, solo las compras de gasto hormiga. */
export function movimientosDeConcepto(datos: Fuente, concepto: string, desde: string, hasta: string, soloChicos = false): Movimiento[] {
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const clave = claveDe(concepto);
  return datos.movimientos
    .filter(m => {
      if (m.estado !== 'ok' || m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta || claveDe(m.descripcion) !== clave) return false;
      const g = gastoDe(m, cats);
      return g > 0 && (!soloChicos || g <= TOPE_HORMIGA);
    })
    .sort(masNuevosPrimero);
}

/** Los gastos de una categoría (con sus subcategorías) en el periodo. */
export function movimientosDeCategoria(datos: Fuente, categoriaId: string, desde: string, hasta: string): Movimiento[] {
  return filtrarMovimientos(datos, { categoria: categoriaId, tipos: ['gasto', 'compartido'], desde, hasta }).sort(masNuevosPrimero);
}

/** Los gastos que salieron de una cuenta de dinero en el periodo (el medio de pago). */
export function movimientosDeMedio(datos: Fuente, cuentaId: string, desde: string, hasta: string): Movimiento[] {
  return datos.movimientos
    .filter(m => m.estado === 'ok' && m.tipo === 'gasto' && m.ocurridoEn >= desde && m.ocurridoEn < hasta && m.asientos.some(a => a.cuentaId === cuentaId && a.moneda === 'COP' && a.monto < 0))
    .sort(masNuevosPrimero);
}

/** Los últimos movimientos que tocaron una cuenta. */
export function movimientosDeCuenta(datos: Fuente, cuentaId: string, n = 12): Movimiento[] {
  return filtrarMovimientos(datos, { cuenta: cuentaId }).filter(m => m.tipo !== 'apertura').sort(masNuevosPrimero).slice(0, n);
}

/** Los movimientos de deuda o préstamo de una persona. */
export function movimientosDePersona(datos: Fuente, personaId: string): Movimiento[] {
  return filtrarMovimientos(datos, { persona: personaId }).sort(masNuevosPrimero);
}

/** Los movimientos de ciertos tipos (ingresos, gastos) en el periodo, los más nuevos primero. */
export function movimientosDeTipos(datos: Fuente, tipos: Movimiento['tipo'][], desde: string, hasta: string): Movimiento[] {
  return filtrarMovimientos(datos, { tipos, desde, hasta }).sort(masNuevosPrimero);
}

/** Lo gastado en una categoría (con sus subcategorías) dentro de una lista de movimientos suyos. */
export function gastoDeCategoria(datos: Fuente, categoriaId: string, movs: Movimiento[]): number {
  const ids = new Set(conSubcategorias(datos.config, categoriaId));
  return movs.reduce((s, m) => s + m.asientos.filter(a => a.moneda === 'COP' && ids.has(a.cuentaId)).reduce((x, a) => x + a.monto, 0), 0);
}

/** Los movimientos que llevan una etiqueta (#viaje) en el periodo, los más nuevos primero. */
export function movimientosDeEtiqueta(datos: Fuente, etiqueta: string, desde: string, hasta: string): Movimiento[] {
  return filtrarMovimientos(datos, { etiqueta, desde, hasta }).sort(masNuevosPrimero);
}
