/**
 * Almacén de datos que usa el bot. Hay tres implementaciones:
 *  - `MemoriaRepo` (aquí): para pruebas.
 *  - D1 (worker/src/d1repo.ts): la base de datos de Cloudflare.
 *  - IndexedDB (web/src/idbrepo.ts): la copia local de la app, que funciona sin conexión.
 *
 * El volumen de datos de una persona es pequeño (cientos de movimientos al año), así que
 * `cargar()` trae todo y los cálculos se hacen en memoria con el mismo código en todas partes.
 */
import { DICCIONARIO } from './diccionario.ts';
import { idPersona } from './entidades.ts';
import { PLANTILLAS, type DatosDeInstalacion } from './plantillas.ts';
import type { Propuesta } from './parser.ts';
import { ATAJOS_INICIALES, CONFIG_INICIAL, CUENTAS_INICIALES } from './semilla.ts';
import { normalizar } from './texto.ts';
import type { Aprendido, Atajo, Compromiso, Contexto, Cuenta, Movimiento } from './tipos.ts';

export interface Datos {
  cuentas: Cuenta[];
  movimientos: Movimiento[];
  compromisos: Compromiso[];
  atajos: Atajo[];
  aprendido: Record<string, Aprendido>;
  presupuestos: Record<string, number>;
  config: Record<string, string>;
}

/** Tarjeta sin confirmar (una sola a la vez). */
export interface Pendiente {
  propuesta: Propuesta;
  /** true = el próximo mensaje se interpreta como corrección de esta tarjeta. */
  editando: boolean;
  /** Si es la edición de un movimiento ya guardado: al confirmar se anula este. */
  reemplazaId?: string;
  /** Id que tendrá el movimiento al confirmar (nace con la tarjeta; evita guardar dos veces). */
  id?: string;
  /** Lo que falta de un mensaje con varios movimientos: se muestra uno por uno al confirmar o cancelar. */
  siguientes?: string[];
  /** Cuántos movimientos traía el mensaje completo (para decir "2 de 3"). */
  total?: number;
}

export interface Repo {
  cargar(): Promise<Datos>;
  guardarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[], compromisos: Compromiso[]): Promise<void>;
  anularMovimiento(id: string, cuando: string): Promise<void>;
  /** Deshace una anulación: el movimiento vuelve a contar y sus deudas a estar activas. Si no está anulado, no hace nada. */
  restaurarMovimiento(id: string, cuando: string): Promise<void>;
  /**
   * Reemplaza un movimiento que ya existe (mismo id): sus datos y sus asientos, de una sola vez. Si no existe o está
   * anulado, lanza: no se edita lo anulado.
   */
  editarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[]): Promise<void>;
  actualizarCompromisos(cs: Compromiso[]): Promise<void>;
  guardarAprendido(palabra: string, valor: Aprendido): Promise<void>;
  setPresupuesto(categoriaId: string, monto: number | null): Promise<void>;
  setConfig(clave: string, valor: string): Promise<void>;
  /** Crea o cambia una categoría o una persona (nombre, grupo). Si ya existe, se actualiza. */
  guardarCuenta(c: Cuenta): Promise<void>;
  leerPendiente(): Promise<Pendiente | null>;
  guardarPendiente(p: Pendiente | null): Promise<void>;
}

/** Arma el contexto del parser a partir de los datos cargados. */
export function contextoDe(d: Datos, ahora: Date): Contexto {
  return {
    ahora, cuentas: d.cuentas, atajos: d.atajos, aprendido: d.aprendido,
    presupuestos: d.presupuestos, config: d.config, diccionario: DICCIONARIO,
  };
}

/** Implementación en memoria (pruebas y primeros ensayos). */
export class MemoriaRepo implements Repo {
  datos: Datos = {
    cuentas: structuredClone(CUENTAS_INICIALES),
    movimientos: [],
    compromisos: [],
    atajos: structuredClone(ATAJOS_INICIALES),
    aprendido: {},
    presupuestos: {},
    config: { ...CONFIG_INICIAL },
  };
  pendiente: Pendiente | null = null;

  /**
   * Deja los datos como los de una plantilla (ver core/src/plantillas.ts), más lo propio de la
   * instalación. Sirve para pruebas y para el modo local de la app; en el servidor lo hace el SQL.
   */
  aplicarPlantilla(id: string, extra: DatosDeInstalacion = {}): void {
    const pl = PLANTILLAS[id];
    if (!pl) throw new Error(`No existe la plantilla «${id}».`);
    const personas: Cuenta[] = (extra.personas ?? []).map(p => ({
      id: idPersona(p.nombre), nombre: p.nombre, clave: normalizar(p.nombre), tipo: 'persona', moneda: 'COP', grupo: p.grupo,
    }));
    this.datos = {
      cuentas: [...structuredClone(pl.cuentas), ...personas],
      movimientos: [],
      compromisos: [],
      atajos: structuredClone(pl.atajos),
      aprendido: { ...structuredClone(pl.aprendido), ...(extra.aprendido ?? {}) },
      presupuestos: {},
      config: { ...pl.config, ...(extra.config ?? {}) },
    };
  }

  async cargar(): Promise<Datos> { return structuredClone(this.datos); }

  async editarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[]): Promise<void> {
    const i = this.datos.movimientos.findIndex(x => x.id === m.id);
    if (i < 0 || this.datos.movimientos[i].estado !== 'ok') throw new Error('Ese movimiento no existe o está anulado.');
    for (const c of cuentasNuevas) if (!this.datos.cuentas.some(x => x.id === c.id)) this.datos.cuentas.push(c);
    // el estado, el id y la fecha de creación no cambian con una edición
    const anterior = this.datos.movimientos[i];
    this.datos.movimientos[i] = structuredClone({ ...m, id: anterior.id, creadoEn: anterior.creadoEn, estado: 'ok' as const, anuladoEn: null });
  }

  async guardarMovimiento(m: Movimiento, cuentasNuevas: Cuenta[], compromisos: Compromiso[]): Promise<void> {
    if (this.datos.movimientos.some(x => x.id === m.id)) return; // idempotente, igual que en D1
    for (const c of cuentasNuevas) if (!this.datos.cuentas.some(x => x.id === c.id)) this.datos.cuentas.push(c);
    this.datos.movimientos.push(structuredClone(m));
    this.datos.compromisos.push(...compromisos);
  }

  async restaurarMovimiento(id: string, _cuando: string): Promise<void> {
    const m = this.datos.movimientos.find(x => x.id === id);
    if (!m || m.estado !== 'anulado') return;
    m.estado = 'ok'; m.anuladoEn = null;
    for (const c of this.datos.compromisos) {
      if (c.id.startsWith(`${id}-c`) && c.estado === 'anulada') c.estado = 'activa';
    }
  }

  async anularMovimiento(id: string, cuando: string): Promise<void> {
    const m = this.datos.movimientos.find(x => x.id === id);
    if (m) { m.estado = 'anulado'; m.anuladoEn = cuando; }
    // Las deudas que creó este movimiento se anulan con él (sus ids son `${id}-c1`, `-c2`...).
    // Si no, siguen "activas" con saldo cero y el siguiente guardado celebra una "deuda saldada" falsa.
    for (const c of this.datos.compromisos) {
      if (c.id.startsWith(`${id}-c`) && c.estado === 'activa') c.estado = 'anulada';
    }
  }

  async actualizarCompromisos(cs: Compromiso[]): Promise<void> {
    for (const c of cs) {
      const i = this.datos.compromisos.findIndex(x => x.id === c.id);
      if (i >= 0) this.datos.compromisos[i] = c;
    }
  }

  async guardarAprendido(palabra: string, valor: Aprendido): Promise<void> {
    // sin categoría ni cuenta es «olvidar» la palabra
    if (!valor.categoriaId && !valor.cuentaId) delete this.datos.aprendido[palabra];
    else this.datos.aprendido[palabra] = valor;
  }

  async guardarCuenta(c: Cuenta): Promise<void> {
    const i = this.datos.cuentas.findIndex(x => x.id === c.id);
    if (i < 0) this.datos.cuentas.push(structuredClone(c));
    else this.datos.cuentas[i] = { ...this.datos.cuentas[i], nombre: c.nombre, clave: c.clave, grupo: c.grupo ?? null };
  }

  async setPresupuesto(categoriaId: string, monto: number | null): Promise<void> {
    if (monto === null) delete this.datos.presupuestos[categoriaId];
    else this.datos.presupuestos[categoriaId] = monto;
  }

  async setConfig(clave: string, valor: string): Promise<void> { this.datos.config[clave] = valor; }
  async leerPendiente(): Promise<Pendiente | null> { return this.pendiente ? structuredClone(this.pendiente) : null; }
  async guardarPendiente(p: Pendiente | null): Promise<void> { this.pendiente = p ? structuredClone(p) : null; }
}
