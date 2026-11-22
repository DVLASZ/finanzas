/**
 * Comparativa del mes contra el anterior y proyección del cierre.
 *
 * Para que sea justa, lo que va de este mes se compara con lo que había gastado el mes pasado en el MISMO número de
 * días (el 12 de noviembre contra el 12 de octubre), no contra el mes completo. La proyección es lineal: lo gastado
 * hasta hoy, repartido entre los días que van, por los días del mes. Es una pista, no una promesa: un arriendo que
 * cae el 28 la desordena, y por eso solo se muestra con unos días de datos.
 */
import { gastoPorCategoria } from './consultas.ts';
import { formatear } from './dinero.ts';
import { aLocal } from './fechas.ts';
import { agruparCategorias } from './subcategorias.ts';
import type { Datos } from './repo.ts';

export interface FilaComparativa {
  cuentaId: string;
  nombre: string;
  /** Gastado este mes hasta hoy. */
  actual: number;
  /** Gastado el mes pasado en los mismos días. */
  anterior: number;
  /** Variación en porcentaje entera (+15, -20), o null si el mes pasado no hubo nada con qué comparar. */
  variacion: number | null;
}

export interface ComparativaMensual {
  filas: FilaComparativa[];
  totalActual: number;
  totalAnteriorMismosDias: number;
  totalMesAnterior: number;
  variacionTotal: number | null;
  dia: number;
  diasDelMes: number;
  /** Cierre estimado del mes; null mientras haya muy pocos días de datos. */
  proyeccion: number | null;
  /** Cuánto más (positivo) o menos (negativo) que el mes pasado completo, en porcentaje, o null. */
  proyeccionVsMesAnterior: number | null;
}

/** Días mínimos con datos para atreverse a proyectar. */
export const DIAS_PARA_PROYECTAR = 5;

const p2 = (n: number) => String(n).padStart(2, '0');
const pct = (actual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);

export function comparativaMensual(datos: Pick<Datos, 'movimientos' | 'cuentas'> & { config?: Record<string, string> }, ahora: Date): ComparativaMensual {
  const hoy = aLocal(ahora);
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7)), dia = Number(hoy.slice(8, 10));
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const inicio = `${anio}-${p2(mes)}-01 00:00:00`;
  const manana = `${anio}-${p2(mes)}-${p2(dia)} 23:59:59`;
  const anioAnt = mes === 1 ? anio - 1 : anio, mesAnt = mes === 1 ? 12 : mes - 1;
  const diasMesAnt = new Date(Date.UTC(anioAnt, mesAnt, 0)).getUTCDate();
  const inicioAnt = `${anioAnt}-${p2(mesAnt)}-01 00:00:00`;
  const hastaAnt = `${anioAnt}-${p2(mesAnt)}-${p2(Math.min(dia, diasMesAnt))} 23:59:59`;
  const finMesAnt = `${anioAnt}-${p2(mesAnt)}-${p2(diasMesAnt)} 23:59:59`;

  const sumar = (l: { total: number }[]) => l.reduce((s, x) => s + x.total, 0);
  // cada fila es una categoría principal con lo de sus subcategorías, igual que la ventana que se abre al tocarla
  const agrupado = (desde: string, hasta: string) => agruparCategorias(gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta), datos.config ?? {}, datos.cuentas);
  const actual = agrupado(inicio, manana);
  const anterior = agrupado(inicioAnt, hastaAnt);
  const totalActual = sumar(actual);
  const totalAnteriorMismosDias = sumar(anterior);
  const totalMesAnterior = sumar(gastoPorCategoria(datos.movimientos, datos.cuentas, inicioAnt, finMesAnt));

  const ids = new Set([...actual.filter(x => x.total > 0).map(x => x.cuenta.id), ...anterior.filter(x => x.total > 0).map(x => x.cuenta.id)]);
  const filas: FilaComparativa[] = [...ids].map(id => {
    const a = actual.find(x => x.cuenta.id === id), b = anterior.find(x => x.cuenta.id === id);
    const nombre = (a ?? b)!.cuenta.nombre;
    return { cuentaId: id, nombre, actual: a?.total ?? 0, anterior: b?.total ?? 0, variacion: pct(a?.total ?? 0, b?.total ?? 0) };
  }).sort((x, y) => Math.max(y.actual, y.anterior) - Math.max(x.actual, x.anterior));

  const proyeccion = dia >= DIAS_PARA_PROYECTAR && totalActual > 0 ? Math.round((totalActual / dia) * diasDelMes) : null;
  return {
    filas, totalActual, totalAnteriorMismosDias, totalMesAnterior, variacionTotal: pct(totalActual, totalAnteriorMismosDias),
    dia, diasDelMes, proyeccion, proyeccionVsMesAnterior: proyeccion !== null ? pct(proyeccion, totalMesAnterior) : null,
  };
}

/** Un texto corto para la alerta: «A este ritmo cerrarás el mes en $X, 20 % más que el mes pasado». Null si no hay nada que decir. */
export function textoProyeccion(c: ComparativaMensual): string | null {
  if (c.proyeccion === null) return null;
  const vs = c.proyeccionVsMesAnterior;
  const resto = vs === null ? '' : vs > 0 ? `, ${vs} % más que el mes pasado` : vs < 0 ? `, ${-vs} % menos que el mes pasado` : ', igual que el mes pasado';
  return `A este ritmo cerrarás el mes en ${formatear(c.proyeccion)}${resto}.`;
}
