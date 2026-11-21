/**
 * Sincronización entre la app (que funciona sin conexión) y el servidor.
 *
 * La app guarda en su copia local y anota cada cambio como una `Op` en una cola. Al volver la
 * conexión envía la cola al servidor, que aplica las operaciones (son idempotentes: repetirlas no
 * duplica nada) y responde con todos los datos. Como es un solo usuario, los conflictos son casi
 * imposibles; lo que se anotó desde otro dispositivo llega en esa misma respuesta.
 */
import { validarAsientos } from './asientos.ts';
import type { Datos, Repo } from './repo.ts';
import { DECIMALES, type Aprendido, type Compromiso, type Cuenta, type Movimiento } from './tipos.ts';

export type Op =
  | { op: 'guardar'; movimiento: Movimiento; cuentasNuevas: Cuenta[]; compromisos: Compromiso[] }
  | { op: 'anular'; id: string; cuando: string }
  | { op: 'restaurar'; id: string; cuando: string }
  /** Reemplaza un movimiento ya guardado (mismo id): sus datos y sus asientos, juntos. */
  | { op: 'editar'; movimiento: Movimiento; cuentasNuevas: Cuenta[] }
  | { op: 'compromisos'; lista: Compromiso[] }
  | { op: 'aprendido'; palabra: string; valor: Aprendido }
  | { op: 'presupuesto'; categoriaId: string; monto: number | null }
  | { op: 'config'; clave: string; valor: string }
  | { op: 'cuenta'; cuenta: Cuenta };

/** Lo que envía la app. */
export interface PeticionSync {
  ops: Op[];
  /** Hora del servidor de la última sincronización (si la app ya tiene todo): pide solo lo que cambió desde entonces. */
  desde?: string;
  /** La «generación» de los datos que tiene la app. Si el servidor purgó o borró algo, cambia y hay que traer todo. */
  generacion?: string;
}
/** Lo que responde el servidor: el estado completo ya con todo aplicado. */
export interface RespuestaSync {
  datos: Datos;
  servidorEn: string;
  /** true: `datos.movimientos` trae solo los que cambiaron; el resto de las tablas viene completo. */
  parcial?: boolean;
  /** Operaciones que el servidor NO aceptó (la app las saca de la cola y avisa, para que una sola mala no trabe las demás). */
  rechazadas?: Rechazo[];
  /**
   * Índices de operaciones que NO se aplicaron porque la base falló un instante (y de todas las que iban detrás).
   * La app las conserva en su cola y reintenta. Un servidor viejo no manda este campo y una app vieja lo ignora.
   */
  reintentar?: number[];
}
export interface Rechazo { indice: number; motivo: string }

/** Máximo de operaciones por petición: de sobra para una cola acumulada sin conexión durante días. */
export const MAX_OPS = 1000;
/** Únicas claves de `config` que la app envía (al registrar el saldo inicial). Cualquier otra se rechaza. */
export const CLAVES_CONFIG_PERMITIDAS = ['fecha_apertura', 'catalogo', 'lista_compras', 'recurrentes', 'metas', 'categoria_persona', 'apodos_personas', 'grupos', 'subcategorias', 'cerrado_hasta', 'tope_arrastra', 'buzon', 'atajos_usuario', 'reglas_aprendidas', 'recordatorio'];
/** Largo máximo del valor de una clave de config (el catálogo y la lista son pequeños). */
const MAX_VALOR_CONFIG = 60000;

const esTexto = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** Revisa lo de afuera de la petición: que sea una lista y que no sea gigante. Devuelve el motivo o null. */
export function validarOps(ops: unknown): string | null {
  if (!Array.isArray(ops)) return 'Falta la lista ops';
  if (ops.length > MAX_OPS) return `Demasiadas operaciones (máximo ${MAX_OPS})`;
  return null;
}

/**
 * Revisa la forma de UNA operación antes de tocar la base de datos. Devuelve el motivo del rechazo,
 * o null si está bien. Es defensiva a propósito: la petición viene de fuera.
 */
export function validarOp(op: unknown): string | null {
  const o = op as Record<string, unknown>;
  {
    if (!o || typeof o !== 'object') return 'Operación inválida';
    switch (o.op) {
      case 'guardar': {
        const m = o.movimiento as Movimiento | undefined;
        if (!m || !esTexto(m.id) || !esTexto(m.ocurridoEn) || !Array.isArray(m.asientos)) return 'Movimiento mal formado';
        if (!esTexto(m.tipo) || typeof m.descripcion !== 'string' || !esTexto(m.origen) || (m.estado !== 'ok' && m.estado !== 'anulado') || !esTexto(m.creadoEn)) return 'Movimiento mal formado';
        if (!Array.isArray(o.cuentasNuevas) || !Array.isArray(o.compromisos)) return 'Movimiento mal formado';
        for (const a of m.asientos) {
          if (!a || !esTexto(a.cuentaId) || !(a.moneda in DECIMALES)) return 'Asiento mal formado';
        }
        try { validarAsientos(m.asientos); } catch (e) { return (e as Error).message; }
        break;
      }
      case 'editar': {
        const m = o.movimiento as Movimiento | undefined;
        if (!m || !esTexto(m.id) || !esTexto(m.ocurridoEn) || !Array.isArray(m.asientos) || !Array.isArray(o.cuentasNuevas)) return 'Edición mal formada';
        if (!esTexto(m.tipo) || typeof m.descripcion !== 'string' || !m.descripcion.trim() || m.descripcion.length > 200) return 'Edición mal formada';
        if (m.editadoEn != null && typeof m.editadoEn !== 'string') return 'Edición mal formada';
        for (const a of m.asientos) {
          if (!a || !esTexto(a.cuentaId) || !(a.moneda in DECIMALES)) return 'Asiento mal formado';
        }
        try { validarAsientos(m.asientos); } catch (e) { return (e as Error).message; }
        break;
      }
      case 'anular': if (!esTexto(o.id) || !esTexto(o.cuando)) return 'Anulación mal formada'; break;
      case 'restaurar': if (!esTexto(o.id) || !esTexto(o.cuando)) return 'Restauración mal formada'; break;
      case 'compromisos': if (!Array.isArray(o.lista)) return 'Compromisos mal formados'; break;
      case 'aprendido': if (!esTexto(o.palabra) || !o.valor || typeof o.valor !== 'object') return 'Palabra aprendida mal formada'; break;
      case 'presupuesto':
        if (!esTexto(o.categoriaId) || !(o.monto === null || Number.isFinite(o.monto))) return 'Presupuesto mal formado';
        break;
      case 'config':
        if (!esTexto(o.clave) || !CLAVES_CONFIG_PERMITIDAS.includes(o.clave) || typeof o.valor !== 'string' || o.valor.length > MAX_VALOR_CONFIG) return 'Clave de config no permitida';
        break;
      case 'cuenta': {
        const c = o.cuenta as Cuenta | undefined;
        if (!c || typeof c !== 'object') return 'Cuenta mal formada';
        // desde aquí solo se tocan categorías y personas; el dinero y lo del sistema no
        if (c.tipo !== 'categoria' && c.tipo !== 'persona') return 'Solo se pueden editar categorías y personas';
        const prefijo = c.tipo === 'categoria' ? 'cat:' : 'per:';
        if (!esTexto(c.id) || !c.id.startsWith(prefijo) || c.id.length > 60 || !esTexto(c.nombre) || c.nombre.length > 60 || !esTexto(c.clave) || c.clave.length > 60) return 'Cuenta mal formada';
        if (c.grupo != null && (typeof c.grupo !== 'string' || c.grupo.length > 40)) return 'Cuenta mal formada';
        break;
      }
      default: return 'Operación desconocida';
    }
  }
  return null;
}

/** Resultado de aplicar una tanda de operaciones. */
export interface ResultadoAplicar {
  /** Operaciones inválidas o que los datos no admiten: no se reintentan. */
  rechazadas: Rechazo[];
  /** Índices de las que NO se aplicaron porque la base falló un instante, y de todas las que venían detrás. */
  reintentar: number[];
}

/**
 * ¿El error es por los datos (permanente) y no por la base que no respondió? Las restricciones de la base
 * (llave foránea, único, no nulo) y los mensajes propios del repositorio («no existe o está anulado») lo son.
 * Todo lo demás (D1_ERROR de red, timeout, sobrecarga, cuota) se toma como pasajero: es más seguro reintentar
 * que perder un cambio.
 */
export function esErrorPermanente(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /constraint|foreign key|unique|not null|datatype|no existe|anulad/i.test(m);
}

/**
 * Aplica las operaciones en orden. Una inválida se rechaza y sigue con las demás. Si la base falla de forma
 * pasajera, se detiene: esa operación y las siguientes quedan en `reintentar` sin aplicarse, porque saltarse
 * una (guardar B) y aplicar la que depende de ella (anular B) rompería el orden de la cola.
 *
 * Una edición de un movimiento anulado cuenta como ya aplicada si más adelante en la misma tanda viene la
 * anulación de ese mismo movimiento: es lo que pasa al reenviar una cola cuya respuesta se perdió. Sin esa
 * anulación después, editar algo anulado sigue siendo un rechazo.
 */
export async function aplicarOpsDetallado(repo: Repo, ops: Op[]): Promise<ResultadoAplicar> {
  const rechazadas: Rechazo[] = [];
  const reintentar: number[] = [];
  for (const [indice, o] of ops.entries()) {
    const motivo = validarOp(o);
    if (motivo) { rechazadas.push({ indice, motivo }); continue; }
    try {
      switch (o.op) {
        case 'guardar': await repo.guardarMovimiento(o.movimiento, o.cuentasNuevas, o.compromisos); break;
        case 'editar': await repo.editarMovimiento(o.movimiento, o.cuentasNuevas); break;
        case 'anular': await repo.anularMovimiento(o.id, o.cuando); break;
        case 'restaurar': await repo.restaurarMovimiento(o.id, o.cuando); break;
        case 'compromisos': await repo.actualizarCompromisos(o.lista); break;
        case 'aprendido': await repo.guardarAprendido(o.palabra, o.valor); break;
        case 'presupuesto': await repo.setPresupuesto(o.categoriaId, o.monto); break;
        case 'config': await repo.setConfig(o.clave, o.valor); break;
        case 'cuenta': await repo.guardarCuenta(o.cuenta); break;
      }
    } catch (e) {
      if (o.op === 'editar' && ops.slice(indice + 1).some(x => x?.op === 'anular' && x.id === o.movimiento.id) && esErrorPermanente(e)) continue;
      if (esErrorPermanente(e)) { rechazadas.push({ indice, motivo: 'La base de datos no la aceptó.' }); continue; }
      for (let i = indice; i < ops.length; i++) reintentar.push(i);
      break;
    }
  }
  return { rechazadas, reintentar };
}

/** Igual que `aplicarOpsDetallado` pero devuelve solo los rechazos (sirve para repositorios en memoria que no fallan por la red). */
export async function aplicarOps(repo: Repo, ops: Op[]): Promise<Rechazo[]> {
  return (await aplicarOpsDetallado(repo, ops)).rechazadas;
}

/** Operaciones por petición cuando la app envía su cola (muy por debajo de MAX_OPS, para que una cola larga no se trabe). */
export const TAM_LOTE = 100;

/**
 * Deja una sola operación `config` por clave (la última, en su sitio) y no mueve ninguna otra. Las claves de config
 * se pisan unas a otras, así que las anteriores no aportan nada y solo alargan la cola.
 */
export function fusionarConfigRepetidas(cola: Op[]): Op[] {
  const ultima = new Map<string, Op>();
  for (const o of cola) if (o.op === 'config') ultima.set(o.clave, o);
  return cola.filter(o => o.op !== 'config' || ultima.get(o.clave) === o);
}

export interface ResultadoLotes {
  /** La última respuesta recibida (la que trae los datos más al día), o null si no llegó ninguna. */
  respuesta: RespuestaSync | null;
  /** Operaciones que el servidor ya trató (aplicadas o rechazadas): salen de la cola. */
  procesadas: Op[];
  rechazadas: { op: Op; motivo: string }[];
  /** Lo que sigue en la cola, en orden: lo que falló de forma pasajera y lo que no llegó a enviarse. */
  pendientes: Op[];
  /** true: el servidor devolvió operaciones en `reintentar`. */
  transitorio: boolean;
  /** Mensaje del error de red o de HTTP que cortó el envío, si lo hubo. */
  error?: string;
}

/**
 * Envía la cola en lotes de `tam` operaciones, en orden, y sigue con el siguiente lote solo si el anterior
 * terminó sin fallo pasajero. Un servidor viejo no manda `reintentar`: se trata como siempre (todo lo enviado se da por tratado).
 */
export async function enviarPorLotes(cola: Op[], enviar: (lote: Op[]) => Promise<RespuestaSync>, tam = TAM_LOTE): Promise<ResultadoLotes> {
  const res: ResultadoLotes = { respuesta: null, procesadas: [], rechazadas: [], pendientes: [...cola], transitorio: false };
  // aun sin operaciones se hace una petición, para traer los datos
  for (let desde = 0; desde < Math.max(cola.length, 1); desde += tam) {
    const lote = cola.slice(desde, desde + tam);
    let r: RespuestaSync;
    try { r = await enviar(lote); } catch (e) { res.error = (e as Error).message; return res; }
    res.respuesta = r;
    const otra = new Set(r.reintentar ?? []);
    for (const x of r.rechazadas ?? []) if (lote[x.indice] && !otra.has(x.indice)) res.rechazadas.push({ op: lote[x.indice], motivo: x.motivo });
    for (const [i, o] of lote.entries()) if (!otra.has(i)) res.procesadas.push(o);
    res.pendientes = cola.filter(o => !res.procesadas.includes(o));
    if (otra.size) { res.transitorio = true; return res; }
  }
  return res;
}

/**
 * Envuelve un repositorio y anota cada cambio como una `Op` (para enviarla luego al servidor).
 * La app usa uno de estos sobre su copia local.
 */
/**
 * Quita de la cola las operaciones que ya se enviaron, por identidad (la misma referencia), y deja todo lo demás.
 * Así lo que se anotó mientras viajaba la petición no se pierde, ni tampoco si la cola se reemplazó entre tanto
 * (por ejemplo, al restaurar un respaldo): lo que no está en `enviadas` se queda. Devuelve cuántas quitó.
 */
export function quitarEnviadas(cola: Op[], enviadas: Op[]): number {
  const enviado = new Set(enviadas);
  let quitadas = 0;
  for (let i = cola.length - 1; i >= 0; i--) {
    if (enviado.has(cola[i])) { cola.splice(i, 1); quitadas++; }
  }
  return quitadas;
}

export class RepoConCola implements Repo {
  private base: Repo;
  /** Cambios aún no enviados. La app los persiste. */
  cola: Op[];
  /** Se llama tras cada cambio (para guardar la cola en el disco del dispositivo). */
  alCambiar: () => void;

  constructor(base: Repo, cola: Op[] = [], alCambiar: () => void = () => {}) {
    this.base = base;
    this.cola = cola;
    this.alCambiar = alCambiar;
  }

  cargar() { return this.base.cargar(); }
  leerPendiente() { return this.base.leerPendiente(); }
  guardarPendiente(p: Parameters<Repo['guardarPendiente']>[0]) { return this.base.guardarPendiente(p); }

  async guardarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[], compromisos: Compromiso[]) {
    await this.base.guardarMovimiento(m, cuentasNuevas, compromisos);
    this.cola.push({ op: 'guardar', movimiento: m, cuentasNuevas, compromisos });
    this.alCambiar();
  }
  async editarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[]) {
    await this.base.editarMovimiento(m, cuentasNuevas);
    this.cola.push({ op: 'editar', movimiento: m, cuentasNuevas });
    this.alCambiar();
  }
  async anularMovimiento(id: string, cuando: string) {
    await this.base.anularMovimiento(id, cuando);
    this.cola.push({ op: 'anular', id, cuando });
    this.alCambiar();
  }
  async restaurarMovimiento(id: string, cuando: string) {
    await this.base.restaurarMovimiento(id, cuando);
    this.cola.push({ op: 'restaurar', id, cuando });
    this.alCambiar();
  }
  async actualizarCompromisos(cs: Compromiso[]) {
    await this.base.actualizarCompromisos(cs);
    this.cola.push({ op: 'compromisos', lista: cs });
    this.alCambiar();
  }
  async guardarAprendido(palabra: string, valor: Aprendido) {
    await this.base.guardarAprendido(palabra, valor);
    this.cola.push({ op: 'aprendido', palabra, valor });
    this.alCambiar();
  }
  async setPresupuesto(categoriaId: string, monto: number | null) {
    await this.base.setPresupuesto(categoriaId, monto);
    this.cola.push({ op: 'presupuesto', categoriaId, monto });
    this.alCambiar();
  }
  async setConfig(clave: string, valor: string) {
    await this.base.setConfig(clave, valor);
    this.cola.push({ op: 'config', clave, valor });
    this.alCambiar();
  }
  async guardarCuenta(c: Cuenta) {
    await this.base.guardarCuenta(c);
    this.cola.push({ op: 'cuenta', cuenta: c });
    this.alCambiar();
  }
}

/** Margen que se le resta a «desde» para no perder cambios que se estaban escribiendo justo en ese momento. */
export const MARGEN_PARCIAL_SEGUNDOS = 120;
/** Si hace más que esto que no se sincroniza, se trae todo de nuevo por seguridad. */
export const MAX_DIAS_PARCIAL = 30;

/**
 * Deja la copia local al día con la respuesta del servidor. Si la respuesta es completa, la reemplaza;
 * si es parcial, cambia solo los movimientos que llegaron (por id) y reemplaza las demás tablas, que
 * siempre vienen completas. Lo que el servidor rechazó se saca de la copia local.
 */
export function fusionarRespuesta(local: Datos, resp: RespuestaSync, rechazados: string[] = []): Datos {
  if (!resp.parcial) return resp.datos;
  const porId = new Map(local.movimientos.map(m => [m.id, m]));
  for (const id of rechazados) porId.delete(id);
  for (const m of resp.datos.movimientos) porId.set(m.id, m);
  const movimientos = [...porId.values()].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
  return { ...resp.datos, movimientos };
}
