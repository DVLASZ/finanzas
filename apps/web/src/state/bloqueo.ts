/**
 * Bloqueo de la app: si hay un PIN, la app puede pedirlo al abrir y de nuevo cuando pasa a segundo plano o tras 2 o 5 minutos
 * sin tocarla. Es una barrera para quien agarre el teléfono desbloqueado: los datos siguen en el dispositivo (para cifrarlos hay
 * que usar el respaldo con contraseña). Se apaga por defecto; se enciende en Ajustes.
 */
import { signal } from '@preact/signals';
import { escribir, leer } from '../services/almacen.ts';
import { anotarActividad } from '../services/actividad.ts';
import { app } from '../services/estado.ts';

export type ModoBloqueo = 'nunca' | 'fondo' | '2' | '5';
export const modoBloqueo = signal<ModoBloqueo>('nunca');
export const bloqueada = signal(false);

let ultimoToque = Date.now();
let seFueA = 0;

const limiteMs = (m: ModoBloqueo): number => (m === '2' ? 120_000 : m === '5' ? 300_000 : m === 'fondo' ? 0 : Infinity);
const hayPin = (): boolean => Boolean(app.ajustes.pinHash);

export function bloquear(): void {
  if (hayPin() && modoBloqueo.peek() !== 'nunca' && !bloqueada.peek()) { bloqueada.value = true; anotarActividad('bloqueo', 'La app se bloqueó'); }
}
export function desbloquear(): void { bloqueada.value = false; ultimoToque = Date.now(); anotarActividad('acceso', 'Se desbloqueó la app con el PIN'); }

export function ponerModoBloqueo(m: ModoBloqueo): void {
  modoBloqueo.value = m;
  void escribir('bloqueo', m);
}

/** Se llama una vez al arrancar: lee el modo, bloquea si toca y se pone a mirar la inactividad. */
export async function iniciarBloqueo(): Promise<void> {
  const m = await leer<ModoBloqueo>('bloqueo');
  if (m === 'fondo' || m === '2' || m === '5') modoBloqueo.value = m;
  bloquear(); // al abrir la app, con PIN y bloqueo activo, se pide
  const tocar = () => { ultimoToque = Date.now(); };
  for (const e of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(e, tocar, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { seFueA = Date.now(); return; }
    // al volver: «fondo» siempre pide el PIN; los modos por minutos, si pasó ese tiempo desde el último toque
    const modo = modoBloqueo.peek();
    if (modo === 'fondo' || (seFueA && Date.now() - ultimoToque >= limiteMs(modo))) bloquear();
  });
  setInterval(() => {
    const modo = modoBloqueo.peek();
    if (!document.hidden && (modo === '2' || modo === '5') && Date.now() - ultimoToque >= limiteMs(modo)) bloquear();
  }, 10_000);
}
