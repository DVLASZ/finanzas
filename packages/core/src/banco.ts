/**
 * Notificaciones del banco pegadas en el chat (Nequi, Daviplata, Bancolombia), casi siempre sacadas de una captura.
 * Se convierten en una frase por operación, en la forma que el bot ya entiende y con cuenta y fecha explícitas:
 *   «envío a laura g 35000 nequi el 26/11/2026 a las 08:15»
 *   «Juan P. me pagó 80000 en nequi el 26/11/2026 a las 09:12»
 *   «gasté 12500 en panadería la 14 nequi el 26/11/2026 a las 07:43»
 *
 * Reglas que importan:
 *   - Solo cuenta el monto de la operación. Saldos, puntos, cupos, dígitos de la tarjeta, referencias y códigos se ignoran:
 *     un monto solo se acepta si trae «$» o «COP» y lo que lo precede no habla de saldo.
 *   - El texto es dato no confiable. Lo que parezca una orden («ignora las instrucciones», «registra X como gasto»)
 *     se corta de la línea y nunca llega al bot.
 *   - Si no hay una cuenta con el nombre del banco (Bancolombia en una instalación que no la tiene), no se inventa:
 *     la frase queda sin cuenta y el bot usa la de siempre, que se ve en la tarjeta y se puede cambiar.
 */
import { aLocal } from './fechas.ts';
import type { Contexto } from './tipos.ts';

const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const BANCOS = /\b(?:nequi|daviplata|bancolombia|banco de bogota|bogota)\b/;
const FUERTES = /compra aprobada|transaccion aprobada|pago exitoso|debito compra|transferencia recibida|te llego plata|recibiste una transferencia|usted envio/;
const ENCABEZADOS = /enviaste|te envio|nequi:|daviplata:|bancolombia:|nequi notificacion|daviplata informa|bancolombia -/;
const INGRESO = /te llego plata|te envio|recibiste|has recibido|transferencia recibida|abono recibido|abono en cuenta|consignacion recibida|deposito recibido|te pagaron/;
/** Alertas con renglones rotulados («Valor:», «Retiro:», «Comisión:»...) y las que dicen cómo terminó la operación. */
const ETIQUETADA = /(?:^|\n)\s*(?:valor|retiro|abono|monto)\b|debito por|has recibido|recibiste|enviaste|transferencia realizada|pago pse|pago tarjeta|reversion|avance|retiro exitoso|abono en cuenta|transaccion exitosa|estamos procesando|fue exitoso|no se pudo|rechazad|no aprobad|declinad|fallid/;
const RECHAZO = /rechazad|no aprobad|declinad|fallid|no se pudo|no fue posible|no pudimos/;
const PENDIENTE = /estamos procesando|estado:?\s*pendiente|en proceso|en curso/;
const REFERENCIA = /\b(?:ref(?:erencia)?(?: pse)?|movimiento|no\.? operacion|operacion|codigo|autorizacion|aprobacion)\.?:?\s*#?(\d{4,})/g;
const GASTO = /enviaste|tu envio|envio de|usted envio|pago pse|transferencia realizada|transaccion exitosa|compra|pago exitoso|debito|retiro|pagaste|transaccion aprobada/;
const SALDO = /saldo|disponible|punto|acumulad|cupo|limite|total/;
// frases que parecen una orden dentro de la notificación: se corta la línea desde ahí
const ORDEN = /\bnota\s*:|\bignora\b|\bolvida\b|\binstrucci|\bregistra\b|\belimina\b|\bborra\b|\bejecuta\b|\bsystem\b|\bsistema\s*:/i;
const MONTO = /(?:\$|\bCOP)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi;
const MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «35.000,00» y «45.000» son pesos; los centavos se descartan. */
function aPesos(s: string): number {
  const m = s.match(/^(.*\d)[.,](\d{1,2})$/);
  const entero = m && (/[.,]/.test(m[1]) || m[2].length < 3) ? m[1] : s;
  return Number(entero.replace(/[.,]/g, ''));
}

const dos = (n: number): string => String(n).padStart(2, '0');

/** La primera fecha del texto como «dd/mm/aaaa» (la forma que lee el bot), o '' si no hay, no existe o es futura. */
function fechaDe(texto: string, hoy: string): string {
  const t = sinTildes(texto);
  let d = 0; let m = 0; let a = 0;
  const num = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  const letras = t.match(/\b(\d{1,2})(?: de)? ([a-z]{3,10})\.?(?: de)? (\d{4})\b/);
  if (num) { d = Number(num[1]); m = Number(num[2]); a = Number(num[3]); if (a < 100) a += 2000; }
  else if (letras) { d = Number(letras[1]); a = Number(letras[3]); m = MESES3.indexOf(letras[2].slice(0, 3)) + 1; }
  if (!d || m < 1 || m > 12 || a < 2000 || d > new Date(Date.UTC(a, m, 0)).getUTCDate()) return '';
  return `${a}-${dos(m)}-${dos(d)}` > hoy ? '' : `${dos(d)}/${dos(m)}/${a}`;
}

/** La hora como « a las HH:MM» en 24 horas, o ''. */
function horaDe(texto: string): string {
  const m = sinTildes(texto).match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/);
  if (!m) return '';
  let h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return '';
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  return ` a las ${dos(h)}:${m[2]}`;
}

const PARADA = new Set(['ref', 'referencia', 'fecha', 'saldo', 'ver', 'el', 'tu', 'nro', 'hora', 'valor', 'por', 'en', 'con', 'desde', 'hoy', 'fue', 'exitoso', 'exitosa', 'aprobado', 'aprobada', 'realizado', 'realizada']);

/** Un nombre de persona o de comercio en minúsculas: palabras seguidas hasta una de parada o un símbolo. */
function nombreDesde(resto: string): string {
  const palabras: string[] = [];
  for (const w of resto.trim().split(/\s+/)) {
    const limpio = w.replace(/[.,;]+$/, '');
    const esNumero = /^\d{1,3}$/.test(limpio);
    if (!/^[\p{L}][\p{L}'-]*$/u.test(limpio) && !(palabras.length && esNumero)) break;
    if (PARADA.has(sinTildes(limpio)) && palabras.length) break;
    palabras.push(limpio.toLowerCase());
    if (palabras.length >= 5) break;
  }
  return palabras.join(' ');
}

const conMayusculas = (s: string): string => s.replace(/(^|\s)(\p{L})/gu, (_, e: string, l: string) => e + l.toUpperCase());

interface Op { linea: string; monto: number; fin: number }

/** El nombre que va en la frase para la cuenta de ese banco en esta instalación, o '' si no la tiene. */
function cuentaDelBanco(n: string, ctx: Contexto): string {
  // el banco que escribe la alerta es el que se nombra primero (el otro puede ser el destino)
  const clave = (['nequi', 'daviplata', 'bancolombia', 'bogota'] as const)
    .map(k => ({ k, i: n.search(new RegExp(String.raw`\b${k}\b`)) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i)[0]?.k ?? '';
  if (!clave || !ctx.cuentas.some(x => x.tipo === 'dinero' && sinTildes(x.nombre).includes(clave))) return '';
  return clave;
}

export interface AlertaBancaria { frases: string[]; respuesta?: string }

/** Las referencias que trae una alerta (sin repetir): sirven para no anotar dos veces la misma operación. */
export function referenciasDeAlerta(texto: string): string[] {
  return [...new Set([...sinTildes(texto).matchAll(REFERENCIA)].map(m => m[1]))];
}

/** Si el texto es la notificación de un banco, una frase por operación; si no, null y el mensaje sigue su camino. */
export function leerNotificacionBancaria(texto: string, ctx: Contexto): AlertaBancaria | null {
  const n = sinTildes(texto);
  if (texto.length < 20) return null;
  const esBanco = BANCOS.test(n);
  const pegada = /\n/.test(texto) || ENCABEZADOS.test(n);
  const reconocida = FUERTES.test(n) || (esBanco && ENCABEZADOS.test(n)) || (esBanco && pegada && ETIQUETADA.test(n));
  if (!reconocida) return null;

  // una compra en dólares no se convierte a pesos: se dice y se deja para cuando el banco la liquide
  const usd = n.match(/\busd\s*(\d+(?:[.,]\d+)?)/);
  if (usd && !/(?:\$|\bcop)\s*\d{1,3}(?:[.,]\d{3})/.test(n)) {
    return { frases: [], respuesta: `Es una compra en dólares (USD ${usd[1]}). No la convierto a pesos por mi cuenta: cuando el banco la liquide, anótala con el valor en pesos o en dólares («gasté ${usd[1].replace(',', '.')} dólares en suscripción»).` };
  }
  // lo que no se hizo no se anota
  if (RECHAZO.test(n)) return { frases: [], respuesta: 'Esa operación no se hizo (la rechazaron, la declinaron o falló), así que no anoté nada.' };
  if (PENDIENTE.test(n) && !/exitos|aprobad|realizad/.test(n)) {
    return { frases: [], respuesta: 'Esa operación sigue pendiente, así que todavía no la anoto. Cuando llegue la confirmación, pégala y la anoto una sola vez.' };
  }
  if (!/(?:\$|\bCOP)\s*\d/i.test(texto)) return null;

  // las líneas, sin lo que parece una orden
  const lineas = texto.split(/\r?\n/).map(l => { const i = l.search(ORDEN); return (i >= 0 ? l.slice(0, i) : l).trim(); }).filter(Boolean);
  const hoy = aLocal(ctx.ahora).slice(0, 10);

  const ops: Op[] = [];
  const vistas = new Set<string>();
  const refs: string[] = [];
  for (const linea of lineas) {
    let previo = 0;
    const refLinea = [...sinTildes(linea).matchAll(REFERENCIA)][0]?.[1];
    for (const m of linea.matchAll(MONTO)) {
      const ini = m.index ?? 0;
      const ventana = sinTildes(linea.slice(Math.max(previo, ini - 35), ini));
      previo = ini + m[0].length;
      if (SALDO.test(ventana)) continue;
      const monto = aPesos(m[1]);
      if (monto <= 0) continue;
      // la misma operación pegada dos veces (igual referencia y monto) cuenta una vez
      const clave = refLinea ? `${refLinea}|${monto}` : '';
      if (clave && vistas.has(clave)) continue;
      if (clave) { vistas.add(clave); refs.push(refLinea as string); }
      ops.push({ linea, monto, fin: previo });
    }
  }
  if (!ops.length) return null;
  const refMensaje = [...n.matchAll(REFERENCIA)].map(m => m[1]);
  if (!refs.length && refMensaje.length) refs.push(refMensaje[0]);

  const todo = lineas.join('\n');
  const nt = sinTildes(todo);
  const unica = ops.length === 1;
  const cuenta = cuentaDelBanco(n, ctx);
  const cta = cuenta ? ` ${cuenta}` : '';
  const hayTarjeta = ctx.cuentas.some(x => x.tipo === 'persona' && x.clave === 'tarjeta');
  const fechaGeneral = fechaDe(todo, hoy);
  const frases: string[] = [];

  // un avance de la tarjeta es deuda con la tarjeta: sin esa persona se pregunta, no se anota como plata libre
  if (/\bavance\b/.test(nt) && !hayTarjeta) {
    return { frases: [], respuesta: '¿Quieres llevar este avance de la tarjeta? Es plata que debes, no un ingreso: crea la persona «Tarjeta» (escribe «agregar persona Tarjeta») y pega la alerta otra vez.' };
  }

  for (const op of ops) {
    const nl = sinTildes(op.linea);
    const neutra = !/comision|cargo|retiro|avance|abono|recibid|enviaste|compra|pago|debito|transferencia/.test(nl.replace(/valor|monto/g, ''));
    const nd = unica || neutra ? nt : nl;
    const fecha = fechaDe(op.linea, hoy) || fechaGeneral;
    const cuando = `${fecha ? ` el ${fecha}` : ''}${horaDe(op.linea) || (unica || neutra ? horaDe(todo) : '')}`;
    const despues = op.linea.slice(op.fin);

    if (/comision|cargo/.test(nl)) {
      frases.push(/avance/.test(nt) && hayTarjeta ? `debo ${op.monto} a Tarjeta por comision avance` : `comision ${op.monto}${cta}${cuando}`);
      continue;
    }
    if (/\bavance\b/.test(nd) && hayTarjeta) { frases.push(`me presto ${op.monto} Tarjeta en ${cuenta || 'efectivo'}${cuando}`); continue; }
    if (/\bretiro\b/.test(nd)) { frases.push(cuenta ? `pase ${op.monto} de ${cuenta} a efectivo${cuando}` : `saque ${op.monto} del cajero${cuando}`); continue; }
    if (/pago (?:de )?tarjeta/.test(nd)) { frases.push(hayTarjeta ? `le pague ${op.monto} a Tarjeta${cta}${cuando}` : `pago tarjeta ${op.monto}${cta}${cuando}`); continue; }
    if (/cuenta propia/.test(nd) && cuenta) {
      const destino = nd.match(/destino:\s*(nequi|daviplata|bancolombia|bogota)/)?.[1];
      if (destino && destino !== cuenta) { frases.push(`pase ${op.monto} de ${cuenta} a ${destino}${cuando}`); continue; }
    }
    if (/reversion|reverso|devolucion/.test(nd)) { frases.push(`ingreso ${op.monto} devolucion${cta}${cuando}`); continue; }
    const esIngreso = INGRESO.test(nd);
    if (!esIngreso && !GASTO.test(nd)) continue;

    if (esIngreso) {
      // «Juan P. te envió $80.000», «... de MARÍA R.», «De: Alejandro», «Origen: TRANSFERENCIA DE ESTEBAN»
      const antes = op.linea.match(/^(.*?)\s+te envi[oó](?=\s|$)/i)?.[1];
      const de = (despues.match(/\bde:?\s+(.+)$/i)
        ?? todo.match(/(?:^|\n)\s*de:\s*([^\n]+)/i) ?? todo.match(/origen:[^\n]*?\bde\s+([^\n]+)/i)
        ?? (unica ? todo.match(/\bde\s+(?!la |el |los |las |tu |una? )([^\n]+)/i) : null))?.[1];
      const quien = conMayusculas(nombreDesde(antes ?? de ?? ''));
      frases.push(`${quien ? `${quien} me pagó` : 'me pagaron'} ${op.monto}${cuenta ? ` en ${cuenta}` : ''}${cuando}`);
      continue;
    }
    // gasto: a una persona («Enviaste $X a LAURA G.», «Destino: DAVIPLATA - Diana») o en un comercio
    const comercio = (donde(nd, op, todo, unica || neutra).match(/comercio:\s*(.+)$/im) ?? donde(nd, op, todo, unica || neutra).match(/\bcompra(?: aprobada)? en\s+(.+)$/im) ?? despues.match(/^\s*-\s*(.+?)(?:\s+-\s+\d|$)/))?.[1];
    const destino = todo.match(/destino:\s*([^\n]+)/i)?.[1];
    const persona = comercio ? undefined : (destino ? destino.split(/\s+-\s+/).pop() : (despues.match(/^\s*a:?\s+(.+)$/i) ?? todo.match(/^a:\s*(.+)$/im))?.[1]);
    const nombreP = persona ? nombreDesde(persona) : '';
    const nombreC = comercio ? nombreDesde(comercio) : '';
    if (nombreP) frases.push(`envío a ${nombreP} ${op.monto}${cta}${cuando}`);
    else if (nombreC) frases.push(`gasté ${op.monto} en ${nombreC}${cta}${cuando}`);
    else frases.push(`gasté ${op.monto}${cuenta ? ` en ${cuenta}` : ''}${cuando}`);
  }
  void refs;
  return frases.length ? { frases } : null;
}

/** El texto donde buscar el comercio: el mensaje entero si es una sola operación, o la línea de la operación. */
const donde = (_nd: string, op: Op, todo: string, entero: boolean): string => (entero ? todo : op.linea);
