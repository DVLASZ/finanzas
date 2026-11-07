// Compra con varias líneas: «compra: arroz 5000, sal 2000, 3 gaseosas a 2000 nequi».
import { aMinor, formatear, hallarMontos } from '../dinero.ts';

export interface CompraConLineas {
  /** La frase reescrita como un gasto normal: «arroz, sal, 3 gaseosas 13000 nequi». */
  texto: string;
  concepto: string;
  /** El detalle de cada línea, para la nota. */
  detalle: string;
}

interface Linea { nombre: string; cantidad: number; unitario: number | null; total: number; sobra: string }

/** «3 gaseosas a 2000» -> 3 × 2000; «arroz 5000» -> una línea de 5000. null si la parte no trae cifra. */
function leerLinea(parte: string): Linea | null {
  const montos = hallarMontos(parte).filter(m => m.explicito);
  if (montos.length !== 1) return null;
  const m = montos[0];
  const valor = aMinor(m.valor, 'COP');
  const antes = parte.slice(0, m.inicio).trim();
  const despues = parte.slice(m.fin).trim();
  // lo que viene después de la cifra (la cuenta, «ayer») no es parte del ítem: se devuelve en `sobra`
  const sobra = antes ? despues : '';
  const porUnidad = antes.match(/^(\d{1,3})\s+(.+?)\s+a$/i);
  if (porUnidad) return { nombre: porUnidad[2], cantidad: Number(porUnidad[1]), unitario: valor, total: Number(porUnidad[1]) * valor, sobra };
  const nombre = antes || despues;
  return nombre ? { nombre, cantidad: 1, unitario: null, total: valor, sobra } : null;
}

export function compraConLineas(original: string): CompraConLineas | null {
  const m = original.trim().match(/^compras?\s*:?\s+(.+)$/i);
  if (!m) return null;
  const lineas: Linea[] = [];
  const resto: string[] = [];
  for (const parte of m[1].split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean)) {
    const l = leerLinea(parte);
    if (l) { lineas.push(l); if (l.sobra) resto.push(l.sobra); } else resto.push(parte);
  }
  if (lineas.length < 2) return null;
  const total = lineas.reduce((s, l) => s + l.total, 0);
  const nombres = lineas.map(l => (l.cantidad > 1 ? `${l.cantidad} ${l.nombre}` : l.nombre));
  const detalle = 'Detalle: ' + lineas.map(l => (l.unitario !== null ? `${l.nombre} ${l.cantidad} × ${formatear(l.unitario)} = ${formatear(l.total)}` : `${l.nombre} ${formatear(l.total)}`)).join(' · ');
  return { texto: `${nombres.join(' ')} ${total} ${resto.join(' ')}`.trim(), concepto: `Compra: ${nombres.join(', ')}`, detalle };
}
