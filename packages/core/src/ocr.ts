/**
 * Lectura de comprobantes con IA con visión (Workers AI). El modelo recibe la foto y contesta con líneas
 * «CLAVE: valor». Aquí viven las instrucciones y la lectura tolerante de la respuesta; el Worker solo llama al
 * modelo. Lo que sale nunca se guarda solo: se convierte en una frase para el bot, que arma la tarjeta para confirmar.
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
 * factura por la fecha de la compra, «CAMBIO» por el nombre del comercio y el vuelto por el total. Otro más grande
 * tomó la BASE de la tabla de impuestos por el total.
 *
 * Por eso el modelo también transcribe las líneas clave (`TEXTO`) y el monto se busca aquí, con reglas fijas
 * (`montoDeTexto`), en vez de fiarse de lo que el modelo eligió. Y se le pide texto plano con una clave por línea y
 * no JSON: un `TEXTO` de varias líneas dentro de un JSON trae saltos de línea sueltos que lo rompen.
 */
export const INSTRUCCIONES_OCR = `Eres un lector de comprobantes de pago colombianos: tirillas de caja de supermercados y tiendas (D1, Ara, Éxito, Olímpica, tiendas de barrio) y comprobantes de transferencia de apps y bancos (Nequi, Daviplata, Bancolombia).
Mira la imagen y responde SOLO con estas líneas, una clave por renglón, sin JSON, sin comillas y sin explicaciones:
MONTO: el valor total que se pagó, en pesos, como número entero sin puntos ni símbolos. Toma el TOTAL general o el VALOR PAGADO que aparece justo debajo de la lista de artículos (en una transferencia, «Valor» o «Monto»). En las facturas POS ignora por completo la tabla «RESUMEN DE IMPUESTOS» del final, con sus columnas TOTAL, BASE e IVA: esos números son de los impuestos y no de lo que se pagó. Tampoco uses CAMBIO, VUELTO, SUBTOTAL, descuentos, números de cuenta ni códigos de barras.
FECHA: la fecha de la compra o de la transacción, en formato AAAA-MM-DD. Suele estar arriba, junto a la hora. Ignora las fechas del pie de la factura: la resolución de la DIAN, su vigencia o el rango de numeración autorizado. Si no ves la fecha de la compra, escribe null.
COMERCIO: el nombre del comercio que está en el encabezado (por ejemplo D1, Ara, Éxito, Nequi) o a quién se le pagó. Nunca una palabra suelta como Cambio, Total, Factura o Gracias.
CATEGORIA: una sola palabra entre comida, mercado, transporte, salud, servicios, ropa, recarga u otro.
TEXTO: esta clave va al final. Desde la línea siguiente transcribe tal cual, una línea por renglón, las líneas clave de la tirilla: el encabezado con el nombre del comercio, la línea de la fecha, y las líneas de TOTAL, VALOR PAGADO, TARJETA o EFECTIVO con sus valores. No copies la tabla de impuestos.
Si no estás seguro de un dato, escribe null. No inventes valores.`;

/** Palabras que aparecen en una factura pero no son el nombre de un comercio. */
const NO_ES_COMERCIO = /^(cambio|vuelto|total|subtotal|iva|base|valor|factura|gracias|efectivo|tarjeta|nit|resolucion|recibo|comprobante|null|n\/a)$/;

/** Desde aquí empiezan las tablas de impuestos: sus TOTAL y BASE no son lo que se pagó. */
const INICIO_IMPUESTOS = /resumen\s+de\s+impuestos|\bexcluido\b|\bexento\b/i;
/** Una línea con el valor que se pagó. Va por prioridad: lo pagado, el total y, al final, la forma de pago. */
const LINEAS_DE_MONTO = [
  /\b(valor\s+pagado|total\s+pagado|total\s+a\s+pagar)\b/i,
  /^\W*total\b/i,
  /\btarj(?:eta)?\.?\s*(?:cre|deb)\w*|\befectivo\b/i,
];
/** Líneas que parecen de total pero no lo son. */
const NO_ES_TOTAL = /\b(items?|art[ií]culos?|cantidad|cant\.?|descuento|iva|base|subtotal|cambio|vuelto|impuesto)\b/i;
/** Un valor en pesos: con separador de miles («50,060», «50.060») o de cuatro cifras o más. */
const VALOR = /\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?![\d])(?:[.,]\d{1,2}(?!\d))?/g;

/**
 * El monto que sale de las líneas transcritas, con reglas fijas. Primero corta lo que viene desde «RESUMEN DE
 * IMPUESTOS» para que esa tabla no se cuele. Si el total está solo en esa parte, solo se aceptan líneas de lo
 * pagado o de la forma de pago. Devuelve 0 si no encuentra nada seguro.
 */
export function montoDeTexto(texto: string): number {
  const corte = texto.search(INICIO_IMPUESTOS);
  const antes = (corte >= 0 ? texto.slice(0, corte) : texto).split('\n');
  const todo = texto.split('\n');
  const buscar = (lineas: string[], patrones: RegExp[]): number => {
    for (const p of patrones) {
      const valores: number[] = [];
      for (const l of lineas) {
        if (!p.test(l) || NO_ES_TOTAL.test(l)) continue;
        for (const m of l.matchAll(VALOR)) valores.push(aPesos(m[1]));
      }
      const v = Math.max(0, ...valores);
      if (v > 0) return v;
    }
    return 0;
  };
  return buscar(antes, LINEAS_DE_MONTO) || buscar(todo, [LINEAS_DE_MONTO[0], LINEAS_DE_MONTO[2]]);
}

/** «D1 SAS NIT900276962-1» queda «D1 SAS»: del NIT en adelante no es el nombre. */
function limpiarComercio(c: string): string {
  return c.replace(/\s*\bn\.?\s?i\.?\s?t(?![a-záéíóúñ])\.?.*$/i, '').replace(/\s+\d{6,}.*$/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Le pone `\n` a los saltos de línea que el modelo dejó sueltos dentro de las comillas de un JSON, que es lo que
 * lo hace inválido. Lo de fuera de las comillas no se toca.
 */
function repararJson(texto: string): string {
  let dentro = false, escapado = false, salida = '';
  for (const c of texto) {
    if (dentro && !escapado && c === '\n') { salida += '\\n'; continue; }
    if (dentro && !escapado && c === '\r') continue;
    if (dentro && !escapado && c === '\t') { salida += '\\t'; continue; }
    if (c === '"' && !escapado) dentro = !dentro;
    escapado = c === '\\' && !escapado;
    salida += c;
  }
  return salida;
}

/** Saca el primer objeto JSON de un texto (el modelo a veces lo rodea de palabras o de vallas de código). */
function primerJson(texto: string): unknown {
  const i = texto.indexOf('{'), j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  const objeto = texto.slice(i, j + 1);
  for (const intento of [objeto, repararJson(objeto)]) {
    try { return JSON.parse(intento); } catch { /* se prueba la versión reparada */ }
  }
  return null;
}

/** Las claves de la respuesta en líneas. */
const LINEA_CLAVE = /^\s*(?:[-*•]\s*)?\**\s*(monto|total|fecha|comercio|categor[ií]a|texto)\s*\**\s*:\s*(.*)$/i;

/**
 * Lee la respuesta en líneas «CLAVE: valor». `TEXTO` junta todo lo que sigue hasta el final. Cada clave cuenta la
 * primera vez que aparece: así una línea «FECHA 2026-11-07» dentro del texto transcrito no pisa la fecha de arriba.
 * Devuelve null si no hay ninguna clave.
 */
function deLineas(texto: string): Record<string, string> | null {
  const o: Record<string, string> = {};
  let actual: string | null = null;
  for (const linea of texto.replace(/```[a-z]*/gi, '').split('\n')) {
    const m = linea.match(LINEA_CLAVE);
    const clave = m ? limpiar(m[1]).replace('total', 'monto') : null;
    if (m && clave && !(clave in o) && actual !== 'texto') {
      actual = clave;
      o[clave] = m[2].replace(/^[\s*]+|[\s*]+$/g, '');
    } else if (actual === 'texto') {
      o.texto += '\n' + linea;
    }
  }
  for (const k of Object.keys(o)) o[k] = o[k].trim();
  return Object.keys(o).length ? o : null;
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
 * La respuesta del modelo puede venir en líneas «CLAVE: valor» (lo que se le pide) o en JSON (si lo usa igual).
 * `hoy` («AAAA-MM-DD», hora Colombia) sirve para descartar fechas imposibles: una compra del futuro o de hace más de
 * un año casi seguro es la resolución de la DIAN o un error de lectura, y es mejor dejar la fecha vacía (se usa hoy).
 */
export function leerRespuestaOCR(respuesta: unknown, hoy?: string): LecturaOCR | null {
  const bruto = typeof respuesta === 'string' ? (deLineas(respuesta) ?? primerJson(respuesta)) : respuesta;
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  // si el modelo transcribió las líneas, lo que dicen manda sobre el monto que él eligió
  const deTexto = typeof o.texto === 'string' ? montoDeTexto(o.texto) : 0;
  const monto = deTexto || aPesos(o.monto ?? o.total ?? o.valor);
  if (!(monto > 0) || monto > 2_000_000_000) return null;
  let fecha = aFechaIso(o.fecha);
  if (fecha && hoy && (dias(hoy, fecha) > 1 || dias(fecha, hoy) > 365)) fecha = null;
  let comercio = typeof o.comercio === 'string' ? limpiarComercio(o.comercio).slice(0, 40) : '';
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
