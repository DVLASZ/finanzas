/** Sincronización con el servidor: envía la cola de cambios y descarga el estado completo. */
import { aplicarOps, enviarPorLotes, fusionarConfigRepetidas, fusionarRespuesta, MemoriaRepo, quitarEnviadas, type Op, type RespuestaSync } from '../../../../packages/core/src/index.ts';
import { escribir, leer } from './almacen.ts';
import { app, hayServidor, notificarCambio } from './estado.ts';
import { anotarActividad } from './actividad.ts';
import { cabeceraJson } from './http.ts';

/** Espera máxima por cada petición: un servidor que no contesta no debe dejar la app "sincronizando" para siempre. */
const ESPERA_MS = 20000;
/** Veces seguidas que una misma operación vuelve como fallo pasajero antes de darla por rechazada (para que una sola no trabe la cola eternamente). */
const MAX_FALLOS_PASAJEROS = 5;
const fallosPasajeros = new WeakMap<Op, number>();

const describir = (o: Op | undefined): string => !o ? 'cambio' : o.op === 'guardar' ? `${o.movimiento.descripcion} ${o.movimiento.ocurridoEn.slice(0, 10)}` : o.op;

/** Vuelve a poner en la cola un cambio que el servidor rechazó y lo saca de la lista. */
export async function reenviarRechazado(indice: number): Promise<void> {
  const x = app.rechazados[indice];
  if (!x?.op) return;
  app.rechazados.splice(indice, 1);
  await escribir('rechazados', app.rechazados);
  app.repo.cola.push(x.op);
  app.repo.alCambiar();
  void sincronizar();
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
    // Las claves de config se pisan unas a otras: solo viaja la última de cada una.
    const fusionada = fusionarConfigRepetidas(app.repo.cola);
    if (fusionada.length !== app.repo.cola.length) {
      app.repo.cola.splice(0, app.repo.cola.length, ...fusionada);
      await escribir('cola', app.repo.cola);
    }
    const enviadas = [...app.repo.cola];
    // Con una copia completa de la última vez, se piden solo los cambios desde entonces (el servidor decide
    // si alcanza o si hay que mandar todo: ver `fusionarRespuesta`).
    const pideParcial = Boolean(app.ultimoSync) && (await leer<boolean>('copia_completa')) === true && app.local.datos.cuentas.length > 0;
    // La cola sale en lotes, en orden. Si un lote trae un fallo pasajero de la base, no se envía el siguiente.
    const res = await enviarPorLotes(enviadas, async lote => {
      const r = await fetch(`${app.ajustes.url.replace(/\/$/, '')}/api/sync`, {
        method: 'POST',
        headers: cabeceraJson(),
        body: JSON.stringify({ ops: lote, ...(pideParcial ? { desde: app.ultimoSync, generacion: app.local.datos.config.generacion ?? '0' } : {}) }),
        signal: AbortSignal.timeout(ESPERA_MS),
      });
      if (r.status === 401) throw new Error('El token no es correcto.');
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}.`);
      return (await r.json()) as RespuestaSync;
    });
    const respuesta = res.respuesta;
    if (!respuesta) throw new Error(res.error ?? 'El servidor no respondió.');

    // Una operación que vuelve como fallo pasajero muchas veces seguidas deja de reintentarse: se trata como rechazada.
    if (res.transitorio) {
      const culpable = res.pendientes[0];
      const n = (fallosPasajeros.get(culpable) ?? 0) + 1;
      fallosPasajeros.set(culpable, n);
      if (n >= MAX_FALLOS_PASAJEROS) {
        res.rechazadas.push({ op: culpable, motivo: 'El servidor no pudo guardarla tras varios intentos.' });
        res.procesadas.push(culpable);
        res.pendientes = res.pendientes.slice(1);
      }
    }

    // lo que el servidor no aceptó no se queda en la copia local
    const rechazadosIds = res.rechazadas.flatMap(x => (x.op.op === 'guardar' ? [x.op.movimiento.id] : []));
    const datos = fusionarRespuesta(app.local.datos, respuesta, rechazadosIds);
    if (!respuesta.parcial) await escribir('copia_completa', true);

    // Lo tratado ya no va en la cola. Lo que quedó pendiente, y lo que hiciste mientras viajaba la petición, se reaplica encima.
    quitarEnviadas(app.repo.cola, res.procesadas);
    const base = new MemoriaRepo();
    base.datos = datos;
    await aplicarOps(base, app.repo.cola);
    app.local.datos = base.datos;
    await app.local.persistir();
    await escribir('cola', app.repo.cola);
    app.ultimoSync = respuesta.servidorEn;
    await escribir('ultimoSync', respuesta.servidorEn);
    // una edición que el servidor no aceptó deja la copia local distinta de la del servidor: la próxima vez se trae todo
    if (res.rechazadas.some(x => x.op.op === 'editar')) await escribir('copia_completa', false);
    if (res.rechazadas.length) {
      // Una operación que el servidor no acepta no puede trabar las demás: se guarda aparte, completa, para revisarla o reenviarla.
      app.rechazados.push(...res.rechazadas.map(x => ({ cuando: respuesta.servidorEn, que: describir(x.op), motivo: x.motivo, op: x.op })));
      await escribir('rechazados', app.rechazados);
      anotarActividad('error', `${res.rechazadas.length} cambio(s) que el servidor no aceptó`);
    }
    if (res.transitorio || res.error) {
      // Nada se perdió: lo pendiente sigue en la cola y se reintenta en la próxima sincronización.
      app.ultimoError = res.error ?? 'La base de datos del servidor no respondió.';
      anotarActividad('error', `Sincronización a medias, ${res.pendientes.length} cambio(s) esperan: ${app.ultimoError}`);
      return `Sin conexión estable con el servidor: ${res.pendientes.length} cambio(s) esperan y se reintentan solos.`;
    }
    app.ultimoError = null;
    if (res.rechazadas.length) return `Sincronizado, pero ${res.rechazadas.length} cambio(s) no se pudieron guardar (míralos en Ajustes).`;
    if (enviadas.length) anotarActividad('sincronizacion', `${enviadas.length} cambio(s) enviados`);
    return `Sincronizado (${enviadas.length} cambios enviados).`;
  } catch (e) {
    const err = e as Error;
    app.ultimoError = err.name === 'TimeoutError' ? 'El servidor tardó demasiado en responder.' : err.message;
    anotarActividad('error', `Sincronización: ${app.ultimoError}`);
    return `No pude sincronizar: ${app.ultimoError}`;
  } finally {
    app.sincronizando = false;
    notificarCambio();
  }
}
