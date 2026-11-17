/**
 * El PIN de la app: nunca se guarda tal cual. Se guarda un resumen PBKDF2 (SHA-256, 210.000 vueltas, sal propia de cada
 * instalación), así que aunque alguien se lleve la copia local no puede probar los PIN de 4 a 8 dígitos de golpe. Los PIN
 * que se guardaron con el resumen simple de antes siguen sirviendo y se pasan al formato nuevo la primera vez que se usan.
 *
 * Equivocarse tiene castigo creciente (ver `intentarPin`), y el castigo se guarda en este dispositivo: cerrar y abrir la app
 * no lo reinicia.
 */
import { app, guardarAjustes } from './estado.ts';
import { anotarActividad } from './actividad.ts';
import { escribir, leer } from './almacen.ts';

const VUELTAS = 210_000;
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const deHex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map(x => parseInt(x, 16)));

/** El resumen simple de antes (SHA-256 de «finanzas:» y el PIN). Solo se usa para reconocer PIN viejos. */
async function hashAntiguo(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finanzas:' + texto)));
}

async function pbkdf2(pin: string, sal: Uint8Array, vueltas: number): Promise<string> {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: vueltas }, llave, 256));
}

/** El resumen de un PIN nuevo: «pbkdf2$vueltas$sal$resumen». */
export async function crearHashPin(pin: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${VUELTAS}$${hex(sal)}$${await pbkdf2(pin, sal, VUELTAS)}`;
}

/** Igualdad sin cortar en la primera letra distinta. */
function iguales(a: string, b: string): boolean {
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

/** ¿Este PIN es el guardado? No cuenta intentos: para eso está `intentarPin`. */
export async function pinCorrecto(pin: string): Promise<boolean> {
  const guardado = app.ajustes.pinHash;
  if (!guardado) return false;
  if (guardado.startsWith('pbkdf2$')) {
    const [, vueltas, sal, resumen] = guardado.split('$');
    return iguales(await pbkdf2(pin, deHex(sal), Number(vueltas)), resumen);
  }
  // un PIN guardado con el formato de antes: si es correcto, se pasa al nuevo
  if (!iguales(await hashAntiguo(pin), guardado)) return false;
  await guardarAjustes({ ...app.ajustes, pinHash: await crearHashPin(pin) });
  return true;
}

// ---------------------------------------------------------------- intentos y espera

interface Fallos { n: number; hasta: number }

/** Segundos de espera después de `n` PIN equivocados seguidos: los dos primeros son gratis, luego 5, 15, 45... hasta 15 minutos. */
export function esperaTrasFallos(n: number): number {
  return n < 3 ? 0 : Math.min(900, 5 * 3 ** (n - 3));
}

export type ResultadoPin = { ok: true } | { ok: false; esperaS: number; intentosFallidos: number };

/** Prueba un PIN llevando la cuenta de los errores. Mientras dure la espera ni siquiera se mira el PIN. */
export async function intentarPin(pin: string, ahora = Date.now()): Promise<ResultadoPin> {
  const f = (await leer<Fallos>('pin-fallos')) ?? { n: 0, hasta: 0 };
  if (f.hasta > ahora) return { ok: false, esperaS: Math.ceil((f.hasta - ahora) / 1000), intentosFallidos: f.n };
  if (await pinCorrecto(pin)) { await escribir('pin-fallos', { n: 0, hasta: 0 }); return { ok: true }; }
  const n = f.n + 1;
  anotarActividad('pin', n >= 3 ? `PIN equivocado ${n} veces seguidas` : 'PIN equivocado');
  const espera = esperaTrasFallos(n);
  await escribir('pin-fallos', { n, hasta: espera ? ahora + espera * 1000 : 0 });
  return { ok: false, esperaS: espera, intentosFallidos: n };
}

/** Lo que se le dice a la persona después de un PIN equivocado. */
export const textoDeFallo = (r: { esperaS: number; intentosFallidos: number }): string =>
  r.esperaS > 0 ? `PIN incorrecto. Espera ${r.esperaS < 60 ? `${r.esperaS} segundos` : `${Math.ceil(r.esperaS / 60)} minutos`} antes de volver a intentar.` : 'PIN incorrecto.';
