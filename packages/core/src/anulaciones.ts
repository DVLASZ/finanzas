/**
 * «Borra ese último movimiento», «deshaz lo que acabas de anotar», «elimina esa deuda», «borra el almuerzo», «se anotó dos
 * veces, borra una», «mentiras, al final no los compré»: anular lo ya guardado con palabras. Elige el movimiento por lo que
 * se dice (último, tipo, concepto, monto, día). Si hay uno solo, lo anula; si hay varios que encajan igual, pregunta cuál.
 */
import { hallarMontos } from './dinero.ts';
import { limpiar, normalizar } from './texto.ts';
import type { Movimiento } from './tipos.ts';

export type Anulacion = { ids: string[] } | { pregunta: string; candidatos: string[] };

const VERBO = /\b(?:borra|borrar|borralo|borrame|elimina|eliminar|eliminalo|anula|anular|anulalo|deshaz|deshacer)\b/;
const ARREPENTIDO = /\b(?:al final no (?:los|las|lo|la) (?:compre|gaste|pague|hice)|todavia no me ha pagado|no me ha pagado todavia|eso no paso|esa compra nunca se hizo)\b/;
const TIPOS: [string, string[]][] = [
  ['ingreso', ['ingreso']],
  ['deuda', ['deuda', 'prestamo']],
  ['transferencia', ['transferencia']],
  ['pago', ['pago', 'abono']],
  ['prestamo', ['prestamo']],
];
const RELLENO = new Set(['ese', 'esa', 'eso', 'este', 'esta', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'lo', 'que', 'y', 'o', 'ultimo', 'ultima', 'ultimos', 'movimiento', 'gasto', 'registro', 'anote', 'anoto', 'anotado', 'anoté', 'mal', 'si', 'ya', 'en', 'por', 'para', 'con', 'hace', 'rato', 'dos', 'veces', 'acabas', 'anotar', 'confusion', 'fue', 'era', 'no', 'puso', 'nada', 'pago', 'pagó', 'karla', 'hoy', 'ayer', 'ingreso', 'deuda', 'transferencia', 'abono', 'prestamo', 'compra', 'esa', 'tengo', 'tiene', 'sin', 'sino', 'sino']);

const monto = (m: Movimiento): number => m.asientos.filter(a => a.monto > 0 && a.moneda === 'COP').reduce((s, a) => s + a.monto, 0);
const tipoDe = (m: Movimiento): string => (m.tipo === 'compartido' ? 'gasto' : m.tipo);

export function leerAnulacion(texto: string, movimientos: Movimiento[], ahora: Date): Anulacion | null {
  const t = limpiar(texto);
  // los comandos de siempre («deshacer», «deshacer 3», «anula el último», «borra») ya tienen su camino
  if (/^(?:deshacer|deshaz|anula|anular|borra|borrar|elimina|eliminar|quita|quitar)(?: el)?(?: ultimo| ultima)?(?: \d+)?$/.test(t)) return null;
  const arrepentido = ARREPENTIDO.test(t);
  if (!VERBO.test(t) && !arrepentido) return null;
  if (/\b(?:categoria|cuenta|monto|fecha)\b/.test(t) && !arrepentido) return null; // «quita la categoría» es una edición, no una anulación
  const vivos = movimientos.filter(m => m.estado === 'ok' && !/^saldo inicial/i.test(m.descripcion));
  if (!vivos.length) return null;
  const orden = [...vivos].sort((a, b) => (a.ocurridoEn < b.ocurridoEn ? -1 : a.ocurridoEn > b.ocurridoEn ? 1 : 0));
  const recientes = [...vivos].reverse(); // el orden en que se guardaron, del último al primero

  // «se anotó dos veces, borra una»: el último de dos iguales
  if (/\bdos veces\b|\bduplicad[oa]\b|\brepetid[oa]\b/.test(t)) {
    const copia = recientes.find((m, i) => recientes.slice(i + 1).some(o => o.descripcion === m.descripcion && monto(o) === monto(m) && o.ocurridoEn.slice(0, 10) === m.ocurridoEn.slice(0, 10)));
    return copia ? { ids: [copia.id] } : null;
  }
  // «los dos últimos», «los tres últimos»
  const n = t.match(/\bultimos? (dos|tres)\b|\blos (dos|tres) ultimos\b/);
  if (n) return { ids: recientes.slice(0, (n[1] ?? n[2]) === 'dos' ? 2 : 3).map(m => m.id) };

  let candidatos = recientes;
  let filtrado = false;
  // tipo de movimiento
  for (const [palabra, tipos] of TIPOS) {
    const quiere = arrepentido && /no me ha pagado/.test(t) ? 'pago' : palabra;
    if (new RegExp(`\\b${quiere === 'pago' ? '(?:pago|abono|pagado)' : quiere}\\b`).test(t) || (palabra === 'pago' && arrepentido && /no me ha pagado/.test(t))) {
      candidatos = candidatos.filter(m => tipos.includes(tipoDe(m)) || (palabra === 'pago' && m.descripcion.toLowerCase().includes('abon')));
      filtrado = true;
      break;
    }
  }
  // día
  const hoy = new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  if (/\bayer\b/.test(t)) { candidatos = candidatos.filter(m => m.ocurridoEn.slice(0, 10) === ayer); filtrado = true; }
  // monto
  const montos = hallarMontos(t).filter(x => x.explicito);
  if (montos.length) { candidatos = candidatos.filter(m => monto(m) === montos[0].valor); filtrado = true; }
  // palabras del concepto
  const palabras = normalizar(t).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !RELLENO.has(w) && !VERBO.test(w) && !/^\d/.test(w) && !['borra', 'borrar', 'elimina', 'anula', 'quita', 'deshaz', 'ultimo', 'mismo', 'anotaste', 'mentiras', 'final', 'compre', 'compra', 'nunca', 'hizo', 'pago', 'puso', 'ellos', 'pude', 'hace', 'aunque', 'mejor'].includes(w));
  for (const w of palabras) {
    const raiz = w.slice(0, Math.max(4, w.length - 2));
    const con = candidatos.filter(m => normalizar(m.descripcion).includes(raiz));
    if (con.length) { candidatos = con; filtrado = true; }
  }
  void orden;
  if (!candidatos.length) return null;
  if (!filtrado || /\b(?:ultimo|acabas de|acabo de|ese|esa|eso)\b/.test(t) && !filtrado) return { ids: [recientes[0].id] };
  if (candidatos.length === 1 || /\bultimo\b/.test(t)) return { ids: [candidatos[0].id] };
  // varios que encajan por igual: se pregunta, salvo que sean de tipos distintos y se haya dicho solo «ese»
  return { pregunta: '¿Cuál borro?', candidatos: candidatos.slice(0, 4).map(m => m.id) };
}
