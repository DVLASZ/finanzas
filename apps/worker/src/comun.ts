/**
 * Lo que comparten las rutas del Worker: el entorno, la respuesta JSON y la comparación de tokens.
 * Cada archivo de `rutas/` recibe un `Contexto` y devuelve una respuesta, o `null` si la petición no es suya.
 */
import type { D1Repo, D1Like } from './d1repo.ts';
import type { EnvBuzon } from './buzon.ts';
import type { EnvRespaldo } from './respaldo.ts';

export interface Env extends EnvRespaldo, EnvBuzon {
  DB: D1Like;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** Token que la app usa para hablar con la API (secreto). */
  API_TOKEN: string;
  /** Token opcional de solo lectura: ve los datos pero no puede escribir ni borrar (secreto). */
  API_TOKEN_LECTURA?: string;
  /** PIN para los borrados definitivos (secreto). Sin PIN el borrado queda desactivado. */
  PIN_BORRADO?: string;
  /** Workers AI (plan gratuito). Sin este binding la ayuda de la IA no existe. */
  AI?: { run(modelo: string, entrada: unknown): Promise<unknown> };
  /** Tope de ayudas de la IA por día. Por defecto 30. */
  IA_TOPE?: string;
  /** Cuánto esperar al modelo en milisegundos (por defecto 20000). Solo se cambia en pruebas. */
  IA_ESPERA_MS?: string;
  /** Otro modelo de Workers AI, si el de siempre se retira. */
  IA_MODELO?: string;
  /** Otro modelo con visión para leer comprobantes. */
  IA_OCR_MODELO?: string;
}

/** Todo lo que una ruta necesita para atender una petición ya autorizada. */
export interface Contexto { req: Request; url: URL; env: Env; repo: D1Repo }

/** Una ruta atiende lo suyo y devuelve su respuesta; si la petición no es suya, devuelve null. */
export type Ruta = (c: Contexto) => Promise<Response | null>;

export const json = (datos: unknown, status = 200): Response =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Comparación en tiempo constante (no filtra información por el tiempo de respuesta). */
export function igualesSeguro(a: string, b: string): boolean {
  // se recorre el largo del más largo y la diferencia de largos cuenta como diferencia: el tiempo no revela cuántas letras coinciden ni el largo del token
  const n = Math.max(a.length, b.length);
  let r = a.length ^ b.length;
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

export function tokenValido(req: Request, esperado: string): boolean {
  const h = req.headers.get('Authorization') ?? '';
  const dado = h.startsWith('Bearer ') ? h.slice(7) : '';
  return Boolean(esperado) && igualesSeguro(dado, esperado);
}
