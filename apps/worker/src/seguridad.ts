/**
 * Seguridad del Worker: cabeceras en todas las respuestas y límite de peticiones.
 *
 * Cabeceras: la política de contenido solo deja cargar scripts de la propia app (nada en línea), no deja que otra página meta
 * la app en un marco y no manda el origen a nadie. Los estilos en línea se permiten porque la interfaz usa el atributo `style`
 * para anchos de barras y animaciones; los scripts no.
 *
 * Límite: cuenta en la memoria del Worker (no en D1, para no gastar lecturas). Cada instancia lleva su propia cuenta, así que
 * es un freno de mejor esfuerzo contra fuerza bruta y contra gastar la cuota de la IA, no una garantía exacta. Con un token de
 * 256 bits adivinar no es realista; esto evita que alguien lo intente igual y que un script suelto se coma la cuota.
 */

export const CABECERAS_SEGURAS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** La misma respuesta con las cabeceras de seguridad (se copia: las de assets no se pueden cambiar). */
export function conCabecerasSeguras(r: Response): Response {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CABECERAS_SEGURAS)) h.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

/** Cuenta eventos por clave en una ventana de tiempo. */
export class Limitador {
  private cuentas = new Map<string, number[]>();
  private max: number;
  private ventanaMs: number;
  constructor(max: number, ventanaMs: number) { this.max = max; this.ventanaMs = ventanaMs; }

  /** Anota un evento; devuelve false si ya se pasó del máximo en la ventana. */
  anotar(clave: string, ahora = Date.now()): boolean {
    const desde = ahora - this.ventanaMs;
    const lista = (this.cuentas.get(clave) ?? []).filter(t => t > desde);
    lista.push(ahora);
    this.cuentas.set(clave, lista);
    if (this.cuentas.size > 5000) this.limpiar(desde);
    return lista.length <= this.max;
  }

  /** ¿Ya se pasó del máximo? (sin anotar nada nuevo) */
  lleno(clave: string, ahora = Date.now()): boolean {
    const desde = ahora - this.ventanaMs;
    return (this.cuentas.get(clave) ?? []).filter(t => t > desde).length >= this.max;
  }

  /** Cuántos segundos faltan para que se libere el primer cupo. */
  esperaS(clave: string, ahora = Date.now()): number {
    const primero = (this.cuentas.get(clave) ?? []).filter(t => t > ahora - this.ventanaMs)[0];
    return primero ? Math.max(1, Math.ceil((primero + this.ventanaMs - ahora) / 1000)) : 1;
  }

  reiniciar(): void { this.cuentas.clear(); }

  private limpiar(desde: number): void {
    for (const [k, v] of this.cuentas) if (!v.some(t => t > desde)) this.cuentas.delete(k);
  }
}

/** Intentos con token equivocado: 8 en 10 minutos y se bloquea esa conexión hasta que pase la ventana. */
export const intentosFallidos = new Limitador(8, 10 * 60_000);
/** Todo lo que se pide a la API: de sobra para sincronizar, poco para un script. */
export const peticiones = new Limitador(300, 60_000);
/** Lo que gasta cuota de Workers AI: la IA y la lectura de comprobantes. */
export const limiteIA = new Limitador(12, 60_000);

export const reiniciarLimites = (): void => { intentosFallidos.reiniciar(); peticiones.reiniciar(); limiteIA.reiniciar(); };

/** La conexión de quien pide (Cloudflare la pone siempre); sin ella no se limita, que es lo que pasa en las pruebas. */
export const conexionDe = (req: Request): string | null => req.headers.get('CF-Connecting-IP');

// ---------------------------------------------------------------- salidas del Worker (SSRF)

/**
 * Una dirección a la que el Worker puede llamar: solo `https`, sin usuario ni contraseña, sin puerto raro y con un nombre
 * de dominio público. Se rechazan los números de IP (incluidos `127.0.0.1`, `169.254.169.254`, `[::1]`, `2130706433` y
 * `0x7f.1`), `localhost`, los nombres sin punto y los sufijos de redes internas.
 */
export function urlPublicaHttps(texto: unknown): URL | null {
  if (typeof texto !== 'string' || texto.length > 600 || /[\u0000-\u0020\\]/.test(texto)) return null;
  let u: URL;
  try { u = new URL(texto); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.startsWith('[') || /^[\d.x]+$/i.test(h) || /^0x/i.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h) || h.endsWith('.')) return null;
  return u;
}

/** Los servicios de avisos que usan los navegadores (Chrome, Firefox, Safari, Edge). Un aviso solo sale hacia uno de estos. */
const SERVICIOS_PUSH = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function esServicioDePush(endpoint: unknown): boolean {
  const u = urlPublicaHttps(endpoint);
  return Boolean(u && SERVICIOS_PUSH.some(re => re.test(u.hostname.toLowerCase())));
}
