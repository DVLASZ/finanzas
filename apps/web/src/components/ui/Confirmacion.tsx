/**
 * La señal de «listo»: una palomita que se dibuja sola, con un aro que se abre, en el centro de la pantalla por un
 * momento. Se usa al guardar o editar algo desde un formulario, donde antes no había más que el cierre del cajón.
 * Si la persona pidió menos movimiento, el CSS la deja quieta pero visible el mismo tiempo.
 */
import { signal } from '@preact/signals';
import { vibrar } from '../../lib/haptico.ts';

const actual = signal<{ texto: string; n: number } | null>(null);
let contador = 0;
let temporizador = 0;

/** Muestra la palomita con un texto corto («Cambios guardados»). */
export function mostrarConfirmacion(texto: string): void {
  actual.value = { texto, n: ++contador };
  vibrar([12, 30, 12]);
  clearTimeout(temporizador);
  temporizador = window.setTimeout(() => { actual.value = null; }, 1500);
}

export function Confirmacion() {
  const c = actual.value;
  if (!c) return null;
  return (
    <div key={c.n} class="confirmacion" role="status" aria-live="polite">
      <div class="confirmacion-caja">
        <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true">
          <circle class="conf-aro" cx="26" cy="26" r="23" fill="none" stroke="currentColor" stroke-width="3" />
          <path class="conf-palomita" d="M15 27.5 l8 8 l15 -17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{c.texto}</span>
      </div>
    </div>
  );
}
