/**
 * Un párrafo que cuenta el día («me pagaron 200 mil del turno y apenas salí compré almuerzo de 18 mil...») trae
 * varios movimientos mezclados con cosas que no pasaron, contexto y la cuenta dicha al final. Aquí se limpia y se
 * parte en frases de un movimiento cada una; el bot las interpreta de a una, como si llegaran en renglones.
 */

import { numerosDeDinero } from './voz.ts';
import { incertidumbre } from './incertidumbre.ts';
import { dividirTodo } from './lineas.ts';

const L = 'a-záéíóúñ';
const FIN = `(?![${L}\\d])`;
const N = String.raw`\d[\d.]*(?:\s*(?:mil|k|lucas?|barras?))?${FIN}`;
const CUENTAS_COMUNES = ['efectivo', 'nequi', 'daviplata', 'bancolombia', 'tarjeta', 'banco', 'ahorros'];

const enMiles = (s: string): boolean =>
  new RegExp(String.raw`\d\s*(?:mil|k|lucas?|barras?)${FIN}`, 'i').test(s) || (s.match(/\d[\d.]*/g) ?? []).some(n => Number(n.replace(/\./g, '')) >= 10000);

/** «pagué 60» en un párrafo que habla en miles son 60 mil, no 60 pesos. */
const conMil = (n: string, texto: string): string => /^\d{1,3}$/.test(n.trim()) && enMiles(texto) ? `${n.trim()} mil` : n.trim();

function valor(n: string, texto: string): number {
  const m = /^(\d[\d.]*)\s*(mil|k|lucas?|barras?)?/i.exec(conMil(n, texto));
  return m ? Number(m[1].replace(/\./g, '')) * (m[2] ? 1000 : 1) : 0;
}

const medio = (c: string): string => (/^efectivo$/i.test(c) ? 'en efectivo' : `con ${c}`);
const sinArticulo = (s: string): string => s.replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/i, '').trim();
const PALABRAS = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco'];

type Regla = (t: string) => string;

const REGLAS: Regla[] = [
  // «compré el mercado por 130 mil pagué 80 con nequi y los otros 50 en efectivo»: un pago con dos medios
  t => t.replace(new RegExp(String.raw`(?:compr[eé]|pagu[eé])\s+(.+?)\s+(?:por|de|en)\s+(${N})\s*,?\s+(?:y\s+)?(?:pagu[eé]|puse|di)\s+(${N})\s+(?:con|en|por|de)\s+(?:el\s+|la\s+|mi\s+)?([${L}]+)\s+y\s+(?:(?:los|las)\s+otr[oa]s\s+|el\s+resto\s+|lo\s+dem[aá]s\s+)?(${N})\s+(?:con|en|por|de)\s+(?:el\s+|la\s+|mi\s+)?([${L}]+)`, 'i'),
    (m, cosa, total, a, c1, b, c2) => valor(a, t) + valor(b, t) !== valor(total, t) ? m
      : `pagué ${conMil(a, t)} de ${sinArticulo(cosa)} ${medio(c1)}\npagué ${conMil(b, t)} de ${sinArticulo(cosa)} ${medio(c2)}\n`),
  // «iba a pagar 80 mil de mercado con nequi pero solo tenía 60 así que puse 20 en efectivo»
  t => t.replace(new RegExp(String.raw`(?:iba\s+a|fui\s+a|quise)\s+pagar\s+(${N})\s+(?:de\s+)?(.+?)\s+(?:con|en|por|desde)\s+([${L}]+)\s+pero\s+(?:solo|sólo)\s+(?:ten[ií]a|hab[ií]a)\s+(${N})\s*,?\s*(?:as[ií]\s+que|entonces|y)\s+(?:puse|pagu[eé]|complet[eé](?:\s+con)?)\s+(?:los\s+otros\s+|el\s+resto\s+)?(${N})\s+(?:en|con|de|por)\s+([${L}]+)`, 'i'),
    (_m, _total, cosa, c1, a, b, c2) => `pagué ${conMil(a, t)} de ${sinArticulo(cosa)} ${medio(c1)}\npagué ${conMil(b, t)} de ${sinArticulo(cosa)} ${medio(c2)}\n`),
  // «pensaba comprar una chaqueta de 200 mil pero al final no compré nada»: no pasó
  t => t.replace(new RegExp(String.raw`(?:^|\s)(?:pensaba|quer[ií]a|iba\s+a|ten[ií]a\s+pensado)\s+.+?\s+pero\s+(?:al\s+final\s+|despu[eé]s\s+)?no\s+[${L}]+(?:\s+(?:nada|eso|nunca))?(?:\s+(?:y\s+)?(?:solo|sólo))?`, 'i'), ' '),
  // «y mañana quiero mirar unos zapatos de 120 mil»: todavía no pasa
  t => t.replace(new RegExp(String.raw`(?:,|\s+y|\s+pero)?\s+(?:pasado\s+)?(?:ma[ñn]ana|la\s+(?:otra|pr[oó]xima)\s+semana|el\s+(?:otro|pr[oó]ximo)\s+mes)\s+(?:quiero|voy\s+a|pienso|tengo\s+que|me\s+toca|quisiera)${FIN}[^,]*`, 'i'), ''),
  // «unas galletas por 6 mil pero las galletas las devolví antes de salir»: se quita la cosa devuelta
  t => {
    const m = new RegExp(String.raw`\s*(?:,|\s+pero|\s+y)\s+(?:el|la|los|las)\s+([${L}]+)\s+(?:l[oa]s?\s+)?(?:devolv[ií]|regres[eé])${FIN}[^,]*`, 'i').exec(t);
    if (!m) return t;
    const sin = t.slice(0, m.index) + t.slice(m.index + m[0].length);
    return sin.replace(new RegExp(String.raw`(?:,\s*|\s+y\s+)?(?:(?:un|una|unos|unas|el|la|los|las)\s+)?${m[1]}\s+(?:por|de|en|a)\s+${N}`, 'i'), '');
  },
  // «dos pizzas de 40 mil cada una pero cancelé una antes de que la prepararan»: queda una
  t => t.replace(new RegExp(String.raw`(dos|tres|cuatro|cinco|[2-5])\s+([${L}]+)\s+de\s+(${N})\s+cada\s+(?:una|uno)\s+pero\s+cancel[eé]\s+(?:una|uno|1)${FIN}[^\d]*$`, 'i'),
    (_m, n, cosa, monto) => `${PALABRAS[(/\d/.test(n) ? Number(n) : PALABRAS.indexOf(n.toLowerCase())) - 1]} ${cosa} de ${monto} cada una`),
  // «el recibo de gas llegó por 75 mil pero hoy solo alcancé a pagar 40»: se anota lo pagado hoy
  t => t.replace(new RegExp(String.raw`(?:el|la|un|una)?\s*(recibo|factura|cuenta|cuota)(\s+del?\s+[${L}]+)?\s*(?:me\s+)?(?:lleg[oó]|vino|sali[oó]|era|es|fue)?\s*(?:por|de|en)\s+(${N})\s+pero\s+(?:hoy\s+)?(?:solo|sólo|apenas)\s+(?:alcanc[eé]\s+a\s+pagar|pagu[eé]|abon[eé]|pude\s+pagar|di)\s+(${N})`, 'i'),
    (_m, que, de, _total, pagado) => `pagué ${conMil(pagado, t)} del ${que}${de ?? ''}`),
  // «llegó el recibo de la casa son 180 mil de energía y 70 mil de agua y ya pagué los dos»
  t => !/pagu[eé]/i.test(t) ? t : t.replace(new RegExp(String.raw`^(?:me\s+)?lleg[oó]\s+(?:el|la)\s+(?:recibo|factura|cuenta)(?:\s+de\s+(?:la\s+|el\s+)?[${L}]+)?\s+(?:y\s+)?(?:son|es|eran|era|de|por|viene\s+por)\s+`, 'i'), 'pagué '),
  // «pasé 100 mil de nequi a efectivo y con 35 de eso compré zapatos»: sale de la cuenta a la que se pasó
  t => t.replace(new RegExp(String.raw`\s+y\s+con\s+(${N})\s+de\s+(?:eso|esa\s+plata|ah[ií]|esos|esa)\s+(compr[eé]|pagu[eé])\s+([^,]+)`, 'i'), (_m, monto, verbo, cosa) => {
    const destino = new RegExp(String.raw`\sa\s+([${L}]+)`, 'i').exec(t)?.[1];
    return `\n${verbo} ${cosa.trim()} por ${conMil(monto, t)}${destino ? ` ${medio(destino)}` : ''}\n`;
  }),
  // «le compré los medicamentos a mi papá por 65 mil ... me dijo que después me paga»: es un préstamo
  t => !new RegExp(String.raw`me\s+(?:l[oa]s?\s+)?(?:paga|pagar[aá]|devuelve|devolver[aá]|repone)${FIN}`, 'i').test(t) ? t
    : t.replace(new RegExp(String.raw`le\s+compr[eé]\s+(.+?)\s+a\s+(?:mi\s+|su\s+)?([${L}]+)\s+(?:por|de|en)\s+(${N})`, 'i'), (_m, cosa, quien, monto) => `le presté ${monto} a ${quien} para ${cosa}\n`),
  // «mi hermana me dio 30 mil para una torta, la torta costó 28»: la plata era para la compra; se anota la compra
  t => t.replace(new RegExp(String.raw`(?:^|\s)(?:mi\s+|su\s+)?[${L}]+\s+me\s+(?:dio|dieron|mand[oó]|pas[oó]|regal[oó])\s+(${N})\s+para\s+.+?((?:el|la|los|las)\s+[${L}]+)\s+(?:cost[oó]|costaron|vali[oó]|valieron|sali[oó]\s+en)\s+(${N})`, 'i'),
    (_m, _dado, cosa, monto) => `${cosa} costó ${conMil(monto, t)}\n`),
  // «mi mamá pagó el recibo de 100 mil yo le mandé 40»: el gasto propio es el aporte
  t => t.replace(new RegExp(String.raw`(?:mi\s+|su\s+)?([${L}]+)\s+pag[oó]\s+(?:(?!\syo\s).)+?\s+(?:y\s+)?yo\s+le\s+(mand[eé]|di|pas[eé]|transfer[ií]|envi[eé])\s+(${N})`, 'i'),
    (_m, quien, verbo, monto) => `le ${verbo} ${conMil(monto, t)} a ${quien}`),
  // «pero mi mamá me había dado 10000 para el pasaje»: plata de antes, es contexto
  t => t.replace(new RegExp(String.raw`\s*(?:,|\s+pero|\s+y|\s+aunque)\s+(?:(?!\s(?:y|pero|porque|luego)\s)[^,\d])*?(?<![${L}])hab[ií]an?\s+[${L}]+(?:ado|ido|to|cho|sto)${FIN}[^,]*`, 'i'), ''),
  // «que valía 90 mil pero me hicieron 10 de descuento quedó en 80»: vale el precio final
  t => t.replace(new RegExp(String.raw`(?:que\s+)?(?:val[ií]a|costaba|cuesta|vale|estaba\s+en)\s+(${N})\s+pero\s+(?:(?!\s(?:y|pero)\s).)*?(?:qued[oó]|me\s+qued[oó]|sali[oó]|me\s+sali[oó])\s+(?:en|a|por)\s+(${N})`, 'i'),
    (_m, _antes, final) => `por ${conMil(final, t)}`),
  // «lo demás quedó en la billetera», «el resto lo pago después»: no es un movimiento de hoy
  t => t.replace(new RegExp(String.raw`\s*(?:,|\s+y)?\s+(?:lo\s+dem[aá]s|el\s+resto)\s+(?:l[oa]\s+|me\s+)?(?:qued[oó]|queda|pago|pagar[eé]|debo|guard[eé])${FIN}[^,\d]*(?=,|$)`, 'i'), ''),
];

// Palabras con tilde al final que no son un verbo en pasado
const NO_VERBO = new Set(['después', 'despues', 'también', 'además', 'aquí', 'allí', 'así', 'café', 'bebé', 'puré', 'comité', 'maní', 'ají', 'rubí', 'esquí', 'colibrí', 'jabalí']);
const FECHA = /^(?:hoy|ayer|anteayer|antier|anoche)$/i;
const CONECTOR = new RegExp(String.raw`(?:\s+|^)(?:y|e|que|apenas|cuando|luego|entonces|pero|ya|solo|sólo|también|además|allá|después)$`, 'i');
const ACCION = new RegExp(String.raw`^(?:(?:hoy|ayer|anteayer|antier|anoche)\s+)?(?:(?:me|le|les|se|nos)\s+)?[${L}]{2,}(?:[éí]|aron|ieron)(?![${L}])`, 'i');
const PRONOMBRE =/^(?:ella|él|el|yo|ellos|ellas|los\s+otros|las\s+otras|el\s+resto|lo\s+dem[aá]s)\s/i;

/** Corta el párrafo donde empieza otra acción: un conector, una coma o un verbo en primera persona del pasado. */
function cortar(t: string): string[] {
  const conMarcas = t
    .replace(new RegExp(String.raw`\s*,?\s+(?:y\s+)?(?:luego|despu[eé]s|adem[aá]s|tambi[eé]n|pero|porque|as[ií]\s+que|entonces|aunque)${FIN}\s*`, 'gi'), '\n')
    .replace(/\s*,\s*/g, '\n')
    .replace(new RegExp(String.raw`(?<=\S)(?<!(?:^|\s)(?:me|le|les|se|nos))\s+(?=(?:(?:me|le|les|se|nos)\s+)?([${L}]{2,}[éí])(?![${L}]))`, 'gi'), (m, w: string) => (NO_VERBO.has(w.toLowerCase()) ? m : '\n'))
    // «leche por 8 mil pan por 4 mil»: una cosa con su precio y luego otra
    .replace(new RegExp(String.raw`(${N})\s+(?=(?:(?:y|unas?|unos?|el|la|los|las)\s+)*[${L}]{3,}\s+(?:por|de|a)\s+\d)`, 'gi'), '$1\n');
  return conMarcas.split('\n').flatMap(s => {
    // «jabón por 7 mil y crema por 18 mil»: un «y» parte cuando los dos lados traen su plata
    const i = s.search(/\s+y\s+/);
    const der = i >= 0 ? s.slice(i).replace(/^\s+y\s+/, '') : '';
    return i >= 0 && /\d/.test(s.slice(0, i)) && /\d/.test(der) && !PRONOMBRE.test(der) ? [s.slice(0, i), der] : [s];
  }).map(s => s.trim()).filter(Boolean);
}

function tieneMonto(s: string): boolean {
  for (const m of s.matchAll(/(\d[\d.]*)\s*(k|mil|lucas?|barras?)?(?![\p{L}])/giu)) if (m[2] || Number(m[1].replace(/\./g, '')) >= 100) return true;
  return false;
}

/**
 * Las frases de cada movimiento del párrafo, o null si no es una narración que haga falta rearmar (entonces el
 * mensaje sigue el camino de siempre). Un arreglo vacío no se devuelve: si nada quedó, también es null.
 */
export function narrar(texto: string, cuentas: string[] = []): string[] | null {
  if (/[\n;]/.test(texto) || texto.trim().split(/\s+/).length < 8) return null;
  const base = numerosDeDinero(texto.trim());
  let t = base;
  for (const r of REGLAS) t = r(t);
  const cambio = t !== base;

  const nombres = [...new Set([...CUENTAS_COMUNES, ...cuentas.map(c => c.toLowerCase())])].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const reCuenta = new RegExp(String.raw`(?:con|en|por|desde|de|a)\s+(?:la\s+|el\s+|mi\s+)?(${nombres.join('|')})(?![${L}])`, 'i');

  const eventos: string[] = [];
  let fecha = '';
  for (let s of t.split('\n').flatMap(cortar)) {
    s = s.replace(/^(?:y|e|que|ya|solo|sólo|apenas|allá)\s+/i, '');
    while (CONECTOR.test(s)) s = s.replace(CONECTOR, '').trim();
    const ultima = s.split(/\s+/).pop() ?? '';
    if (FECHA.test(ultima) && s.split(/\s+/).length > 1) { s = s.slice(0, -ultima.length).trim(); }
    if (FECHA.test(s)) { fecha = s; continue; }
    // «pagué 12 de parqueadero» en un párrafo que habla en miles
    s = s.replace(/((?:pagu[eé]|puse|di|por|de|en|con|cost[oó]|vali[oó])\s+)(\d{1,3})(?![\d.,]|\s*(?:mil|k|lucas?|barras?))/i, (m, a, n) => (enMiles(t) ? `${a}${n} mil` : m));
    if (tieneMonto(s)) {
      if (/^\d/.test(s)) s = `${/^(pagu[eé]|compr[eé]|gast[eé])\s/i.exec(eventos.at(-1) ?? '')?.[1] ?? 'pagué'} ${s}`;
      // «recargué el celular con 10 mil»: el «con» es el precio, no el medio
      s = s.replace(new RegExp(String.raw`^(recargu[eé]\s+.+?)\s+con\s+(${N})`, 'i'), '$1 por $2');
      eventos.push(fecha ? `${fecha} ${s}` : s);
      fecha = FECHA.test(ultima) ? ultima : '';
      continue;
    }
    fecha = FECHA.test(ultima) ? ultima : '';
    // «que pagué con nequi», «ya pagué los dos desde daviplata»: la cuenta es de los movimientos de al lado
    const c = reCuenta.exec(s)?.[1];
    if (!c || !eventos.length) continue;
    const todos = /(?:los|las)\s+dos|ambos|ambas|todos?(?![${L}])/i.test(s);
    for (let i = todos ? 0 : eventos.length - 1; i < eventos.length; i++) if (!reCuenta.test(eventos[i])) eventos[i] += ` ${medio(c)}`;
  }
  const quedan = eventos.filter(e => !incertidumbre(e));
  if (!quedan.length) return null;
  // lo que se compra después de sacar plata del cajero sale del efectivo que se acaba de sacar
  if (/\bsaqu[eé]\b.*\bcajero\b/iu.test(quedan[0])) {
    for (let i = 1; i < quedan.length; i++) if (!reCuenta.test(quedan[i])) quedan[i] += ' en efectivo';
  }
  if (cambio) return quedan;
  // Sin reglas que limpiar, solo se rearma un relato largo donde cada trozo es una acción ya hecha («compré», «me
  // pagaron») y que el camino de siempre no parte bien. «iba para el trabajo cogí bus...» suena a algo que no pasó
  // por el «iba», pero los trozos sí pasaron.
  const claro = quedan.length >= 2 && texto.trim().split(/\s+/).length >= 12 && quedan.every(e => ACCION.test(e));
  if (!claro || (!incertidumbre(texto) && quedan.length <= dividirTodo(texto, cuentas).length)) return null;
  return quedan;
}
