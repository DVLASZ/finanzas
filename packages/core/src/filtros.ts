/**
 * Filtro de movimientos para la pantalla Movimientos y para exportar: texto, etiqueta (#viaje), tipo, categoría,
 * cuenta, persona y rango de fechas. Es una función pura: la pantalla la llama en cada tecla sin recargar nada.
 */
import { conSubcategorias } from './subcategorias.ts';
import { limpiar } from './texto.ts';
import type { Datos } from './repo.ts';
import type { Movimiento } from './tipos.ts';
import { esArqueoAnulado } from './revision.ts';
import { extraerEtiquetas, tieneEtiquetas, tokensDeEtiqueta } from './etiquetas.ts';

export interface FiltroMovimientos {
  /** Palabras que tienen que aparecer todas (en cualquier orden). Una palabra con # busca esa etiqueta. */
  texto?: string;
  /** Una o varias etiquetas (por palabra completa), con o sin #; el movimiento tiene que llevarlas todas. */
  etiqueta?: string;
  /** Tipos de movimiento permitidos; vacío o ausente: todos. */
  tipos?: string[];
  categoria?: string;
  cuenta?: string;
  persona?: string;
  /** Rango de fechas: `desde` incluida, `hasta` excluida, en «AAAA-MM-DD» o «AAAA-MM-DD HH:MM:SS». */
  desde?: string;
  hasta?: string;
  /** Incluir los anulados (los arqueos anulados no salen nunca). */
  anulados?: boolean;
}


export function filtrarMovimientos(datos: Pick<Datos, 'movimientos' | 'config'>, f: FiltroMovimientos): Movimiento[] {
  const dichas = extraerEtiquetas(f.texto ?? ''); // los #hashtags del buscador, con su guion bajo
  const palabras = limpiar(dichas.texto).split(' ').filter(Boolean);
  const etiquetas = [...dichas.etiquetas, ...tokensDeEtiqueta(f.etiqueta)];
  const sueltas = palabras;
  const tocan = (m: Movimiento, id: string) => m.asientos.some(a => a.cuentaId === id);
  const categorias = f.categoria ? conSubcategorias(datos.config, f.categoria) : [];
  const dia = (x: string) => (x.length <= 10 ? x : x.slice(0, 10));
  return datos.movimientos
    .filter(m => !esArqueoAnulado(m) && (f.anulados || m.estado === 'ok')
      && (!f.desde || m.ocurridoEn.slice(0, 10) >= dia(f.desde))
      && (!f.hasta || m.ocurridoEn.slice(0, 10) < dia(f.hasta))
      && (!f.tipos?.length || f.tipos.includes(m.tipo))
      && (!f.categoria || categorias.some(id => tocan(m, id)))
      && (!f.cuenta || tocan(m, f.cuenta))
      && (!f.persona || tocan(m, f.persona))
      && tieneEtiquetas(m.etiqueta, etiquetas)
      && (!sueltas.length || sueltas.every(p => limpiar(`${m.descripcion} ${m.etiqueta ?? ''} ${m.lugarDesde ?? ''} ${m.lugarHasta ?? ''} ${m.nota ?? ''}`).includes(p))))
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
}

/** Las etiquetas que hay en los movimientos, de la más usada a la menos, para ofrecerlas como botones. */
export function etiquetasUsadas(movs: Movimiento[]): { etiqueta: string; n: number }[] {
  const cuenta = new Map<string, { etiqueta: string; n: number }>();
  for (const m of movs) {
    if (m.estado !== 'ok') continue;
    for (const k of new Set(tokensDeEtiqueta(m.etiqueta))) cuenta.set(k, { etiqueta: k, n: (cuenta.get(k)?.n ?? 0) + 1 });
  }
  return [...cuenta.values()].sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}
