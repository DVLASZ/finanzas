/**
 * Lectura de comprobantes con IA con visión (Workers AI). El modelo recibe la foto y devuelve un JSON con lo que
 * ve. Aquí viven las instrucciones y la lectura tolerante de la respuesta; el Worker solo llama al modelo.
 * Lo que sale nunca se guarda solo: se convierte en una frase para el bot, que arma la tarjeta para confirmar.
 */
import { limpiar } from './texto.ts';

export interface LecturaOCR {
  /** En pesos, sin decimales. */
  monto: number;
  /** «AAAA-MM-DD» si se pudo leer. */
  fecha: string | null;
  /** Comercio o a quién se le pagó. */
  comercio: string;
  /** Una categoría sugerida. */
  categoria: string | null;
}

export const INSTRUCCIONES_OCR = 'Eres un lector de comprobantes de pago colombianos (Nequi, Daviplata, Bancolombia, tirillas de caja). ' +
  'Mira la imagen y responde SOLO un JSON con estas claves: "monto" (número en pesos, sin puntos ni símbolos), ' +
  '"fecha" (AAAA-MM-DD o null), "comercio" (a quién se pagó, corto) y "categoria" (una palabra: comida, transporte, mercado, salud, ' +
  'servicios, ropa, recarga, otro). Si no lees algo, pon null. No inventes.';

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

export function leerRespuestaOCR(respuesta: unknown): LecturaOCR | null {
  const bruto = typeof respuesta === 'string' ? primerJson(respuesta) : respuesta;
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  const monto = aPesos(o.monto);
  if (!(monto > 0) || monto > 2_000_000_000) return null;
  const fecha = typeof o.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : null;
  const comercio = typeof o.comercio === 'string' ? o.comercio.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  const categoria = typeof o.categoria === 'string' && o.categoria.trim() ? limpiar(o.categoria).slice(0, 20) : null;
  return { monto, fecha, comercio, categoria };
}

/** La frase que el bot entiende: «almuerzo 12000», con el día si no es hoy. Sin comercio se usa la categoría. */
export function fraseDeOCR(l: LecturaOCR, hoy: string): string {
  const concepto = (l.comercio || l.categoria || 'gasto').toLowerCase();
  const cuando = l.fecha && l.fecha !== hoy ? ` ${l.fecha.slice(8, 10)}/${l.fecha.slice(5, 7)}` : '';
  return `${concepto} ${l.monto}${cuando}`;
}
