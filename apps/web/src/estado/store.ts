/**
 * Capa reactiva de la app: envuelve lo que ya existe (`app`, el repositorio local, la cola de cambios y
 * IndexedDB) y lo expone como signals. Cualquier componente que lea un signal se vuelve a pintar solo
 * cuando cambian los datos, sin volver a armar toda la pantalla.
 *
 * No guarda nada por su cuenta: la fuente de verdad sigue siendo `app.local` (datos) y `app.repo.cola`
 * (cambios por enviar). Esto solo los refleja.
 */
import { computed, signal } from '@preact/signals';
import { contextoDe, type Datos } from '../../../../packages/core/src/index.ts';
import { alCambiarElEstado, app, hayServidor } from '../app.ts';

/** Una copia de los datos tal como están ahora (cuentas, movimientos, deudas, config...). Nula hasta que carga. */
export const datos = signal<Datos | null>(null);

/** Cambios que todavía no llegan al servidor. */
export const pendientes = signal(0);
export const sincronizando = signal(false);
export const ultimoSync = signal<string | null>(null);
export const ultimoError = signal<string | null>(null);
export const conServidor = signal(false);

/** El mismo contexto que usa el bot (cuentas, topes, config, hora). Se recalcula con los datos. */
export const ctx = computed(() => (datos.value ? contextoDe(datos.value, new Date()) : null));

/** Lo que la barra de estado muestra: cómo va la sincronización. */
export const estadoSync = computed<'local' | 'ok' | 'pendiente' | 'sincronizando' | 'error'>(() => {
  if (!conServidor.value) return 'local';
  if (sincronizando.value) return 'sincronizando';
  if (ultimoError.value) return 'error';
  return pendientes.value > 0 ? 'pendiente' : 'ok';
});

let refrescando: Promise<void> | null = null;
let otraVez = false;

/** Vuelve a leer todo de la app y actualiza los signals. Si piden refrescar mientras se refresca, se hace una sola vez más. */
export function refrescar(): Promise<void> {
  if (refrescando) { otraVez = true; return refrescando; }
  refrescando = (async () => {
    do {
      otraVez = false;
      const nuevos = await app.local.cargar();
      // los signals se actualizan juntos para que un componente no vea datos nuevos con una cola vieja
      pendientes.value = app.repo?.cola.length ?? 0;
      sincronizando.value = app.sincronizando;
      ultimoSync.value = app.ultimoSync;
      ultimoError.value = app.ultimoError;
      conServidor.value = hayServidor();
      datos.value = nuevos;
    } while (otraVez);
  })().finally(() => { refrescando = null; });
  return refrescando;
}

let apagar: (() => void) | null = null;

/** Se llama una vez, después de `iniciar()`: carga el estado y se engancha a los cambios de la app. */
export async function iniciarEstado(): Promise<void> {
  apagar?.();
  apagar = alCambiarElEstado(() => { void refrescar(); });
  await refrescar();
}
