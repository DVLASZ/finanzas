/**
 * Respaldo con contraseña, hecho en el navegador con Web Crypto: la clave sale de la contraseña con PBKDF2 (SHA-256,
 * 600.000 vueltas, sal propia) y el contenido se cifra con AES-GCM de 256 bits (que además detecta si el archivo se tocó).
 * La contraseña no se guarda en ningún lado: si se pierde, el respaldo no se puede abrir. Los respaldos de antes, sin
 * cifrar, se siguen pudiendo restaurar.
 */

export const FORMATO_CIFRADO = 'finanzas-respaldo-cifrado';
const VERSION = 1;
const VUELTAS = 600_000;

const aB64 = (b: Uint8Array): string => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const deB64 = (t: string): Uint8Array => Uint8Array.from(atob(t), c => c.charCodeAt(0));

async function llaveDe(contrasena: string, sal: Uint8Array, vueltas: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: vueltas }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** El texto de un archivo, ¿es un respaldo cifrado? */
export function estaCifrado(contenido: string): boolean {
  try { return JSON.parse(contenido)?.formato === FORMATO_CIFRADO; } catch { return false; }
}

/** Cifra un texto con una contraseña y devuelve el archivo (JSON con sal, vector inicial y datos en base64). */
export async function cifrarRespaldo(texto: string, contrasena: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const llave = await llaveDe(contrasena, sal, VUELTAS);
  const aad = new TextEncoder().encode(`${FORMATO_CIFRADO}:${VERSION}`);
  const datos = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad }, llave, new TextEncoder().encode(texto)));
  return JSON.stringify({ formato: FORMATO_CIFRADO, version: VERSION, kdf: 'PBKDF2-SHA256', vueltas: VUELTAS, cifrado: 'AES-256-GCM', sal: aB64(sal), iv: aB64(iv), datos: aB64(datos) });
}

/** Abre un respaldo cifrado. Si la contraseña no es o el archivo se tocó, lanza un error claro. */
export async function descifrarRespaldo(contenido: string, contrasena: string): Promise<string> {
  const j = JSON.parse(contenido);
  if (j?.formato !== FORMATO_CIFRADO || j.version !== VERSION) throw new Error('El archivo no es un respaldo cifrado de esta app.');
  const vueltas = Number(j.vueltas);
  if (!Number.isInteger(vueltas) || vueltas < 100_000 || vueltas > 5_000_000) throw new Error('El archivo trae una configuración que no es válida.');
  try {
    const llave = await llaveDe(contrasena, deB64(j.sal), vueltas);
    const aad = new TextEncoder().encode(`${FORMATO_CIFRADO}:${VERSION}`);
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(j.iv) as BufferSource, additionalData: aad }, llave, deB64(j.datos) as BufferSource);
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error('Contraseña incorrecta, o el archivo está dañado.');
  }
}
