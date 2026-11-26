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

const BANCOS = /\b(?:nequi|daviplata|bancolombia)\b/;
const FUERTES = /compra aprobada|transaccion aprobada|pago exitoso|debito compra|transferencia recibida|te llego plata|recibiste una transferencia|usted envio/;
const ENCABEZADOS = /enviaste|te envio|nequi:|daviplata:|bancolombia:|nequi notificacion|daviplata informa|bancolombia -/;
const INGRESO = /te llego plata|te envio|recibiste|transferencia recibida|abono recibido|consignacion recibida|deposito recibido|te pagaron/;
const GASTO = /enviaste|usted envio|compra|pago exitoso|debito|retiro|pagaste|transaccion aprobada/;
const SALDO = /saldo|disponible|punto|acumulad|cupo|limite/;
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

const PARADA = new Set(['ref', 'referencia', 'fecha', 'saldo', 'ver', 'el', 'tu', 'nro', 'hora', 'valor']);

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

/** Si el texto es la notificación de un banco, una frase por operación; si no, null y el mensaje sigue su camino. */
export function leerNotificacionBancaria(texto: string, ctx: Contexto): { frases: string[] } | null {
  const n = sinTildes(texto);
  if (texto.length < 20 || !/(?:\$|\bCOP)\s*\d/i.test(texto)) return null;
  if (!(FUERTES.test(n) || (BANCOS.test(n) && ENCABEZADOS.test(n)))) return null;

  // las líneas, sin lo que parece una orden
  const lineas = texto.split(/\r?\n/).map(l => { const i = l.search(ORDEN); return (i >= 0 ? l.slice(0, i) : l).trim(); }).filter(Boolean);
  const hoy = aLocal(ctx.ahora).slice(0, 10);

  const ops: Op[] = [];
  for (const linea of lineas) {
    let previo = 0;
    for (const m of linea.matchAll(MONTO)) {
      const ini = m.index ?? 0;
      const ventana = sinTildes(linea.slice(Math.max(previo, ini - 35), ini));
      previo = ini + m[0].length;
      if (SALDO.test(ventana)) continue;
      const monto = aPesos(m[1]);
      if (monto > 0) ops.push({ linea, monto, fin: previo });
    }
  }
  if (!ops.length) return null;

  const todo = lineas.join('\n');
  const unica = ops.length === 1;
  const banco = BANCOS.exec(n)?.[0] ?? '';
  const cuenta = banco && ctx.cuentas.some(c => c.tipo === 'dinero' && sinTildes(c.nombre) === banco) ? banco : '';
  const fechaGeneral = fechaDe(todo, hoy);
  const frases: string[] = [];

  for (const op of ops) {
    const donde = unica ? todo : op.linea;
    const nd = sinTildes(donde);
    const esIngreso = INGRESO.test(nd);
    if (!esIngreso && !GASTO.test(nd)) continue;
    const fecha = fechaDe(op.linea, hoy) || fechaGeneral;
    const cuando = `${fecha ? ` el ${fecha}` : ''}${horaDe(op.linea) || (unica ? horaDe(todo) : '')}`;
    const despues = op.linea.slice(op.fin);

    if (esIngreso) {
      // «Juan P. te envió $80.000», «... por valor de $125.000 de MARÍA R.», «... - DE: ANDRÉS P. - 09:02»
      const antes = op.linea.match(/^(.*?)\s+te envi[oó](?=\s|$)/i)?.[1];
      const de = (despues.match(/\bde:?\s+(.+)$/i) ?? (unica ? todo.match(/\bde:?\s+([^\n]+)/i) : null))?.[1];
      const quien = conMayusculas(nombreDesde(antes ?? de ?? ''));
      frases.push(`${quien ? `${quien} me pagó` : 'me pagaron'} ${op.monto}${cuenta ? ` en ${cuenta}` : ''}${cuando}`);
      continue;
    }
    // gasto: a una persona («Enviaste $X a LAURA G.», «A: CARLOS M.») o en un comercio
    const comercio = (donde.match(/comercio:\s*(.+)$/im) ?? donde.match(/\bcompra(?: aprobada)? en\s+(.+)$/im) ?? despues.match(/^\s*-\s*(.+?)(?:\s+-\s+\d|$)/))?.[1];
    const persona = comercio ? undefined : (despues.match(/^\s*a:?\s+(.+)$/i) ?? donde.match(/^a:\s*(.+)$/im))?.[1];
    const nombreP = persona ? nombreDesde(persona) : '';
    const nombreC = comercio ? nombreDesde(comercio) : '';
    if (nombreP) frases.push(`envío a ${nombreP} ${op.monto}${cuenta ? ` ${cuenta}` : ''}${cuando}`);
    else if (nombreC) frases.push(`gasté ${op.monto} en ${nombreC}${cuenta ? ` ${cuenta}` : ''}${cuando}`);
    else frases.push(`gasté ${op.monto}${cuenta ? ` en ${cuenta}` : ''}${cuando}`);
  }
  return frases.length ? { frases } : null;
}
