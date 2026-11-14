/**
 * Selector propio en lugar del `<select>` del sistema. En el celular abre una hoja que sube desde abajo (con el
 * fondo de la app, un ícono por opción y una marca en la elegida); en pantalla ancha, un menú flotante junto al
 * botón. Entra al historial como un cajón más, así el botón atrás del teléfono lo cierra.
 */
import { signal } from '@preact/signals';
import { Check, ChevronDown } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { abrirHoja, atras, hojaAbierta } from '../../state/nav.ts';
import { Insignia, visualDeNombre, type Visual } from './iconos.tsx';

export interface Opcion { valor: string; etiqueta: string; visual?: Visual }
interface Hoja { titulo: string; opciones: Opcion[]; valor: string; elegir: (valor: string) => void; ancla: DOMRect }

const hoja = signal<Hoja | null>(null);

function abrir(h: Hoja): void {
  hoja.value = h;
  abrirHoja();
}

/** Abre la hoja con unas opciones desde un botón cualquiera (por ejemplo, «Cámara» o «Galería»). Al elegir, llama a `alElegir`. */
export function abrirOpciones(titulo: string, opciones: Opcion[], alElegir: (valor: string) => void, ancla: HTMLElement): void {
  abrir({ titulo, opciones, valor: '', elegir: alElegir, ancla: ancla.getBoundingClientRect() });
}

/** El botón que abre la hoja. Muestra la opción elegida. */
export function Selector({ id, etiqueta, valor, opciones, alCambiar }: { id?: string; etiqueta: string; valor: string; opciones: Opcion[]; alCambiar: (valor: string) => void }) {
  const actual = opciones.find(o => o.valor === valor) ?? opciones[0];
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button ref={ref} id={id} type="button" class="select-btn" aria-haspopup="listbox" aria-label={`${etiqueta}: ${actual?.etiqueta ?? ''}`} data-valor={valor}
      onClick={() => ref.current && abrir({ titulo: etiqueta, opciones, valor, elegir: alCambiar, ancla: ref.current.getBoundingClientRect() })}>
      <span>{actual?.etiqueta ?? etiqueta}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
  );
}

/** La hoja o el menú flotante. Se monta una sola vez, en `App`. */
export function HojaSelector() {
  const h = hoja.value;
  const caja = useRef<HTMLDivElement>(null);
  const abierta = hojaAbierta.value && h;
  const ancho = abierta ? matchMedia('(min-width: 640px)').matches : false;
  useEffect(() => {
    if (!abierta) return;
    if (!ancho && caja.current) subirDesdeAbajo(caja.current);
    caja.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') atras(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta]);
  if (!abierta || !h) return null;

  const elegir = (v: string) => { h.elegir(v); atras(); };
  const lista = (
    <ul role="listbox" aria-label={h.titulo} class="m-0 list-none p-1.5">
      {h.opciones.map(o => {
        const activa = o.valor === h.valor;
        return (
          <li key={o.valor} role="option" aria-selected={activa} data-valor={o.valor} tabIndex={0}
            class={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition active:scale-[.98] ${activa ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
            onClick={() => elegir(o.valor)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(o.valor); } }}>
            {o.visual && <Insignia v={o.visual} tam={32} />}
            <span class={`min-w-0 flex-1 truncate ${activa ? 'font-semibold' : ''}`}>{o.etiqueta}</span>
            {activa && <Check size={18} class="shrink-0 text-emerald-400" aria-hidden="true" />}
          </li>
        );
      })}
    </ul>
  );

  // pantalla ancha: menú flotante junto al botón (hacia arriba si abajo no cabe)
  if (ancho) {
    const r = h.ancla;
    const alto = Math.min(340, h.opciones.length * 52 + 16);
    const arriba = r.bottom + alto + 12 > innerHeight && r.top > alto;
    return createPortal(
      <div class="fixed inset-0 z-50" onClick={e => { if (e.target === e.currentTarget) atras(); }}>
        <div ref={caja} class="fixed overflow-y-auto rounded-2xl border border-white/10 bg-sup shadow-[0_20px_60px_-15px_rgba(0,0,0,.6)]"
          style={{ left: `${Math.min(r.left, innerWidth - Math.max(r.width, 260) - 8)}px`, top: arriba ? undefined : `${r.bottom + 6}px`, bottom: arriba ? `${innerHeight - r.top + 6}px` : undefined, width: `${Math.max(r.width, 260)}px`, maxHeight: '340px' }}>
          {lista}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div class="fixed inset-0 z-50 flex items-end bg-black/55 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) atras(); }}>
      <div ref={caja} class="flex max-h-[75%] w-full flex-col rounded-t-[1.6rem] border-t border-white/10 bg-sup pb-[calc(env(safe-area-inset-bottom)+.75rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-1 mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-bor" />
        <div class="shrink-0 px-5 pb-1 pt-1 text-xs font-semibold uppercase tracking-[.09em] text-tx2">{h.titulo}</div>
        <div class="min-h-0 overflow-y-auto overscroll-contain">{lista}</div>
      </div>
    </div>,
    document.body,
  );
}
