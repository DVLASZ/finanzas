/** Llamadas al servidor (Worker) de esta instalación: la dirección y la clave salen de los ajustes. */
import { app, hayServidor } from './estado.ts';

export const urlBase = (): string => app.ajustes.url.replace(/\/$/, '');
export const cabeceraAuth = (): Record<string, string> => ({ Authorization: `Bearer ${app.ajustes.token}` });
export const cabeceraJson = (): Record<string, string> => ({ ...cabeceraAuth(), 'Content-Type': 'application/json' });
/** ¿Hay servidor y hay red? */
export const hayRed = (): boolean => hayServidor() && navigator.onLine !== false;

export async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${urlBase()}${ruta}`, {
    method: metodo,
    headers: cabeceraJson(),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'El servidor no respondió.');
  return (await r.json()) as T;
}
