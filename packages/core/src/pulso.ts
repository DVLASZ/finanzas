/**
 * El gasto de cada día: sirve para las barras de los últimos días y para el mapa de calor del mes. Es una cuenta sobre
 * lo que ya hay en pantalla, sin guardar nada.
 */
import { gastoPorCategoria, totalIngresos } from './consultas.ts';
import { aLocal } from './fechas.ts';
import type { Datos } from './repo.ts';

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

/** El gasto de cada día de un mes (mes de 1 a 12), para el mapa de calor. Los días que aún no llegan salen en cero. */
export function gastoDelMes(datos: Pick<Datos, 'movimientos' | 'cuentas'>, anio: number, mes: number): GastoDia[] {
  const n = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const p2 = (x: number) => String(x).padStart(2, '0');
  return Array.from({ length: n }, (_, k) => {
    const fecha = `${anio}-${p2(mes)}-${p2(k + 1)}`;
    const sig = new Date(Date.UTC(anio, mes - 1, k + 2)).toISOString().slice(0, 10);
    const total = gastoPorCategoria(datos.movimientos, datos.cuentas, `${fecha} 00:00:00`, `${sig} 00:00:00`).reduce((s, x) => s + x.total, 0);
    return { fecha, diaSemana: new Date(`${fecha}T12:00:00Z`).getUTCDay(), total };
  });
}

export interface MesIngresosGastos {
  /** 'YYYY-MM' */
  mes: string;
  ingresos: number;
  gastos: number;
}

/** Ingresos y gastos de cada uno de los últimos `n` meses (el actual al final): el ahorro neto es la diferencia. */
export function ingresosGastosPorMes(datos: Pick<Datos, 'movimientos' | 'cuentas'>, ahora: Date, n = 6): MesIngresosGastos[] {
  const hoy = aLocal(ahora);
  const anio = Number(hoy.slice(0, 4)), mes = Number(hoy.slice(5, 7));
  const p2 = (x: number) => String(x).padStart(2, '0');
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(anio, mes - 1 - (n - 1 - k), 1));
    const sig = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const desde = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-01 00:00:00`;
    const hasta = `${sig.getUTCFullYear()}-${p2(sig.getUTCMonth() + 1)}-01 00:00:00`;
    return {
      mes: desde.slice(0, 7),
      ingresos: totalIngresos(datos.movimientos, datos.cuentas, desde, hasta),
      gastos: gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta).reduce((s, x) => s + x.total, 0),
    };
  });
}
