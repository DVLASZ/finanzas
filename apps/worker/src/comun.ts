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
  /** Otro modelo de Workers AI, si el de siempre se retira. */
  IA_MODELO?: string;
}

/** Todo lo que una ruta necesita para atender una petición ya autorizada. */
export interface Contexto { req: Request; url: URL; env: Env; repo: D1Repo }

/** Una ruta atiende lo suyo y devuelve su respuesta; si la petición no es suya, devuelve null. */
export type Ruta = (c: Contexto) => Promise<Response | null>;

export const json = (datos: unknown, status = 200): Response =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Comparación en tiempo constante (no filtra información por el tiempo de respuesta). */
export function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function tokenValido(req: Request, esperado: string): boolean {
  const h = req.headers.get('Authorization') ?? '';
  const dado = h.startsWith('Bearer ') ? h.slice(7) : '';
  return Boolean(esperado) && igualesSeguro(dado, esperado);
}
