/**
 * Corregir lo que ya está guardado sin decir «editar»: «cambia el almuerzo de ayer de 15k a 17k», «el taxi del viernes pasado fue
 * por Nequi», «corrige la deuda con Karla, ya no son 20k sino 15k». Primero se busca el movimiento por lo que se dice de él (día,
 * monto, concepto, persona, tipo); si hay uno solo se corrige, si hay varios se pregunta cuál. Corregir el principal de una deuda
 * cambia la deuda: no se anota ningún abono.
 */
import { aplicarCambio, type Propuesta } from './parser.ts';
import { cambiarPersona } from './aclaraciones.ts';
import { hallarMontos } from './dinero.ts';
import { categoriaPorNombre, hallarCuentas } from './entidades.ts';
import { capitalizar, limpiar, normalizar } from './texto.ts';
import type { Contexto, Cuenta, Movimiento } from './tipos.ts';

export interface Cambios {
  monto?: number; cuenta?: string; categoria?: string; fecha?: string; persona?: { viejo?: string; nuevo: string }; motivo?: string; alReves?: boolean;
}
export type Edicion = { id: string; cambios: Cambios; resumen: string[] } | { pregunta: string; candidatos: string[] };

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const RE_DIA = String.raw`(?:anteayer|antier|ayer|hoy|(?:el )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: pasado)?|(?:el )?mes pasado|hace un mes)`;
const VERBO_EDICION = /\b(?:cambia|cambiale|cambialo|cambiala|corrige|corrigelo|corrigela|ajusta|modifica|busca|ponle|ponlo|ponla|actualiza|arregla)\b/;
const PASADO = /\b(?:que anote|que pague|que le preste|que le hice|que hice|que recibi|que tengo|aparece|quedo anotad|anote mal|me confundi|desde el principio|ya no|sale en|debe quedar|se anoto)\b/;
const NUEVO = /^(?:pague|gaste|compre|le preste|le pase|me pagaron|me llegaron|presto|debo|le debo|anota|registra|apunta)\b/;
const NO_NOMBRE = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'cambia', 'corrige', 'busca', 'ajusta', 'ponle', 'ponlo', 'ayer', 'hoy', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'nequi', 'daviplata', 'efectivo', 'ya', 'al', 'de', 'mi', 'pipe']);

const monto = (m: Movimiento): number => m.asientos.filter(a => a.monto > 0 && a.moneda === 'COP').reduce((s, a) => s + a.monto, 0);
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** La fecha de un día dicho: «ayer», «el viernes pasado», «el lunes». Un día de la semana es el último que ya pasó. */
function rangoDe(dia: string, ahora: Date): [string, string] {
  const hoy = new Date(`${iso(new Date(ahora.getTime() - 5 * 3600000))}T12:00:00Z`);
  const mas = (n: number): string => iso(new Date(hoy.getTime() + n * 86400000));
  const d = dia.replace(/^el /, '').replace(/ pasado$/, '');
  if (d === 'hoy') return [mas(0), mas(0)];
  if (d === 'ayer') return [mas(-1), mas(-1)];
  if (d === 'anteayer' || d === 'antier') return [mas(-2), mas(-2)];
  if (/mes pasado|hace un mes/.test(dia)) {
    const ini = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1, 12));
    const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 0, 12));
    return [iso(ini), iso(fin)];
  }
  const i = DIAS.indexOf(d);
  const atras = ((hoy.getUTCDay() - i + 7) % 7) || 7;
  return [mas(-atras), mas(-atras)];
}

const personasDe = (m: Movimiento, cuentas: Cuenta[]): string[] => m.asientos.map(a => cuentas.find(c => c.id === a.cuentaId)).filter((c): c is Cuenta => c?.tipo === 'persona').map(c => c.clave);
const cuentaDe = (m: Movimiento, cuentas: Cuenta[]): string => m.asientos.map(a => cuentas.find(c => c.id === a.cuentaId)).find(c => c?.tipo === 'dinero')?.clave ?? '';

export function leerEdicion(texto: string, movimientos: Movimiento[], ctx: Contexto): Edicion | null {
  if (texto.length > 220) return null;
  const t = limpiar(texto);
  if (NUEVO.test(t) && !VERBO_EDICION.test(t) && !PASADO.test(t)) return null;
  const vivos = movimientos.filter(m => m.estado === 'ok' && !/^saldo inicial/i.test(m.descripcion) && m.propuesta);
  if (!vivos.length) return null;
  const cuentas = ctx.cuentas;

  // ---- los días: el primero señala el movimiento y, si hay dos, el último es el día nuevo
  const dias = [...t.matchAll(new RegExp(RE_DIA, 'g'))].map(m => m[0]);
  // ---- los montos: el primero es el de ahora y el último el nuevo («de 15k a 17k», «ya no son 20k sino 15k»); tras un «no» es el viejo
  const montos = hallarMontos(t).filter(m => m.explicito && m.moneda === null);
  let viejo: number | undefined; let nuevo: number | undefined;
  if (montos.length >= 2) {
    const a = montos[0], b = montos[montos.length - 1];
    const noAntesDeB = /\bno (?:fue |era |eran |fueron |son |es )?(?:de )?$/.test(t.slice(0, b.inicio));
    [viejo, nuevo] = noAntesDeB ? [b.valor, a.valor] : [a.valor, b.valor];
  } else if (montos.length === 1) viejo = montos[0].valor;

  // ---- los nombres de personas: el primero señala el movimiento y, si hay dos, el último es el nuevo
  const conocidos = new Set(cuentas.filter(c => c.tipo === 'persona').map(c => c.clave));
  const palabras = texto.split(/\s+/).map(w => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''));
  const nombres: string[] = [];
  palabras.forEach((w, i) => {
    const n = normalizar(w);
    if (!/^[A-ZÁÉÍÓÚÑ][\p{L}]{2,}$/u.test(w) || NO_NOMBRE.has(n) || cuentas.some(c => c.tipo === 'dinero' && c.clave === n)) return;
    if (cuentas.some(c => c.tipo === 'categoria' && (c.clave === n || normalizar(c.nombre) === n))) return;
    if (i === 0 && !conocidos.has(n)) return;
    if (!nombres.some(x => normalizar(x) === n)) nombres.push(w);
  });

  // ---- qué se cambia
  const cambios: Cambios = {};
  const resumen: string[] = [];
  if (nuevo !== undefined && nuevo !== viejo) { cambios.monto = nuevo; resumen.push(`monto ${nuevo}`); }
  if (dias.length >= 2) { cambios.fecha = rangoDe(dias[dias.length - 1], ctx.ahora)[0]; resumen.push('fecha'); }
  if (/\bal reves\b/.test(t)) { cambios.alReves = true; resumen.push('sentido'); }
  const motivo = /\bponle que (?:fue|era|es)(?: por)? (.+)$/.exec(t);
  if (motivo) { cambios.motivo = motivo[1]; resumen.push('motivo'); }
  if (nombres.length >= 2 && /\b(?:era|fue|es)\s+(?:para|a|con)\s+\S+/.test(t)) { cambios.persona = { viejo: nombres[0], nuevo: nombres[nombres.length - 1] }; resumen.push('persona'); }
  // la cuenta: la última que se nombra («como efectivo, pero fue por Nequi»); una sola solo cuenta si se dice con «fue», «por», «en» o «a»
  const mencionadas = hallarCuentas(t, ctx).map(x => cuentas.find(c => c.id === x.id)).filter((c): c is Cuenta => c?.tipo === 'dinero');
  if (mencionadas.length && (mencionadas.length > 1 || /\b(?:fue|era|pague|pagado|paso|a|por|en)\s+(?:la |el )?(?:nequi|daviplata|efectivo|dolares)\b/.test(t))) {
    cambios.cuenta = mencionadas[mencionadas.length - 1].nombre; resumen.push('cuenta');
  }
  // la categoría: «ponlo en Salidas», «cámbialo de Compras a Universidad», «era de transporte, no de varios»
  const cats = [...t.matchAll(/\b([a-z]{4,})\b/g)].map(m => ({ w: m[1], i: m.index ?? 0 })).map(x => ({ ...x, c: categoriaPorNombre(x.w, ctx) })).filter(x => x.c && x.c.tipo === 'categoria');
  const cueCat = /\b(?:ponle|ponlo|ponla|pon|va en|va como|cambialo|cambiale|era de)\b/.test(t) || /\bde [a-z]+ a [a-z]+\b/.test(t);
  if (cats.length && cueCat) {
    const candidatas = cats.filter(x => !/\bno (?:de |en )?$/.test(t.slice(Math.max(0, x.i - 8), x.i)));
    const ultima = candidatas[candidatas.length - 1];
    if (ultima?.c) { cambios.categoria = ultima.c.nombre; resumen.push('categoría'); }
  }
  if (!resumen.length) return null;
  if (!VERBO_EDICION.test(t) && !PASADO.test(t) && !(dias.length && /\b(?:fue|era)\b/.test(t))) return null;

  // ---- qué movimiento: se va estrechando con lo que se dijo mientras quede alguno
  let c = [...vivos].reverse();
  const estrechar = (f: (m: Movimiento) => boolean): void => { const x = c.filter(f); if (x.length) c = x; };
  const vieja = nombres.length >= 2 && cambios.persona ? nombres[0] : nombres.length === 1 ? nombres[0] : undefined;
  if (/\b(?:deuda|debo|debe)\b/.test(t)) estrechar(m => m.tipo === 'deuda' || m.tipo === 'prestamo');
  if (/\bprestamo\b/.test(t)) estrechar(m => m.tipo === 'prestamo');
  if (/\b(?:abono|pago)\b/.test(t)) estrechar(m => m.tipo === 'pago');
  if (/\bdevolucion\b/.test(t)) estrechar(m => m.tipo === 'ingreso');
  if (/\btransferencia\b/.test(t)) estrechar(m => m.tipo === 'transferencia');
  if (viejo !== undefined) estrechar(m => monto(m) === viejo);
  if (dias.length) { const [d, h] = rangoDe(dias[0], ctx.ahora); estrechar(m => m.ocurridoEn.slice(0, 10) >= d && m.ocurridoEn.slice(0, 10) <= h); }
  if (vieja) estrechar(m => personasDe(m, cuentas).includes(normalizar(vieja)));
  const sueltas = t.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !/^\d/.test(w) && !NO_NOMBRE.has(w) && !/^(?:cambia|corrige|ajusta|busca|ponle|ponlo|fue|era|eran|fueron|para|como|pero|desde|principio|anote|anoto|pague|hice|hizo|presto|preste|mismo|debe|quedar|sale|aparece|realmente|tengo|varios|gasto|deuda|pago|abono|prestamo|devolucion|transferencia|ultimo|pasado|mes|ya|ese|esa|con|por|que|del|sino|sino|mal|confundi|queda|anotado|como|recibi|corrigela|corrigelo)$/.test(w));
  for (const w of sueltas) {
    const raiz = w.slice(0, Math.max(4, w.length - 2));
    estrechar(m => normalizar(m.descripcion).includes(raiz) || (m.mensajeOriginal ? normalizar(m.mensajeOriginal).includes(raiz) : false));
  }
  if (cambios.cuenta) { /* la cuenta nueva no sirve para buscar: el movimiento todavía está en la vieja */ }
  if (c.length === vivos.length && !dias.length && viejo === undefined && !vieja) return null; // no se dijo cuál: no se adivina
  if (c.length === 1) return { id: c[0].id, cambios, resumen };
  // varios que encajan igual: se pregunta
  const iguales = c.filter(m => monto(m) === monto(c[0]) && m.ocurridoEn.slice(0, 10) === c[0].ocurridoEn.slice(0, 10) && m.tipo === c[0].tipo);
  if (iguales.length === c.length || c.length > 1) return { pregunta: '¿Cuál quieres cambiar?', candidatos: c.slice(0, 4).map(m => m.id) };
  return null;
}

/** La tarjeta de lo guardado, con lo que se corrigió. null si lo que se pide no se puede aplicar a ese movimiento. */
export function aplicarEdicion(p: Propuesta, cambios: Cambios, ctx: Contexto): Propuesta | null {
  let q: Propuesta = { ...p };
  if (cambios.monto !== undefined) {
    const n = cambios.monto;
    const nueva = q.tipo === 'gasto' || q.tipo === 'compartido' || q.tipo === 'ingreso' ? aplicarCambio(q, `monto ${n}`, ctx) : { ...q, monto: n };
    if (!nueva) return null;
    q = nueva;
  }
  if (cambios.cuenta) {
    const c = ctx.cuentas.find(x => x.tipo === 'dinero' && x.nombre === cambios.cuenta);
    if (!c) return null;
    q = { ...q, cuentaId: c.id };
  }
  if (cambios.categoria) {
    const cat = categoriaPorNombre(normalizar(cambios.categoria), ctx);
    if (!cat) return null;
    q = { ...q, categoriaId: cat.id, faltantes: q.faltantes.filter(f => f.campo !== 'categoria') };
  }
  if (cambios.fecha) q = { ...q, ocurridoEn: `${cambios.fecha} ${q.ocurridoEn.slice(11) || '12:00:00'}` };
  if (cambios.persona && q.persona) q = cambiarPersona(q, cambios.persona.viejo && normalizar(cambios.persona.viejo) === normalizar(q.persona) ? q.persona : q.persona, cambios.persona.nuevo);
  if (cambios.motivo) q = { ...q, motivo: cambios.motivo, ...(q.tipo === 'gasto' || q.tipo === 'compartido' ? { concepto: capitalizar(cambios.motivo) } : {}) };
  if (cambios.alReves && q.tipo === 'transferencia' && q.cuentaId && q.cuentaDestinoId) q = { ...q, cuentaId: q.cuentaDestinoId, cuentaDestinoId: q.cuentaId };
  return q;
}
