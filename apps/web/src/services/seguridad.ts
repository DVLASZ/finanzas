/** El PIN de las acciones sensibles: nunca se guarda el PIN tal cual, solo su hash. */
import { app } from './estado.ts';

/** Hash SHA-256 de un texto (para el PIN: nunca se guarda el PIN tal cual). */
export async function hash(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finanzas:' + texto));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pinCorrecto(pin: string): Promise<boolean> {
  return Boolean(app.ajustes.pinHash) && (await hash(pin)) === app.ajustes.pinHash;
}
