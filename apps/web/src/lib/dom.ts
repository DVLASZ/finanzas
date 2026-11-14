export const $ = <T extends HTMLElement>(raiz: ParentNode, sel: string): T => raiz.querySelector(sel) as T;

const puestos = new WeakMap<HTMLElement, Map<string, EventListener>>();

/**
 * Como `cont.addEventListener`, pero deja un solo handler por tipo de evento en ese contenedor. Las pantallas de HTML
 * a mano se vuelven a dibujar sobre el mismo contenedor: sin esto, cada dibujo apilaba otro handler y una acción
 * (un clic en «Renombrar») disparaba varios `prompt()` seguidos.
 */
export function escuchar(cont: HTMLElement, tipo: string, fn: (e: Event) => unknown): void {
  const mapa = puestos.get(cont) ?? new Map<string, EventListener>();
  const anterior = mapa.get(tipo);
  if (anterior) cont.removeEventListener(tipo, anterior);
  const nuevo: EventListener = e => { void fn(e); };
  cont.addEventListener(tipo, nuevo);
  mapa.set(tipo, nuevo);
  puestos.set(cont, mapa);
}
