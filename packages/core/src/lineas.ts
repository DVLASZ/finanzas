/**
 * Un mensaje con varios movimientos. Se parte en trozos y el bot los va mostrando uno por uno,
 * cada uno con su tarjeta. Los separa un salto de línea, un punto y coma, o un + o - con espacios
 * entre dos trozos que traen cantidad ("150000 Ana + 500000 Ana - 75000 llanta").
 */

import { numerosDeDinero } from './voz.ts';

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
  String.raw`|(?:me\s+)?(?:entr(?:o|ó|aron)|lleg(?:o|ó|aron)|ingresaron|consignaron|depositaron|giraron|pasaron|soltaron|mandaron|enviaron|pagu[eé]|gast[eé]|compr[eé]|prest[eé]|vend[ií])${FIN}` +
  // plata que entra dicha en primera persona: «y me pagaron 20000», «y recibí 20000», «y cobré 20000 de ana»
  String.raw`|me\s+(?:pagaron|pag[oó]|devolvieron|devolvi[oó]|consignaron|cayeron|cay[oó]|dieron|dio|transfirieron|enviaron|mandaron)${FIN}` +
  String.raw`|(?:recib[ií]|cobr[eé])${FIN})`,
  'i',
);

/** Un monto de plata y no un conteo: «comimos 4» o «éramos 3» no cuentan. Sirve 100 o más, o una cifra con k, mil o lucas. */
function tieneMonto(s: string): boolean {
  for (const m of s.matchAll(/(\d[\d.]*)\s*(k|mil|lucas?)?(?![\p{L}])/giu)) {
    const n = Number(m[1].replace(/\./g, ''));
    if (m[2] || n >= 100) return true;
  }
  return false;
}

// «con billete de 10k, me dieron un billete de 5k y 500 en monedas»: es el vuelto, no plata que entra
const ES_VUELTO = /(?<![a-záéíóúñ])(?:billetes?|monedas?|vuelto|devuelta|cambio)(?![a-záéíóúñ])/i;

function cortarPorConjuncion(fila: string): string[] {
  if (ES_VUELTO.test(fila)) return [fila];
  const trozos = fila.split(CORTE).map(x => x.trim()).filter(Boolean);
  return trozos.length > 1 && trozos.every(tieneMonto) ? trozos : [fila];
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
  const partes = trozo.split(SEPARADOR_LISTA).map(x => x.trim()).filter(Boolean);
  if (partes.length < 2 || !partes.every(esMovimientoSimple)) return [trozo];
  // todos empiezan con número o ninguno: «debo 5000 a ana y 3000 a luis» mezcla y no se parte
  const conNumero = partes.filter(p => /^\d/.test(p)).length;
  return conNumero === 0 || conNumero === partes.length ? partes : [trozo];
}

function cortarTexto(fila: string): string[] {
  return cortarPorConjuncion(fila).flatMap(cortarLista);
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

export function dividirLinea(texto: string): string[] {
  // «quince mil» y «sesenta lucas» pasan a números antes de contar cantidades: así «ayer pagué quince mil de almuerzo y hoy me giraron ochenta mil» se parte en dos
  const filas = unirFragmentos(texto.split(/\r?\n|;/).map(x => numerosDeDinero(x.trim())).filter(Boolean));
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
    else partes.push(...cortarTexto(fila));
  }
  return partes.slice(0, MAX_MOVIMIENTOS_POR_MENSAJE);
}
