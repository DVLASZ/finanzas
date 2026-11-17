/**
 * La barra de «Deshacer»: aparece abajo ocho segundos después de guardar, editar, duplicar o anular algo, con un botón que lo
 * revierte al instante. Sirve para el desliz del momento sin abrir nada. Solo hay una a la vez: la última acción.
 */
import { signal } from '@preact/signals';
import { Undo2 } from 'lucide-preact';
import { useEffect } from 'preact/hooks';
import { vibrar } from '../../lib/haptico.ts';
import { mostrarConfirmacion } from './Confirmacion.tsx';

export const SEGUNDOS_DESHACER = 8;

interface Toast { texto: string; n: number; alDeshacer: () => Promise<void> }
const actual = signal<Toast | null>(null);
let contador = 0;
let temporizador = 0;

/** Muestra la barra. `alDeshacer` revierte la acción; si falla, la barra se cierra y se avisa en su lugar. */
export function mostrarDeshacer(texto: string, alDeshacer: () => Promise<void>): void {
  actual.value = { texto, n: ++contador, alDeshacer };
  clearTimeout(temporizador);
  temporizador = window.setTimeout(() => { actual.value = null; }, SEGUNDOS_DESHACER * 1000);
}

export const cerrarDeshacer = (): void => { clearTimeout(temporizador); actual.value = null; };

export function ToastDeshacer() {
  const t = actual.value;
  useEffect(() => () => clearTimeout(temporizador), []);
  if (!t) return null;
  const deshacer = async () => {
    cerrarDeshacer();
    vibrar(12);
    try { await t.alDeshacer(); mostrarConfirmacion('Deshecho'); } catch { mostrarConfirmacion('No se pudo deshacer'); }
  };
  return (
    <div key={t.n} id="toast-deshacer" class="toast-deshacer" role="status" aria-live="polite">
      <span class="min-w-0 flex-1 truncate">{t.texto}</span>
      <button type="button" id="deshacer-toast" class="toast-boton" onClick={() => void deshacer()}><Undo2 size={16} />Deshacer</button>
      <span class="toast-barra" aria-hidden="true" style={{ animationDuration: `${SEGUNDOS_DESHACER}s` }} />
    </div>
  );
}
