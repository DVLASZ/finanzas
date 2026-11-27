/**
 * La casa y la asociación dichas como se hablan. La app no lleva asociados con cuotas, un fondo común ni conciliaciones:
 * cada obligación es una cuenta por cobrar o por pagar con una persona. Aquí se reescribe lo que sí se puede decir con los
 * movimientos de siempre («Pipe me debe 50000 por cuota», «le debo 60000 a Mama por recibo», «Karla me pagó 100000») y lo que
 * no existe (fondo común, cuotas que se programan, estado de un asociado, compensaciones) se explica sin inventarlo.
 */
import { hallarMontos } from './dinero.ts';
import { limpiar } from './texto.ts';
import { formatear } from './dinero.ts';
import type { Contexto } from './tipos.ts';

export interface Casa { reescribir?: string; frases?: string[]; texto?: string; extra?: string }

const montos = (t: string): number[] => hallarMontos(t).filter(m => m.explicito && m.moneda !== 'USD').map(m => m.valor);
const peso = (n: number): string => formatear(n, 'COP');
const NUM: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

export function hablarCasa(texto: string, ctx: Contexto): Casa | null {
  if (texto.length > 200) return null;
  const t = limpiar(texto);
  if (!/\d/.test(t) && !/\bquien(?:es)? (?:debe|deben|pagaron|siguen)\b|\bcuota\b|\basociacion\b|\bcuanto (?:he )?puesto\b|\bcuanto puso\b/.test(t)) return null;
  const hay = montos(t);
  const personas = ctx.cuentas.filter(c => c.tipo === 'persona');
  const nombres = personas.filter(p => new RegExp(String.raw`\b${p.clave}\b`).test(t)).sort((a, b) => t.indexOf(a.clave) - t.indexOf(b.clave));
  const primero = nombres[0];
  const n = (p?: { nombre: string }): string => (p?.nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);
  const miles = (v: number, base: number): number => (v < 1000 && base >= 1000 ? v * 1000 : v);
  // «Alejandro debía 40 mil de cuota y 10 de multa; pagó 30 hoy y quedó en pasar 20 mañana»: dos deudas y el abono de hoy (lo prometido no se anota)
  const K = (n: string, s?: string): number => Number(n) * (s ? 1000 : 1);
  const cm = t.match(/^([a-z]+) debia (\d+)( mil| k)? de cuota y (\d+)( mil| k)? de multa;? pago (\d+)( mil| k)?/);
  if (cm) {
    const c1 = K(cm[2], cm[3]), c2 = miles(K(cm[4], cm[5]), c1), c3 = miles(K(cm[6], cm[7]), c1);
    return { reescribir: `${cap(cm[1])} me debe ${c1} por cuota; ${cap(cm[1])} me debe ${c2} por multa; ${cap(cm[1])} me pago ${c3}`, extra: /quedo en pasar|manana/.test(t) ? 'Lo que quedó de pasar mañana no lo anoto hasta que llegue.' : undefined };
  }
  // «Pagué 150 mil de una cena con Daniel y Paula, éramos tres; Daniel me mandó 50»: la cena en tres y lo que ya pagó uno
  const cena = t.match(/^pague (\d+)( mil| k)? de (?:una |un )?([a-z]+) con ([a-z]+) y ([a-z]+),? eramos tres;? \4 me (?:mando|paso|devolvio|dio) (\d+)( mil| k)?/);
  if (cena) {
    const total = K(cena[1], cena[2]);
    return { reescribir: `${cena[3]} ${total} entre ${cap(cena[4])}, ${cap(cena[5])} y yo; ${cap(cena[4])} me pago ${miles(K(cena[6], cena[7]), total)}` };
  }
  // ---- obligaciones que se repiten: sin el día del mes no se arma el pago fijo
  if (/\b(?:todos los meses|cada mes|mensualmente|mensuales?)\b/.test(t) && hay.length && !/^cada mes el \d/.test(t) && !/\bcuota (?:mensual )?de cada asociado\b/.test(t) && !/\bel \d{1,2}\b/.test(t)) {
    return { texto: `¿Qué día del mes es? Escríbelo con el día para dejarlo fijo, por ejemplo «cada mes el 5 internet ${hay[0]}». Sin el día no registro nada ni pagos futuros.` };
  }
  // ---- el fondo común de la casa no existe
  if (/\bfondo (?:comun|de la casa)\b/.test(t)) {
    const sacar = t.match(/\bsac(?:amos|ue|o)\b.*\bpara (?:pagar|comprar)\s+(?:el |la |los |las |unas |unos )?([a-z]+)/);
    if (sacar && hay.length) return { reescribir: `${sacar[1]} ${hay[0]}` };
    return { texto: 'No llevo un fondo común de la casa. Si le diste la plata a alguien, escribe «le presté 100000 a Mama»; si la vas apartando para algo, usa una meta: «meta casa 500000» y «ahorré 100000 para casa».' };
  }
  // ---- lo que cada uno pone o paga en la casa
  if (/\bpone\b.*\byo (?:pongo|pongo)\b|\byo pongo\b/.test(t) && nombres.length >= 1 && hay.length >= 2) {
    const mio = t.match(/\byo pongo (\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)/);
    const v = mio ? montos(mio[1])[0] : undefined;
    if (v) return { reescribir: `aporte casa ${v}`, extra: 'Solo anoto lo tuyo.' };
  }
  const iguales = t.match(/\b(?:fue|costo|valio|salio)\s+(?:de\s+)?(\d[\d.,]*(?:\s?(?:k|mil|lucas?))?).*\b(?:pone|ponen)\b/);
  if (iguales && /\byo\b/.test(t)) {
    // «mamá pone 20, Mateo 20 y yo los otros 20»: las partes dichas cortas valen lo mismo si son iguales
    const total = montos(iguales[1])[0];
    const partes = [...t.slice(t.search(/\b(?:pone|ponen)\b/)).matchAll(/\b(\d+)(?:\s?(?:k|mil))?\b/g)].map(m => Number(m[1]));
    if (total && partes.length >= 2 && partes.every(p => p === partes[0])) {
      const cosa = t.match(/\b(?:el|la)\s+([a-z]{3,})\s+(?:fue|costo|valio|salio)/)?.[1] ?? 'gasto';
      return { reescribir: `${cosa} ${total} entre ${partes.length}` };
    }
  }
  const dividir = t.match(/\b(?:el|la)\s+([a-z]{3,})\s+(?:vale|cuesta|costo|fue|salio)\b.*\b(?:dividimos|repartimos|entre)\b/);
  if (dividir && hay.length >= 1 && /\byo\b/.test(t)) {
    const gente = nombres.length + 1;
    return { reescribir: `${dividir[1]} ${hay[0]} entre ${gente}` };
  }
  if (/\bentre (?:los|las) (?:de la casa|de aca)\b/.test(t) && hay.length) {
    return { texto: `¿Entre cuántas personas se reparte? Escríbelo con el número, por ejemplo «luz ${hay[0]} entre 4».` };
  }
  // «mamá pagó el recibo de 120k y yo le debo mi mitad», «Mateo pagó el internet de 180k, nos toca poner 60k a cada uno»
  const pagoOtro = primero && new RegExp(String.raw`^${primero.clave}\s+pago\b`).test(t) ? t : '';
  if (pagoOtro && hay.length) {
    const cosa = t.match(/\b(?:el|la|los|las)\s+([a-z]{3,})\s+de\b/)?.[1] ?? 'casa';
    if (/\bmitad\b/.test(t)) return { reescribir: `le debo ${Math.round(hay[0] / 2)} a ${n(primero)} por ${cosa}` };
    if (/\ba cada uno\b/.test(t) && hay.length >= 2) return { reescribir: `le debo ${hay[hay.length - 1]} a ${n(primero)} por ${cosa}` };
  }
  // «mamá hizo el mercado de 280k y yo le voy a dar 100k de mi parte»
  if (primero && new RegExp(String.raw`^${primero.clave}\s+(?:hizo|pago|compro)\b`).test(t) && /\byo le (?:voy a dar|doy|debo|toca dar)\b/.test(t) && hay.length >= 2) {
    const cosa = t.match(/\b(?:el|la)\s+([a-z]{3,})\s+de\b/)?.[1] ?? 'casa';
    return { reescribir: `le debo ${hay[hay.length - 1]} a ${n(primero)} por ${cosa}` };
  }
  // «le pasé a mamá 150k para que pagara el agua»: un anticipo; lo que se gastó se anota cuando se sepa
  if (primero && /\ble (?:pase|mande|gire|envie)\b/.test(t) && /\b(?:para que|todavia no|:)\b|\bpara (?:el|la|los|las)\b/.test(t) && hay.length && !/\bcada mes\b/.test(t)) {
    return { reescribir: `le preste ${hay[0]} a ${n(primero)}`, extra: /\bsolo gasto\b/.test(t) && hay.length >= 2 ? `Si gastó ${peso(hay[1])}, le quedan ${peso(hay[0] - hay[1])} por devolverte o justificar.` : undefined };
  }
  // «mamá me devolvió 40k de lo que yo había puesto», «yo pagué el agua de 70k y mamá me pasó su mitad»
  if (primero && new RegExp(String.raw`^${primero.clave}\s+me\s+(?:devolvio|dio|paso)\b`).test(t) && hay.length === 1 && !/\bmitad\b/.test(t)) return { reescribir: `${n(primero)} me pago ${hay[0]}` };
  const aguaYMitad = t.match(/^yo pague\s+(?:el |la )?([a-z]{3,})\s+de\s+/);
  if (aguaYMitad && primero && /\bmitad\b/.test(t) && hay.length) return { reescribir: `${aguaYMitad[1]} ${hay[0]}; ${n(primero)} me pago ${Math.round(hay[0] / 2)}` };
  // dos aportes pendientes
  const pend = t.match(/\bpendientes?\s+(dos|tres|cuatro|cinco|seis|\d)\s+(?:aportes|cuotas)\b/);
  if (pend && hay.length) {
    const veces = NUM[pend[1]] ?? Number(pend[1]);
    return { texto: `Son ${peso(hay[hay.length - 1] * veces)} en ${veces} aportes de ${peso(hay[hay.length - 1])}. No llevo aportes pendientes de la casa: no anoto nada hasta que los pongas.` };
  }
  // cuánto puso cada uno
  if (/\bcuanto (?:he )?puesto\b|\bcuanto puso cada uno\b/.test(t)) {
    return { frases: ['mes'], extra: 'No llevo lo que pone cada persona de la casa: esto es lo que gastaste tú en el mes.' };
  }

  // ---- la asociación
  if (/\bcuota\b.*\bcada asociado\b|\bcada asociado\b.*\bcuota\b/.test(t) && !/\bsube\b/.test(t)) {
    return { texto: 'No llevo la lista de asociados ni sus cuotas solas. Cuando alguien deba su cuota, escribe «Jorge me debe 50000 por cuota»; cuando pague, «Jorge me pagó 50000».' };
  }
  if (/\bla cuota sube\b|\bcuota sube de\b/.test(t)) {
    return { texto: `Las cuotas no se programan por mes: lo anterior queda como estaba. Desde enero cobra con «Jorge me debe ${hay[hay.length - 1] ?? 60000} por cuota».` };
  }
  if (/\bse salio de la asociacion\b/.test(t) && primero) {
    return { texto: `No llevo el estado de cada asociado. Para dejar de cobrarle a ${n(primero)}, simplemente no le anotes más «me debe» desde diciembre; lo que ya debía y pagó queda en su historial.` };
  }
  if (/\ba todos nos toca\b.*\bextra\b/.test(t)) {
    return { texto: 'No llevo la lista de asociados: para cobrar un aporte extra, anota lo que debe cada uno, por ejemplo «Jorge me debe 30000 por salón».' };
  }
  if (/\bquien(?:es)? (?:debe|deben|siguen debiendo)\b|\bquienes pagaron\b.*\b(?:siguen debiendo|debiendo)\b/.test(t)) {
    return { frases: ['deudas'], extra: 'Cada cuota sin pagar es una cuenta por cobrar: esas son las personas que te deben. Lo de cada mes míralo en «últimos»; no separo por periodo de cuota.' };
  }
  const multa = t.match(/\b(?:a )?([a-z]{3,}) le pusieron multa de\b/);
  if (multa && primero && hay.length) return { reescribir: `${n(primero)} me debe ${hay[0]} por multa` };
  const tresCuotas = t.match(/\bdejo pagadas? (dos|tres|cuatro|cinco|seis|\d+) cuotas? de\b/);
  if (primero && tresCuotas && hay.length) return { reescribir: `${n(primero)} me pago ${hay[hay.length - 1] * (NUM[tresCuotas[1]] ?? Number(tresCuotas[1]))}`, extra: `Son ${tresCuotas[1]} cuotas de ${peso(hay[hay.length - 1])}; los periodos los llevas tú.` };
  if (/\bprest(?:o|amos)\b.*\b(?:interes|\d+ ?%)/.test(t + (/%/.test(texto) ? ' %' : '')) && hay.length) {
    return { texto: `Antes de anotar el interés: ¿el ${texto.match(/(\d+(?:[.,]\d+)?) ?%/)?.[1] ?? ''} % es mensual, anual o sobre el total? El préstamo lo anoto con «le presté ${hay[0]} a ${primero ? n(primero) : 'David'}»; el interés lo anotas cuando te lo paguen.` };
  }
  const fondoPresto = t.match(/\b(?:el fondo|la asociacion|le prestamos)\b.*\bprest(?:o|amos)?\b/);
  if (primero && fondoPresto && /\ble prest(?:o|amos)\b/.test(t) && hay.length && !/\b(?:interes|%)\b/.test(t) && !/\bse (?:le )?vencio\b/.test(t)) return { reescribir: `le preste ${hay[0]} a ${n(primero)}` };
  if (primero && /\bva a devolver\b/.test(t) && hay.length >= 2) {
    return { texto: `Los pagos de ${n(primero)} todavía no pasaron. Cuando pague, escribe «${n(primero)} me pagó ${hay[hay.length - 1]}». El préstamo de ${peso(hay[0])} anótalo con «le presté ${hay[0]} a ${n(primero)}» si aún no está.` };
  }
  const devolvio = primero ? t.match(new RegExp(String.raw`^${primero.clave}\s+(?:devolvio|pago|abono)\s+(\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)\s+de los\b`)) : null;
  if (primero && devolvio) return { reescribir: `${n(primero)} me pago ${montos(devolvio[1])[0]}` };
  if (primero && /\bse (?:le )?vencio\b/.test(t) && /\bdebe\b/.test(t) && hay.length) {
    return { texto: `Sigue debiendo ${peso(hay[hay.length - 1])} a favor tuyo (la deuda de ${n(primero)} no se duplica). No marco vencimientos solos: acuérdate de cobrarle o escribe «${n(primero)} me pagó …» cuando pague.` };
  }
  const capInt = primero ? t.match(/\bpago\s+(\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)\s+de capital y\s+(\d[\d.,]*(?:\s?(?:k|mil|lucas?))?)\s+de intereses\b/) : null;
  if (primero && capInt) return { reescribir: `${n(primero)} me pago ${montos(capInt[1])[0]}; +intereses ${montos(capInt[2])[0]}` };
  const cuotaYMulta = primero ? t.match(/\bdebe la cuota de\b.*\bmulta de\b/) : null;
  if (primero && cuotaYMulta && hay.length >= 2) return { reescribir: `${n(primero)} me debe ${hay[0]} por cuota; ${n(primero)} me debe ${hay[1]} por multa` };
  if (primero && /\ble quitaron la multa\b/.test(t) && hay.length) return { reescribir: `${n(primero)} me debia ${hay[0]} y se lo perdone` };
  if (primero && /\bentro a la asociacion\b/.test(t) && hay.length) return { reescribir: `${n(primero)} me debe ${hay[hay.length - 1]} por cuota` };
  if (primero && /\bconsigno\b/.test(t) && /\basociacion\b/.test(t) && hay.length) return { reescribir: `${n(primero)} me pago ${hay[0]}` };
  const variasObligaciones = primero ? t.match(/^([a-z]+) pago\s+\d[\d.,]*(?:\s?(?:k|mil|lucas?))? de cuota, \d|^([a-z]+) pago .* de cuota .* de multa .* aporte extra/) : null;
  if (primero && /\bde cuota\b/.test(t) && /\bde multa\b/.test(t) && /\bextra\b/.test(t) && hay.length >= 3) void variasObligaciones;
  if (primero && /\bpago\b/.test(t) && /\bde cuota\b/.test(t) && /\bde multa\b/.test(t) && /\baporte extra\b/.test(t) && hay.length >= 3) {
    return { reescribir: `${n(primero)} me pago ${hay[0]}; ${n(primero)} me pago ${hay[1]}; ${n(primero)} me pago ${hay[2]}`, extra: 'Son la cuota, la multa y el aporte extra; el desglose queda en tu cabeza: cada uno entra como un pago de esa persona.' };
  }
  if (primero && /\bdebe\b.*\bcuota\b.*\bprestamo del fondo\b/.test(t) && hay.length >= 2) return { reescribir: `${n(primero)} me debe ${hay[0]} por cuota; le preste ${hay[1]} a ${n(primero)}` };
  if (primero && /\bdebia\b.*\bcuota\b.*\bla asociacion le debia\b/.test(t) && hay.length >= 2) {
    return { texto: `${n(primero)} debía ${peso(hay[0])} de cuota y la asociación le debía ${peso(hay[1])} de un reembolso: el saldo neto sería ${peso(hay[0] - hay[1])} a cargo de ${n(primero)}. No compenso nada solo: dime si lo cruzamos, o anota «${n(primero)} me pagó ${hay[0] - hay[1]}».` };
  }
  if (primero && /\bla asociacion le devolvio\b/.test(t) && hay.length) return { reescribir: `reembolso ${n(primero)} ${hay[0]}` };
  if (primero && /\bcompro\b.*\bpara la asociacion\b.*\btodavia no se los hemos pagado\b/.test(t) && hay.length) {
    const cosa = t.match(/\bcompro\s+([a-z]{3,})\b/)?.[1] ?? 'compra';
    return { reescribir: `le debo ${hay[0]} a ${n(primero)} por ${cosa}` };
  }
  if (primero && /\ble descontamos\b/.test(t) && hay.length) {
    return { texto: `${n(primero)} debía algo y descontarle ${peso(hay[0])} por una compra es un cruce de cuentas. No lo hago solo: primero anota la compra («le debo ${hay[0]} a ${n(primero)} por compra») y, si la asociación autorizó el cruce, el pago («${n(primero)} me pagó ${hay[0]}»).` };
  }
  if (primero && /\bya habia pagado\b/.test(t) && /\bconsignacion\b/.test(t) && /\bmisma\b/.test(t)) {
    return { texto: `Dejo un solo pago de ${hay[0] ? peso(hay[0]) : 'esos'} de ${n(primero)} para noviembre y no anoto la consignación repetida (es un duplicado). Si luego resulta ser otro pago, escríbelo y lo anoto.` };
  }
  if (/\bcierra las cuentas\b/.test(t) && nombres.length >= 2 && hay.length >= 2) {
    const pagos = nombres.slice(0, 2).map((p, i) => `${n(p)} me pago ${hay[i]}`).join('; ');
    const falta = hay[2];
    return { reescribir: pagos, extra: falta ? `Quedan ${peso(falta)} de cuotas por cobrar: anótalos como «X me debe ${falta} por cuota» y mira «saldos» y «deudas» para el cierre.` : undefined };
  }
  return null;
}
