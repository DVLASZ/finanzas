/**
 * Lectura de comprobantes con IA con visión (Workers AI). El modelo recibe la foto y devuelve un JSON con lo que
 * ve. Aquí viven las instrucciones y la lectura tolerante de la respuesta; el Worker solo llama al modelo.
 * Lo que sale nunca se guarda solo: se convierte en una frase para el bot, que arma la tarjeta para confirmar.
 */
import { limpiar } from './texto.ts';

export interface LecturaOCR {
  /** En pesos, sin decimales. */
  monto: number;
  /** «AAAA-MM-DD» si se pudo leer y es creíble. */
  fecha: string | null;
  /** Comercio o a quién se le pagó. */
  comercio: string;
  /** Una categoría sugerida. */
  categoria: string | null;
}

/**
 * Las reglas salen de errores reales: un modelo pequeño tomó la fecha de la resolución de la DIAN del pie de la
 * factura por la fecha de la compra, «CAMBIO» por el nombre del comercio y el vuelto por el total.
 */
export const INSTRUCCIONES_OCR = `Eres un lector de comprobantes de pago colombianos: tirillas de caja de supermercados y tiendas (D1, Ara, Éxito, Olímpica, tiendas de barrio) y comprobantes de transferencia de apps y bancos (Nequi, Daviplata, Bancolombia).
Mira la imagen y responde SOLO un objeto JSON, sin texto antes ni después, con estas claves:
- "monto": el valor total que se pagó, en pesos, como número entero sin puntos ni símbolos. Busca «TOTAL», «TOTAL A PAGAR» o «VALOR PAGADO» (en una transferencia, «Valor» o «Monto»). No uses CAMBIO, VUELTO, IVA, BASE, SUBTOTAL, descuentos, números de cuenta ni códigos de barras.
- "fecha": la fecha de la compra o de la transacción, en formato AAAA-MM-DD. Suele estar arriba, junto a la hora. Ignora las fechas del pie de la factura: la resolución de la DIAN, su vigencia o el rango de numeración autorizado. Si no ves la fecha de la compra, pon null.
- "comercio": el nombre del comercio que está en el encabezado (por ejemplo D1, Ara, Éxito, Nequi) o a quién se le pagó. Nunca una palabra suelta como Cambio, Total, Factura o Gracias.
- "categoria": una sola palabra entre comida, mercado, transporte, salud, servicios, ropa, recarga u otro.
Si no estás seguro de un dato, pon null. No inventes valores.`;

/** Palabras que aparecen en una factura pero no son el nombre de un comercio. */
const NO_ES_COMERCIO = /^(cambio|vuelto|total|subtotal|iva|base|valor|factura|gracias|efectivo|tarjeta|nit|resolucion|recibo|comprobante|null|n\/a)$/;

/** Saca el primer objeto JSON de un texto (el modelo a veces lo rodea de palabras). */
function primerJson(texto: string): unknown {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(texto.slice(i, j + 1)); } catch { return null; }
}

/** Convierte «45.000», «$ 45,000» o 45000 en 45000. */
function aPesos(v: unknown): number {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v !== 'string') return 0;
  const s = v.replace(/[^\d.,]/g, '');
  // «45.000» y «45,000» son miles; «45.50» sería decimal y en pesos se redondea
  const miles = /^\d{1,3}([.,]\d{3})+$/.test(s);
  return Math.round(Number(miles ? s.replace(/[.,]/g, '') : s.replace(',', '.'))) || 0;
}

/** «2026-11-07» o «07/11/2026» a «2026-11-07»; otra cosa, null. */
function aFechaIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

const dias = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * `hoy` («AAAA-MM-DD», hora Colombia) sirve para descartar fechas imposibles: una compra del futuro o de hace más de
 * un año casi seguro es la resolución de la DIAN o un error de lectura, y es mejor dejar la fecha vacía (se usa hoy).
 */
export function leerRespuestaOCR(respuesta: unknown, hoy?: string): LecturaOCR | null {
  const bruto = typeof respuesta === 'string' ? primerJson(respuesta) : respuesta;
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  const monto = aPesos(o.monto ?? o.total ?? o.valor);
  if (!(monto > 0) || monto > 2_000_000_000) return null;
  let fecha = aFechaIso(o.fecha);
  if (fecha && hoy && (dias(hoy, fecha) > 1 || dias(fecha, hoy) > 365)) fecha = null;
  let comercio = typeof o.comercio === 'string' ? o.comercio.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (NO_ES_COMERCIO.test(limpiar(comercio))) comercio = '';
  const categoria = typeof o.categoria === 'string' && o.categoria.trim() && limpiar(o.categoria) !== 'null' ? limpiar(o.categoria).slice(0, 20) : null;
  return { monto, fecha, comercio, categoria };
}

/** La frase que el bot entiende: «almuerzo 12000», con el día si no es hoy. Sin comercio se usa la categoría. */
export function fraseDeOCR(l: LecturaOCR, hoy: string): string {
  const concepto = (l.comercio || l.categoria || 'gasto').toLowerCase();
  const cuando = l.fecha && l.fecha !== hoy ? ` ${l.fecha.slice(8, 10)}/${l.fecha.slice(5, 7)}` : '';
  return `${concepto} ${l.monto}${cuando}`;
}
