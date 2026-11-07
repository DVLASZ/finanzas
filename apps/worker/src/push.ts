/**
 * Avisos al celular (Web Push), sin librerías: solo WebCrypto, que ya trae el Worker.
 *
 * Dos estándares:
 *  - VAPID (RFC 8292): el servidor se identifica ante Google/Mozilla con una firma ES256.
 *  - Cifrado del mensaje (RFC 8291, aes128gcm): el aviso viaja cifrado con las llaves del celular.
 */

export interface Suscripcion {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface LlavesVapid {
  /** Llave pública sin comprimir (65 bytes) en base64url: la que se le da al navegador. */
  publica: string;
  privada: JsonWebKey;
}

const cod = new TextEncoder();

export const aBase64Url = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const deBase64Url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};

const unir = (...partes: Uint8Array[]): Uint8Array => {
  const r = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { r.set(p, o); o += p.length; }
  return r;
};

/** Crea el par de llaves del servidor (se hace una sola vez por instalación). */
export async function crearLlavesVapid(): Promise<LlavesVapid> {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  return { publica: aBase64Url(publica), privada: await crypto.subtle.exportKey('jwk', par.privateKey) };
}

/** Las cabeceras VAPID para hablar con el servicio de avisos de ese celular. */
export async function cabeceraVapid(endpoint: string, llaves: LlavesVapid, ahora = Date.now()): Promise<string> {
  const jwt = [
    aBase64Url(cod.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))),
    aBase64Url(cod.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: 'mailto:admin@example.com' }))),
  ].join('.');
  const llave = await crypto.subtle.importKey('jwk', llaves.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, cod.encode(jwt)));
  return `vapid t=${jwt}.${aBase64Url(firma)}, k=${llaves.publica}`;
}

const hkdf = async (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> => {
  const llave = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, llave, bytes * 8));
};

/** Cifra el aviso para un celular concreto (aes128gcm, un solo bloque). */
export async function cifrarAviso(texto: string, s: Suscripcion, sal?: Uint8Array): Promise<Uint8Array> {
  const uaPublica = deBase64Url(s.keys.p256dh);
  const auth = deBase64Url(s.keys.auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaLlave = await crypto.subtle.importKey('raw', uaPublica as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secreto = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaLlave }, par.privateKey, 256));

  const ikm = await hkdf(secreto, auth, unir(cod.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const salt = sal ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, cod.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, cod.encode('Content-Encoding: nonce\0'), 12);

  const llaveAes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  // el 0x02 final marca que es el último (y único) bloque
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, llaveAes, unir(cod.encode(texto), Uint8Array.of(2)) as BufferSource));
  const cabecera = new Uint8Array(21);
  new DataView(cabecera.buffer).setUint32(0, 4096);
  cabecera[4] = asPublica.length;
  return unir(salt, cabecera.slice(0, 5), asPublica, cifrado);
}

/** Resultado de mandar un aviso: 'ok', 'caducada' (hay que borrar la suscripción) o 'fallo'. */
export type EstadoEnvio = 'ok' | 'caducada' | 'fallo';

export async function enviarAviso(s: Suscripcion, aviso: { titulo: string; cuerpo: string }, llaves: LlavesVapid): Promise<EstadoEnvio> {
  try {
    const r = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await cabeceraVapid(s.endpoint, llaves),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body: (await cifrarAviso(JSON.stringify(aviso), s)) as BodyInit,
    });
    if (r.ok) return 'ok';
    return r.status === 404 || r.status === 410 ? 'caducada' : 'fallo';
  } catch {
    return 'fallo';
  }
}

/** ¿Es una suscripción que el navegador nos pudo mandar? */
export function suscripcionValida(x: unknown): x is Suscripcion {
  const s = x as Suscripcion | null;
  return Boolean(
    s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 600
    && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
    && s.keys.p256dh.length < 200 && s.keys.auth.length < 50,
  );
}
