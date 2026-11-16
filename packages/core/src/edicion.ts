/**
 * Editar un movimiento ya guardado sin anularlo y volver a escribirlo.
 *
 * Es una función pura: recibe los datos y los cambios que se piden y devuelve el movimiento nuevo (con el mismo id),
 * lo que cambia, cómo quedan los saldos y los avisos que la persona debe leer antes de confirmar. La pantalla la
 * llama en cada cambio del formulario; al confirmar, `aplicarEdicion` guarda el reemplazo de una sola vez (el
 * movimiento y sus asientos juntos), así la partida doble sigue sumando cero.
 *
 * Qué se puede cambiar depende del tipo, para no dejar a medias lo que está atado a otras cosas:
 *   gasto, ingreso, transferencia  monto, cuentas, categoría, concepto y fecha (los asientos se rehacen)
 *   venta con catálogo             cantidad (el monto sale de ella), cuenta, concepto y fecha
 *   préstamo, deuda, pago, compartido, venta fiada, gasto con plata de otros
 *                                  solo concepto y fecha: su monto está atado a lo que debe cada persona
 *   saldo inicial, arqueo, cambio de moneda: no se editan desde aquí
 */
import { calcularSaldos } from './consultas.ts';
import { aMinor, formatear } from './dinero.ts';
import { aLocal, describirFecha } from './fechas.ts';
import { avisoDeExistencias } from './existencias.ts';
import { construirMovimiento, saldoDe } from './asientos.ts';
import { contextoDe, type Datos, type Repo } from './repo.ts';
import type { Propuesta } from './parser/tipos.ts';
import type { Cuenta, Moneda, Movimiento } from './tipos.ts';

export type CampoEditable = 'monto' | 'cantidad' | 'cuenta' | 'cuentaDestino' | 'categoria' | 'fuente' | 'concepto' | 'fecha';

/** Lo que se quiere cambiar. Todo es opcional: lo que falta se queda como estaba. `monto` va en pesos (o dólares), como se escribe. */
export interface CambiosEdicion {
  monto?: number;
  cantidad?: number;
  cuentaId?: string;
  cuentaDestinoId?: string;
  categoriaId?: string;
  fuenteId?: string;
  concepto?: string;
  /** 'AAAA-MM-DD HH:MM:SS' */
  ocurridoEn?: string;
}

export interface Posibilidad { editable: boolean; motivo?: string }
export interface Capacidades {
  /** false: no hay nada que editar y `motivo` dice por qué. */
  editable: boolean;
  motivo?: string;
  campos: Record<CampoEditable, Posibilidad>;
}

export interface CambioDeCampo { campo: CampoEditable; etiqueta: string; antes: string; despues: string }
export interface CambioDeSaldo { cuentaId: string; nombre: string; moneda: Moneda; antes: number; despues: number }

export type Previsualizacion =
  | { ok: false; motivo: string }
  | {
    ok: true;
    movimiento: Movimiento;
    cuentasNuevas: Cuenta[];
    cambios: CambioDeCampo[];
    saldos: CambioDeSaldo[];
    /** Lo que conviene leer antes de confirmar; no impide guardar. */
    avisos: string[];
    /** Lo que impide guardar tal como está pedido. */
    bloqueos: string[];
  };

const TODOS: CampoEditable[] = ['monto', 'cantidad', 'cuenta', 'cuentaDestino', 'categoria', 'fuente', 'concepto', 'fecha'];
const todosCerrados = (motivo: string): Record<CampoEditable, Posibilidad> => Object.fromEntries(TODOS.map(c => [c, { editable: false, motivo }])) as Record<CampoEditable, Posibilidad>;

const MOTIVO_ATADO = 'Está atado a lo que debe cada persona. Para cambiar el monto, anula el movimiento y vuelve a anotarlo: así las deudas se recalculan bien.';

const propuestaDe = (m: Movimiento): Propuesta | null => {
  const p = m.propuesta as Propuesta | undefined;
  return p && typeof p === 'object' && typeof p.tipo === 'string' && typeof p.monto === 'number' ? p : null;
};

/** Qué se puede editar de un movimiento y, lo que no, por qué. */
export function capacidadesDeEdicion(m: Movimiento): Capacidades {
  if (m.estado !== 'ok') return { editable: false, motivo: 'Un movimiento anulado no se edita.', campos: todosCerrados('Está anulado.') };
  if (m.tipo === 'apertura') {
    return { editable: false, motivo: 'El saldo inicial no se edita desde aquí: mueve desde dónde se calculan todos los saldos. Para corregirlo, escribe «saldo inicial» en el chat, o «arqueo» para ajustar lo que hay.', campos: todosCerrados('Es el saldo inicial.') };
  }
  if (m.tipo === 'ajuste') {
    return { editable: false, motivo: 'Un arqueo no se edita: dice cuánto había en ese momento. Anúlalo con «Anular arqueo» y cuenta de nuevo con «arqueo».', campos: todosCerrados('Es un arqueo.') };
  }
  if (m.tipo === 'cambio_moneda') {
    return { editable: false, motivo: 'Un cambio de moneda no se edita desde aquí. Anúlalo y vuelve a anotarlo.', campos: todosCerrados('Es un cambio de moneda.') };
  }
  const p = propuestaDe(m);
  const libres = (extra: Partial<Record<CampoEditable, Posibilidad>> = {}) => ({ ...todosCerrados('No aplica a este movimiento.'), concepto: { editable: true }, fecha: { editable: true }, ...extra });
  // sin la tarjeta guardada (movimientos que vinieron del Excel) no se sabe cómo se armaron los asientos
  if (!p) {
    return { editable: true, campos: { ...libres(), monto: { editable: false, motivo: 'Este movimiento vino de un archivo y no guarda cómo se armó. Para cambiar el monto, anúlalo y vuelve a anotarlo.' } } };
  }
  const atado = { editable: false, motivo: MOTIVO_ATADO };
  if (m.tipo === 'gasto' && !p.custodia && !p.persona) {
    return { editable: true, campos: libres({ monto: { editable: true }, cuenta: { editable: true }, categoria: { editable: true } }) };
  }
  if (m.tipo === 'gasto') {
    // regalo a alguien o gasto con plata de otra persona: se puede mover de cuenta o de categoría, pero el monto está atado a la persona
    return { editable: true, campos: libres({ monto: atado, cuenta: { editable: !p.custodia, motivo: p.custodia ? 'Se pagó con plata de otra persona.' : undefined }, categoria: { editable: !p.custodia } }) };
  }
  if (m.tipo === 'ingreso' && p.venta && !p.fiado) {
    return { editable: true, campos: libres({ cantidad: { editable: true }, monto: { editable: false, motivo: 'En una venta del catálogo el monto sale de la cantidad por el precio.' }, cuenta: { editable: true } }) };
  }
  if (m.tipo === 'ingreso' && !p.fiado) {
    return { editable: true, campos: libres({ monto: { editable: true }, cuenta: { editable: true }, fuente: { editable: true } }) };
  }
  if (m.tipo === 'transferencia') {
    return { editable: true, campos: libres({ monto: { editable: true }, cuenta: { editable: true }, cuentaDestino: { editable: true } }) };
  }
  // préstamo, deuda, pago, compartido, ventas fiadas: solo concepto y fecha
  return { editable: true, campos: libres({ monto: atado, cuenta: atado }) };
}

const hayNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const nombreCuenta = (cuentas: Cuenta[], id: string | undefined): string => cuentas.find(c => c.id === id)?.nombre ?? id ?? '';

/** Los saldos que cambian entre dos listas de movimientos (cuentas de dinero y de personas). */
function diferenciaDeSaldos(datos: Datos, antes: Movimiento[], despues: Movimiento[]): CambioDeSaldo[] {
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const a = calcularSaldos(antes, apertura), d = calcularSaldos(despues, apertura);
  const res: CambioDeSaldo[] = [];
  for (const c of datos.cuentas.filter(x => x.tipo === 'dinero' || x.tipo === 'persona')) {
    for (const moneda of ['COP', 'USD'] as Moneda[]) {
      const x = saldoDe(a, c.id, moneda), y = saldoDe(d, c.id, moneda);
      if (x !== y) res.push({ cuentaId: c.id, nombre: c.nombre, moneda, antes: x, despues: y });
    }
  }
  return res;
}

/**
 * Calcula cómo quedaría el movimiento con esos cambios, sin guardar nada. Si los cambios no sirven (un monto que no es
 * número, una cuenta de otra moneda, un mes cerrado), devuelve los `bloqueos` junto con lo que sí se pudo calcular.
 */
export function previsualizarEdicion(datos: Datos, ahora: Date, id: string, cambios: CambiosEdicion): Previsualizacion {
  const original = datos.movimientos.find(x => x.id === id);
  if (!original) return { ok: false, motivo: 'No encuentro ese movimiento.' };
  const cap = capacidadesDeEdicion(original);
  if (!cap.editable) return { ok: false, motivo: cap.motivo ?? 'Este movimiento no se puede editar.' };

  const ctx = contextoDe(datos, ahora);
  const bloqueos: string[] = [];
  const avisos: string[] = [];
  const p0 = propuestaDe(original);
  const moneda: Moneda = p0?.moneda ?? original.asientos.find(a => a.moneda)?.moneda ?? 'COP';
  const cerrado = /^\d{4}-\d{2}-\d{2}$/.test(datos.config.cerrado_hasta ?? '') ? datos.config.cerrado_hasta! : null;

  // 1. qué campos se están tocando y cuáles se pueden
  const pide = (campo: CampoEditable, valor: unknown, actual: unknown): boolean => {
    if (valor === undefined || valor === actual) return false;
    if (!cap.campos[campo].editable) { bloqueos.push(cap.campos[campo].motivo ?? 'Ese dato no se puede cambiar.'); return false; }
    return true;
  };

  const p1: Propuesta | null = p0 ? { ...p0, avisos: [], faltantes: [] } : null;
  let descripcion = original.descripcion;
  let ocurridoEn = original.ocurridoEn;
  let rehacerAsientos = false;

  if (pide('concepto', cambios.concepto?.trim(), original.descripcion)) {
    if (!cambios.concepto!.trim()) bloqueos.push('El concepto no puede quedar vacío.');
    else if (cambios.concepto!.trim().length > 80) bloqueos.push('El concepto es muy largo (hasta 80 letras).');
    else { descripcion = cambios.concepto!.trim(); if (p1) p1.concepto = descripcion; }
  }
  if (pide('fecha', cambios.ocurridoEn, original.ocurridoEn)) {
    const f = cambios.ocurridoEn!;
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(f) || Number.isNaN(Date.parse(f.replace(' ', 'T') + 'Z'))) bloqueos.push('La fecha no es válida.');
    else if (f > aLocal(new Date(ahora.getTime() + 86_400_000))) bloqueos.push('La fecha no puede ser del futuro.');
    else { ocurridoEn = f; if (p1) p1.ocurridoEn = f; }
  }
  if (cerrado && (original.ocurridoEn.slice(0, 10) <= cerrado || ocurridoEn.slice(0, 10) <= cerrado) && (descripcion !== original.descripcion || ocurridoEn !== original.ocurridoEn || Object.keys(cambios).length)) {
    bloqueos.push(`Ese tiempo está cerrado (hasta el ${cerrado}). Si de verdad hace falta, escribe «abrir meses» en el chat, corrige y vuelve a cerrar.`);
  }

  if (p1) {
    if (pide('monto', cambios.monto, undefined)) {
      if (!hayNumero(cambios.monto) || !(cambios.monto > 0) || cambios.monto > 2_000_000_000) bloqueos.push('El monto tiene que ser un número mayor que cero.');
      else { const nuevo = aMinor(cambios.monto, moneda); if (nuevo !== p1.monto) { p1.monto = nuevo; rehacerAsientos = true; } }
    }
    if (pide('cantidad', cambios.cantidad, undefined) && p1.venta) {
      if (!Number.isInteger(cambios.cantidad) || cambios.cantidad! < 1 || cambios.cantidad! > 100_000) bloqueos.push('La cantidad tiene que ser un número entero mayor que cero.');
      else if (cambios.cantidad !== p1.venta.cantidad) { p1.venta = { ...p1.venta, cantidad: cambios.cantidad! }; p1.monto = cambios.cantidad! * p1.venta.precio; rehacerAsientos = true; }
    }
    if (pide('cuenta', cambios.cuentaId, p1.cuentaId ?? 'efectivo')) {
      const c = datos.cuentas.find(x => x.id === cambios.cuentaId);
      if (!c || c.tipo !== 'dinero') bloqueos.push('Elige una cuenta de dinero.');
      else if (c.moneda !== moneda) bloqueos.push(`${c.nombre} es de otra moneda: este movimiento es en ${moneda}. Para cambiar de moneda, anótalo de nuevo.`);
      else { p1.cuentaId = c.id; rehacerAsientos = true; }
    }
    if (pide('cuentaDestino', cambios.cuentaDestinoId, p1.cuentaDestinoId)) {
      const c = datos.cuentas.find(x => x.id === cambios.cuentaDestinoId);
      if (!c || c.tipo !== 'dinero') bloqueos.push('Elige una cuenta de dinero de destino.');
      else if (c.moneda !== moneda) bloqueos.push(`${c.nombre} es de otra moneda: este movimiento es en ${moneda}.`);
      else { p1.cuentaDestinoId = c.id; rehacerAsientos = true; }
    }
    if (pide('categoria', cambios.categoriaId, p1.categoriaId)) {
      const c = datos.cuentas.find(x => x.id === cambios.categoriaId);
      if (!c || c.tipo !== 'categoria') bloqueos.push('Elige una categoría.');
      else { p1.categoriaId = c.id; rehacerAsientos = true; }
    }
    if (pide('fuente', cambios.fuenteId, undefined)) {
      const c = datos.cuentas.find(x => x.id === cambios.fuenteId);
      if (!c || c.tipo !== 'fuente') bloqueos.push('Elige una fuente de ingreso.');
      else { p1.fuente = c.nombre; rehacerAsientos = true; }
    }
    if (p1.tipo === 'transferencia' && (p1.cuentaId ?? 'efectivo') === p1.cuentaDestinoId) bloqueos.push('La cuenta de origen y la de destino no pueden ser la misma.');
  }

  // 2. los asientos nuevos, con la plata de los demás movimientos (sin este)
  const sin = datos.movimientos.filter(x => x.id !== id);
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  let asientos = original.asientos;
  let cuentasNuevas: Cuenta[] = [];
  if (p1 && rehacerAsientos && !bloqueos.length) {
    // el pago en efectivo se vuelve a calcular: lo que se había dicho de billetes y vuelto ya no sirve con otro monto
    delete p1.pagoCon; delete p1.pagoMonedas; delete p1.restoEnMonedas; delete p1.vuelto; delete p1.formaPago; delete p1.billeteMayor;
    try {
      const hecho = construirMovimiento(p1, ctx, calcularSaldos(sin, apertura), id, original.origen === 'excel' ? 'app' : original.origen);
      asientos = hecho.movimiento.asientos;
      cuentasNuevas = hecho.cuentasNuevas;
    } catch (e) {
      bloqueos.push(`${(e as Error).message.replace(/[.]$/, '')}.`);
    }
  }

  const movimiento: Movimiento = {
    ...original, ocurridoEn, descripcion, asientos,
    ...(p1 ? { propuesta: p1 } : {}),
    editadoEn: aLocal(ahora),
  };

  // 3. qué cambió, en palabras
  const cambiosDeCampo: CambioDeCampo[] = [];
  const nuevo = (campo: CampoEditable, etiqueta: string, antes: string, despues: string) => { if (antes !== despues) cambiosDeCampo.push({ campo, etiqueta, antes, despues }); };
  nuevo('concepto', 'Concepto', original.descripcion, descripcion);
  nuevo('fecha', 'Fecha', describirFecha(original.ocurridoEn, ahora, original.sinHora), describirFecha(ocurridoEn, ahora, original.sinHora));
  if (p0 && p1) {
    nuevo('monto', 'Monto', formatear(p0.monto, p0.moneda), formatear(p1.monto, p1.moneda));
    nuevo('cantidad', 'Cantidad', String(p0.venta?.cantidad ?? ''), String(p1.venta?.cantidad ?? ''));
    nuevo('cuenta', original.tipo === 'ingreso' ? 'Entró a' : original.tipo === 'transferencia' ? 'Sale de' : 'Pagado con', nombreCuenta(datos.cuentas, p0.cuentaId ?? 'efectivo'), nombreCuenta(datos.cuentas, p1.cuentaId ?? 'efectivo'));
    nuevo('cuentaDestino', 'Entra a', nombreCuenta(datos.cuentas, p0.cuentaDestinoId), nombreCuenta(datos.cuentas, p1.cuentaDestinoId));
    nuevo('categoria', 'Categoría', nombreCuenta(datos.cuentas, p0.categoriaId), nombreCuenta(datos.cuentas, p1.categoriaId));
    nuevo('fuente', 'Fuente', p0.fuente ?? '', p1.fuente ?? '');
  }
  const cambiosReales = cambiosDeCampo.filter(c => c.antes !== c.despues);

  // 4. cómo quedan los saldos y qué conviene avisar
  const despues = datos.movimientos.map(x => (x.id === id ? movimiento : x));
  const saldos = diferenciaDeSaldos(datos, datos.movimientos, despues);
  if (!bloqueos.length) {
    for (const s of saldos) {
      const cuenta = datos.cuentas.find(c => c.id === s.cuentaId);
      if (cuenta?.tipo === 'dinero' && s.despues < 0 && s.despues < s.antes) avisos.push(`${s.nombre} quedaría en -${formatear(-s.despues, s.moneda)}: hay plata que ya no alcanza. Revisa si es lo que quieres.`);
      if (cuenta?.tipo === 'persona' && s.antes !== 0 && Math.sign(s.antes) !== Math.sign(s.despues) && s.despues !== 0) avisos.push(`La deuda con ${s.nombre} cambiaría de sentido (de ${formatear(s.antes, s.moneda)} a ${formatear(s.despues, s.moneda)}).`);
    }
    // un arqueo posterior ya «cuadró» esas cuentas: el cambio mueve algo que se había contado
    const tocadas = new Set([...original.asientos, ...asientos].filter(a => datos.cuentas.find(c => c.id === a.cuentaId)?.tipo === 'dinero').map(a => a.cuentaId));
    const desde = original.ocurridoEn < ocurridoEn ? original.ocurridoEn : ocurridoEn;
    const cambiaAsientos = JSON.stringify(original.asientos) !== JSON.stringify(asientos);
    const hayCambioDeFecha = original.ocurridoEn !== ocurridoEn;
    if (cambiaAsientos || hayCambioDeFecha) {
      for (const a of datos.movimientos.filter(x => x.estado === 'ok' && x.tipo === 'ajuste' && x.id !== id && x.ocurridoEn > desde && !(x.propuesta as { cuadra?: unknown } | undefined)?.cuadra)) {
        const cuentasDelArqueo = a.asientos.map(y => y.cuentaId).filter(y => tocadas.has(y));
        if (cuentasDelArqueo.length) avisos.push(`Hay un arqueo de ${[...new Set(cuentasDelArqueo)].map(y => nombreCuenta(datos.cuentas, y)).join(' y ')} el ${describirFecha(a.ocurridoEn, ahora, false).replace(/ \d+:\d+ [ap]m$/, '')}, posterior a este movimiento: el cambio mueve el saldo que ya habías cuadrado.`);
      }
    }
    if (hayCambioDeFecha) {
      if (original.ocurridoEn < apertura !== ocurridoEn < apertura) avisos.push(ocurridoEn < apertura ? 'La nueva fecha queda antes del saldo inicial: el movimiento dejará de contar en los saldos.' : 'La nueva fecha queda después del saldo inicial: el movimiento empezará a contar en los saldos.');
    }
    // ventas con existencias: si cambia la cantidad, el conteo se ajusta solo; se avisa si no alcanza
    if (p1?.venta && p0?.venta && p1.venta.cantidad !== p0.venta.cantidad) {
      const aviso = avisoDeExistencias(datos.config, sin, p1.venta);
      if (aviso) avisos.push(aviso);
    }
  }

  return { ok: true, movimiento, cuentasNuevas, cambios: cambiosReales, saldos, avisos, bloqueos };
}

/** Guarda el reemplazo si los cambios sirven. Lanza con el motivo si no. */
export async function aplicarEdicion(repo: Repo, ahora: Date, id: string, cambios: CambiosEdicion): Promise<Previsualizacion & { ok: true }> {
  const datos = await repo.cargar();
  const r = previsualizarEdicion(datos, ahora, id, cambios);
  if (!r.ok) throw new Error(r.motivo);
  if (r.bloqueos.length) throw new Error(r.bloqueos[0]);
  if (!r.cambios.length) throw new Error('No cambió nada.');
  await repo.editarMovimiento(r.movimiento, r.cuentasNuevas);
  return r;
}
