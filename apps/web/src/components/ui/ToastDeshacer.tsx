/**
 * El aviso de «Deshacer»: una píldora arriba de la pantalla ocho segundos después de guardar, editar, duplicar o anular algo,
 * con un botón que lo revierte al instante. Está arriba para no tapar la caja de escribir ni la barra de abajo. Se cierra con la
 * equis o deslizándolo hacia arriba. Solo hay una a la vez: la última acción.
 */
import { signal } from '@preact/signals';
import { Undo2, X } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { vibrar } from '../../lib/haptico.ts';
import { mostrarConfirmacion } from './Confirmacion.tsx';

export const SEGUNDOS_DESHACER = 8;

interface Toast { texto: string; n: number; alDeshacer: () => Promise<void>; saliendo?: boolean }
const actual = signal<Toast | null>(null);
let contador = 0;
let temporizador = 0;
let salida = 0;

/** Muestra el aviso. `alDeshacer` revierte la acción; si falla, el aviso se cierra y se avisa en su lugar. */
export function mostrarDeshacer(texto: string, alDeshacer: () => Promise<void>): void {
  clearTimeout(salida);
  actual.value = { texto, n: ++contador, alDeshacer };
  clearTimeout(temporizador);
  temporizador = window.setTimeout(cerrarDeshacer, SEGUNDOS_DESHACER * 1000);
}

/** Lo cierra deslizándolo hacia arriba (220 ms) y después lo quita del todo. */
export function cerrarDeshacer(): void {
  clearTimeout(temporizador);
  const t = actual.value;
  if (!t || t.saliendo) return;
  actual.value = { ...t, saliendo: true };
  salida = window.setTimeout(() => { if (actual.value?.saliendo) actual.value = null; }, 220);
}

export function ToastDeshacer() {
  const t = actual.value;
  const el = useRef<HTMLDivElement>(null);
  const y0 = useRef<number | null>(null);
  useEffect(() => () => { clearTimeout(temporizador); clearTimeout(salida); }, []);
  if (!t) return null;
  const deshacer = async () => {
    cerrarDeshacer();
    vibrar(12);
    try { await t.alDeshacer(); mostrarConfirmacion('Deshecho'); } catch { mostrarConfirmacion('No se pudo deshacer'); }
  };
  // arrastrar hacia arriba: sigue al dedo y, pasados 36 px, se cierra
  const mover = (e: PointerEvent) => {
    if (y0.current === null || !el.current) return;
    el.current.style.transform = `translateY(${Math.min(0, e.clientY - y0.current)}px)`;
  };
  const soltar = (e: PointerEvent) => {
    if (y0.current === null || !el.current) return;
    const dy = e.clientY - y0.current;
    y0.current = null;
    el.current.style.transform = '';
    if (dy < -36) cerrarDeshacer();
  };
  return (
    <div key={t.n} ref={el} id="toast-deshacer" class={`toast-deshacer ${t.saliendo ? 'saliendo' : ''}`} role="status" aria-live="polite"
      onPointerDown={e => { y0.current = e.clientY; }} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      <span class="min-w-0 flex-1 truncate">{t.texto}</span>
      <button type="button" id="deshacer-toast" class="toast-boton" onClick={() => void deshacer()}><Undo2 size={16} />Deshacer</button>
      <button type="button" id="cerrar-toast" class="toast-x" aria-label="Cerrar el aviso" onClick={cerrarDeshacer}><X size={16} /></button>
      <span class="toast-barra" aria-hidden="true" style={{ animationDuration: `${SEGUNDOS_DESHACER}s` }} />
    </div>
  );
}
