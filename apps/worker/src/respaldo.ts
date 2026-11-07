/**
 * Copia de seguridad semanal en la nube. Cada domingo el servidor arma un JSON con todos los datos de
 * la instalación, lo cifra (AES-GCM, con una clave que solo tiene el dueño) y lo sube a un repositorio
 * privado de GitHub. Si falta cualquiera de las tres variables, no hace nada: queda apagada.
 *
 *   RESPALDO_TOKEN   token de GitHub con permiso solo sobre ese repositorio (contents: write)
 *   RESPALDO_REPO    «dueño/repositorio»
 *   RESPALDO_CLAVE   la frase para cifrar (mínimo 12 letras). Sin ella no se puede abrir el respaldo.
 *   RESPALDO_NOMBRE  la carpeta dentro del repositorio (opcional, «finanzas» por defecto)
 */
import type { Datos } from '../../../packages/core/src/index.ts';

export interface EnvRespaldo {
  RESPALDO_TOKEN?: string;
  RESPALDO_REPO?: string;
  RESPALDO_CLAVE?: string;
  RESPALDO_NOMBRE?: string;
}

// por trozos: con un respaldo grande, String.fromCharCode(...b) se pasa del límite de argumentos y falla
const aBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
const deBase64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const VUELTAS = 100_000; // Cloudflare no acepta más de 100.000 en PBKDF2

async function llave(frase: string, sal: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(frase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: VUELTAS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Devuelve un JSON de texto: {v, sal, iv, datos}, todo en base64. */
export async function cifrar(texto: string, frase: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await llave(frase, sal), new TextEncoder().encode(texto)));
  return JSON.stringify({ v: 1, sal: aBase64(sal), iv: aBase64(iv), datos: aBase64(datos) });
}

export async function descifrar(cifrado: string, frase: string): Promise<string> {
  const { sal, iv, datos } = JSON.parse(cifrado) as { sal: string; iv: string; datos: string };
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(iv) }, await llave(frase, deBase64(sal)), deBase64(datos));
  return new TextDecoder().decode(claro);
}

/** Sube la copia de hoy. `ahora` en hora UTC; el nombre del archivo lleva la fecha. */
export async function respaldarEnGitHub(
  env: EnvRespaldo, repo: { cargar(): Promise<Datos> | Promise<unknown> }, ahora: Date, llamar: typeof fetch = fetch,
): Promise<{ hecho: boolean; ruta?: string; motivo?: string }> {
  if (!env.RESPALDO_TOKEN || !env.RESPALDO_REPO || !env.RESPALDO_CLAVE) return { hecho: false, motivo: 'El respaldo en la nube no está activado.' };
  if (env.RESPALDO_CLAVE.length < 12) return { hecho: false, motivo: 'La clave del respaldo es muy corta (mínimo 12 letras).' };
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.RESPALDO_REPO)) return { hecho: false, motivo: 'RESPALDO_REPO tiene que ser «dueño/repositorio».' };
  const carpeta = (env.RESPALDO_NOMBRE ?? 'finanzas').replace(/[^\w-]/g, '') || 'finanzas';
  const ruta = `${carpeta}/${ahora.toISOString().slice(0, 10)}.json.cifrado`;
  const cifrado = await cifrar(JSON.stringify(await repo.cargar()), env.RESPALDO_CLAVE);
  const r = await llamar(`https://api.github.com/repos/${env.RESPALDO_REPO}/contents/${ruta}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${env.RESPALDO_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'finanzas-respaldo' },
    body: JSON.stringify({ message: `respaldo ${ruta}`, content: btoa(cifrado) }),
  });
  // 422 = ese día ya se subió (el archivo existe): se da por hecho, no se repite
  if (r.status === 422) return { hecho: true, ruta };
  if (!r.ok) return { hecho: false, motivo: `GitHub respondió ${r.status}.` };
  return { hecho: true, ruta };
}
