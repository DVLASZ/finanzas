/** Sincronización con el servidor: envía la cola de cambios y descarga el estado completo. */
import { aplicarOps, fusionarRespuesta, MemoriaRepo, quitarEnviadas, type Op, type RespuestaSync } from '../../../../packages/core/src/index.ts';
import { escribir, leer } from './almacen.ts';
import { app, hayServidor, notificarCambio } from './estado.ts';
import { cabeceraJson, urlBase } from './http.ts';

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
      headers: cabeceraJson(),
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
    quitarEnviadas(app.repo.cola, enviadas);
    const base = new MemoriaRepo();
    base.datos = datos;
    await aplicarOps(base, app.repo.cola);
    app.local.datos = base.datos;
    await app.local.persistir();
    await escribir('cola', app.repo.cola);
    app.ultimoSync = servidorEn;
    app.ultimoError = null;
    await escribir('ultimoSync', servidorEn);
    // una edición que el servidor no aceptó deja la copia local distinta de la del servidor: la próxima vez se trae todo
    if (rechazadas?.some(x => enviadas[x.indice]?.op === 'editar')) await escribir('copia_completa', false);
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
    notificarCambio();
  }
}
