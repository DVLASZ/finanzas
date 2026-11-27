/**
 * Traslados entre cuentas propias, retiros, consignaciones, comisiones del banco y tarjeta de crédito, dichos como se hablan.
 * Se reescriben con las frases que el parser ya entiende («pasé 150000 de nequi a bancolombia», «comision cajero 4000 bancolombia»,
 * «debo 240000 a Tarjeta por audifonos») y, si falta una cuenta, se pregunta en vez de inventarla. Un envío a otra persona
 * («le mandé 70k a Jorge») nunca es un traslado propio.
 *
 * La tarjeta de crédito es una persona llamada «Tarjeta»: lo que se le debe es la deuda de la tarjeta, el abono es el pago de esa
 * deuda y los intereses suben lo que se debe. Solo funciona si la instalación tiene esa persona.
 */
import { aliasDeCuentas, cuentaDePalabra } from './entidades.ts';
import { hallarMontos } from './dinero.ts';
import { limpiar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export interface Traslado { texto?: string; error?: string }

const MONTO = String.raw`(\d[\d.,]*(?:\s?(?:k|mil|lucas?|barras?))?)`;
const TRASLADA = /\b(?:pase|pasar|pasamos|movi|mover|mande|mandar|envie|enviar|transferi|transferir|traslade|trasladar|recargue|recargar|consigne|consignar|meti|meter|deposite|depositar|retire|retirar|saque|sacar|envio)\b/;
const RETIRA = /\b(?:retire|retirar|saque|sacar)\b/;
const CONSIGNA = /\b(?:consigne|consignar|meti|meter|deposite|depositar)\b/;
const A_UN_TERCERO = /\ble(?:s)? (?:mande|envie|pase|transferi|consigne|deposite|gire)\b|\bno es mio\b|\bsu (?:nequi|cuenta|daviplata)\b/;
const SUYO = /\bmis? cuentas?\b|\bmi otra cuenta\b|\botra cuenta (?:mia|propia)\b|\bentre mis\b|\bcuentas? (?:mias|propias)\b|\bmismo banco\b|\bbolsillo\b|\bsaldo (?:normal|principal)\b|\bmi (?:nequi|daviplata|bancolombia|davivienda)\b/;
const NO_PASO = /\b(?:programad[oa]s?|rechazad[oa]s?|fallid[oa]s?|sigue pendiente|esta pendiente|queda pendiente|todavia no (?:ha |han )?(?:salido|salio|llegado|llego|pasado|paso|sido)|no (?:se pudo|paso|fue posible|se hizo))\b|\bintente\b/;
const BANCOS = /bancolombia|banco|bogota|ahorros|davivienda|nomina|bbva|nu\b|nubank/;

/** Las cuentas de dinero COP del banco (no el efectivo, las monedas ni los medios tipo Nequi) de esta instalación. */
function cuentasDeBanco(ctx: Contexto): string[] {
  return ctx.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP' && BANCOS.test(c.clave + ' ' + c.id)).map(c => c.clave);
}

interface Mencion { clave: string; id: string; inicio: number; fin: number }

/** Las cuentas de dinero nombradas, con la palabra que el parser entiende para cada una. */
function cuentasDe(t: string, ctx: Contexto): Mencion[] {
  const extra = aliasDeCuentas(ctx);
  const res: Mencion[] = [];
  for (const m of t.matchAll(/[a-z]+/g)) {
    const id = m[0] === 'banco' ? null : cuentaDePalabra(m[0], extra);
    const c = id ? ctx.cuentas.find(x => x.id === id && x.tipo === 'dinero') : undefined;
    if (c) res.push({ clave: c.clave, id: c.id, inicio: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  }
  return res;
}

const valorDe = (s: string): number | null => hallarMontos(limpiar(s)).find(m => m.explicito)?.valor ?? null;

/** Un monto y lo que viene después de él, ya como cifra: «150k» pasa a 150000. */
function montosDe(t: string): number[] {
  return hallarMontos(t).filter(m => m.explicito && m.moneda !== 'USD').map(m => m.valor);
}

/** De dónde sale y a dónde va según las palabras que preceden a cada cuenta («de nequi a bancolombia», «a mi nequi desde mi bancolombia»). */
function direccion(t: string, cuentas: Mencion[], recarga: boolean): { de?: string; a?: string } {
  let de: string | undefined; let a: string | undefined;
  for (const c of cuentas) {
    const antes = t.slice(Math.max(0, c.inicio - 28), c.inicio);
    if (/\b(?:de|desde|del)\s+(?:(?:mi|la|el|mis|esa|esta)\s+)?(?:(?:cuenta|tarjeta|bolsillo)\s+(?:de\s+)?)?$/.test(antes)) de ??= c.clave;
    else if (/\b(?:a|al|pa|para|hacia|en|con)\s+(?:(?:mi|la|el|mis)\s+)?(?:(?:cuenta|tarjeta|bolsillo)\s+(?:de\s+)?)?$/.test(antes)) a ??= c.clave;
    else if (recarga && !a) a = c.clave;
  }
  const dist = [...new Set(cuentas.map(c => c.clave))];
  if (dist.length === 2) {
    if (de && !a) a = dist.find(x => x !== de);
    else if (a && !de) de = dist.find(x => x !== a);
    else if (!de && !a) [de, a] = dist;
  }
  return { de, a };
}

/** La frase del cobro del banco: comisión, 4x1000 o cuota, de la cuenta de donde salió. */
function cobros(t: string, cuenta: string | undefined): { frases: string[]; error?: string } {
  const frases: string[] = [];
  const c = cuenta ? ' ' + cuenta : '';
  // «me cobraron 4 mil de 4x1000» / «1.200 de cuatro por mil»
  for (const m of t.matchAll(new RegExp(String.raw`${MONTO}\s+de\s+(?:4x1000|4 x 1000|cuatro por mil|cuatro por 1000|4 por mil|4 por 1000|gmf|gravamen)`, 'g'))) {
    const v = valorDe(m[1]); if (v) frases.push(`gmf ${v}${c}`);
  }
  const mil = new RegExp(String.raw`(?:cobraron|cobro|descontaron|quitaron|cargaron)\s+${MONTO}\s+(?:pesos\s+)?(?:de|por)\s+(?:4x1000|cuatro por mil|cuatro por 1000|4 por mil|4 por 1000|gmf)`).exec(t);
  if (mil && !frases.length) { const v = valorDe(mil[1]); if (v) frases.push(`gmf ${v}${c}`); }
  if (!frases.length && /\b(?:4x1000|cuatro por mil|cuatro por 1000|4 por mil|4 por 1000|gmf)\b/.test(t) && montosDe(t.replace(/cuatro por 1000|4 por 1000|4 por mil|4 x 1000|4x1000/g, ' ')).length <= 1) {
    return { frases, error: '¿Cuánto te descontó el banco de 4x1000? No lo calculo yo porque el banco exonera una parte. Escríbelo con el valor, por ejemplo: «saqué 250 mil y me descontaron 1.000 de 4x1000».' };
  }
  // «me cobraron 4 mil por usar el cajero», «me cobró 3k por moverla», «3.500 de comisión»
  const co = new RegExp(String.raw`(?:cobraron|cobro|descontaron|quitaron|cargaron)\s+${MONTO}\s+(?:pesos\s+)?(?:por|del|de)\s+([a-z ]+)`).exec(t)
    ?? new RegExp(String.raw`${MONTO}\s+de\s+(comision|cuota de manejo)`).exec(t);
  if (co && !/4x1000|cuatro por mil|cuatro por 1000|4 por mil|4 por 1000|gmf/.test(co[2] ?? '')) {
    const v = valorDe(co[1]);
    if (v && !frases.some(f => f.endsWith(String(v) + c))) {
      const motivo = /cajero/.test(co[2] ?? t) ? 'cajero' : /consigna/.test(co[2] ?? t) ? 'consignacion' : /manejo/.test(co[2] ?? '') ? 'cuota de manejo' : 'bancaria';
      frases.push(`comision ${motivo} ${v}${c}`);
    }
  }
  return { frases };
}

/** Lo que se pagó o compró después del retiro: «de ahí pagué 25k de almuerzo», «compré mercado por 42k y gasolina por 20k». */
function gastos(resto: string): string[] {
  const frases: string[] = [];
  for (const m of resto.matchAll(new RegExp(String.raw`(?:(?:y|,)\s*)?(?:de ahi\s+)?(?:solo\s+)?(?:pague|compre|gaste)\s+${MONTO}\s+(?:de|en|por)\s+(?:la |el |los |las )?([a-z]+)`, 'g'))) {
    const v = valorDe(m[1]); if (v) frases.push(`${m[2]} ${v}`);
  }
  if (frases.length) return frases;
  for (const m of resto.matchAll(new RegExp(String.raw`(?:(?:compre|pague|gaste)\s+)?(?:la |el |los |las )?([a-z]{3,})\s+por\s+${MONTO}`, 'g'))) {
    const v = valorDe(m[2]); if (v) frases.push(`${m[1]} ${v}`);
  }
  return frases;
}

const sinCuenta = (v: string, que: string): string =>
  `${que} Dime las dos cuentas y lo anoto, por ejemplo: «${v}».`;

export function trasladar(texto: string, ctx: Contexto): Traslado | null {
  // un párrafo largo o varias líneas los resuelven narrativa.ts y lineas.ts: aquí solo frases sueltas
  if (texto.length > 170 || /[\n;]/.test(texto)) return null;
  const t = limpiar(texto);
  // dólares y monedas sueltas tienen su propio camino (cambio de moneda, alcancía)
  if (/\b(?:dolar(?:es)?|usd|us)\b|\bmonedas?\b|\balcancia\b/.test(t)) return null;
  // plata que entra («me consignaron 80000 en daviplata y pasé 50 a nequi») no es un traslado propio
  if (/\b(?:me|nos) (?:consignaron|giraron|pagaron|enviaron|mandaron|transfirieron|depositaron|cayeron|llegaron)\b/.test(t)) return null;
  if (!/\d/.test(t) && !/\bcuanto\b/.test(t)) return null;
  const tarjeta = ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === 'tarjeta') ? tarjetaDeCredito(t, ctx) : null;
  if (tarjeta) return tarjeta;
  const suelto = cobroSuelto(texto); if (suelto) return { texto: suelto };
  if (!TRASLADA.test(t)) return null;
  if (A_UN_TERCERO.test(t)) return null;
  const montos = montosDe(t);
  if (!montos.length) return null;

  // lo que todavía no pasó o no salió: no se anota
  if (TRASLADA.test(t) && NO_PASO.test(t)) {
    return { error: 'Eso todavía no pasó (está programado, pendiente o la rechazaron), así que no lo anoté. Cuando salga, escribe el movimiento y lo anoto.' };
  }

  // varios traslados en una frase: «pasé 100k a nequi y después 40k de nequi a bancolombia»
  const clausulas = t.split(/\s+(?:y\s+)?(?:despues|luego)\s+/);
  if (clausulas.length > 1 && clausulas.every(c => /\d/.test(c))) {
    const frases: string[] = [];
    let ultimaMeta: string | undefined;
    for (const c of clausulas) {
      const cs = cuentasDe(c, ctx);
      const dir = direccion(c, cs, false);
      let de = dir.de; const a = dir.a;
      if (!de && ultimaMeta && /\b(?:devolvi|devolver|regrese|regresar)\b/.test(c)) de = ultimaMeta;
      const v = montosDe(c)[0];
      if (!de || !a || !v) {
        return { error: sinCuenta('pasé 100k de bancolombia a nequi', `No sé de qué cuenta salieron los $${(v ?? montos[0]).toLocaleString('es-CO')} de «${c.trim()}».`) };
      }
      frases.push(`pase ${v} de ${de} a ${a}`);
      ultimaMeta = a;
    }
    return { texto: frases.join('; ') };
  }

  // el monto: si se corrige en la misma frase («bueno, eran 105k»), vale el último
  const corr = new RegExp(String.raw`(?:bueno|digo|perdon|mejor dicho|en realidad|mejor)[ ,]+(?:eran|fueron|era|fue|son)?\s*${MONTO}`).exec(t);
  const monto = (corr ? valorDe(corr[1]) : null) ?? montos[0];
  const cs = cuentasDe(t, ctx);
  const distintas = [...new Set(cs.map(c => c.clave))];
  const retiro = RETIRA.test(t);
  const consigna = CONSIGNA.test(t);
  const efectivoDicho = distintas.includes('efectivo');
  const otras = distintas.filter(x => x !== 'efectivo' && x !== 'monedas');
  const genericoBanco = /\bbanco\b/.test(t) && !otras.length;

  // dos cuentas propias nombradas
  let de: string | undefined; let a: string | undefined;
  if (retiro) {
    de = direccion(t, cs, false).de ?? otras[0];
    a = 'efectivo';
  } else if (consigna && !distintas.length) {
    de = 'efectivo';
  } else if (consigna && efectivoDicho && otras.length === 1) {
    de = 'efectivo'; a = otras[0];
  } else if (consigna && otras.length === 1 && !efectivoDicho) {
    de = 'efectivo'; a = otras[0];
  } else {
    ({ de, a } = direccion(t, cs, /\brecargue|\brecargar\b/.test(t)));
    if (!distintas.length && !/\bcuenta|bolsillo|\bbanco\b/.test(t)) return null;
  }
  if (!retiro && !consigna && !SUYO.test(t) && distintas.length < 2) return null;
  if (!retiro && !consigna && distintas.length < 2) {
    return { error: sinCuenta(`pasé ${monto >= 1000 ? monto / 1000 + 'k' : monto} de bancolombia a nequi`, `¿De qué cuenta a cuál pasaste $${monto.toLocaleString('es-CO')}?`) };
  }

  // «del banco» sin decir cuál: con una sola cuenta de banco es esa; con varias se pregunta
  const bancos = cuentasDeBanco(ctx);
  if (genericoBanco) {
    if (bancos.length === 1) { if (retiro && !de) de = bancos[0]; if (consigna && !a) a = bancos[0]; }
    else if (bancos.length > 1) {
      const que = retiro ? `¿De cuál cuenta sacaste $${monto.toLocaleString('es-CO')}?` : `¿A cuál cuenta lo pasaste?`;
      return { error: `${que} Tienes ${bancos.join(', ')}. Escríbelo con la cuenta, por ejemplo: «${retiro ? 'saqué' : 'metí'} ${monto >= 1000 ? monto / 1000 + 'k' : monto} ${retiro ? 'de' : 'a'} ${bancos[0]}».` };
    }
  }
  // un «pero» después del retiro («los dejé en el cajero») cambia lo que pasó: lo aclara el flujo de siempre
  if ((retiro || consigna) && /\bpero\b/.test(t)) return null;
  const extras = /\b(?:cobraron|cobro|descontaron|quitaron|cargaron|4x1000|cuatro por mil|cuatro por 1000|4 por mil|4 por 1000|gmf)\b/.test(t);
  // «saqué 150k para la vuelta, compré mercado por 42k»: sin decir de qué cuenta, con una sola de banco es esa; con varias se pregunta
  if (retiro && !de && !/\bcajero\b/.test(t) && /\b(?:compre|pague|gaste)\b/.test(t)) {
    if (bancos.length === 1) de = bancos[0];
    else if (bancos.length > 1) return { error: sinCuenta('saqué 100k de bancolombia', '¿De qué cuenta sacaste $' + monto.toLocaleString('es-CO') + '?') };
  }
  if (retiro && !de) {
    // un retiro suelto lo resuelve lenguaje.ts (el cajero de la cuenta de banco); con extras hace falta saber de dónde salió
    const sigue = /\by (?:los|las|lo|la) (?:movi|pase|mande|meti|envie|transferi|devolvi)\b/.test(t);
    if (!extras && !sigue && !SUYO.test(t)) return null;
    return { error: sinCuenta('saqué 100k de bancolombia', `¿De qué cuenta sacaste $${monto.toLocaleString('es-CO')}?`) };
  }
  if (!retiro && !de && !a) return null;
  if (!de || !a) {
    if (!retiro && !consigna) return null;
    return { error: sinCuenta(consigna ? 'metí 150k a bancolombia' : 'saqué 100k de bancolombia', `¿${consigna ? 'A qué cuenta' : 'De qué cuenta'} fue?`) };
  }

  const principal = [`pase ${monto} de ${de} a ${a}`];
  // los cobros salen de la cuenta de banco que se movió
  const cuentaBanco = retiro ? de : consigna ? a : de;
  const c = cobros(t, cuentaBanco);
  if (c.error) return { error: c.error };
  // lo que se compró o pagó con esa plata: «y de ahí pagué 25k de almuerzo», «compré mercado por 42k y gasolina por 20k»
  const iGasto = t.search(/\b(?:compre|pague|gaste|de ahi)\b/);
  const g = iGasto >= 0 ? gastos(t.slice(iGasto)) : [];
  if (iGasto >= 0 && !g.length) return null; // una compra que no se alcanza a partir: la entiende el flujo de siempre
  return { texto: [...principal, ...c.frases, ...g].join('; ') };
}

/** Un cobro suelto del banco: «me apareció un cobro de 2.800 por una transferencia», «el banco me quitó 12k de cuota de manejo». */
export function cobroSuelto(texto: string): string | null {
  const t = limpiar(texto);
  const m = new RegExp(String.raw`(?:cobro|cobraron|descontaron|quitaron|cargaron|quito)\s+(?:de\s+)?${MONTO}\s+(?:pesos\s+)?(?:por|de)\s+(?:una?\s+)?(transferencia|consignacion|retiro|cajero|comision)`).exec(t);
  const v = m ? valorDe(m[1]) : null;
  return m && v && montosDe(t).length === 1 ? `comision ${m[2]} ${v}` : null;
}

const NUMERO_EN_LETRAS: Record<string, string> = { '1': 'una', '2': 'dos', '3': 'tres', '4': 'cuatro', '5': 'cinco', '6': 'seis', '12': 'doce' };

/** La tarjeta de crédito dicha como se habla (ver la cabecera). */
function tarjetaDeCredito(t: string, ctx: Contexto): Traslado | null {
  const montos = montosDe(t);
  const cs = cuentasDe(t, ctx);
  const dePago = (): string => { const c = cs.find(x => /\b(?:desde|con|por|de)\s+(?:mi\s+)?$/.test(t.slice(Math.max(0, x.inicio - 8), x.inicio))); return c ? ' con ' + c.clave : ''; };
  if (/^cuanto (?:debo|le debo|debo yo|adeudo)\b.*\btarjeta\b/.test(t)) return { texto: 'cuanto le debo a Tarjeta' };
  if (!montos.length) return null;
  const alPagar = (verbo: RegExp): number | null => {
    const m = new RegExp(verbo.source + String.raw`\s+(?:unos |los |las |solo |otros )?${MONTO}`).exec(t);
    return m ? valorDe(m[1]) : null;
  };
  // «de los 300k que pagué, 25k eran intereses y el resto abonó a la deuda»
  const mixto = new RegExp(String.raw`(?:los\s+)?${MONTO}\s+que\s+pague.*?${MONTO}\s+(?:eran|fueron)\s+(?:de\s+)?intereses`).exec(t);
  if (mixto) {
    const total = valorDe(mixto[1]); const inte = valorDe(mixto[2]);
    if (total && inte && total > inte) return { texto: `comision intereses ${inte}; le pague ${total - inte} a Tarjeta` };
  }
  // intereses, cuota de manejo y comisión del avance que cobra la tarjeta: la deuda sube
  const cobro = /\b(?:cobraron|cobro|cargaron|cobra)\b/.test(t) ? /\b(intereses|cuota de manejo|comision)\b/.exec(t) : null;
  if (cobro && /\btarjeta\b/.test(t) && !/\bavance\b/.test(t)) return { texto: `debo ${montos[0]} a Tarjeta por ${cobro[1]}` };
  // avance: la tarjeta te presta plata que llega a una cuenta o al cajero
  if (/\bavance\b/.test(t)) {
    const desembolso = montos[0];
    const aCajero = /\b(?:saque|retire|cajero)\b/.test(t);
    const aCuenta = aCajero ? 'efectivo' : (cs[0]?.clave ?? '');
    if (!aCuenta) return { error: `¿A qué cuenta te llegó el avance de $${desembolso.toLocaleString('es-CO')}? Escríbelo con la cuenta, por ejemplo: «avance de ${desembolso >= 1000 ? desembolso / 1000 + 'k' : desembolso} en nequi».` };
    const fr = [`me presto ${desembolso} Tarjeta en ${aCuenta}`];
    const com = new RegExp(String.raw`(?:cobraron|cobro|cargaron)\s+${MONTO}`).exec(t);
    const v = com ? valorDe(com[1]) : null;
    if (v) fr.push(`debo ${v} a Tarjeta por comision avance`);
    return { texto: fr.join('; ') };
  }
  // pagar o abonar a la tarjeta
  const paga = /\b(?:abone|abono|pague|pagar|pago|alcance a pagar|cancele)\b/.test(t);
  const compra = /\b(?:compre|compramos|gaste|hice una compra)\b/.test(t) || /\bdifer[a-z]+\b/.test(t);
  if (paga && /\btarjeta\b/.test(t) && !/\bcon (?:la |mi )?tarjeta\b/.test(t.replace(/\b(?:abone|pague)\s+\d[^ ]*\s+(?:a|de) la tarjeta/, '')) ) {
    const v = alPagar(/\b(?:abone|pague|pagar|abono|pago|cancele)\b/) ?? montos[montos.length - 1];
    return { texto: `le pague ${v} a Tarjeta${dePago()}` };
  }
  // compra con la tarjeta, a una o varias cuotas
  if ((compra || paga) && (/\bcon (?:la |mi )?tarjeta\b/.test(t) || /\bdifer[a-z]+\b/.test(t))) {
    const partes = t.split(/\s+y\s+(?=(?:hoy |ya )?(?:abone|pague|pago))/);
    const buena = partes[0];
    const v = montosDe(buena)[0];
    const cuotas = /\bsola cuota\b|\buna cuota\b/.test(buena) ? 'una' : (/\b(\d+|una|dos|tres|cuatro|cinco|seis|doce)\s+cuotas?\b/.exec(buena)?.[1] ?? '');
    const cu = cuotas ? (NUMERO_EN_LETRAS[cuotas] ?? cuotas) : '';
    let concepto = buena
      .replace(new RegExp(MONTO, 'g'), ' ').replace(/\b(?:con|de)\s+(?:la |mi )?tarjeta(?:\s+de\s+credito|\s+credito)?\b/g, ' ')
      .replace(/\b(?:a\s+)?(?:\d+|una|dos|tres|cuatro|cinco|seis|doce)?\s*(?:sola\s+)?cuotas?\b/g, ' ')
      .replace(/\b(?:compre|compramos|gaste|pague|difer[a-z]*|hice|una|un|unos|unas|por|de|en|a|el|la|los|las|mi|con)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!concepto) concepto = 'compra con tarjeta';
    if (!v) return null;
    const fr = [`debo ${v} a Tarjeta por ${concepto.split(' ')[0]}`];
    if (partes[1]) { const v2 = montosDe(partes[1])[0]; if (v2) fr.push(`le pague ${v2} a Tarjeta`); }
    void cu;
    return { texto: fr.join('; ') };
  }
  return null;
}
