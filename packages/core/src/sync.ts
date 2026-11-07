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
}
export interface Rechazo { indice: number; motivo: string }

/** Máximo de operaciones por petición: de sobra para una cola acumulada sin conexión durante días. */
export const MAX_OPS = 1000;
/** Únicas claves de `config` que la app envía (al registrar el saldo inicial). Cualquier otra se rechaza. */
export const CLAVES_CONFIG_PERMITIDAS = ['fecha_apertura', 'catalogo', 'lista_compras', 'recurrentes', 'metas', 'categoria_persona', 'apodos_personas', 'grupos', 'subcategorias', 'cerrado_hasta', 'tope_arrastra', 'buzon'];
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
      case 'anular': if (!esTexto(o.id) || !esTexto(o.cuando)) return 'Anulación mal formada'; break;
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

/** Aplica las operaciones sobre un repositorio (sirve en el servidor y en las pruebas). */
export async function aplicarOps(repo: Repo, ops: Op[]): Promise<Rechazo[]> {
  const rechazadas: Rechazo[] = [];
  for (const [indice, o] of ops.entries()) {
    const motivo = validarOp(o);
    if (motivo) { rechazadas.push({ indice, motivo }); continue; }
    try {
      switch (o.op) {
        case 'guardar': await repo.guardarMovimiento(o.movimiento, o.cuentasNuevas, o.compromisos); break;
        case 'anular': await repo.anularMovimiento(o.id, o.cuando); break;
        case 'compromisos': await repo.actualizarCompromisos(o.lista); break;
        case 'aprendido': await repo.guardarAprendido(o.palabra, o.valor); break;
        case 'presupuesto': await repo.setPresupuesto(o.categoriaId, o.monto); break;
        case 'config': await repo.setConfig(o.clave, o.valor); break;
        case 'cuenta': await repo.guardarCuenta(o.cuenta); break;
      }
    } catch (e) {
      // una operación que la base no acepta (cuenta que no existe...) no debe trabar las que vienen detrás
      rechazadas.push({ indice, motivo: 'La base de datos no la aceptó.' });
    }
  }
  return rechazadas;
}

/**
 * Envuelve un repositorio y anota cada cambio como una `Op` (para enviarla luego al servidor).
 * La app usa uno de estos sobre su copia local.
 */
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
  async anularMovimiento(id: string, cuando: string) {
    await this.base.anularMovimiento(id, cuando);
    this.cola.push({ op: 'anular', id, cuando });
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
