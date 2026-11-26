/**
 * Cuentas compuestas dichas en una frase: propina, IVA, descuentos, domicilio, promociones y repartos. Corre antes de
 * interpretar y deja la frase con el total final, para que el resto la lea como cualquier gasto:
 *   «almuerzo 28000 más 10% de propina»  ->  «almuerzo 30800»
 *   «chaqueta 200k, primero 20% y luego otros 10%»  ->  «chaqueta 144000»
 * Los porcentajes se aplican sobre la base que diga la frase y cada parte se redondea a pesos, así la suma cuadra exacto.
 * Lo que no tiene porcentajes ni ajustes («almuerzo 12000») pasa igual. Cuando la cuenta no se puede cerrar sin inventar
 * (un invitado, un interés) devuelve una pregunta en vez de un total.
 */
import type { Resultado } from './parser/tipos.ts';

// un monto: «28000», «4.800», «46k», «5 mil». No toma cifras seguidas de «%».
const M = String.raw`(?<![\d.,])\d[\d.,]*(?:\s?(?:k|mil|lucas?)\b)?(?!\d|\s*%)`;
const PCT = String.raw`(\d+(?:[.,]\d+)?)\s*%`;
const CANT = String.raw`\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce`;
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const num = (s: string): number => NUM[s.toLowerCase()] ?? Number(s);

/** Lo mismo con las tildes quitadas letra por letra, para que los índices coincidan con el texto original. */
const plano = (s: string): string => s.toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');

/** Valor en pesos de un monto escrito. Con «k» o «mil» son miles; «4.800» y «15.200» llevan punto de miles. */
function valor(s: string, hablado = false): number {
  const cifras = /\d[\d.,]*/.exec(s)?.[0].replace(/[.,]+$/, '') ?? '0';
  const miles = /[a-z]/i.test(s);
  const n = /^\d{1,3}(?:[.,]\d{3})+$/.test(cifras) ? Number(cifras.replace(/[.,]/g, '')) : Number(cifras.replace(',', '.'));
  if (miles) return Math.round(n * 1000);
  return hablado && n < 1000 ? n * 1000 : Math.round(n);
}

const limpiarBordes = (s: string): string =>
  s.replace(/\s+/g, ' ').replace(/(?:[\s,;]+|\b(?:y|m[aá]s|con|pero|sobre)\b)+$/gi, '').replace(/^[\s,;]+/, '').trim();

/** Una pregunta con dos salidas: cada botón trae la frase que se manda si se elige. */
function preguntar(mensaje: string, opciones: { titulo: string; frase: string }[]): Resultado {
  return { clase: 'pregunta', mensaje, opciones };
}

const conMiles = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Concepto de lo que va antes del primer monto: «el arroz costó» queda «arroz». */
function concepto(antes: string): string {
  return limpiarBordes(antes.replace(/\b(?:fue|fueron|costo|costó|cuesta|valia|valía|vale|es|son)\s*$/i, '').replace(/^\s*(?:el|la|los|las)\s+/i, ''));
}

/** Casos con forma propia. Devuelve la frase nueva, una pregunta, o null si ninguno aplica. */
function especiales(texto: string, t: string): string | Resultado | null {
  let m: RegExpExecArray | null;

  // «chaqueta 200k, primero 20% y luego otros 10% sobre el precio rebajado»: descuentos sucesivos, no 30%
  m = new RegExp(String.raw`^(.*?)\s*(${M})[\s,;]+primero\s+${PCT}\s+y\s+luego\s+(?:otros?\s+)?${PCT}`).exec(t);
  if (m) {
    const base = valor(m[2]);
    const tras1 = base - Math.round((base * Number(m[3].replace(',', '.'))) / 100);
    const total = tras1 - Math.round((tras1 * Number(m[4].replace(',', '.'))) / 100);
    return limpiarBordes(`${texto.slice(0, m[1].length)} ${total}`);
  }

  // «propina del 10% sobre 60k, no sobre el total con domicilio de 8k»: la propina solo sobre lo que dice
  m = new RegExp(String.raw`^(.*?)\bpropina\s+(?:del?\s+)?${PCT}\s+sobre\s+(?:los\s+|las\s+)?(${M})[\s,;]+no\s+sobre\s+el\s+total\s+con\s+(?:el\s+)?domicilio\s+(?:de\s+)?(${M})`).exec(t);
  if (m) {
    const base = valor(m[3]);
    const total = base + Math.round((base * Number(m[2].replace(',', '.'))) / 100) + valor(m[4]);
    return `${limpiarBordes(texto.slice(0, m[1].length)) || 'cuenta'} ${total}`.trim();
  }

  // «tres camisetas a 40k cada una, promoción 3x2»: se pagan 2 de cada 3
  m = new RegExp(String.raw`(?:^|\s)(${CANT})\s+([a-z]+(?:\s+[a-z]+){0,2}?)\s+(?:de\s+a|a|por)\s+(${M})(?:\s+(?:cada\s+un[oa]|c\/u|cada))?[\s,;]+(?:con\s+)?(?:promocion|promo|oferta)?\s*(\d)\s*[x×]\s*(\d)(?![\da-z])`).exec(t);
  if (m) {
    const n = num(m[1]);
    const [lleva, paga] = [Number(m[4]), Number(m[5])];
    if (n >= 1 && lleva > paga && paga >= 1) {
      const pagadas = Math.floor(n / lleva) * paga + (n % lleva);
      return `${m[2]} ${pagadas * valor(m[3])}`;
    }
  }

  // «el arroz costó 4.800 el kilo y compré 3 kilos»: precio por unidad por la cantidad
  m = new RegExp(String.raw`^(.*?)(${M})\s+(?:el|la|por)\s+(kilo|libra|litro|metro|galon|paquete|unidad|caja|botella)\s*(?:,|y)?\s*(?:compre|lleve|pedi|eche|compramos)?\s*(${CANT})\s+(?:kilos?|libras?|litros?|metros?|galon(?:es)?|paquetes?|unidades?|cajas?|botellas?)(?![a-z])`).exec(t);
  if (m) {
    const total = valor(m[2]) * num(m[4]);
    const nombre = concepto(texto.slice(0, m[1].length));
    return nombre ? `${nombre} ${total}` : String(total);
  }

  // «la cuenta fue 80k, yo puse 50 y Juan puso 30»: mi gasto es lo que yo puse; lo de Juan ya lo pagó él
  m = new RegExp(String.raw`^(.*?)(${M})[\s,;]+yo\s+puse\s+(${M})\s+y\s+([a-z]+)\s+puso\s+(${M})\s*$`).exec(t);
  if (m) {
    const total = valor(m[2]);
    const mio = valor(m[3], true);
    if (mio > 0 && mio < total) {
      const nombre = concepto(texto.slice(0, m[1].length));
      return `${nombre || 'cuenta'} ${mio}`;
    }
  }

  // «pizza 90k entre cuatro, pero yo invito a uno»: no se sabe quién paga la parte del invitado
  m = new RegExp(String.raw`^(.*?)(${M})\s+entre\s+(${CANT})[\s,;]+(?:pero\s+)?(?:yo\s+)?invito\s+a\s+(?:${CANT})\s*$`).exec(t);
  if (m) {
    const total = valor(m[2]);
    const n = num(m[3]);
    const nombre = concepto(texto.slice(0, m[1].length)) || 'cuenta';
    if (n >= 2 && total > 0) {
      return preguntar(`Invitas a uno de ${n}: ¿quién paga su parte? Así queda la cuenta de ${conMiles(total)}.`, [
        { titulo: `Yo pago todo (${conMiles(total)})`, frase: `${nombre} ${total}` },
        { titulo: `Solo mi parte (${conMiles(Math.ceil(total / n))})`, frase: `${nombre} ${Math.ceil(total / n)}` },
      ]);
    }
  }

  // «cuenta 100k entre 3, redondea a pesos»: tu parte con el peso sobrante a quien paga
  m = new RegExp(String.raw`^(.*?)(${M})\s+entre\s+(${CANT})[\s,;]+(?:y\s+)?redondea\w*(?:\s+a\s+pesos(?:\s+enteros)?)?\s*$`).exec(t);
  if (m) {
    const total = valor(m[2]);
    const n = num(m[3]);
    if (n >= 2 && total > 0) return `${limpiarBordes(texto.slice(0, m[1].length)) || 'cuenta'} ${Math.ceil(total / n)}`;
  }

  // «presté 100k y me devolvieron 110k por el interés»: capital y rendimiento van aparte; no se inventa la tasa
  m = new RegExp(String.raw`^.*\bprest\w*\s+(${M}).*\bme\s+(?:devolvieron|pagaron|regresaron)\s+(${M})\s+(?:por|de|con)\s+(?:el\s+)?(?:interes|intereses|rendimiento)`).exec(t);
  if (m) {
    const [capital, recibido] = [valor(m[1]), valor(m[2])];
    if (recibido > capital) {
      const interes = recibido - capital;
      return preguntar(`Te devolvieron ${conMiles(recibido)} de ${conMiles(capital)} prestados. Solo ${conMiles(interes)} es ganancia; el resto es tu plata que vuelve. ¿Anoto el interés?`, [
        { titulo: `Sí, ${conMiles(interes)} de interés`, frase: `ingreso ${interes} intereses` },
      ]);
    }
  }

  // «compré algo por 20 dólares y el banco me cobró 82 mil pesos»: un solo gasto en pesos; los dólares son referencia
  m = new RegExp(String.raw`^(.*?)\s+por\s+\d[\d.,]*\s*(?:dolares?|usd|dlls?)\s+y\s+(?:el\s+banco\s+)?(?:me\s+)?(?:cobro|cargo|debito|descontaron|cobraron)\s+(${M})\s*(?:pesos|cop)?\s*$`).exec(t);
  if (m) return `${limpiarBordes(texto.slice(0, m[1].length))} ${valor(m[2])} pesos`;

  // «factura 180k, pagué 100k hoy y el resto el viernes»: solo se anota lo pagado hoy
  m = new RegExp(String.raw`^(.*?)(${M})[\s,;]+(?:y\s+)?(?:yo\s+)?(?:pague|abone|di)\s+(${M})\s+(?:hoy|ahora|ya)\s+y\s+(?:el\s+)?(?:resto|saldo|lo\s+que\s+falta)\b`).exec(t);
  if (m) {
    const [total, hoy] = [valor(m[2]), valor(m[3])];
    if (hoy > 0 && hoy < total) return `${limpiarBordes(texto.slice(0, m[1].length)) || 'pago'} ${hoy}`;
  }
  return null;
}

const SUMA = 'propina|servicio|iva|impuesto|impoconsumo|domicilio';
const RESTA = 'descuento|rebaja|dto';
const esResta = (s: string): boolean => new RegExp(RESTA).test(s);
const dec = (s: string): number => Number(s.replace(',', '.'));

/** Cada forma de ajuste que se reconoce, con lo que suma (en pesos) o el porcentaje (negativo si resta). */
const AJUSTES: { re: RegExp; pct: boolean; cuanto: (m: RegExpMatchArray) => number }[] = [
  // «10% de propina», «20% de descuento»
  { re: new RegExp(String.raw`(?:(?:y|con|mas)\s+)?${PCT}\s*(?:de(?:l)?\s+)?(${SUMA}|${RESTA})\b`, 'g'), pct: true, cuanto: m => (esResta(m[2]) ? -1 : 1) * dec(m[1]) },
  // «IVA del 19%», «servicio 8%»
  { re: new RegExp(String.raw`(?:(?:y|con|mas)\s+)?(${SUMA}|${RESTA})\s+(?:adicional\s+)?(?:de(?:l)?\s+)?${PCT}`, 'g'), pct: true, cuanto: m => (esResta(m[1]) ? -1 : 1) * dec(m[2]) },
  // «me devolvieron el 15%»
  { re: new RegExp(String.raw`(?:y\s+)?(?:me\s+)?(?:devolvieron|reembolsaron|rebajaron|descontaron)\s+(?:el\s+)?${PCT}`, 'g'), pct: true, cuanto: m => -dec(m[1]) },
  // «y domicilio de 4000», «propina adicional de 4k»
  { re: new RegExp(String.raw`(?:(?:,|y|con|mas)\s*)?\b(?:propina|domicilio|servicio|envio|flete)\s+(?:adicional\s+)?(?:de\s+)?(${M})`, 'g'), pct: false, cuanto: m => valor(m[1]) },
  // «dejé 5 mil de propina»
  { re: new RegExp(String.raw`(?:(?:,|y)\s*)?(?:(?:le\s+)?(?:deje|di|puse)\s+)?(${M})\s+de\s+(?:propina|domicilio|servicio)\b`, 'g'), pct: false, cuanto: m => valor(m[1]) },
  // «y me rebajaron 12 mil», «un descuento de 5000»
  { re: new RegExp(String.raw`(?:(?:,|y)\s*)?(?:me\s+)?(?:rebajaron|quitaron|rebajo|descuento\s+de|rebaja\s+de)\s+(${M})`, 'g'), pct: false, cuanto: m => -valor(m[1]) },
];

/** Base más ajustes: el único monto que queda sin ajuste es la base, y los ajustes la mueven. */
function general(texto: string, t: string): string | null {
  if (/\bincluid[oa]s?\b|\bhicieron\b/.test(t)) return null; // «con IVA incluido» ya viene sumado
  const hallados: { i: number; j: number; pct: boolean; cuanto: number }[] = [];
  for (const a of AJUSTES) for (const m of t.matchAll(a.re)) hallados.push({ i: m.index, j: m.index + m[0].length, pct: a.pct, cuanto: a.cuanto(m) });
  // un mismo tramo no se cuenta dos veces: gana el que empieza antes y es más largo
  hallados.sort((a, b) => a.i - b.i || b.j - a.j);
  const usados: typeof hallados = [];
  for (const h of hallados) if (!usados.length || h.i >= usados[usados.length - 1].j) usados.push(h);
  if (!usados.length) return null;

  let resto = texto;
  let plana = t;
  for (const u of [...usados].reverse()) {
    resto = `${resto.slice(0, u.i)} ${resto.slice(u.j)}`;
    plana = `${plana.slice(0, u.i)} ${plana.slice(u.j)}`;
  }
  const bases = [...plana.matchAll(new RegExp(M, 'g'))];
  if (bases.length !== 1) return null;
  const b = bases[0];
  let base = valor(b[0]);
  if (!(base > 0)) return null;
  // «dos combos de 18500»: el precio es por unidad
  const q = new RegExp(String.raw`(?:^|\s)(${CANT})\s+((?:[a-z]+\s+){1,3}?)(?:de|a)\s*$`).exec(plana.slice(0, b.index));
  let ini = b.index;
  let cosas = '';
  if (q) {
    base *= num(q[1]);
    ini = q.index + (q[0].startsWith(' ') ? 1 : 0);
    cosas = q[2].trim();
  }
  const total = usados.reduce((s, u) => s + (u.pct ? Math.round((base * u.cuanto) / 100) : u.cuanto), base);
  if (!(total > 0)) return null;
  const antes = resto.slice(0, ini);
  const despues = resto.slice(b.index + b[0].length);
  return limpiarBordes(`${antes}${cosas ? `${cosas} ` : ''}${total}${despues}`);
}

/**
 * Resuelve las cuentas compuestas de la frase. Devuelve el texto (con el total si había cuenta, igual si no) o una
 * pregunta cuando la cuenta no se puede cerrar sin adivinar.
 */
export function calcular(texto: string): string | Resultado {
  if (texto.length > 300 || /^\s*compras?\s*:/i.test(texto)) return texto;
  const t = plano(texto);
  return especiales(texto, t) ?? general(texto, t) ?? texto;
}
