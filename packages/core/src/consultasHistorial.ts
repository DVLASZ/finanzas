/**
 * Preguntas sobre el historial dichas con palabras libres: «cuál fue mi último gasto», «muéstrame los movimientos de
 * ayer», «gasté más en octubre o en noviembre», «qué préstamos no me han pagado». Solo leen: nunca crean un movimiento
 * ni piden un monto. Reutilizan las consultas de consultas.ts y filtros.ts; aquí solo se entiende la pregunta y se
 * arma la respuesta. Si no se reconoce, devuelve null y el mensaje sigue su camino normal.
 */
import { deudasPorPersona, gastoPorCategoria, resumenSaldos, TIPOS_GASTO } from './consultas.ts';
import { formatear } from './dinero.ts';
import { aLocal, describirDia, describirFecha, indiceMes, nombreMes, rangoPeriodo } from './fechas.ts';
import { filtrarMovimientos } from './filtros.ts';
import { etiquetasUsadas } from './filtros.ts';
import { estadoPresupuesto } from './consultas.ts';
import { leerRecurrentes, vecesQueFaltanEsteMes } from './recurrentes.ts';
import type { Datos } from './repo.ts';
import { conSubcategorias } from './subcategorias.ts';
import { capitalizar, limpiar } from './texto.ts';
import type { Cuenta, Movimiento } from './tipos.ts';

interface Periodo { desde: string; hasta: string; nombre: string }

const DIA_MS = 86400000;
const p2 = (n: number) => String(n).padStart(2, '0');
const sumarDias = (dia: string, n: number): string => new Date(Date.parse(`${dia.slice(0, 10)}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const inicio = (dia: string): string => `${dia} 00:00:00`;
const sumar = (l: { total: number }[]): number => l.reduce((s, x) => s + x.total, 0);

/** Las preguntas que ya contestan los comandos del parser: no se tocan para no cambiar lo que ya funciona. */
const YA_RESPONDIDA = [
  /^(?:cuanto (?:llevo gastado|llevo|he gastado|gaste)|gastos?) en [a-z ]+?(?: (?:este mes|en el mes|del mes|esta semana|en la semana|hoy))?$/,
  /^(?:cuanto (?:hay|tengo|me queda|queda|plata hay)|saldo)(?: de| en) (?:la |el )?[a-z ]+$/,
  /^(?:quien|quienes) me deben?(?: plata| algo| dinero)?$/,
];

const INICIO_DE_PREGUNTA = /^(?:cuanto|cuanta|cuantos|cuantas|cual|cuales|quien|quienes|que|muestrame|muestra|dame|dime|ver|lista|listame|comparame|compara|al final|gaste mas|he gastado mas|en que)\b|\b(?:cierto|verdad)$/;
const RANGO = /\b(?:entre el|del) \d{1,2} (?:y el|al) \d{1,2} de [a-z]+/;

/** ¿Es una pregunta sobre los datos? Con cifras solo vale un rango de fechas: con un monto es un movimiento. */
export function esPreguntaDeHistorial(texto: string): boolean {
  const t = limpiar(texto);
  if (/\d/.test(t) && !RANGO.test(t)) return false;
  return INICIO_DE_PREGUNTA.test(t) && !YA_RESPONDIDA.some(r => r.test(t));
}

/** El año que se supone para un mes dicho a secas: este si ya llegó, el anterior si todavía no. */
const anioDe = (mes0: number, hoy: string): number => Number(hoy.slice(0, 4)) - (mes0 + 1 > Number(hoy.slice(5, 7)) ? 1 : 0);

function mesCompleto(mes0: number, anio: number): Periodo {
  const sig = mes0 === 11 ? `${anio + 1}-01` : `${anio}-${p2(mes0 + 2)}`;
  const nombre = nombreMes(`${anio}-${p2(mes0 + 1)}-01`);
  return { desde: inicio(`${anio}-${p2(mes0 + 1)}-01`), hasta: inicio(`${sig}-01`), nombre: `${nombre} ${anio}` };
}

/** Los meses con nombre propio que dice el texto, en orden y sin repetir. */
function mesesDichos(t: string, hoy: string): Periodo[] {
  const vistos: number[] = [];
  for (const w of t.split(' ')) {
    const i = w.length >= 4 ? indiceMes(w) : -1;
    if (i >= 0 && !vistos.includes(i)) vistos.push(i);
  }
  return vistos.map(i => mesCompleto(i, anioDe(i, hoy)));
}

function leerPeriodo(t: string, ahora: Date): Periodo | null {
  const hoy = aLocal(ahora).slice(0, 10);
  const r = t.match(/\b(?:entre el|del) (\d{1,2}) (?:y el|al) (\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/);
  if (r) {
    const mes = indiceMes(r[3]), d1 = Number(r[1]), d2 = Number(r[2]);
    if (mes >= 0 && d1 >= 1 && d1 <= d2 && d2 <= 31) {
      const base = `${r[4] ?? anioDe(mes, hoy)}-${p2(mes + 1)}`;
      return { desde: inicio(`${base}-${p2(d1)}`), hasta: inicio(sumarDias(`${base}-${p2(d2)}`, 1)), nombre: `del ${d1} al ${d2} de ${r[3]}` };
    }
  }
  const uno = (dia: string, nombre: string): Periodo => ({ desde: inicio(dia), hasta: inicio(sumarDias(dia, 1)), nombre });
  if (/\b(?:anteayer|antier)\b/.test(t)) return uno(sumarDias(hoy, -2), 'anteayer');
  if (/\bayer\b/.test(t)) return uno(sumarDias(hoy, -1), 'ayer');
  if (/\bhoy\b/.test(t)) return uno(hoy, 'hoy');
  if (/\bsemana pasada\b/.test(t)) return { ...rangoPeriodo('semana', new Date(ahora.getTime() - 7 * DIA_MS)), nombre: 'la semana pasada' };
  if (/\besta semana\b/.test(t)) return { ...rangoPeriodo('semana', ahora), nombre: 'esta semana' };
  if (/\bmes pasado\b/.test(t)) {
    const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
    return { ...mesCompleto(m === 1 ? 11 : m - 2, m === 1 ? a - 1 : a), nombre: 'el mes pasado' };
  }
  if (/\beste mes\b/.test(t)) return { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
  if (/\b(?:todo el|este|el) ano\b/.test(t)) return { ...rangoPeriodo('anio', ahora), nombre: `el año ${hoy.slice(0, 4)}` };
  const meses = mesesDichos(t, hoy);
  return meses[0] ?? null;
}

const singular = (w: string): string => (w.length > 3 ? w.replace(/s$/, '') : w);

/** La categoría que nombra el texto, por palabra completa («mecatos» sirve para Mecato). */
function categoriaDicha(t: string, cuentas: Cuenta[]): Cuenta | null {
  const palabras = new Set(t.split(' ').map(singular));
  return cuentas.find(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre' && c.clave.split(' ').every(w => palabras.has(singular(w)))) ?? null;
}

function personaDicha(t: string, cuentas: Cuenta[]): Cuenta | null {
  const palabras = new Set(t.split(' '));
  return cuentas.find(c => c.tipo === 'persona' && c.clave.split(' ').every(w => palabras.has(w))) ?? null;
}

/** Lo que vale el movimiento: lo que cae en categorías o, si no hay, el mayor de sus asientos. */
function montoDe(m: Movimiento, cats: Set<string>): number {
  const cop = m.asientos.filter(a => a.moneda === 'COP');
  const enCat = cop.filter(a => cats.has(a.cuentaId)).reduce((s, a) => s + a.monto, 0);
  return enCat !== 0 ? enCat : Math.max(0, ...cop.map(a => Math.abs(a.monto)));
}

const ROTULO: Record<string, string> = { gasto: 'gasto', compartido: 'compartido', ingreso: 'ingreso', transferencia: 'transferencia', prestamo: 'préstamo', deuda: 'deuda', pago: 'pago', cambio_moneda: 'cambio', ajuste: 'ajuste' };
const tipoGasto = (m: Movimiento): boolean => TIPOS_GASTO.includes(m.tipo);

function lista(titulo: string, movs: Movimiento[], cats: Set<string>, ancho = 15): string {
  const l = [titulo, ...movs.slice(0, ancho).map(m => `• ${describirDia(m.ocurridoEn.slice(0, 10))} · ${ROTULO[m.tipo] ?? m.tipo} · ${m.descripcion} · ${formatear(montoDe(m, cats))}`)];
  if (movs.length > ancho) l.push(`• …y ${movs.length - ancho} más`);
  return l.join('\n');
}

export function responderHistorial(texto: string, datos: Datos, ahora: Date): string | null {
  if (!esPreguntaDeHistorial(texto)) return null;
  const t = limpiar(texto);
  const { cuentas, movimientos, compromisos, config } = datos;
  const ahoraLocal = aLocal(ahora);
  const hoy = ahoraLocal.slice(0, 10);
  const cats = new Set(cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const dinero = new Set(cuentas.filter(c => c.tipo === 'dinero').map(c => c.id));
  const vivos = movimientos.filter(m => m.estado === 'ok');
  const periodo = leerPeriodo(t, ahora);
  const categoria = categoriaDicha(t, cuentas);
  const persona = personaDicha(t, cuentas);
  const gastoDe = (c: Cuenta | null, p: Periodo): number => {
    const ids = c ? new Set(conSubcategorias(config, c.id)) : null;
    return sumar(gastoPorCategoria(movimientos, cuentas, p.desde, p.hasta).filter(x => !ids || ids.has(x.cuenta.id)));
  };
  const apertura = config.fecha_apertura ?? '2000-01-01 00:00:00';

  // lo que se movió entre cuentas propias: no es gasto ni ingreso, se cuenta aparte
  if (/\b(?:movido|movi|mover|pasado|trasladado|transferido)\b.*\b(?:entre (?:mis )?cuentas|cuentas propias)\b|\b(?:traslados|transferencias) entre (?:mis )?cuentas\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
    const mov = filtrarMovimientos(datos, { desde: p.desde, hasta: p.hasta, tipos: ['transferencia'] });
    const total = mov.reduce((s, m) => s + m.asientos.filter(x => x.monto > 0 && x.moneda === 'COP').reduce((u, x) => u + x.monto, 0), 0);
    if (!mov.length) return `🔁 En ${p.nombre} no has movido plata entre tus cuentas.`;
    return `🔁 En ${p.nombre} moviste ${formatear(total, 'COP')} entre tus cuentas, en ${mov.length} ${mov.length === 1 ? 'traslado' : 'traslados'}. Eso no cuenta como gasto ni como ingreso.`;
  }

  // el último gasto, ingreso o movimiento que se anotó
  const ultimo = t.match(/\bultim[oa] (gasto|ingreso|movimiento|compra)\b/);
  if (ultimo) {
    const sirve = (m: Movimiento) => (ultimo[1] === 'ingreso' ? m.tipo === 'ingreso' : ultimo[1] === 'movimiento' ? m.tipo !== 'apertura' : tipoGasto(m));
    const m = vivos.filter(sirve).sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn) || b.creadoEn.localeCompare(a.creadoEn))[0];
    if (!m) return `Todavía no hay ${ultimo[1] === 'ingreso' ? 'ingresos' : ultimo[1] === 'movimiento' ? 'movimientos' : 'gastos'} anotados.`;
    const cat = cuentas.find(c => cats.has(c.id) && m.asientos.some(a => a.cuentaId === c.id));
    return `🧾 Tu último ${ultimo[1]}: ${m.descripcion}, ${formatear(montoDe(m, cats))}, ${describirFecha(m.ocurridoEn, ahora, m.sinHora)}${cat ? ` (${cat.nombre})` : ''}.`;
  }

  // el gasto más grande de un periodo (por defecto, el año)
  if (/\b(?:gasto|compra|pago) mas (?:grande|alto|caro)\b|\bmayor (?:gasto|compra)\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('anio', ahora), nombre: `el año ${hoy.slice(0, 4)}` };
    const mayor = filtrarMovimientos(datos, { desde: p.desde, hasta: p.hasta, tipos: [...TIPOS_GASTO] }).sort((a, b) => montoDe(b, cats) - montoDe(a, cats))[0];
    if (!mayor) return `No hay gastos anotados en ${p.nombre}.`;
    return `🏆 Tu gasto más grande de ${p.nombre}: ${mayor.descripcion}, ${formatear(montoDe(mayor, cats))} (${describirFecha(mayor.ocurridoEn, ahora, mayor.sinHora)}).`;
  }

  // pagos fijos que faltan este mes
  if (/\b(?:pagos? fijos?|gastos? fijos?|recurrentes?|fijos)\b/.test(t) && /\b(?:pendientes?|faltan?|falta|por pagar|sin pagar)\b/.test(t)) {
    const fijos = leerRecurrentes(config);
    if (!fijos.length) return 'No tienes pagos fijos guardados. Para crear uno: «cada mes el 5 internet 60000».';
    const faltan = fijos.map(r => ({ r, veces: vecesQueFaltanEsteMes(r, movimientos, ahoraLocal) })).filter(x => x.veces > 0);
    if (!faltan.length) return '✅ No te falta ningún pago fijo este mes: todos están registrados.';
    const total = faltan.reduce((s, x) => s + x.r.monto * x.veces, 0);
    return ['📌 Pagos fijos que faltan este mes', ...faltan.map(x => `• ${capitalizar(x.r.concepto)} · ${formatear(x.r.monto)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}`), `Total por pagar: ${formatear(total)}`].join('\n');
  }

  // préstamos que todavía no te pagan
  if (/\bprestamos?\b/.test(t) && /\b(?:no me (?:han )?pagado|pendientes?|sin cobrar|por cobrar|todavia|aun)\b/.test(t)) {
    const deben = deudasPorPersona(movimientos, cuentas, compromisos, apertura).filter(d => d.saldo > 0);
    if (!deben.length) return '🤝 No tienes préstamos pendientes de cobro: nadie te debe.';
    return ['🤝 Préstamos sin cobrar', ...deben.map(d => `• ${d.persona.nombre}: ${formatear(d.saldo, d.moneda)}`)].join('\n');
  }

  // lo que te devolvieron: reembolsos y cobros de préstamos
  if (/\b(?:devuelto|devolvieron|devuelven|reembols\w*|devoluciones?)\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
    const fuentes = new Set(cuentas.filter(c => c.tipo === 'fuente' && /reembols|devoluc/.test(c.clave)).map(c => c.id));
    let reembolsos = 0, cobros = 0;
    for (const m of filtrarMovimientos(datos, { desde: p.desde, hasta: p.hasta })) {
      for (const a of m.asientos) if (a.moneda === 'COP' && fuentes.has(a.cuentaId)) reembolsos -= a.monto;
      if (m.tipo === 'pago') cobros += m.asientos.filter(a => a.moneda === 'COP' && dinero.has(a.cuentaId) && a.monto > 0).reduce((s, a) => s + a.monto, 0);
    }
    if (!reembolsos && !cobros) return `↩️ En ${p.nombre} no hay devoluciones ni reembolsos anotados ($0).`;
    return `↩️ En ${p.nombre} te devolvieron ${formatear(reembolsos + cobros)}: reembolsos ${formatear(reembolsos)} y cobros de préstamos ${formatear(cobros)}.`;
  }

  // lo que queda del tope de una categoría
  if (/\b(?:presupuesto|tope)\b/.test(t)) {
    const mes = rangoPeriodo('mes', ahora);
    const pedida = t.match(/(?:presupuesto|tope) (?:de|del|para)(?: la| el)? ([a-z ]+?)(?: este mes)?$/)?.[1];
    if (!categoria && pedida) return `No tengo una categoría ni un tope llamado «${pedida}», así que no hay presupuesto que descontar. Tus categorías: ${cuentas.filter(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre').map(c => c.nombre).join(', ')}.`;
    if (!categoria) {
      const con = Object.keys(datos.presupuestos).map(id => ({ id, e: estadoPresupuesto(movimientos, cuentas, datos.presupuestos, id, mes.desde, mes.hasta, config.tope_arrastra === '1', config) })).filter(x => x.e);
      if (!con.length) return 'No tienes topes puestos. Para uno: «tope mecato 60000».';
      return ['📏 Topes de este mes', ...con.map(x => `• ${cuentas.find(c => c.id === x.id)?.nombre ?? x.id}: llevas ${formatear(x.e!.gastado)} de ${formatear(x.e!.tope)} (${x.e!.porcentaje}%)`)].join('\n');
    }
    const e = estadoPresupuesto(movimientos, cuentas, datos.presupuestos, categoria.id, mes.desde, mes.hasta, config.tope_arrastra === '1', config);
    if (!e) return `No tienes presupuesto para ${categoria.nombre}; este mes llevas ${formatear(gastoDe(categoria, { ...mes, nombre: '' }))}. Para ponerlo: «tope ${categoria.clave} 300000».`;
    const resta = e.tope - e.gastado;
    return resta >= 0
      ? `📏 Del presupuesto de ${categoria.nombre} te quedan ${formatear(resta)}: llevas ${formatear(e.gastado)} de ${formatear(e.tope)} (${e.porcentaje}%).`
      : `📏 En ${categoria.nombre} te pasaste del presupuesto por ${formatear(-resta)}: llevas ${formatear(e.gastado)} de ${formatear(e.tope)}.`;
  }

  // gastos «saliendo con Ana» o «con mis compañeros»: solo hay datos si es una persona o una etiqueta
  const con = t.match(/\b(?:cuanto|cuanta)\b.*\b(?:gaste|gastado|pague|pagado|gasto)\b.* con ((?:mis |mi |el |la |los |las )?[a-z ]+?)(?: (?:este mes|esta semana|hoy|este ano))?$/);
  if (con && !/\bcon (?:efectivo|tarjeta|nequi|daviplata)\b/.test(t)) {
    const quien = con[1].replace(/^(?:mis|mi|el|la|los|las) /, '');
    if (cuentas.some(c => c.tipo === 'dinero' && c.clave === quien)) return null;
    const p = periodo ?? { desde: '0000-01-01 00:00:00', hasta: '9999-12-31 00:00:00', nombre: 'todo el historial' };
    const compartidos = persona ? filtrarMovimientos(datos, { persona: persona.id, tipos: ['compartido'], desde: p.desde, hasta: p.hasta }) : [];
    if (persona) {
      if (!compartidos.length) return `No hay gastos compartidos con ${persona.nombre} en ${p.nombre}. Si sales con ella pero no divides la cuenta, no queda ligado a su nombre: usa una etiqueta, por ejemplo #salidas-${persona.clave}.`;
      const total = compartidos.reduce((s, m) => s + montoDe(m, cats), 0);
      return `🧾 Con ${persona.nombre} tienes ${compartidos.length} gasto${compartidos.length === 1 ? '' : 's'} compartido${compartidos.length === 1 ? '' : 's'} (${p.nombre}): tu parte suma ${formatear(total)}.`;
    }
    const palabras = quien.split(' ').filter(w => w.length >= 5).map(singular);
    const etiqueta = etiquetasUsadas(vivos).find(e => palabras.some(w => e.etiqueta.includes(w) || w.includes(e.etiqueta)));
    if (!etiqueta) return `No tengo información para separar lo de «${quien}»: no hay ninguna persona ni etiqueta con ese nombre. Si pones una etiqueta en esos gastos (por ejemplo #trabajo), sí lo puedo sumar.`;
    const hallados = filtrarMovimientos(datos, { etiqueta: etiqueta.etiqueta, categoria: categoria?.id, tipos: [...TIPOS_GASTO], desde: p.desde, hasta: p.hasta });
    return `🏷️ Con la etiqueta #${etiqueta.etiqueta}${categoria ? ` en ${categoria.nombre}` : ''}: ${hallados.length} gasto${hallados.length === 1 ? '' : 's'} por ${formatear(hallados.reduce((s, m) => s + montoDe(m, cats), 0))}.`;
  }

  // cuentas con una persona: solo informa, no compensa nada
  if (/\b(?:cuanto le (?:he )?(?:pagado|pague|prestado|preste|debo|di)|cuanto (?:me )?(?:debe|deben)|quien (?:le )?debe (?:a )?quien|cuentas con)\b/.test(t) || (persona && /\b(?:debe|debo|debemos|quedamos|vamos|voy|pagado|prestado)\b/.test(t))) {
    if (!persona) return '¿A quién te refieres? «le» no me dice. Escríbelo con el nombre, por ejemplo: «cuánto le he pagado a Pedro».';
    const filas = deudasPorPersona(movimientos, cuentas, compromisos, apertura).filter(d => d.persona.id === persona.id);
    const pagado = filtrarMovimientos(datos, { persona: persona.id, tipos: ['pago'] }).reduce((s, m) => s + m.asientos.filter(a => a.moneda === 'COP' && dinero.has(a.cuentaId) && a.monto < 0).reduce((x, a) => x - a.monto, 0), 0);
    const frases = filas.map(d => (d.saldo > 0 ? `${persona.nombre} te debe ${formatear(d.saldo, d.moneda)}` : `le debes ${formatear(-d.saldo, d.moneda)} a ${persona.nombre}`));
    return `🤝 ${frases.length ? frases.join('; ') : `Con ${persona.nombre} estás a mano`}.${pagado ? ` Le has pagado ${formatear(pagado)} en total.` : ''} Solo te lo cuento: no compensé nada.`;
  }

  // saldo de una cuenta al empezar un día de la semana, reconstruido con el historial
  const dia = t.match(/\b(?:tenia|habia|tuve)\b.*\b(?:al empezar|al inicio|al comenzar|a principios)\b.*\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (dia) {
    const idx = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(dia[1]);
    const atras = (new Date(`${hoy}T00:00:00Z`).getUTCDay() - idx + 7) % 7;
    const desde = inicio(sumarDias(hoy, -atras));
    const cuenta = cuentas.find(c => c.tipo === 'dinero' && t.split(' ').includes(c.clave)) ?? null;
    const actual = resumenSaldos(movimientos, cuentas, apertura);
    const hoyEn = cuenta ? actual.cuentas.find(x => x.cuenta.id === cuenta.id)?.saldo ?? 0 : actual.disponibleCop;
    const antes = vivos.filter(m => m.ocurridoEn < desde);
    const nombre = cuenta?.nombre ?? 'plata disponible';
    if (!antes.length || apertura >= desde) return `No tengo movimientos anteriores al ${dia[1]} ${describirDia(desde.slice(0, 10))}, así que no puedo reconstruir cuánto había en ${nombre} al empezar ese día. Hoy tienes ${formatear(hoyEn)}.`;
    const r = resumenSaldos(antes, cuentas, apertura);
    const valor = cuenta ? r.cuentas.find(x => x.cuenta.id === cuenta.id)?.saldo ?? 0 : r.disponibleCop;
    return `💰 Al empezar el ${dia[1]} ${describirDia(desde.slice(0, 10))} tenías ${formatear(valor)} en ${nombre} (hoy ${formatear(hoyEn)}).`;
  }

  // plata movida sin contar transferencias entre cuentas propias
  if (/\bmovi\b|\bplata (?:que )?(?:se )?movio\b|\bsin contar transferencias\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
    let entro = 0, salio = 0;
    for (const m of filtrarMovimientos(datos, { desde: p.desde, hasta: p.hasta })) {
      if (['transferencia', 'cambio_moneda', 'apertura', 'ajuste'].includes(m.tipo)) continue;
      for (const a of m.asientos) if (a.moneda === 'COP' && dinero.has(a.cuentaId)) { if (a.monto > 0) entro += a.monto; else salio -= a.monto; }
    }
    return `💸 En ${p.nombre} moviste ${formatear(entro + salio)} sin contar transferencias entre tus cuentas: entró ${formatear(entro)} y salió ${formatear(salio)}.`;
  }

  // promedio diario: se divide entre los días que van del periodo, no entre todos
  if (/\bpromedio\b/.test(t) && /\b(?:diario|por dia|al dia|dia)\b|\bpromedio de gastos\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
    const fin = p.hasta < inicio(sumarDias(hoy, 1)) ? p.hasta : inicio(sumarDias(hoy, 1));
    const dias = Math.max(1, Math.round((Date.parse(`${fin.slice(0, 10)}T00:00:00Z`) - Date.parse(`${p.desde.slice(0, 10)}T00:00:00Z`)) / DIA_MS));
    const total = gastoDe(categoria, { ...p, hasta: fin });
    return `📊 Promedio diario de gastos de ${p.nombre}: ${formatear(Math.round(total / dias))}. Gastaste ${formatear(total)} en ${dias} día${dias === 1 ? '' : 's'} transcurrido${dias === 1 ? '' : 's'}; divido entre los días que van, no entre todo el periodo.`;
  }

  // comparar dos meses (o este contra el pasado)
  const meses = /\bmes pasado\b/.test(t) && /\beste mes\b/.test(t) ? [leerPeriodo('este mes', ahora)!, leerPeriodo('mes pasado', ahora)!] : mesesDichos(t, hoy);
  if (meses.length >= 2 && /\b(?:gaste|gastado|gasto|compar\w*|gastos)\b/.test(t)) {
    const [a, b] = meses;
    const actual = rangoPeriodo('mes', ahora).desde;
    const enCurso = (p: Periodo) => p.desde === actual;
    const dia = Number(hoy.slice(8, 10));
    // el mes en curso va incompleto: se compara también con el otro mes hasta el mismo día
    const parejo = (p: Periodo): Periodo => ({ ...p, hasta: inicio(sumarDias(p.desde.slice(0, 10), dia)) });
    const ga = gastoDe(categoria, a), gb = gastoDe(categoria, b);
    const de = categoria ? ` en ${categoria.nombre}` : '';
    const l = [`📊 Gastos${de}: ${capitalizar(a.nombre)} ${formatear(ga)} y ${capitalizar(b.nombre)} ${formatear(gb)}.`];
    const incompleto = enCurso(a) ? a : enCurso(b) ? b : null;
    if (incompleto) {
      const otro = incompleto === a ? b : a;
      l.push(`Ojo: ${incompleto.nombre.split(' ')[0]} va solo hasta el ${dia}, así que no es parejo. En los mismos ${dia} días, ${otro.nombre.split(' ')[0]} fue ${formatear(gastoDe(categoria, parejo(otro)))} y ${incompleto.nombre.split(' ')[0]} ${formatear(gastoDe(categoria, incompleto))}.`);
    } else if (ga !== gb) {
      l.push(`${capitalizar((ga > gb ? a : b).nombre)} fue mayor por ${formatear(Math.abs(ga - gb))}.`);
    }
    return l.join('\n');
  }

  // movimientos de un día o un rango, o cuánto se gastó en uno
  const pide = /^(?:muestrame|muestra|dame|lista|listame|ver|que|cuales)\b/.test(t) || /\bmovimientos\b/.test(t);
  if (periodo && (pide || /\b(?:cuanto|cuanta)\b.*\b(?:gaste|gastado|gasto)\b/.test(t))) {
    if (!pide) {
      const total = gastoDe(categoria, periodo);
      return `🧾 ${/^(?:ayer|hoy|anteayer|antier)$/.test(periodo.nombre) ? periodo.nombre[0].toUpperCase() + periodo.nombre.slice(1) : "En " + periodo.nombre}${categoria ? `, en ${categoria.nombre}` : ''} gastaste ${formatear(total)}.`;
    }
    const efectivo = t.includes('efectivo');
    const salida = /\b(?:salio|salieron|gaste|gastos?)\b/.test(t);
    const filtro = filtrarMovimientos(datos, { desde: periodo.desde, hasta: periodo.hasta, tipos: /\bgastos?\b/.test(t) ? [...TIPOS_GASTO] : undefined, categoria: categoria?.id })
      .filter(m => m.tipo !== 'apertura')
      .filter(m => !efectivo || m.asientos.some(a => a.cuentaId === 'efectivo' && (salida ? a.monto < 0 : true)))
      .reverse();
    if (!filtro.length) return `No hay movimientos${efectivo ? ' de efectivo' : ''} en ${periodo.nombre}.`;
    const gastos = filtro.filter(tipoGasto).reduce((s, m) => s + montoDe(m, cats), 0);
    return `${lista(`🧾 Movimientos${efectivo ? ' de efectivo' : ''} de ${periodo.nombre}`, filtro, cats)}${gastos ? `\nGastos: ${formatear(gastos)}` : ''}`;
  }

  // «este mes no he gastado nada en cine, cierto»: se contesta con el dato
  if (/\b(?:gaste|gastado|gasto)\b/.test(t)) {
    const p = periodo ?? { ...rangoPeriodo('mes', ahora), nombre: 'este mes' };
    const en = t.match(/\ben ([a-z ]+?)(?: (?:este mes|esta semana|hoy|cierto|verdad|o no))*$/)?.[1];
    const total = categoria ? gastoDe(categoria, p) : en
      ? filtrarMovimientos(datos, { texto: en, tipos: [...TIPOS_GASTO], desde: p.desde, hasta: p.hasta }).reduce((s, m) => s + montoDe(m, cats), 0)
      : gastoDe(null, p);
    const de = categoria ? ` en ${categoria.nombre}` : en ? ` en «${en}»` : '';
    const cierto = /\b(?:cierto|verdad)$/.test(t);
    const nada = /\bno he gastado nada\b|\bno gaste nada\b/.test(t);
    const veredicto = cierto && nada ? (total === 0 ? 'Cierto: ' : 'No: ') : '';
    const dia = /^(?:ayer|hoy|anteayer|antier)$/.test(p.nombre);
    return `🧾 ${veredicto}${dia ? (veredicto ? p.nombre : p.nombre[0].toUpperCase() + p.nombre.slice(1)) : (veredicto ? 'en ' : 'En ') + p.nombre}${de} gastaste ${formatear(total)}.`;
  }

  return null;
}
