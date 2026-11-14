/**
 * Control básico de existencias para los productos del catálogo. Es opcional: un producto lleva cuenta solo si
 * alguien dijo cuántas unidades tiene («inventario galletas 200»). No es contabilidad de inventario, solo un aviso.
 *
 * Lo que queda se calcula, no se guarda: cada producto recuerda su último conteo (cuántas unidades había y desde
 * cuándo) y se le restan las ventas posteriores que siguen vigentes. Así anular una venta devuelve las unidades
 * sin que nadie tenga que acordarse, y funciona igual en el celular y en el servidor.
 */
import { leerCatalogo, type Catalogo, type Producto } from './ventas.ts';
import { limpiar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

/** Lo que dijo la persona la última vez que contó: «había N unidades en esta fecha». */
export interface Conteo { cantidad: number; desde: string }

/** Cuántas unidades trae una presentación: «paquete de 10» trae 10; «granel» o «botella», 1. */
export function unidadesDe(nombre: string): number {
  const n = /(\d+)/.exec(nombre)?.[1];
  const v = n ? Number(n) : 1;
  return Number.isInteger(v) && v > 0 ? v : 1;
}

/** El conteo de un producto, si lo tiene. */
export function conteoDe(p: Producto): Conteo | null {
  const c = p.conteo;
  return c && Number.isInteger(c.cantidad) && typeof c.desde === 'string' ? c : null;
}

/** ¿Este movimiento es una venta de ese producto, y de cuántas unidades? 0 si no lo es. */
function unidadesVendidas(m: Movimiento, producto: Producto): number {
  const v = (m.propuesta as { venta?: { producto: string; presentacion: string; cantidad: number } } | undefined)?.venta;
  if (!v || m.estado !== 'ok' || limpiar(v.producto) !== limpiar(producto.nombre)) return 0;
  return v.cantidad * unidadesDe(v.presentacion);
}

/** Cuántas unidades quedan, o null si el producto no lleva cuenta. */
export function existenciasDe(p: Producto, movs: Movimiento[]): number | null {
  const c = conteoDe(p);
  if (!c) return null;
  const vendidas = movs.filter(m => m.ocurridoEn >= c.desde).reduce((s, m) => s + unidadesVendidas(m, p), 0);
  return c.cantidad - vendidas;
}

/** Los productos que llevan cuenta, con lo que queda de cada uno. */
export function existencias(config: Record<string, string>, movs: Movimiento[]): { producto: Producto; quedan: number }[] {
  const cat = leerCatalogo({ config });
  return (cat?.productos ?? []).flatMap(p => { const q = existenciasDe(p, movs); return q === null ? [] : [{ producto: p, quedan: q }]; });
}

/** Encuentra un producto por lo que escribió la persona («galletas»), o null. */
export function productoPorNombre(catalogo: Catalogo | null, texto: string): Producto | null {
  const t = limpiar(texto);
  if (!catalogo || !t) return null;
  const sing = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  const clave = t.split(' ').map(sing).join(' ');
  return catalogo.productos.find(p => [p.nombre, ...(p.alias ?? [])].some(n => limpiar(n).split(' ').map(sing).join(' ') === clave)) ?? null;
}

/** El catálogo con el conteo de un producto cambiado: «ahora hay `cantidad` desde `desde`». */
export function conConteo(catalogo: Catalogo, producto: Producto, cantidad: number, desde: string): Catalogo {
  return { ...catalogo, productos: catalogo.productos.map(p => (p === producto ? { ...p, conteo: { cantidad, desde } } : p)) as Producto[] };
}

/** El aviso para una tarjeta de venta: cuántas unidades quedarán, o que no alcanzan. Null si el producto no lleva cuenta. */
export function avisoDeExistencias(config: Record<string, string>, movs: Movimiento[], venta: { producto: string; presentacion: string; cantidad: number }): string | null {
  const producto = leerCatalogo({ config })?.productos.find(p => limpiar(p.nombre) === limpiar(venta.producto));
  const quedan = producto ? existenciasDe(producto, movs) : null;
  if (!producto || quedan === null) return null;
  const sale = venta.cantidad * unidadesDe(venta.presentacion);
  const despues = quedan - sale;
  if (despues < 0) return `Solo te quedan ${quedan} ${quedan === 1 ? 'unidad' : 'unidades'} de ${producto.nombre} y esta venta es de ${sale}. Revisa el conteo: «inventario ${producto.nombre.toLowerCase()} 50».`;
  if (despues <= 5) return `Después de esta venta te quedan ${despues} ${despues === 1 ? 'unidad' : 'unidades'} de ${producto.nombre}.`;
  return null;
}
