/**
 * Subcategorías: una categoría puede vivir dentro de otra (Restaurante dentro de Comida, y Domicilios
 * dentro de Restaurante: hasta tres niveles). Los gastos siguen yendo a la categoría donde se anotaron,
 * así nada de lo anterior cambia; las de adentro solo se suman en la de arriba al mostrar. El mapa
 * hijo -> padre vive en la config (`subcategorias`), como la lista de compras, y se sincroniza igual.
 */
import type { Cuenta } from './tipos.ts';

/** Niveles que se permiten: categoría, subcategoría y sub-subcategoría. */
export const MAX_NIVELES = 3;

type Mapa = Record<string, string>;

/** Cuántas categorías hay por encima de esta (0 = una principal). Corta si hay un ciclo. */
export function profundidad(mapa: Mapa, id: string): number {
  let n = 0;
  const visto = new Set([id]);
  for (let p = mapa[id]; p; p = mapa[p]) {
    if (visto.has(p)) return Infinity;
    visto.add(p);
    n++;
  }
  return n;
}

/** {idHijo: idPadre}. Se descartan los ciclos, lo que se pasa de los niveles permitidos y lo que se apunta a sí mismo. */
export function leerSubcategorias(config: Record<string, string>): Mapa {
  try {
    const m = JSON.parse(config.subcategorias ?? '{}');
    if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
    const limpio: Mapa = Object.fromEntries(Object.entries(m).filter(([h, p]) => typeof p === 'string' && h !== p)) as Mapa;
    return Object.fromEntries(Object.entries(limpio).filter(([h]) => profundidad(limpio, h) < MAX_NIVELES));
  } catch { return {}; }
}

/** Todas las categorías que están dentro de esta, a cualquier nivel. */
export function descendientes(mapa: Mapa, id: string): string[] {
  const res: string[] = [];
  const pendientes = [id];
  while (pendientes.length) {
    const actual = pendientes.pop()!;
    for (const [h, p] of Object.entries(mapa)) if (p === actual && !res.includes(h) && h !== id) { res.push(h); pendientes.push(h); }
  }
  return res;
}

/** Cuántos niveles tiene por debajo (0 = no tiene subcategorías). */
export function altura(mapa: Mapa, id: string): number {
  const hijos = Object.entries(mapa).filter(([, p]) => p === id).map(([h]) => h);
  return hijos.length ? 1 + Math.max(...hijos.map(h => altura(mapa, h))) : 0;
}

/** ¿Se puede poner `id` dentro de `padre`? No sobre sí misma, ni dentro de lo suyo, ni pasando de los niveles. */
export function puedeIrDentro(mapa: Mapa, id: string, padre: string): boolean {
  if (id === padre || descendientes(mapa, id).includes(padre)) return false;
  return profundidad(mapa, padre) + 1 + altura(mapa, id) < MAX_NIVELES;
}

/** El id de la categoría y los de todas las que están dentro de ella. */
export function conSubcategorias(config: Record<string, string>, id: string): string[] {
  return [id, ...descendientes(leerSubcategorias(config), id)];
}

/** «Comida › Restaurante»: la ruta de una categoría desde la principal. */
export function rutaDe(mapa: Mapa, id: string, cuentas: Cuenta[]): string {
  const nombres: string[] = [];
  for (let actual: string | undefined = id; actual && nombres.length < MAX_NIVELES; actual = mapa[actual]) nombres.unshift(cuentas.find(c => c.id === actual)?.nombre ?? actual);
  return nombres.join(' › ');
}

export interface GrupoCategoria {
  cuenta: Cuenta;
  /** Lo de la categoría más lo de todas las de adentro. */
  total: number;
  /** Lo anotado directamente en esta categoría. */
  propio: number;
  /** Lo de cada subcategoría con gasto (lo suyo, sin sus hijas), en orden de árbol; `nivel` 1 = hija, 2 = nieta. */
  hijos: { cuenta: Cuenta; total: number; nivel: number }[];
}

/** Junta cada subcategoría con su categoría principal y ordena de mayor a menor. */
export function agruparCategorias(filas: { cuenta: Cuenta; total: number }[], config: Record<string, string>, cuentas: Cuenta[]): GrupoCategoria[] {
  const mapa = leerSubcategorias(config);
  const raizDe = (id: string): string => { let a = id; while (mapa[a]) a = mapa[a]; return a; };
  const grupos = new Map<string, GrupoCategoria>();
  const grupoDe = (cuenta: Cuenta): GrupoCategoria => {
    let g = grupos.get(cuenta.id);
    if (!g) { g = { cuenta, total: 0, propio: 0, hijos: [] }; grupos.set(cuenta.id, g); }
    return g;
  };
  const propios = new Map(filas.map(f => [f.cuenta.id, f.total]));
  for (const f of filas) {
    const raiz = cuentas.find(c => c.id === raizDe(f.cuenta.id)) ?? f.cuenta;
    const g = grupoDe(raiz);
    g.total += f.total;
    if (raiz.id === f.cuenta.id) g.propio += f.total;
    else g.hijos.push({ cuenta: f.cuenta, total: f.total, nivel: profundidad(mapa, f.cuenta.id) });
  }
  // las hijas van debajo de su madre, y entre hermanas de mayor a menor (contando lo que tengan adentro)
  const subtotal = (id: string): number => (propios.get(id) ?? 0) + descendientes(mapa, id).reduce((s, d) => s + (propios.get(d) ?? 0), 0);
  for (const g of grupos.values()) {
    const presentes = new Map(g.hijos.map(h => [h.cuenta.id, h]));
    const ordenado: GrupoCategoria['hijos'] = [];
    const visitar = (padre: string) => {
      const hijas = Object.entries(mapa).filter(([, p]) => p === padre).map(([h]) => h).filter(h => subtotal(h) > 0).sort((a, b) => subtotal(b) - subtotal(a));
      for (const h of hijas) {
        const f = presentes.get(h);
        // una intermedia sin gasto propio igual se muestra (en cero) para que se vea de dónde cuelga la de abajo
        const cuenta = f?.cuenta ?? cuentas.find(c => c.id === h);
        if (cuenta) ordenado.push({ cuenta, total: f?.total ?? 0, nivel: profundidad(mapa, h) });
        visitar(h);
      }
    };
    visitar(g.cuenta.id);
    g.hijos = ordenado;
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total);
}
