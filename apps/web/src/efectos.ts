/**
 * Efectos de la interfaz: movimiento y celebraciones. Todo respeta `prefers-reduced-motion`: si la persona
 * pidió menos movimiento, no hay animaciones ni confeti.
 */
import { animate, spring } from 'motion';
import confetti from 'canvas-confetti';

export const menosMovimiento = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Entrada suave de un elemento: aparece desde abajo con un resorte corto. */
export function entrar(el: Element, retraso = 0): void {
  if (menosMovimiento()) return;
  animate(el, { opacity: [0, 1], transform: ['translateY(10px) scale(.98)', 'translateY(0) scale(1)'] }, { type: spring, stiffness: 420, damping: 32, delay: retraso });
}

/** Confeti de celebración (arqueo que cuadra, deuda saldada, meta cumplida). */
export function celebrar(origenY = 0.7): void {
  if (menosMovimiento()) return;
  void confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 140, origin: { y: origenY }, colors: ['#10B981', '#38BDF8', '#818CF8', '#F59E0B', '#F43F5E'], disableForReducedMotion: true });
}
