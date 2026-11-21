/**
 * Efectos de la interfaz: movimiento y celebraciones. Usa `motion/mini` (animaciones web del navegador,
 * unos pocos KB). Todo respeta `prefers-reduced-motion`: si la persona pidió menos movimiento, no hay
 * animaciones ni confeti.
 */
import { animate } from 'motion/mini';
import confetti from 'canvas-confetti';

export const menosMovimiento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Una curva con un pequeño rebote al final, parecida a un resorte. */
export const RESORTE = [0.22, 1.2, 0.36, 1] as const;

/** Entrada suave de un elemento: aparece desde abajo. `retraso` en segundos sirve para escalonar una lista. */
export function entrar(el: Element, retraso = 0): void {
  if (menosMovimiento()) return;
  animate(el, { opacity: [0, 1], transform: ['translateY(12px) scale(.985)', 'translateY(0) scale(1)'] }, { duration: 0.42, delay: retraso, ease: RESORTE });
}

/** Entrada de una pantalla entera (cambio de pestaña). `dir` es hacia dónde se va: 1 a la derecha, -1 a la izquierda, 0 sin lado. */
export function entrarPantalla(el: Element, dir = 0): void {
  if (menosMovimiento()) return;
  const x = dir * 22;
  animate(el, { opacity: [0, 1], transform: [`translateX(${x}px) translateY(${dir ? 0 : 8}px)`, 'translate(0, 0)'] }, { duration: 0.28, ease: [0.22, 1, 0.36, 1] });
}

/** Una marca de tiempo corta en una clase del <html>, para transiciones que solo valen durante un instante (cambio de tema, revelar cifras). */
export function momentanea(clase: string, ms = 450): void {
  if (menosMovimiento()) return;
  const h = document.documentElement;
  h.classList.add(clase);
  window.setTimeout(() => h.classList.remove(clase), ms);
}

/** Una onda que sale de un botón y cruza toda la pantalla, para marcar un cambio general (el modo privado). */
export function ondaDesde(origen: Element): void {
  if (menosMovimiento()) return;
  const r = origen.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const radio = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  const onda = document.createElement('div');
  onda.className = 'onda-privacidad';
  Object.assign(onda.style, { left: `${cx - radio}px`, top: `${cy - radio}px`, width: `${radio * 2}px`, height: `${radio * 2}px` });
  document.body.appendChild(onda);
  animate(onda, { transform: ['scale(.03)', 'scale(1)'], opacity: [0.55, 0] }, { duration: 0.7, ease: [0.22, 1, 0.36, 1] });
  window.setTimeout(() => onda.remove(), 800);
}

/** Las tarjetas y filas que se ven en pantalla pasan de borrosas a nítidas una tras otra, como cuando se revelan las cifras. */
export function desenfocarCifras(): void {
  if (menosMovimiento()) return;
  const piezas = [...document.querySelectorAll<HTMLElement>('#contenido .tarjeta, #contenido .fila, #contenido .alerta')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !e.parentElement?.closest('.tarjeta'); })
    .slice(0, 24);
  piezas.forEach((e, i) => animate(e, { filter: ['blur(8px)', 'blur(0px)'], opacity: [0.4, 1] }, { duration: 0.5, delay: i * 0.035, ease: [0.22, 1, 0.36, 1] }));
}

/** Un cuadro de ayuda que sube desde abajo (el detalle de un movimiento). */
export function subirDesdeAbajo(el: Element): void {
  if (menosMovimiento()) return;
  animate(el, { transform: ['translateY(100%)', 'translateY(0)'] }, { duration: 0.38, ease: [0.22, 1, 0.36, 1] });
}

/** Rebote corto al tocar (confirmaciones, favoritos). */
export function rebote(el: Element): void {
  if (menosMovimiento()) return;
  animate(el, { transform: ['scale(1)', 'scale(1.12)', 'scale(1)'] }, { duration: 0.35 });
}

/** Confeti de celebración (arqueo que cuadra, deuda saldada, meta cumplida). */
export function celebrar(origenY = 0.7): void {
  if (menosMovimiento()) return;
  void confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 140, origin: { y: origenY }, colors: ['#10B981', '#38BDF8', '#818CF8', '#F59E0B', '#F43F5E'], disableForReducedMotion: true, zIndex: 100 });
}

/** Cuenta de 0 al valor final en un par de décimas (números grandes que «llegan»). Devuelve cómo cancelarla. */
export function contar(hasta: number, alCambiar: (v: number) => void, duracionMs = 700): () => void {
  if (menosMovimiento() || !Number.isFinite(hasta) || Math.abs(hasta) < 2) { alCambiar(hasta); return () => {}; }
  const inicio = performance.now();
  let id = 0;
  const paso = (t: number) => {
    const x = Math.min(1, (t - inicio) / duracionMs);
    const suave = 1 - Math.pow(1 - x, 3);
    alCambiar(Math.round(hasta * suave));
    if (x < 1) id = requestAnimationFrame(paso);
  };
  id = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(id);
}
