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

/** Entrada de una pantalla entera (cambio de pestaña). */
export function entrarPantalla(el: Element): void {
  if (menosMovimiento()) return;
  animate(el, { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] }, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
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
