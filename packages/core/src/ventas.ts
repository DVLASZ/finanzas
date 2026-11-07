/**
 * Catálogo de productos y ventas: «vendí 3 botellas de jugo», «15 galletas a granel Tomás»,
 * «8 paq por 10 unidades. Tomás», «vendí 2 paquetes de 10 a 7 mil».
 *
 * El catálogo vive en `config.catalogo` (JSON), así se sincroniza como todo lo demás y cada
 * instalación tiene el suyo. Cada presentación trae su precio y sus formas de escribirla (alias).
 */
import type { Contexto } from './tipos.ts';

export interface Presentacion { id: string; nombre: string; alias?: string[]; precio: number }
export interface Producto { id: string; nombre: string; alias?: string[]; presentaciones: Presentacion[] }
export interface Catalogo { productos: Producto[] }

export function leerCatalogo(ctx: Pick<Contexto, 'config'>): Catalogo | null {
  try {
    const c = JSON.parse(ctx.config.catalogo ?? 'null') as Catalogo | null;
    if (c && Array.isArray(c.productos) && c.productos.some(p => Array.isArray(p.presentaciones) && p.presentaciones.length)) return c;
  } catch { /* JSON mal escrito: es como no tener catálogo */ }
  return null;
}

/** «Paquete de 10» -> ['paquete de 10', 'paquete 10', 'paq 10', 'paq por 10', 'paq por 10 unidades', '10 unidades', 'de 10']. */
export function aliasDePresentacion(nombre: string): string[] {
  const n = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const alias = new Set<string>([n]);
  const num = /(\d+)/.exec(n)?.[1];
  if (num) for (const a of [`paquete de ${num}`, `paquete ${num}`, `paq ${num}`, `paq por ${num}`, `paq por ${num} unidades`, `${num} unidades`, `de ${num}`]) alias.add(a);
  if (n === 'granel') for (const a of ['a granel', 'suelta', 'suelto']) alias.add(a);
  return [...alias];
}

/** «paquete de 10=6000» o «granel 500» -> una presentación con su precio. null si no se entiende. */
export function presentacionDeTexto(texto: string): Presentacion | null {
  const m = /^\s*(.+?)\s*(?:=|:|\s)\s*\$?\s*(\d[\d.,]*)\s*(k|mil)?\s*$/i.exec(texto);
  if (!m) return null;
  const crudo = m[2];
  const n = /^\d{1,3}([.,]\d{3})+$/.test(crudo) ? Number(crudo.replace(/[.,]/g, '')) : Number(crudo.replace(',', '.'));
  const precio = Math.round(n * (m[3] ? 1000 : 1));
  const nombre = m[1].trim();
  if (!nombre || !Number.isFinite(precio) || precio <= 0 || precio > 2_000_000_000) return null;
  const id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { id: id || 'p', nombre, alias: aliasDePresentacion(nombre), precio };
}

/** «paquetes» y «paquete» son lo mismo: se quita la «s» final de las palabras largas. */
const singular = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const normal = (t: string): string => t.split(' ').filter(Boolean).map(singular).join(' ');
const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface VentaHallada {
  producto: Producto;
  presentacion: Presentacion;
  cantidad: number;
  /** Precio por unidad: el del catálogo o el que se dijo («a 7 mil»). */
  precio: number;
  /** El precio lo dijo la persona (no es el del catálogo). */
  precioManual: boolean;
  /** Dónde está en el texto, para no confundirlo con otras cosas. */
  tramo: { inicio: number; fin: number };
  /** Palabras del catálogo que entraron en la frase (para no tomarlas por el nombre de una persona). */
  palabras: Set<string>;
}

/** Busca una venta del catálogo en un texto ya normalizado. `null` si no hay catálogo o no se nombra nada de él. */
export function buscarVenta(t: string, ctx: Pick<Contexto, 'config'>): VentaHallada | { error: string } | null {
  const cat = leerCatalogo(ctx);
  if (!cat) return null;
  const texto = normal(t);
  // posición en el texto singularizado ≠ posición en `t`; se trabaja sobre `texto` y se avisa por palabras
  type Cand = { prod: Producto; pres: Presentacion | null; inicio: number; fin: number; largo: number };
  const cands: Cand[] = [];
  for (const prod of cat.productos) {
    for (const pres of prod.presentaciones ?? []) {
      for (const alias of [pres.nombre, ...(pres.alias ?? [])]) {
        const a = normal(alias.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
        if (!a) continue;
        const m = new RegExp(`(?:^| )(${escapar(a)})(?= |$)`).exec(texto);
        if (m) cands.push({ prod, pres, inicio: m.index + (m[0].length - m[1].length), fin: m.index + m[0].length, largo: a.length });
      }
    }
    for (const nombre of [prod.nombre, ...(prod.alias ?? [])]) {
      const a = normal(nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      if (!a) continue;
      const m = new RegExp(`(?:^| )(${escapar(a)})(?= |$)`).exec(texto);
      if (m) cands.push({ prod, pres: null, inicio: m.index + (m[0].length - m[1].length), fin: m.index + m[0].length, largo: a.length });
    }
  }
  if (!cands.length) return null;

  // Producto: el de la presentación más específica (la que más texto cubre) o el nombrado.
  const conPres = cands.filter(c => c.pres).sort((a, b) => b.largo - a.largo);
  const base = conPres[0] ?? cands.sort((a, b) => b.largo - a.largo)[0];
  const producto = base.prod;
  let presentacion = base.pres;
  if (!presentacion) {
    // Se nombró el producto sin presentación: sirve solo si tiene una única presentación.
    if (producto.presentaciones.length === 1) presentacion = producto.presentaciones[0];
    else return { error: `¿Cuál presentación de ${producto.nombre}? ${producto.presentaciones.map(p => p.nombre).join(', ')}. Ejemplo: «vendí 3 ${producto.presentaciones[0].nombre} de ${producto.nombre.toLowerCase()}».` };
  }

  // Cantidad: el número que está justo antes del primer término del catálogo que aparece.
  const primero = Math.min(...cands.filter(c => c.prod === producto).map(c => c.inicio));
  const antes = texto.slice(0, primero).trimEnd();
  const mc = /(?:^| )(\d+)(?: de)?$/.exec(antes);
  if (!mc) return { error: `¿Cuántas ${presentacion.nombre}? Escribe la cantidad, por ejemplo: «vendí 3 ${presentacion.nombre} de ${producto.nombre.toLowerCase()}».` };
  const cantidad = Number(mc[1]);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) return { error: 'La cantidad no es válida.' };

  // Precio manual: «a 7 mil» o «a 7000» después del producto
  const despues = texto.slice(Math.max(...cands.filter(c => c.prod === producto).map(c => c.fin)));
  const mp = /(?:^| )a (\d[\d.,]*\s?(?:k|mil)?)(?= |$)/.exec(despues);
  let precio = presentacion.precio;
  let manual = false;
  if (mp) {
    const v = valorDe(mp[1]);
    if (v !== null) { precio = v; manual = true; }
  }

  const palabras = new Set<string>();
  for (const c of cands.filter(x => x.prod === producto)) for (const w of texto.slice(c.inicio, c.fin).split(' ')) palabras.add(w);
  return { producto, presentacion, cantidad, precio, precioManual: manual, tramo: { inicio: primero, fin: primero }, palabras };
}

/** «7 mil» -> 7000, «7k» -> 7000, «7000» -> 7000, «7.500» -> 7500. */
function valorDe(s: string): number | null {
  const m = /^(\d[\d.,]*)\s?(k|mil)?$/.exec(s.trim());
  if (!m) return null;
  const crudo = m[1];
  const n = /^\d{1,3}([.,]\d{3})+$/.test(crudo) ? Number(crudo.replace(/[.,]/g, '')) : Number(crudo.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n * (m[2] ? 1000 : 1));
  return v > 0 ? v : null;
}
