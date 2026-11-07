/**
 * Estado de la app: copia local de los datos, cola de cambios por enviar, ajustes y sincronización.
 *
 * Funciona 100 % sin conexión: todo se guarda primero en este dispositivo. Si hay un servidor
 * configurado, los cambios se envían cuando hay conexión y se descargan los que llegaron por
 * otros dispositivos. Sin servidor, la app es un cuaderno local completo ("modo local").
 */
import {
  alinearConPlantilla, aplicarOps, fusionarRespuesta, contextoDe, MemoriaRepo, RepoConCola,
  type Compromiso, type Cuenta, type Datos, type Movimiento, type Op, type Pendiente, type RespuestaSync,
} from '../../../packages/core/src/index.ts';
import { escribir, leer } from './almacen.ts';

export interface Ajustes {
  /** Dirección del servidor (Worker). Vacío = modo local. */
  url: string;
  /** Token de la API (solo tú lo conoces). */
  token: string;
  /** Hash del PIN para acciones sensibles. */
  pinHash?: string;
}

/** Copia local que persiste en el dispositivo después de cada cambio. */
class RepoLocal extends MemoriaRepo {
  async persistir(): Promise<void> {
    await escribir('datos', this.datos);
    await escribir('pendiente', this.pendiente);
  }
  override async guardarMovimiento(m: Movimiento, c: Cuenta[], k: Compromiso[]) { await super.guardarMovimiento(m, c, k); await this.persistir(); }
  override async anularMovimiento(id: string, cuando: string) { await super.anularMovimiento(id, cuando); await this.persistir(); }
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
  app.repo = new RepoConCola(app.local, cola, () => { void escribir('cola', app.repo.cola); });
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

/**
 * Pide ayuda a la IA del servidor para una frase que las reglas no entendieron. Devuelve las frases
 * reescritas, o un mensaje si no se pudo. Nunca lanza.
 */
export async function pedirAyudaIA(texto: string): Promise<{ frases: string[]; error?: string }> {
  try {
    const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}/api/interpretar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    const d = (await r.json().catch(() => ({}))) as { frases?: string[]; error?: string };
    return r.ok ? { frases: d.frases ?? [] } : { frases: [], error: d.error };
  } catch {
    return { frases: [] };
  }
}

/** Cómo va el servidor de esta instalación (lo mismo que `npm run salud`). */
export interface SaludServidor { fotos?: { cantidad: number; kb: number }; movimientos: number; ultimoMovimiento: string | null; desdeCuando: string | null; celularesConAvisos: number; ia: { encendida: boolean; uso: string | null }; ahora: string }
export async function leerSalud(): Promise<SaludServidor | string> {
  try { return await llamar<SaludServidor>('GET', '/api/salud'); } catch { return 'No pude hablar con el servidor. Revisa la conexión y el token.'; }
}

/** Buzón entre apps: a quién se le puede avisar, y el aviso. */
export async function destinosDelBuzon(): Promise<string[]> {
  try { return (await llamar<{ destinos: string[] }>('GET', '/api/buzon/destinos')).destinos; } catch { return []; }
}
export async function avisarAOtraApp(destino: string, monto: number, concepto: string): Promise<string> {
  try {
    const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}/api/buzon/enviar`, {
      method: 'POST', headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ destino, monto, concepto }),
    });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; motivo?: string };
    return r.ok ? 'Listo, le dejé el aviso.' : d.motivo ?? 'No se pudo enviar.';
  } catch { return 'No pude hablar con el servidor.'; }
}

/** Frases que las reglas no entendieron cuando no había internet: se piensan cuando vuelva. */
export interface FraseEnCola { texto: string; cuando: string }
const MAX_COLA_IA = 10;

export async function encolarFraseIA(texto: string): Promise<void> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  await escribir('ia_cola', [...cola, { texto, cuando: new Date().toISOString() }].slice(-MAX_COLA_IA));
}

/** Si hay internet, la IA piensa las frases guardadas. Devuelve las que entendió; las que no se pudo preguntar se quedan. */
export async function atenderColaIA(): Promise<(FraseEnCola & { frases: string[] })[]> {
  const cola = (await leer<FraseEnCola[]>('ia_cola')) ?? [];
  if (!cola.length || !hayServidor() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return [];
  const listas: (FraseEnCola & { frases: string[] })[] = [];
  const quedan: FraseEnCola[] = [];
  for (const f of cola) {
    const a = await pedirAyudaIA(f.texto);
    if (a.frases.length) listas.push({ ...f, frases: a.frases });
    else if (!a.error) quedan.push(f); // sin respuesta (la red se cayó): se intenta otra vez
  }
  await escribir('ia_cola', quedan);
  return listas;
}

// ---------------------------------------------------------------------------------------
// Avisos al celular
// ---------------------------------------------------------------------------------------

async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'El servidor no respondió.');
  return (await r.json()) as T;
}

const llaveABytes = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));

/** ¿Este celular ya recibe avisos? */
export async function avisosActivados(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/** Pide permiso, se suscribe y le cuenta al servidor. Devuelve un mensaje para mostrar. */
export async function activarAvisos(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Este navegador no puede mostrar avisos.';
  if (!hayServidor()) return 'Primero conecta la app con el servidor (arriba, en «Conexión»).';
  try {
    if ((await Notification.requestPermission()) !== 'granted') return 'No diste permiso. Puedes darlo en los ajustes del navegador y volver a intentar.';
    const reg = await navigator.serviceWorker.ready;
    const { clave } = await llamar<{ clave: string }>('GET', '/api/push/clave');
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveABytes(clave) as BufferSource });
    await llamar('POST', '/api/push/suscribir', { suscripcion: sub.toJSON() });
    return 'Listo, te avisaré en este celular.';
  } catch (e) {
    return `No se pudo activar: ${(e as Error).message}`;
  }
}

export async function apagarAvisos(): Promise<string> {
  try {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      await llamar('POST', '/api/push/baja', { endpoint: sub.endpoint }).catch(() => null);
      await sub.unsubscribe();
    }
    return 'Avisos apagados en este celular.';
  } catch (e) {
    return `No se pudo apagar: ${(e as Error).message}`;
  }
}

/** Manda un aviso de prueba a los celulares suscritos. */
export async function probarAvisos(): Promise<string> {
  try {
    const r = await llamar<{ enviados: number; suscritos: number }>('POST', '/api/push/probar');
    return r.suscritos === 0 ? 'Todavía no hay ningún celular con avisos activados.' : `Mandé la prueba a ${r.enviados} de ${r.suscritos} celulares. Debería llegar en unos segundos.`;
  } catch (e) {
    return `No se pudo probar: ${(e as Error).message}`;
  }
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

/**
 * Envía los cambios pendientes y descarga el estado completo del servidor.
 * Devuelve un mensaje corto para mostrar. Nunca lanza: los errores quedan en `ultimoError`.
 */
export async function sincronizar(): Promise<string> {
  if (!hayServidor()) return 'Modo local: aún no hay servidor configurado.';
  if (app.sincronizando) return 'Ya estoy sincronizando…';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión: se sincronizará al volver.';
  app.sincronizando = true;
  try {
    const enviadas = [...app.repo.cola];
    // Con una copia completa de la última vez, se piden solo los cambios desde entonces (el servidor decide
    // si alcanza o si hay que mandar todo: ver `fusionarRespuesta`).
    const pideParcial = Boolean(app.ultimoSync) && (await leer<boolean>('copia_completa')) === true && app.local.datos.cuentas.length > 0;
    const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}/api/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${app.ajustes.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: enviadas, ...(pideParcial ? { desde: app.ultimoSync, generacion: app.local.datos.config.generacion ?? '0' } : {}) }),
    });
    if (r.status === 401) throw new Error('El token no es correcto.');
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`);
    const respuesta = (await r.json()) as RespuestaSync;
    const { servidorEn, rechazadas } = respuesta;
    // lo que el servidor no aceptó no se queda en la copia local
    const rechazadosIds = (rechazadas ?? []).map(x => enviadas[x.indice]).flatMap(o => (o?.op === 'guardar' ? [o.movimiento.id] : []));
    const datos = fusionarRespuesta(app.local.datos, respuesta, rechazadosIds);
    if (!respuesta.parcial) await escribir('copia_completa', true);

    // Lo enviado ya está en el servidor. Si mientras tanto hiciste cambios nuevos, se reaplican encima.
    app.repo.cola.splice(0, enviadas.length);
    const base = new MemoriaRepo();
    base.datos = datos;
    await aplicarOps(base, app.repo.cola);
    app.local.datos = base.datos;
    await app.local.persistir();
    await escribir('cola', app.repo.cola);
    app.ultimoSync = servidorEn;
    app.ultimoError = null;
    await escribir('ultimoSync', servidorEn);
    if (rechazadas?.length) {
      // Una operación que el servidor no acepta no puede trabar las demás: se guarda aparte para que se vea.
      const describir = (o: Op | undefined): string => !o ? 'cambio' : o.op === 'guardar' ? `${o.movimiento.descripcion} ${o.movimiento.ocurridoEn.slice(0, 10)}` : o.op;
      app.rechazados.push(...rechazadas.map(x => ({ cuando: servidorEn, que: describir(enviadas[x.indice]), motivo: x.motivo })));
      await escribir('rechazados', app.rechazados);
      return `Sincronizado, pero ${rechazadas.length} cambio(s) no se pudieron guardar (míralos en Ajustes).`;
    }
    return `Sincronizado (${enviadas.length} cambios enviados).`;
  } catch (e) {
    app.ultimoError = (e as Error).message;
    return `No pude sincronizar: ${app.ultimoError}`;
  } finally {
    app.sincronizando = false;
  }
}

/** Hash SHA-256 de un texto (para el PIN: nunca se guarda el PIN tal cual). */
export async function hash(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finanzas:' + texto));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pinCorrecto(pin: string): Promise<boolean> {
  return Boolean(app.ajustes.pinHash) && (await hash(pin)) === app.ajustes.pinHash;
}

// ---------------------------------------------------------------- fotos de recibos
// Cada foto se guarda en el aparato y, si hay servidor, también allá: así se ve desde otro celular.

const urlFoto = (id: string): string => `${app.ajustes.url.replace(/\/$/, '')}/api/foto/${encodeURIComponent(id)}`;
const cabecera = (): Record<string, string> => ({ Authorization: `Bearer ${app.ajustes.token}` });
const hayRed = (): boolean => hayServidor() && navigator.onLine !== false;

export async function subirFoto(id: string, foto: Blob): Promise<boolean> {
  if (!hayRed()) return false;
  try { return (await fetch(urlFoto(id), { method: 'PUT', headers: cabecera(), body: foto })).ok; } catch { return false; }
}
export async function bajarFoto(id: string): Promise<Blob | null> {
  if (!hayRed()) return null;
  try { const r = await fetch(urlFoto(id), { headers: cabecera() }); return r.ok ? await r.blob() : null; } catch { return null; }
}
export async function borrarFotoEnServidor(id: string): Promise<void> {
  if (!hayRed()) return;
  try { await fetch(urlFoto(id), { method: 'DELETE', headers: cabecera() }); } catch { /* se quedará ahí hasta purgar */ }
}
