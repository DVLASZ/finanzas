/**
 * Datos para las gráficas del Resumen: el flujo del mes día a día, los conceptos donde más se va la plata y con qué se paga
 * (efectivo o digital). Son cuentas sobre lo que ya hay en pantalla; no se guarda nada.
 */
import { gastoPorCategoria, totalIngresos } from './consultas.ts';
import { limpiar } from './texto.ts';
import type { Datos } from './repo.ts';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas'>;

const p2 = (x: number) => String(x).padStart(2, '0');

export interface PuntoDeFlujo { fecha: string; neto: number; acumulado: number }

/**
 * El balance (ingresos menos gastos) de cada día de un mes (de 1 a 12), sumado día tras día. Los días que aún no llegan se
 * cortan en `hastaDia`, para que la línea termine hoy y no se estire en plano hasta fin de mes.
 */
export function flujoAcumulado(datos: Fuente, anio: number, mes: number, hastaDia?: number): PuntoDeFlujo[] {
  const n = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const ultimo = Math.min(n, hastaDia ?? n);
  let acumulado = 0;
  return Array.from({ length: ultimo }, (_, k) => {
    const fecha = `${anio}-${p2(mes)}-${p2(k + 1)}`;
    const sig = new Date(Date.UTC(anio, mes - 1, k + 2)).toISOString().slice(0, 10);
    const d = `${fecha} 00:00:00`, h = `${sig} 00:00:00`;
    const gastos = gastoPorCategoria(datos.movimientos, datos.cuentas, d, h).reduce((s, x) => s + x.total, 0);
    const neto = totalIngresos(datos.movimientos, datos.cuentas, d, h) - gastos;
    acumulado += neto;
    return { fecha, neto, acumulado };
  });
}

export interface ConceptoTop { concepto: string; veces: number; total: number; pct: number }

/** Los `n` conceptos (lo que escribiste: «almuerzo», «taxi») que más plata se llevaron en [desde, hasta), con su parte del total. */
export function topConceptos(datos: Fuente, desde: string, hasta: string, n = 5): ConceptoTop[] {
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const grupos = new Map<string, { concepto: string; veces: number; total: number }>();
  let suma = 0;
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    const monto = m.asientos.filter(a => a.moneda === 'COP' && cats.has(a.cuentaId)).reduce((s, a) => s + a.monto, 0);
    if (monto <= 0) continue;
    const clave = limpiar(m.descripcion).replace(/\d+/g, '').trim() || limpiar(m.descripcion);
    const g = grupos.get(clave) ?? { concepto: m.descripcion.replace(/\d+/g, '').trim() || m.descripcion, veces: 0, total: 0 };
    g.veces++; g.total += monto;
    grupos.set(clave, g);
    suma += monto;
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total).slice(0, n).map(g => ({ ...g, pct: suma > 0 ? Math.round((g.total / suma) * 100) : 0 }));
}

export interface MedioDePago { nombre: string; efectivo: boolean; total: number; pct: number }

/**
 * Con qué se pagó lo gastado en [desde, hasta): sale de la cuenta de dinero que bajó en cada gasto. Efectivo y monedas cuentan como
 * efectivo; lo demás (Nequi, el banco, la tarjeta) son medios digitales.
 */
export function gastoPorMedio(datos: Fuente, desde: string, hasta: string): MedioDePago[] {
  const dinero = new Map(datos.cuentas.filter(c => c.tipo === 'dinero').map(c => [c.id, c]));
  const acum = new Map<string, number>();
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || m.tipo !== 'gasto' || m.ocurridoEn < desde || m.ocurridoEn >= hasta) continue;
    for (const a of m.asientos) {
      if (a.moneda === 'COP' && a.monto < 0 && dinero.has(a.cuentaId)) acum.set(a.cuentaId, (acum.get(a.cuentaId) ?? 0) - a.monto);
    }
  }
  const suma = [...acum.values()].reduce((s, x) => s + x, 0);
  return [...acum.entries()]
    .map(([id, total]) => ({ nombre: dinero.get(id)!.nombre, efectivo: id === 'efectivo' || id === 'monedas', total, pct: suma > 0 ? Math.round((total / suma) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}
