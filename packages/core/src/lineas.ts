/**
 * Un mensaje con varios movimientos. Se parte en trozos y el bot los va mostrando uno por uno,
 * cada uno con su tarjeta. Los separa un salto de línea, un punto y coma, o un + o - con espacios
 * entre dos trozos que traen cantidad ("150000 Ana + 500000 Ana - 75000 llanta").
 */

import { numerosDeDinero } from './voz.ts';
import { calcular } from './calculos.ts';

/** «almuerzo 28000 más 10% de propina» ya viene con su total, para que no se parta en dos gastos (ver calculos.ts). */
const conCuenta = (s: string): string => { const c = calcular(s); return typeof c === 'string' ? c : s; };

/** Máximo de movimientos por mensaje, para no volverse una cola eterna. */
export const MAX_MOVIMIENTOS_POR_MENSAJE = 10;

const tieneCantidad = (s: string): boolean => /\d/.test(s);

/**
 * «ayer pagué 15 mil de almuerzo y hoy entraron 80 mil a Nequi» son dos movimientos: se corta donde empieza otra cosa
 * (un «y» o una coma seguidos de un día, «luego», o un verbo de plata) y solo si cada trozo trae una cantidad.
 */
// En JS sin la bandera u, \b no ve una vocal con tilde como letra: «pagué\b» nunca ocurre. Por eso la
// frontera de palabra se escribe a mano con L (letra, con tildes y ñ).
const L = 'a-záéíóúñ';
const FIN = `(?![${L}])`;
const CORTE = new RegExp(
  String.raw`\s*(?:,|\s+y)\s+(?=(?:hoy|ayer|anteayer|antier|luego|despu[eé]s|tambi[eé]n|adem[aá]s)${FIN}` +
  String.raw`|(?:me\s+)?(?:entr(?:o|ó|aron)|lleg(?:o|ó|aron)|ingresaron|consignaron|depositaron|giraron|pasaron|soltaron|mandaron|enviaron|pagu[eé]|gast[eé]|compr[eé]|prest[eé]|vend[ií]` +
  // mover plata entre cuentas también empieza otro movimiento: «me consignaron 80000 y pasé 50 a nequi»
  String.raw`|pas[eé]|transfer[ií]|saqu[eé]|retir[eé]|consign[eé]|met[ií])${FIN}` +
  // plata que entra dicha en primera persona: «y me pagaron 20000», «y recibí 20000», «y cobré 20000 de ana»
  String.raw`|me\s+(?:pagaron|pag[oó]|devolvieron|devolvi[oó]|consignaron|cayeron|cay[oó]|dieron|dio|transfirieron|enviaron|mandaron)${FIN}` +
  String.raw`|(?:recib[ií]|cobr[eé])${FIN})`,
  'i',
);

/** Un monto de plata y no un conteo: «comimos 4» o «éramos 3» no cuentan. Sirve 100 o más, o una cifra con k, mil o lucas. */
function tieneMonto(s: string): boolean {
  for (const m of s.matchAll(/(\d[\d.]*)\s*(k|mil|lucas?|barras?)?(?![\p{L}])/giu)) {
    const n = Number(m[1].replace(/\./g, ''));
    if (m[2] || n >= 100) return true;
  }
  return false;
}

/** ¿Algún monto del trozo se dijo en miles («8k», «5mil», «20 lucas») o pasa de diez mil? */
const enMiles = (s: string): boolean =>
  /\d\s*(?:k|mil|lucas?|barras?)(?![\p{L}])/iu.test(s) || (s.match(/\d[\d.]*/g) ?? []).some(n => Number(n.replace(/\./g, '')) >= 10000);

/**
 * «pagué 5mil de comida y 7 de taxi»: el 7 son 7 mil. Un trozo con una sola cifra corta y sin unidad hereda el «mil»
 * de un trozo anterior que habló en miles. Así no se anota un taxi de 7 pesos.
 */
function heredarMiles(trozos: string[]): string[] {
  return trozos.map((t, i) => {
    const cifras = t.match(/\d[\d.]*/g) ?? [];
    if (i === 0 || cifras.length !== 1 || tieneMonto(t) || !trozos.slice(0, i).some(enMiles)) return t;
    return t.replace(/(?<![\d.])(\d{1,3})(?![\d.])/, '$1 mil');
  });
}

// «con billete de 10k, me dieron un billete de 5k y 500 en monedas»: es el vuelto, no plata que entra
const ES_VUELTO = /(?<![a-záéíóúñ])(?:billetes?|monedas?|vuelto|devuelta|cambio)(?![a-záéíóúñ])/i;

const CUENTAS_COMUNES = new Set(['efectivo', 'nequi', 'daviplata', 'monedas', 'bancolombia', 'banco', 'ahorros', 'alcancia']);

/** «me consignaron 80000 en daviplata y pasé 50 a nequi»: lo que se pasa sale de la cuenta que se acaba de nombrar. */
function heredarCuenta(trozos: string[], cuentas: Set<string>): string[] {
  return trozos.map((t, i) => {
    if (i === 0 || !/^pas[eé]\s/i.test(t) || !/\sa\s/i.test(t) || /\s(?:de|desde|del)\s/i.test(t)) return t;
    const cuenta = new RegExp(String.raw`\s(?:en|a)\s+([${L}]+)`, 'i').exec(trozos[i - 1])?.[1];
    return cuenta && (cuentas.has(cuenta.toLowerCase()) || CUENTAS_COMUNES.has(cuenta.toLowerCase())) ? `${t} de ${cuenta}` : t;
  });
}

function cortarPorConjuncion(fila: string, cuentas: Set<string>): string[] {
  if (ES_VUELTO.test(fila)) return [fila];
  const trozos = heredarMiles(fila.split(CORTE).map(x => x.trim()).filter(Boolean));
  return trozos.length > 1 && trozos.every(tieneMonto) ? heredarCuenta(trozos, cuentas) : [fila];
}

// Señales de que los montos y nombres son un reparto y no una lista: «cena 60000 entre ana y luis», «a ana y luis»
const SENAL_REPARTO = new RegExp(
  String.raw`(?<![${L}])(?:entre|dividimos|dividid[oa]s?|partes iguales|a medias|mitad y mitad|cada uno|cada quien)${FIN}` +
  String.raw`|\b50\s*[-/]\s*50\b` +
  String.raw`|(?<![${L}])(?:a|con|para|por)\s+[${L}]+(?:\s*,\s*[${L}]+)*\s+y\s+[${L}]+`,
  'i',
);
const SEPARADOR_LISTA = /\s*(?:,(?!\d)|\s+y\s+|\s\/\s|\/(?=\D))\s*/i;
const PALABRAS_VACIAS = new Set(['de', 'en', 'a', 'para', 'por', 'con', 'y', 'k', 'mil', 'lucas', 'luca', 'pesos', 'cop', 'el', 'la', 'un', 'una', 'me', 'le']);

const PRONOMBRES = new Set(['me', 'le', 'les', 'nos', 'se', 'dio', 'dieron']);
const NOMBRES_CON_TILDE = new Set(['café', 'bebé', 'sofá', 'menú', 'maní', 'jabón', 'camión', 'balón']);

/** Un trozo de lista: exactamente un monto y al menos una palabra de concepto. */
function esMovimientoSimple(t: string): boolean {
  if ((t.match(/\d[\d.]*/g) ?? []).length !== 1 || !tieneMonto(t)) return false;
  const palabras = t.toLowerCase().match(new RegExp(`[${L}]+`, 'g')) ?? [];
  // un verbo conjugado («pagué», «devolví», «me dio») no es un concepto: eso es una frase, no una lista
  if (palabras.some(p => PRONOMBRES.has(p) || (/[éíó]$/.test(p) && p.length > 3 && !NOMBRES_CON_TILDE.has(p)))) return false;
  return palabras.some(p => !PALABRAS_VACIAS.has(p));
}

/** «mecato 5000, pasaje 3000 y almuerzo 12k»: cada trozo con su monto y su concepto, sin pinta de reparto. */
function cortarLista(trozo: string): string[] {
  // «compra: arroz 5000, sal 2000» ya la entiende el bot como un solo gasto con detalle
  // y «compra pan 3000, leche 4500» es una sola compra con varios renglones
  if (SENAL_REPARTO.test(trozo) || ES_VUELTO.test(trozo) || /^[^\d]{0,25}:/.test(trozo) || /^(?:compra|compras|compr[eé]|mercado)(?![a-záéíóúñ])/i.test(trozo)) return [trozo];
  const partes = heredarMiles(trozo.split(SEPARADOR_LISTA).map(x => x.trim()).filter(Boolean));
  if (partes.length < 2) return [trozo];
  // «pagué 20k con nequi y 10k en efectivo» son dos gastos: el verbo del primero vale para los que empiezan con la cifra
  const verbo = /^(pagu[eé]|gast[eé])\s+/i.exec(partes[0])?.[1];
  if (verbo && partes.slice(1).every(p => /^\d/.test(p))) {
    const sinVerbo = [partes[0].slice(verbo.length).trim(), ...partes.slice(1)];
    return sinVerbo.every(esMovimientoSimple) ? [partes[0], ...partes.slice(1).map(p => `${verbo} ${p}`)] : [trozo];
  }
  if (!partes.every(esMovimientoSimple)) return [trozo];
  // todos empiezan con número o ninguno: «debo 5000 a ana y 3000 a luis» mezcla y no se parte
  const conNumero = partes.filter(p => /^\d/.test(p)).length;
  return conNumero === 0 || conNumero === partes.length ? partes : [trozo];
}

function cortarTexto(fila: string, cuentas: Set<string>): string[] {
  return cortarPorConjuncion(fila, cuentas).flatMap(cortarLista);
}

/** «1. almuerzo 5000 2. taxi 3000»: una lista numerada en un solo renglón. Empieza en 1 y sigue en orden. */
function cortarNumerada(fila: string): string[] | null {
  if (!/^1[.)]\s/.test(fila)) return null;
  const marcas = [...fila.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+(?=[^\d\s])/g)];
  if (marcas.length < 2 || marcas.some((m, i) => Number(m[1]) !== i + 1)) return null;
  const trozos = marcas.map((m, i) => fila.slice((m.index ?? 0) + m[0].length, marcas[i + 1]?.index).trim());
  return trozos.every(tieneMonto) ? trozos : null;
}

// Palabras que nunca son el concepto de un gasto de lista: cuentas, arqueos, saldos, metas y conectores
const NO_ES_CONCEPTO = new Set([
  'efectivo', 'nequi', 'daviplata', 'monedas', 'bancolombia', 'banco', 'ahorros', 'ahorro', 'alcancia', 'alcancía', 'tarjeta', 'cuenta',
  'dolares', 'dólares', 'usd', 'arqueo', 'saldo', 'inicial', 'tengo', 'hay', 'quedan', 'inventario', 'meta', 'tope', 'cada', 'vuelto',
  'billete', 'billetes', 'cambio', 'debo', 'debe', 'presté', 'preste', 'abono', 'total',
  // unidades de medida: «botella 500 ml 2500» es un solo gasto, no dos
  'ml', 'cc', 'gr', 'g', 'kg', 'kilo', 'kilos', 'lb', 'libra', 'libras', 'cm', 'mm', 'mt', 'mts', 'lt', 'lts', 'l', 'oz', 'mb', 'gb', 'megas', 'unidades', 'und', 'uds',
]);

/**
 * «almuerzo 5000 taxi 3000 bus 2500»: palabra y monto, repetido, sin nada más. Cada par es un gasto. No se parte si
 * alguna palabra es una cuenta («nequi 15k efectivo 10k» es un saldo), un conector o un verbo.
 */
function cortarPares(fila: string, cuentas: Set<string>): string[] | null {
  const par = String.raw`[${L}]+(?:\s+[${L}]+){0,2}\s+\d[\d.]*\s*(?:k|mil|lucas?)?`;
  if (!new RegExp(String.raw`^(?:${par}\s*){2,}$`, 'i').test(fila)) return null;
  const pares = [...fila.matchAll(new RegExp(par, 'gi'))].map(m => m[0].trim());
  const sirve = (p: string): boolean => {
    const palabras = p.toLowerCase().match(new RegExp(`[${L}]+`, 'g')) ?? [];
    const concepto = palabras.filter(w => !['k', 'mil', 'luca', 'lucas'].includes(w));
    return tieneMonto(p) && concepto.length > 0 && concepto.every(w => !NO_ES_CONCEPTO.has(w) && !cuentas.has(w) && !PALABRAS_VACIAS.has(w)
      && !PRONOMBRES.has(w) && !(/[éíó]$/.test(w) && w.length > 3 && !NOMBRES_CON_TILDE.has(w)));
  };
  return pares.length >= 2 && pares.every(sirve) ? pares : null;
}

// Un + o - parte la fila cuando va con espacio a los dos lados («5 + 3») o pegado a un monto («+50000 nomina -12000 mecato»)
const SIGNO = /(?:^|\s)([+-])(\s+|(?=\d))/g;
const DESCUENTO = /(?<![a-záéíóúñ])(?:descuento|rebaja|propina|dto)(?![a-záéíóúñ])/i;

interface TrozoSigno { signo: string; pegado: boolean; texto: string }

/** Parte por + y -; devuelve null si el resultado no es una lista clara de movimientos. */
function cortarPorSignos(fila: string): string[] | null {
  const trozos: TrozoSigno[] = [];
  let signo = '';
  let pegado = false;
  let desde = 0;
  for (const m of fila.matchAll(SIGNO)) {
    const previo = fila.slice(desde, m.index).trim();
    if (previo || trozos.length) trozos.push({ signo, pegado, texto: previo });
    signo = m[1];
    pegado = m[2] === '';
    desde = (m.index ?? 0) + m[0].length;
  }
  trozos.push({ signo, pegado, texto: fila.slice(desde).trim() });
  // «-12000 mecato» solo es un gasto; «+50000 nomina» solo lo resuelve el bot
  if (trozos.length === 1 && !(trozos[0].signo === '-' && trozos[0].pegado)) return null;
  const valido = trozos.every(t => t.texto && tieneCantidad(t.texto) && (!t.pegado || /[a-záéíóúñ]{2,}/i.test(t.texto)));
  if (!valido) return null;
  // «pasaje 3000 - 500 descuento»: ese 500 resta del gasto, no es otro gasto; no se adivina
  if (trozos.some(t => t.signo === '-' && !t.pegado && DESCUENTO.test(t.texto))) return null;
  // lo que sigue a un «+» pegado, o a un «+ 500000 Ana» que empieza por la cantidad, es plata que entra;
  // «mecato 5000 + pasaje 3000» solo separa dos gastos
  return trozos.map(t => (t.signo === '+' && (t.pegado || /^\d/.test(t.texto)) ? 'ingreso ' + t.texto : t.texto));
}

/** Una línea corta sin monto ni verbo («nequi», «ayer», «de ana») es un dato del movimiento de al lado, no un movimiento. */
function esFragmento(s: string): boolean {
  if (/\d/.test(s) || s.length > 40 || /:\s*$/.test(s)) return false;
  const palabras = s.toLowerCase().match(new RegExp(`[${L}]+`, 'g')) ?? [];
  if (!palabras.length || palabras.length > 4) return false;
  return !palabras.some(p => PRONOMBRES.has(p) || (/[éíó]$/.test(p) && p.length > 3 && !NOMBRES_CON_TILDE.has(p)));
}

/**
 * «mecato 5000» y debajo «nequi» son un solo movimiento: el fragmento se pega a la línea de arriba si esta trae monto.
 * «mecato» y debajo «5000» (un mensaje de dos líneas, sin nada más) también se juntan.
 */
function unirFragmentos(filas: string[]): string[] {
  const salida: string[] = [];
  filas.forEach((f, i) => {
    const anterior = salida.length - 1;
    if (esFragmento(f) && anterior >= 0 && /\d/.test(salida[anterior])) salida[anterior] += ` ${f}`;
    else if (filas.length === 2 && i === 1 && /^\d/.test(f) && esFragmento(filas[0])) salida[0] = `${filas[0]} ${f}`;
    else salida.push(f);
  });
  return salida;
}

/** Los movimientos de un mensaje, hasta el máximo por mensaje. */
export function dividirLinea(texto: string, cuentas: string[] = []): string[] {
  return dividirTodo(texto, cuentas).slice(0, MAX_MOVIMIENTOS_POR_MENSAJE);
}

/**
 * Todos los movimientos de un mensaje, sin tope: el bot muestra los primeros y avisa de los que sobran.
 * `cuentas` son los nombres de las cuentas de la app, para no tomar «nequi 15k efectivo 10k» por dos gastos.
 */
export function dividirTodo(texto: string, cuentas: string[] = []): string[] {
  if (!/[\n;]/.test(texto) && typeof calcular(texto) !== 'string') return [texto]; // una cuenta que se pregunta no se parte
  const nombres = new Set(cuentas.flatMap(c => c.toLowerCase().split(/\s+/)));
  // «quince mil» y «sesenta lucas» pasan a números antes de contar cantidades: así «ayer pagué quince mil de almuerzo y hoy me giraron ochenta mil» se parte en dos
  const filas = unirFragmentos(texto.split(/\r?\n|;/).map(x => conCuenta(numerosDeDinero(x.trim()))).filter(Boolean))
    .flatMap(f => cortarNumerada(f) ?? [f]);
  const partes: string[] = [];
  for (const fila of filas) {
    // «pollo 8000 para luis puso 6000 nequi»: todo el gasto era de Luis y él ya mandó una parte. Son dos
    // movimientos: el gasto que pagaste por él y lo que él te pagó.
    const puso = fila.match(/^(.+?)\s+(\d[\d.]*\s?(?:k|mil)?)\s+para\s+([a-záéíóúñ]+),?\s+(?:\S+\s+)?puso\s+(\d[\d.]*\s?(?:k|mil)?)\s*(.*)$/i);
    if (puso) {
      partes.push(`${puso[1]} ${puso[2]} pagué por ${puso[3]} ${puso[2]}`);
      partes.push(`${puso[3]} me pagó ${puso[4]} ${puso[5]}`.trim());
      continue;
    }
    const porSignos = cortarPorSignos(fila);
    if (porSignos) partes.push(...porSignos);
    else partes.push(...(cortarPares(fila, nombres) ?? cortarTexto(fila, nombres)));
  }
  return partes;
}
