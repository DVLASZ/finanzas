// Todo lo que pasa con otra persona: préstamos, deudas, pagos, regalos, ventas y la pregunta de qué fue.
import { error, type Faltante, type Propuesta, type Resultado } from './tipos.ts';
import { BORDE, MEDIOS, RELLENO, VEHICULOS, blanquear, conOriginales, dentroDe, listaCategorias, montosDePersona, nombreEn, palabrasLibres, personaDe, personaDeNombre, propuestaBase, recortarBordes, resolverNombre, sinNombre, total, tramosDe, type Base } from './comun.ts';
import { anotarPago, leerPago } from './pago.ts';
import { gasto, ingreso } from './movimientos.ts';
import { hallarMontos } from '../dinero.ts';
import { BILLETES } from '../efectivo.ts';
import { borrarTramos, categorizar, gruposDe, hallarCuentas, personaAlInicio } from '../entidades.ts';
import { buscarVenta } from '../ventas.ts';
import { capitalizar, limpiar } from '../texto.ts';
import { type Contexto, type Cuenta, type Grupo } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Personas sin verbo: «30000 Felipe», «pagué 3700 por Ivan empanadas»
// ---------------------------------------------------------------------------------------

/** Qué pudo ser un movimiento con una persona. Los alias son otras formas de contestar escribiendo. */
export const ROLES = [
  { id: 'pague', nombre: 'Le pagué', alias: ['pague', 'pago', 'le pague'] },
  { id: 'presto', nombre: 'Le presté', alias: ['preste', 'prestamo', 'le preste'] },
  { id: 'vendi', nombre: 'Le vendí', alias: ['vendi', 'venta', 'le vendi'] },
  { id: 'mePago', nombre: 'Me pagó', alias: ['me pago'] },
  { id: 'mePresto', nombre: 'Me prestó', alias: ['me presto'] },
  { id: 'regale', nombre: 'Le regalé', alias: ['regale', 'regalo', 'le regale'] },
  { id: 'mio', nombre: 'Fue gasto mío', alias: ['mio', 'gasto', 'gasto mio', 'fue mio'] },
] as const;
type RolId = typeof ROLES[number]['id'];

/**
 * La cuenta de un movimiento con una persona: la que dijiste, y si no dijiste ninguna pero el monto viene en dólares
 * («presté 12.50 usd a ana») y existe la cuenta de dólares, esa. Sin eso caería en Efectivo y quedaría en negativo.
 */
export function cuentaDeLaPersona(b: Base, ctx: Contexto): string {
  if (b.cuentas[0]) return b.cuentas[0].id;
  const usd = ctx.cuentas.find(c => c.tipo === 'dinero' && c.moneda === 'USD');
  return usd && b.montos.some(m => m.moneda === 'USD') ? usd.id : 'efectivo';
}

/** ¿Es una persona que ya tienes (o un apodo suyo)? */
export function personaConocida(nombre: string, ctx: Contexto): boolean {
  return personaAlInicio(limpiar(nombre).split(' '), ctx) !== null;
}

/**
 * ¿Hay una cuenta abierta con esta persona? 'teDeben' = te debe a ti; 'debes' = tú le debes.
 * Sin esa información en el contexto no se puede saber y se responde que sí, para no cambiar lo que ya hacía el intérprete.
 */
export function tieneAbierta(nombre: string, ctx: Contexto, cual: 'teDeben' | 'debes'): boolean {
  if (!ctx.abiertas) return true;
  const claves = ctx.abiertas[cual];
  const clave = limpiar(nombre);
  if (claves.includes(clave)) return true;
  const c = personaAlInicio(clave.split(' '), ctx);
  return !!c && claves.includes(c.cuenta.clave);
}

/** Palabras que dicen de dónde viene una plata que entra: «me pagaron la quincena», «me pagó la nómina». */
const DE_INGRESO = /\b(quincena|nomina|sueldo|salario|chamba|trabajo|mesada|pension|honorarios|comision|prima|bono)\b/;

export const NO_ES_PERSONA = 'No es una persona';
export const ES_APODO = 'Es un apodo de...';

// ---------------------------------------------------------------------------------------
// Ventas del catálogo: «vendí 3 botellas de jugo», «15 galletas a granel Tomás»
// ---------------------------------------------------------------------------------------

export function ventaDelCatalogo(b: Base, ctx: Contexto): Resultado | null {
  const v = buscarVenta(b.t, ctx);
  if (!v) return null;
  if ('error' in v) return /\b(vendi|vendimos|venta)\b/.test(b.t) || /\d/.test(b.t) ? error(v.error) : null;
  const cuentaId = cuentaDeLaPersona(b, ctx);
  const total = v.cantidad * v.precio;
  const p = propuestaBase(b, 'ingreso', `Venta de ${v.producto.nombre}`, total, 'COP');
  p.cuentaId = cuentaId;
  p.fuente = v.producto.nombre;
  p.venta = { producto: v.producto.nombre, presentacion: v.presentacion.nombre, cantidad: v.cantidad, precio: v.precio };

  // ¿a quién? (si hay un cliente, se pregunta si pagó o se lo fiaron)
  const per = personaEnMensaje(b, ctx, false, v.palabras);
  if (per) {
    const antes = p.faltantes.length;
    p.persona = per.conocida ? per.nombre : resolverNombre(per.nombre, ctx, p);
    const dudas = p.faltantes.splice(antes);
    p.pedirGrupo = !per.conocida;
    const nueva = !per.conocida && !dudas.length;
    p.faltantes.unshift(...dudas, ...(nueva ? [faltanteGrupo(p.persona, ctx)] : []), faltanteCobro(p.persona));
  }
  return { clase: 'movimiento', propuesta: p };
}

const faltanteCobro = (nombre: string): Faltante => ({
  campo: 'cobro', dato: nombre, pregunta: `¿${nombre} pagó o se lo fiaste?`, opciones: ['Pagó ahora', 'Se lo fié'],
});

/** Palabras de trato que casi siempre acompañan a un nombre que es un apodo o un nombre a medias: «Don Carlos», «la seño». */
const DE_TRATO = new Set(['don', 'dona', 'senor', 'senora', 'seno', 'profe', 'profesor', 'profesora', 'tio', 'tia', 'doctor', 'doctora', 'doc', 'el', 'la']);

/**
 * Una persona nueva con trato («Don Carlos») en un préstamo o una deuda: se pregunta quién es, porque dejarla en «amigos»
 * sin decirlo es lo que luego estorba. Un nombre simple («Ana») sigue sin preguntar, para no agregar un paso a cada préstamo.
 */
function preguntarQuienEs(p: Propuesta, ctx: Contexto): void {
  const conocida = ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === limpiar(p.persona ?? ''));
  if (conocida || p.faltantes.some(f => f.campo === 'persona')) return;
  if (!limpiar(p.persona ?? '').split(' ').some(w => DE_TRATO.has(w))) return;
  p.pedirGrupo = true;
  p.faltantes.unshift(faltanteGrupo(p.persona ?? '', ctx));
}

export const faltanteGrupo = (nombre: string, ctx: Contexto): Faltante => ({
  campo: 'grupo', dato: nombre, pregunta: `¿Quién es ${nombre}?`, opciones: [...gruposDe(ctx).map(g => g.nombre), ...(ctx.cuentas.some(c => c.tipo === 'persona') ? [ES_APODO] : []), NO_ES_PERSONA],
});
const faltanteRol = (nombre: string): Faltante => ({
  campo: 'rol', dato: nombre, pregunta: `Veo a ${nombre} en el mensaje. ¿Qué fue?`, opciones: ROLES.map(r => r.nombre),
});

/**
 * Persona que aparece en el mensaje: una que ya conoces (por su nombre) o un nombre nuevo escrito con
 * mayúscula (no al comienzo, no después de «en»: eso es un lugar, y no si es una palabra que ya
 * significa otra cosa, como Trident o Nequi).
 */
function personaEnMensaje(b: Base, ctx: Contexto, esTransporte: boolean, excluir: Set<string> = new Set()): { nombre: string; conocida: Cuenta | null } | null {
  const ws = b.t.split(' ').filter(Boolean);
  for (let i = 0; i < ws.length; i++) {
    const c = personaAlInicio(ws.slice(i), ctx);
    if (c) return { nombre: c.cuenta.nombre, conocida: c.cuenta };
  }
  if (esTransporte) return null; // en un recorrido las mayúsculas son lugares
  if (!/\p{Ll}/u.test(b.original)) return null; // todo en MAYÚSCULAS: las mayúsculas no dicen nada
  const delTexto = new Set(ws);
  const toks = b.original.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  const conSignificado = (w: string): boolean => {
    const c = limpiar(w);
    return excluir.has(c) || excluir.has(c.endsWith('s') ? c.slice(0, -1) : c) || RELLENO.has(c) || BORDE.has(c) || VEHICULOS.includes(c) || MEDIOS.includes(c) || hallarCuentas(c, ctx).length > 0 || categorizar(c, ctx) !== null;
  };
  for (let i = 1; i < toks.length; i++) {
    const sigla = (w: string) => w.length > 1 && w === w.toUpperCase(); // «DROP», «NEQUI»: siglas o gritos, no nombres
    if (!/^\p{Lu}/u.test(toks[i]) || sigla(toks[i])) continue;
    if (['en', 'desde', 'hasta', 'hacia'].includes(limpiar(toks[i - 1] ?? ''))) continue;
    const partes: string[] = [];
    for (let j = i; j < toks.length && partes.length < 3 && /^\p{Lu}/u.test(toks[j]) && !sigla(toks[j]); j++) partes.push(toks[j]);
    if (!partes.every(w => delTexto.has(limpiar(w)))) continue; // era una fecha, una etiqueta...
    if (partes.some(conSignificado)) continue;
    return { nombre: partes.join(' '), conocida: null };
  }
  return null;
}

/** Si hay una persona sin verbo claro, pone primero las preguntas: ¿quién es? (si es nueva) y ¿qué fue? */
export function preguntarPorPersona(p: Propuesta, b: Base, ctx: Contexto, esTransporte: boolean): void {
  const per = personaEnMensaje(b, ctx, esTransporte);
  if (!per) return;
  const antes = p.faltantes.length;
  p.persona = per.conocida ? per.nombre : resolverNombre(per.nombre, ctx, p); // puede agregar «¿a quién te refieres?»
  const dudas = p.faltantes.splice(antes); // la duda de nombre va primero
  const nueva = !per.conocida && !dudas.length;
  p.pedirGrupo = !per.conocida;
  // una persona con categoría fija (un hijo) no pregunta qué fue: es un gasto en esa categoría
  const fija = per.conocida && !dudas.length ? categoriaFijaDe(per.conocida, ctx) : null;
  if (fija) {
    p.faltantes = p.faltantes.filter(f => f.campo !== 'categoria');
    p.categoriaId = fija;
    return;
  }
  // «jornal 50000 felipe»: la palabra jornal ya dice que es un pago a un trabajador, no hay nada que preguntar
  if (per.conocida && !dudas.length && p.categoriaId === 'cat:jornales' && ctx.cuentas.some(c => c.tipo === 'persona' && c.nombre === per.nombre && c.grupo === 'trabajadores')) return;
  p.faltantes.unshift(...dudas, ...(nueva ? [faltanteGrupo(p.persona, ctx)] : []), faltanteRol(p.persona));
}

/** Config `categoria_persona` (JSON {idPersona: idCategoria}): lo que se le da a esa persona siempre va a esa categoría. */
function categoriaFijaDe(c: Cuenta, ctx: Contexto): string | null {
  try {
    const id = (JSON.parse(ctx.config.categoria_persona ?? 'null') ?? {})[c.id];
    return typeof id === 'string' && ctx.cuentas.some(x => x.id === id) ? id : null;
  } catch { return null; }
}

/** Convierte la propuesta según lo que la persona contestó que fue. */
export function aplicarRol(sig: Propuesta, rol: RolId, ctx: Contexto): Propuesta {
  const persona = sig.persona ?? '';
  const resto = sinNombre(sig.concepto, persona);
  const sinCategoria = () => {
    sig.faltantes = sig.faltantes.filter(f => f.campo !== 'categoria' && f.campo !== 'desde' && f.campo !== 'hasta');
    sig.categoriaId = undefined; sig.desde = undefined; sig.hasta = undefined;
  };
  switch (rol) {
    case 'presto':
      sig.tipo = 'prestamo'; sig.concepto = `Préstamo a ${persona}`; sig.motivo = resto ? capitalizar(resto) : undefined; sinCategoria();
      break;
    case 'mePresto':
      sig.tipo = 'deuda'; sig.recibeDinero = true; sig.concepto = `Préstamo de ${persona}`; sig.motivo = resto ? capitalizar(resto) : undefined; sinCategoria();
      break;
    case 'mePago':
      sig.tipo = 'pago'; sig.direccion = 'me_pagan'; sig.concepto = `Pago de ${persona}`; sinCategoria();
      break;
    case 'vendi':
      sig.tipo = 'ingreso'; sig.fuente = persona; sig.concepto = `Ingreso de ${persona}`; sig.nota = resto ? `Venta: ${resto}` : undefined; sinCategoria();
      break;
    case 'regale':
      sig.concepto = `Regalo a ${persona}`;
      if (ctx.cuentas.some(c => c.id === 'cat:regalos')) { sinCategoria(); sig.categoriaId = 'cat:regalos'; }
      break;
    case 'pague':
      if (!resto) sig.concepto = `Pago a ${persona}`;
      break;
    case 'mio':
      break;
  }
  return sig;
}

// ---------------------------------------------------------------------------------------
// Regalos: «le regalé 50000 a jorge»
// ---------------------------------------------------------------------------------------

export function regalo(b0: Base, ctx: Contexto): Resultado {
  const pg = leerPago(b0.t, b0.montos);
  const b: Base = { ...b0, montos: pg.montos, cuentas: b0.cuentas.filter(c => !dentroDe(c, pg.tramos)), t: blanquear(b0.t, pg.tramos) };
  const cuentaId = cuentaDeLaPersona(b, ctx);
  const mm = montosDePersona(b, cuentaId);
  if (typeof mm === 'string') return error(`${mm} Ejemplo: «le regalé 50k a jorge».`);
  const ws = palabrasLibres(b.t, [...b.cuentas, ...tramosDe(b.montos)]).filter(w => !['regale', 'regalo', 'le', 'a'].includes(w));
  const nombre = nombreEn(ws, ctx, b);
  if (!nombre) return error('¿A quién se lo regalaste? Ejemplo: «le regalé 50k a jorge».');

  let monto = mm.monto;
  const efectivoCOP = cuentaId === 'efectivo' && mm.moneda === 'COP';
  if (efectivoCOP && !pg.hayCon && pg.vueltoDicho && pg.vuelto && total(pg.vuelto) > 0 && BILLETES.includes(monto)) {
    if (total(pg.vuelto) >= monto) return error('El vuelto no puede ser igual o mayor a lo que pagaste.');
    pg.pagoCon = monto; pg.hayCon = true; monto -= total(pg.vuelto);
  }
  const p = propuestaBase(b, 'gasto', `Regalo a ${nombre.escrito}`, monto, mm.moneda);
  p.cuentaId = cuentaId;
  const conocida = ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === limpiar(nombre.escrito));
  p.persona = conocida ? nombre.escrito : resolverNombre(nombre.escrito, ctx, p);
  p.concepto = `Regalo a ${p.persona}`;
  if (ctx.cuentas.some(c => c.id === 'cat:regalos')) p.categoriaId = 'cat:regalos';
  else p.faltantes.push({ campo: 'categoria', dato: 'regalo', pregunta: `¿En qué categoría va «${p.concepto}»? Responde con una: ${listaCategorias(ctx).join(', ')}.`, opciones: listaCategorias(ctx) });
  if (!conocida) {
    p.pedirGrupo = true;
    if (!p.faltantes.some(f => f.campo === 'persona')) p.faltantes.unshift(faltanteGrupo(p.persona, ctx));
  }
  anotarPago(p, pg, efectivoCOP, p.avisos);
  return { clase: 'movimiento', propuesta: p };
}

export function prestamo(b0: Base, ctx: Contexto): Resultado {
  // Lo del pago ("con 5k", "vuelto 200 monedas") se lee primero y se saca del texto.
  const pg = leerPago(b0.t, b0.montos);
  const b: Base = { ...b0, montos: pg.montos, cuentas: b0.cuentas.filter(c => !dentroDe(c, pg.tramos)), t: blanquear(b0.t, pg.tramos) };
  const cuentaId = cuentaDeLaPersona(b, ctx);
  const mm = montosDePersona(b, cuentaId);
  if (typeof mm === 'string') return error(`${mm} Ejemplo: «presté 40k a Ana».`);
  const persona = personaDe(b, ctx, ['preste', 'prestamo', 'a', 'le'], ['para']);
  if (!persona) return error('¿A quién le prestaste? Escríbelo con su nombre, por ejemplo: «presté 40k a Ana».');

  let monto = mm.monto;
  const efectivoCOP = cuentaId === 'efectivo' && mm.moneda === 'COP';
  if (efectivoCOP && !pg.hayCon && pg.vueltoDicho && pg.vuelto && total(pg.vuelto) > 0 && BILLETES.includes(monto)) {
    if (total(pg.vuelto) >= monto) return error('El vuelto no puede ser igual o mayor a lo que prestaste.');
    pg.pagoCon = monto;
    pg.hayCon = true;
    monto -= total(pg.vuelto);
  }
  const p = propuestaBase(b, 'prestamo', `Préstamo a ${persona.escrito}`, monto, mm.moneda);
  p.cuentaId = cuentaId;
  p.persona = resolverNombre(persona.escrito, ctx, p);
  preguntarQuienEs(p, ctx);
  p.concepto = `Préstamo a ${p.persona}`;
  // lo que sobra («para cámara y comercio») es el motivo
  const sobra = recortarBordes(palabrasLibres(b.t, [...b.cuentas, ...tramosDe(b.montos)]).filter(w => !['preste', 'prestamo', 'le'].includes(w) && !personaDeNombre(persona.escrito).includes(w)));
  if (sobra.length) p.motivo = capitalizar(conOriginales(sobra, b));
  anotarPago(p, pg, efectivoCOP, p.avisos);
  return { clase: 'movimiento', propuesta: p };
}

/** "le debo 54k a sergio por la bici antes del 31 de octubre" / "sergio me prestó 20k". */
export function deuda(b: Base, ctx: Contexto, recibeDinero: boolean, fechaLimite: string | null): Resultado {
  const fl = { fecha: fechaLimite };
  const b2: Base = b;
  const cuentaId = cuentaDeLaPersona(b2, ctx);
  const mm = montosDePersona(b2, cuentaId);
  if (typeof mm === 'string') return error(`${mm} Ejemplo: «le debo 54k a sergio por la bicicleta».`);

  const motivoIdx = b2.t.search(/\b(por|para)\b/);
  const parteNombre = motivoIdx >= 0 ? b2.t.slice(0, motivoIdx) : b2.t;
  const parteMotivo = motivoIdx >= 0 ? b2.t.slice(motivoIdx) : '';
  const wsNombre = parteNombre.split(' ').filter(w => w && !RELLENO.has(w));
  const nombre = nombreEn(
    borrarTramos(parteNombre, [...b2.cuentas.filter(c => c.fin <= parteNombre.length), ...tramosDe(b2.montos.filter(m => m.fin <= parteNombre.length))])
      .split(' ').filter(w => w && !RELLENO.has(w) && !['le', 'debo', 'me', 'presto', 'prestaron', 'a'].includes(w)),
    ctx, b2,
  );
  void wsNombre;
  if (!nombre) return error(recibeDinero ? '¿Quién te prestó? Ejemplo: «sergio me prestó 20k».' : '¿A quién le debes? Ejemplo: «le debo 54k a sergio por la bicicleta».');

  const motivoWs = recortarBordes(parteMotivo.split(' ').filter(w => w && !RELLENO.has(w)));
  const motivo = motivoWs.length ? conOriginales(motivoWs, b2) : undefined;
  const p = propuestaBase(b2, 'deuda', '', mm.monto, mm.moneda);
  p.persona = resolverNombre(nombre.escrito, ctx, p);
  preguntarQuienEs(p, ctx);
  p.concepto = recibeDinero ? `Préstamo de ${p.persona}` : `Deuda con ${p.persona}`;
  p.recibeDinero = recibeDinero;
  p.motivo = motivo;
  if (fl.fecha) p.fechaLimite = fl.fecha;
  if (recibeDinero) {
    p.cuentaId = cuentaId;
  } else {
    // Gasto aún sin pagar: necesita categoría (por el motivo).
    const cat = categorizar(motivoWs.join(' '), ctx);
    if (cat) p.categoriaId = cat;
    else {
      p.faltantes.push({
        campo: 'categoria', dato: motivoWs.join(' ') || 'deuda',
        pregunta: `¿En qué categoría va esta deuda${motivo ? ` («${motivo}»)` : ''}? Responde con una: ${listaCategorias(ctx).join(', ')}.`,
        opciones: listaCategorias(ctx),
      });
    }
  }
  return { clase: 'movimiento', propuesta: p };
}

/** "ivan me pagó 40k" (cobro) o "ivan me pagó el almuerzo 6000" (gasto que pagó otro). */
export function mePago(b: Base, ctx: Contexto, verbo: string): Resultado {
  const cuentaId = cuentaDeLaPersona(b, ctx);
  // Lo que hay antes de «me pagó» es quién; lo de después, en qué ("me pagó el almuerzo").
  const m = b.t.match(/\bme (pago|pagaron|devolvio|devolvieron|regreso|abono|salde|invito)\b/)!;
  const limpio = borrarTramos(b.t, [...b.cuentas, ...tramosDe(b.montos)]);
  const izq = recortarBordes(limpio.slice(0, m.index).split(' ').filter(w => w && !RELLENO.has(w)));
  const der = recortarBordes(limpio.slice((m.index ?? 0) + m[0].length).split(' ').filter(w => w && !RELLENO.has(w)));
  const persona = izq.length ? nombreEn(izq, ctx, b, 3) : nombreEn(der, ctx, b, 1);
  if (!persona) return error('¿Quién te pagó? Ejemplo: «Ana me pagó 40k».');
  const sobrantes = izq.length ? der : recortarBordes(der.filter(w => !persona.usadas.includes(w)));
  void verbo;

  // Si esa persona no te debe nada, que te pague es plata que entra (un sueldo, un trabajo), no el abono de una deuda
  // ni una deuda tuya. «me pagó el almuerzo» sigue su camino de abajo.
  // (abonó, devolvió y regresó dicen lo mismo que pagó: sin cuenta abierta con esa persona es plata que entra)
  if (['pago', 'pagaron', 'abono', 'devolvio', 'devolvieron', 'regreso'].includes(verbo) && !tieneAbierta(persona.escrito, ctx, 'teDeben') && (!sobrantes.length || DE_INGRESO.test(b.t))) return ingreso(b, ctx);

  const mm = montosDePersona(b, cuentaId);
  if (typeof mm === 'string') return error(`${mm} Ejemplo: «Ana me pagó 40k».`);

  // "me pagó el almuerzo": un gasto tuyo que pagó otra persona
  if (sobrantes.length && ['pago', 'invito'].includes(verbo)) {
    const p = propuestaBase(b, 'compartido', capitalizar(conOriginales(sobrantes, b)), mm.monto, mm.moneda);
    p.pagoOtro = true;
    p.persona = resolverNombre(persona.escrito, ctx, p);
    const cat = categorizar(sobrantes.join(' '), ctx);
    if (cat) p.categoriaId = cat;
    else {
      p.faltantes.push({
        campo: 'categoria', dato: sobrantes.join(' '),
        pregunta: `¿En qué categoría va «${p.concepto}»? Responde con una: ${listaCategorias(ctx).join(', ')}.`,
        opciones: listaCategorias(ctx),
      });
    }
    return { clase: 'movimiento', propuesta: p };
  }

  const p = propuestaBase(b, 'pago', '', mm.monto, mm.moneda);
  p.direccion = 'me_pagan';
  p.cuentaId = cuentaId;
  p.montoOtro = mm.otro; p.monedaOtra = mm.monedaOtra;
  p.persona = resolverNombre(persona.escrito, ctx, p);
  p.concepto = `${p.persona} me pagó`;
  return { clase: 'movimiento', propuesta: p };
}

/** "pagué 54k a sergio" -> abono a una deuda. Devuelve null si parece un gasto normal. */
export function pagoDeDeuda(b: Base, ctx: Contexto): Resultado | null {
  const cuentaId = cuentaDeLaPersona(b, ctx);
  const i = b.t.search(/\ba [a-z]/);
  const antes = b.t.slice(0, i);
  const despues = b.t.slice(i + 2);
  const nombreWs = borrarTramos(despues, [...hallarCuentas(despues, ctx), ...tramosDe(hallarMontos(despues))]).split(' ').filter(Boolean);
  const nombre = nombreEn(nombreWs.filter(w => !RELLENO.has(w)), ctx, b);
  if (!nombre) return null;
  // sin una deuda tuya con esa persona o entidad no es un abono: es un gasto («pagué 20k a netflix»)
  if (!tieneAbierta(nombre.escrito, ctx, 'debes')) return null;
  const conocida = ctx.cuentas.some(c => c.tipo === 'persona' && c.clave === nombre.escrito.toLowerCase());
  const sobra = recortarBordes(palabrasLibres(antes, [...hallarCuentas(antes, ctx), ...tramosDe(hallarMontos(antes))]).filter(w => !['pague', 'pagamos', 'abone', 'salde', 'pago', 'le'].includes(w)));
  // Si no es una persona conocida y hay un concepto antes ("pagué arepas a ...") es un gasto normal.
  if (!conocida && sobra.length) return null;

  const mm = montosDePersona(b, cuentaId);
  if (typeof mm === 'string') return error(`${mm} Ejemplo: «pagué 54k a Pedro».`);
  const p = propuestaBase(b, 'pago', '', mm.monto, mm.moneda);
  p.direccion = 'yo_pago';
  p.cuentaId = cuentaId;
  p.montoOtro = mm.otro; p.monedaOtra = mm.monedaOtra;
  p.persona = resolverNombre(nombre.escrito, ctx, p);
  p.concepto = `Pago a ${p.persona}`;
  return { clase: 'movimiento', propuesta: p };
}

