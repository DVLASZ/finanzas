/**
 * Intérprete de mensajes: convierte lo que escribes ("mecato 5000", "5000 mecato nequi",
 * "taxi de terminal a casa 8000", "presté 40k a ivan"...) en una `Propuesta` que el bot
 * muestra para confirmar. No usa IA: son reglas + tolerancia a errores de ortografía.
 *
 * Idea general: se van "consumiendo" del texto las partes que se reconocen (fecha, etiqueta,
 * cuentas, montos...) y lo que sobra es el concepto.
 */
import { error, type Comando, type Resultado } from './parser/tipos.ts';
import { dentroDe, prepararBase, type Base } from './parser/comun.ts';
import { leerPago, pagoSinTotal } from './parser/pago.ts';
import { alcancia, gasto, ingreso, transferencia, vueltoSuelto } from './parser/movimientos.ts';
import { deuda, mePago, pagoDeDeuda, prestamo, regalo, ventaDelCatalogo } from './parser/personas.ts';
import { compraConLineas } from './parser/compras.ts';
import { declaraciones } from './parser/declaraciones.ts';
import { hallarFecha, hallarFechaLimite } from './fechas.ts';
import { quitarComasDeMiles, repartoEnOtroOrden } from './reparto.ts';
import { limpiar } from './texto.ts';
import { type Contexto, type Moneda } from './tipos.ts';

// ---------------------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------------------

function detectarComando(t: string): { comando: Comando; arg?: string } | null {
  const simples: [RegExp, Comando][] = [
    [/^(saldo|saldos|cuanto tengo|cuanta plata tengo)$/, 'saldo'],
    [/^(semana|esta semana|resumen semana|resumen de la semana)$/, 'semana'],
    [/^(mes|este mes|resumen|resumen mes|resumen del mes)$/, 'mes'],
    [/^(ano|este ano|anio|resumen ano|resumen del ano)$/, 'anio'],
    [/^(deudas|debo|cuanto debo|deudas pendientes)$/, 'deudas'],
    [/^(deshacer|undo|anular|anular ultimo|deshacer ultimo)$/, 'deshacer'],
    [/^(ayuda|help|hola|menu|comandos|\?)$/, 'ayuda'],
    [/^(editar ultimo|corregir ultimo|editar)$/, 'editar_ultimo'],
    [/^(ultimos|movimientos|historial|ultimos movimientos)$/, 'ultimos'],
  ];
  for (const [re, comando] of simples) if (re.test(t)) return { comando };
  // Cierre de meses: «cerrar mes octubre», «meses cerrados», «abrir meses»
  const cerrar = t.match(/^cerrar(?: el)? mes (?:de )?([a-z]+)(?: (?:de )?(\d{4}))?$/);
  if (cerrar) return { comando: 'cierre_cerrar', arg: `${cerrar[1]}|${cerrar[2] ?? ''}` };
  if (/^(?:abrir|reabrir) (?:los )?meses?(?: cerrados?)?$/.test(t)) return { comando: 'cierre_abrir' };
  if (/^meses? cerrados?$/.test(t)) return { comando: 'cierre_ver' };
  const sub = t.match(/^sub ?categoria ([a-z ]+?) (?:de|en|dentro de) ([a-z ]+)$/);
  if (sub) return { comando: 'subcategoria', arg: `${sub[1]}|${sub[2]}` };
  if (/^(?:revision|revisar|revisar el mes|revision del mes|que debo revisar)$/.test(t)) return { comando: 'revision' };
  const jor = t.match(/^(?:jornales|pagos? a (?:los )?trabajadores|trabajadores)(?: de| del| de la| esta| este)?(?: (semana pasada|la semana pasada|semana|mes))?$/);
  if (jor) return { comando: 'jornales', arg: /pasada/.test(jor[1] ?? '') ? 'pasada' : jor[1] === 'mes' ? 'mes' : 'semana' };
  const cuadrar = t.match(/^(?:cuadrar|saldar|perdonar)(?: la deuda)? (?:con|de) ([a-z ]+)$/);
  if (cuadrar) return { comando: 'cuadrar_persona', arg: cuadrar[1].trim() };
  const varios = t.match(/^deshacer (\d{1,2})$/);
  if (varios) return { comando: 'deshacer_varios', arg: varios[1] };
  // Metas de ahorro: «meta moto 2000000», «ahorré 50000 para moto», «saqué 20000 de la meta moto», «metas»
  if (/^metas$/.test(t)) return { comando: 'metas' };
  const quitarMeta = t.match(/^(?:quitar|borrar|eliminar) meta (.+)$/);
  if (quitarMeta) return { comando: 'meta_quitar', arg: quitarMeta[1].trim() };
  const fijarMeta = t.match(/^meta ([a-z ]+?) (\d[\d. ]*(?:k|mil|lucas?)?)$/);
  if (fijarMeta) return { comando: 'meta_fijar', arg: `${fijarMeta[1]}|${fijarMeta[2]}` };
  const apartar = t.match(/^(?:ahorre|aparte|separe|guarde) (\d[\d. ]*(?:k|mil|lucas?)?) (?:para|en|a la meta|a) (?:la meta )?([a-z ]+)$/);
  if (apartar) return { comando: 'meta_apartar', arg: `${apartar[2]}|${apartar[1]}` };
  const sacarMeta = t.match(/^(?:saque|retire|gaste) (\d[\d. ]*(?:k|mil|lucas?)?) de (?:la )?meta ([a-z ]+)$/);
  if (sacarMeta) return { comando: 'meta_sacar', arg: `${sacarMeta[2]}|${sacarMeta[1]}` };
  // Gastos que se repiten:«cada mes el 5 internet 60000», «recurrentes», «quitar recurrente internet»
  const rec = t.match(/^(?:cada mes|todos los meses|mensual|mensualmente)(?: el)?(?: dia)?\s*(\d{1,2})?\s*(.*)$/);
  if (rec) return { comando: 'recurrente_agregar', arg: `${rec[1] ?? ''}|${rec[2]}` };
  if (/^(recurrentes|gastos recurrentes|gastos fijos|pagos del mes)$/.test(t)) return { comando: 'recurrentes' };
  const quitarRec = t.match(/^(?:quitar|borrar|eliminar) recurrente (.+)$/);
  if (quitarRec) return { comando: 'recurrente_quitar', arg: quitarRec[1].trim() };
  const v = t.match(/^ventas(?: de| del| de la| este| esta)?(?: (semana|mes|ano|anio))?$/);
  if (v) return { comando: 'ventas', arg: v[1] === 'semana' ? 'semana' : v[1] === 'ano' || v[1] === 'anio' ? 'anio' : 'mes' };
  if (/^(lista|lista de compras|mi lista|la lista|que falta|que me falta)$/.test(t)) return { comando: 'lista' };
  // «falta arroz y sal», «comprar jabón»: solo si no trae plata (con monto es un gasto)
  let m = t.match(/^(?:me |nos )?(?:falta|faltan|comprar|hay que comprar|agrega(?:r)?(?: a la lista)?|anota(?:r)?(?: en la lista)?|apunta(?:r)?(?: en la lista)?)\s+([a-z ,y]+)$/);
  if (m && !/\d/.test(t)) return { comando: 'lista_agregar', arg: m[1].trim() };
  m = t.match(/^(?:ya )?(?:compre|compramos|tache|tacha|quita|quitar|saca|sacar)(?: de la lista)?\s+([a-z ,y]+)$/);
  if (m && !/\d/.test(t)) return { comando: 'lista_quitar', arg: m[1].trim() };
  m = t.match(/^(?:cuanto llevo en|gastos? en|cuanto gaste en) ([a-z ]+)$/);
  if (m) return { comando: 'categoria', arg: m[1].trim() };
  m = t.match(/^(?:evento |etiqueta )?#([a-z0-9-]+)$/) ?? t.match(/^(?:evento|etiqueta) ([a-z0-9-]+)$/);
  if (m) return { comando: 'evento', arg: m[1] };
  return null;
}

// ---------------------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------------------

/** Montos que casi seguro son un error de ceros: 2.000 millones de pesos o 1 millón de dólares. */
const MAX_COP = 2_000_000_000;
const MAX_USD = 100_000_000; // centavos

/** Revisa lo que salió del intérprete: ningún monto absurdo, cero o negativo llega a la tarjeta. */
function conLimites(r: Resultado): Resultado {
  if (r.clase !== 'movimiento') return r;
  const p = r.propuesta;
  const grande = (n: number | undefined, mon: Moneda | undefined) => n !== undefined && Math.abs(n) > (mon === 'USD' ? MAX_USD : MAX_COP);
  if (grande(p.monto, p.moneda) || grande(p.montoOtro, p.monedaOtra)
    || (p.declarados ?? []).some(d => grande(d.monto, d.moneda)) || (p.deudasIniciales ?? []).some(d => grande(d.monto, d.moneda))) {
    return error('Ese monto es demasiado grande: revisa los ceros.');
  }
  if (p.tipo !== 'apertura' && p.tipo !== 'ajuste' && !(p.monto > 0)) return error('El monto tiene que ser mayor que cero.');
  return r;
}

/**
 * Plata que otra persona te manda para pagar algo suyo. Se dice con las palabras de la deuda, que ya
 * existen, y así no cuenta como ingreso ni como gasto tuyo:
 *   «plata de mamá para cooperativa 150000 nequi»  ->  «mamá me prestó 150000 nequi para cooperativa»
 *   «cooperativa 149984 con plata de mamá nequi»   ->  «pagué 149984 a mamá nequi por cooperativa»
 */
function plataDeTerceros(texto: string): string {
  const monto = String.raw`(\d[\d.]*\s?(?:k|mil)?)`;
  const recibida = texto.trim().match(new RegExp(String.raw`^plata de (\S+) para ([^\d]+?)\s+${monto}\s*(.*)$`, 'i'));
  if (recibida) return `${recibida[1]} me prestó ${recibida[3]} ${recibida[4]} para ${recibida[2]}`.replace(/\s+/g, ' ').trim();
  const pagada = texto.trim().match(new RegExp(String.raw`^(?:pagu[eé] )?([^\d]+?)\s+${monto}\s+con (?:la )?plata de (\S+)\s*(.*)$`, 'i'));
  if (pagada) return `pagué ${pagada[2]} a ${pagada[3]} ${pagada[4]} por ${pagada[1]}`.replace(/\s+/g, ' ').trim();
  return texto;
}

/** «4x1000», «4 x 1000» o «4 por mil» se vuelven «gravamen»: así los dos números no se leen como montos. */
function cobroDelBanco(texto: string): string {
  return texto.replace(/\b4\s*(?:x|por)\s*(?:1000|mil)\b/gi, 'gravamen');
}

/**
 * «almuerzo 60000 entre ana, luis y yo» es un gasto en partes iguales: se lee igual que «almuerzo 60000 pagué por ana y luis».
 * Solo aplica si tú estás en la lista («yo» o «mí»); sin eso no se sabe si el gasto era tuyo y se deja como está.
 */
export function repartoEntre(texto: string): string {
  const m = texto.match(/^(.*?\d[\d.,]*\s*(?:k|mil|lucas?)?)\s+entre\s+(.+)$/i);
  if (!m) return texto;
  const partes = m[2].split(/\s*,\s*|\s+y\s+/).map(s => s.trim()).filter(Boolean);
  const nombres = partes.filter(s => !/^(yo|mi|mí)$/i.test(s));
  if (nombres.length === partes.length || nombres.length === 0) return texto;
  return `${m[1]} pagué por ${nombres.join(' y ')}`;
}

export function interpretar(texto: string, ctx: Contexto): Resultado {
  // primero los números (el dictado trae «25,000»), después las dos formas de repartir un gasto
  texto = repartoEnOtroOrden(repartoEntre(quitarComasDeMiles(texto)), ctx);
  // una compra con varias líneas se lee como un solo gasto y deja el detalle en la nota
  const compra = compraConLineas(texto);
  const deTerceros = plataDeTerceros(texto) !== texto;
  const res = conLimites(interpretarPlano(pagoSinTotal(cobroDelBanco(plataDeTerceros(compra?.texto ?? texto))), ctx));
  if (compra && res.clase === 'movimiento') { res.propuesta.concepto = compra.concepto; res.propuesta.nota = compra.detalle; }
  // la plata de otro no es deuda ni ingreso ni gasto tuyo: se marca para mostrarla como lo que es
  if (deTerceros && res.clase === 'movimiento' && (res.propuesta.tipo === 'deuda' || res.propuesta.tipo === 'pago')) res.propuesta.custodia = true;
  return res;
}

function interpretarPlano(texto: string, ctx: Contexto): Resultado {
  const original = texto.trim();
  const t0 = limpiar(original);
  if (!t0) return error('Escribe un movimiento, por ejemplo: «mecato 5000».');

  const cmd = detectarComando(t0);
  if (cmd) return { clase: 'comando', ...cmd };

  if (/^(apertura|saldo inicial|saldos iniciales)\b/.test(t0)) return declaraciones('apertura', original, t0, ctx);
  if (/^(arqueo|cuadre|cuadrar)\b/.test(t0)) return declaraciones('ajuste', original, t0, ctx);

  // En las deudas, «antes del 31 de octubre» es la fecha límite, no la fecha del movimiento.
  let fechaLimite: string | null = null;
  let tBase = t0;
  if (/\b(le debo|debo|me presto|me prestaron)\b/.test(t0)) {
    const fl = hallarFechaLimite(t0, ctx.ahora);
    fechaLimite = fl.fecha;
    tBase = fl.resto;
  }
  const b = prepararBase(original, tBase, ctx);
  if (b.fechaInvalida) return error('Esa fecha no existe. Revísala (por ejemplo «el 15/10» o «ayer»).');
  const suelto = vueltoSuelto(b);
  if (suelto) return suelto;
  // Alcancía de monedas (solo en las apps que la tienen): «metí 5 monedas de 500 y 3 de mil a la alcancía»
  if (/\balcancia\b/.test(b.t) && ctx.cuentas.some(c => c.id === 'alcancia')) return alcancia(b);
  const sinVuelto =!/\b(de vuelto|vuelto|devuelta)\b/.test(b.t);
  const conBillete = /\bcon (?:(?:un|una|el|la|billete|billetes|de|del) )*\d/.test(b.t);

  // Ingreso: "+mamá 100k", "ingreso 50k chamba", "mamá me dio 100k"
  const sujetoPrimero = /^(?:\+?[a-z]+ ){0,3}me (dio|dieron|deposito|transfirio|mando|envio)\b/.test(b.t);
  if (/^\+/.test(b.t) || /^(ingreso|recibi|cobre|gane|mesada)\b/.test(b.t) || (sujetoPrimero && sinVuelto && !conBillete)) {
    return ingreso(b, ctx);
  }

  // Transferencia entre tus cuentas
  const verbosTransfer = /\b(cambie|cambio|pase|transferi|transferencia|movi|mueve|consigne|deposite|saque|retire|retiro|traslade|meti)\b/;
  // (las cuentas nombradas dentro de «con 2k en monedas» o «vuelto 200 monedas» son del pago, no de una transferencia)
  const pago0 = leerPago(b.t, b.montos);
  const cuentasDeVerdad = b.cuentas.filter(c => !dentroDe(c, pago0.tramos));
  if (cuentasDeVerdad.length >= 2 || (cuentasDeVerdad.length === 1 && /\b(consigne|deposite|saque|retire|retiro|meti)\b/.test(b.t))) {
    if (cuentasDeVerdad.length >= 2 || verbosTransfer.test(b.t)) return transferencia(b, ctx);
  }

  const venta = ventaDelCatalogo(b, ctx);
  if (venta) return venta;
  if (/\b(regale|le regale|regalo a)\b/.test(b.t)) return regalo(b, ctx);
  if (/\b(preste|le preste|prestamo a)\b/.test(b.t)) return prestamo(b, ctx);
  if (/\bme (presto|prestaron)\b/.test(b.t)) return deuda(b, ctx, true, fechaLimite);
  if (/\b(le debo|debo)\b/.test(b.t)) return deuda(b, ctx, false, fechaLimite);

  const mePagaron = b.t.match(/\bme (pago|pagaron|devolvio|devolvieron|regreso|abono|salde|invito)\b/);
  if (mePagaron) return mePago(b, ctx, mePagaron[1]);

  // Pago de una deuda: "pagué 54k a sergio"  (el nombre se toma de lo que sigue a «a»)
  if (/\b(pague|pagamos|abone|salde|pago)\b.*\ba [a-z]/.test(b.t)) {
    const r = pagoDeDeuda(b, ctx);
    if (r) return r;
  }

  return gasto(b, ctx);
}


export type { Comando, Faltante, Propuesta, Resultado } from './parser/tipos.ts';
export { aplicarCambio, resolverFaltante } from './parser/correcciones.ts';
export { cuentaDePalabra } from './entidades.ts';
