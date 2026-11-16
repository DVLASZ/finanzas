/**
 * Estado de la app: copia local de los datos, ajustes y la cola de cambios por enviar.
 *
 * Funciona 100 % sin conexión: todo se guarda primero en este dispositivo. Si hay un servidor
 * configurado, los cambios se envían cuando hay conexión (ver `sincronizacion.ts`). Sin servidor, la app
 * es un cuaderno local completo ("modo local").
 */
import {
  alinearConPlantilla, contextoDe, MemoriaRepo, RepoConCola,
  type Compromiso, type Cuenta, type Datos, type Movimiento, type Op, type Pendiente,
} from '../../../../packages/core/src/index.ts';
import { escribir, leer } from './almacen.ts';

export interface Ajustes {
  /** Dirección del servidor (Worker). Vacío = modo local. */
  url: string;
  /** Token de la API (solo tú lo conoces). */
  token: string;
  /** Hash del PIN para acciones sensibles. */
  pinHash?: string;
}

/** Quienes quieren enterarse cuando cambian los datos, la cola o la sincronización (la capa reactiva de `estado/store.ts`). */
const oyentes = new Set<() => void>();
export const alCambiarElEstado = (f: () => void): (() => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
export const notificarCambio = (): void => { for (const f of oyentes) f(); };

/** Copia local que persiste en el dispositivo después de cada cambio. */
class RepoLocal extends MemoriaRepo {
  async persistir(): Promise<void> {
    await escribir('datos', this.datos);
    await escribir('pendiente', this.pendiente);
    notificarCambio();
  }
  override async guardarMovimiento(m: Movimiento, c: Cuenta[], k: Compromiso[]) { await super.guardarMovimiento(m, c, k); await this.persistir(); }
  override async anularMovimiento(id: string, cuando: string) { await super.anularMovimiento(id, cuando); await this.persistir(); }
  override async editarMovimiento(m: Movimiento, c: Cuenta[]) { await super.editarMovimiento(m, c); await this.persistir(); }
  override async actualizarCompromisos(cs: Compromiso[]) { await super.actualizarCompromisos(cs); await this.persistir(); }
  override async guardarAprendido(p: string, v: Parameters<MemoriaRepo['guardarAprendido']>[1]) { await super.guardarAprendido(p, v); await this.persistir(); }
  override async setPresupuesto(c: string, m: number | null) { await super.setPresupuesto(c, m); await this.persistir(); }
  override async setConfig(k: string, v: string) { await super.setConfig(k, v); await this.persistir(); }
  override async guardarPendiente(p: Pendiente | null) { await super.guardarPendiente(p); await this.persistir(); }
}

export const app = {
  local: new RepoLocal(),
  /** El repositorio que usa el bot de la app: guarda local y anota cada cambio en la cola. */
  repo: null as unknown as RepoConCola,
  ajustes: { url: '', token: '' } as Ajustes,
  sincronizando: false,
  ultimoSync: null as string | null,
  ultimoError: null as string | null,
  /** Cambios que el servidor no aceptó (para que la persona los vea; no traban la cola). */
  rechazados: [] as { cuando: string; que: string; motivo: string }[],
};

/** Carga todo lo guardado en el dispositivo. Llamar una vez al abrir la app. */
export async function iniciar(): Promise<void> {
  const datos = await leer<Datos>('datos');
  if (datos) app.local.datos = datos;
  // Primera vez en este aparato: se parte de las cuentas de ESTA app (no de las de otra), aunque aún no
  // esté conectada al servidor.
  else app.local.aplicarPlantilla(document.documentElement.dataset.plantilla ?? 'personal');
  app.local.pendiente = (await leer<Pendiente | null>('pendiente')) ?? null;
  const cola = (await leer<Op[]>('cola')) ?? [];
  app.repo = new RepoConCola(app.local, cola, () => { void escribir('cola', app.repo.cola); notificarCambio(); });
  app.ajustes = (await leer<Ajustes>('ajustes')) ?? { url: '', token: '' };
  // Si la app se sirve desde el propio Worker, la dirección del servidor es la de la página.
  if (!app.ajustes.url && location.hostname.endsWith('.workers.dev')) app.ajustes.url = location.origin;
  // Una copia local de antes puede no tener las cuentas nuevas de su plantilla (o tener las que ya no hay).
  if (datos && !hayServidor() && alinearConPlantilla(app.local.datos, document.documentElement.dataset.plantilla ?? 'personal')) await app.local.persistir();
  app.ultimoSync = (await leer<string>('ultimoSync')) ?? null;
  app.rechazados = (await leer<typeof app.rechazados>('rechazados')) ?? [];
}

/** Vacía la lista de cambios que el servidor no aceptó. */
export async function limpiarRechazados(): Promise<void> {
  app.rechazados = [];
  await escribir('rechazados', app.rechazados);
}

export async function guardarAjustes(a: Ajustes): Promise<void> {
  app.ajustes = a;
  await escribir('ajustes', a);
}

/** ¿Hay servidor configurado? */
export const hayServidor = (): boolean => Boolean(app.ajustes.url && app.ajustes.token);

/** Cambios pendientes de enviar. */
export const pendientesDeEnviar = (): number => app.repo.cola.length;

/** Datos y contexto del bot en este momento. */
export async function leerTodo() {
  const datos = await app.local.cargar();
  return { datos, ctx: contextoDe(datos, new Date()) };
}
