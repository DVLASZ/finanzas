/**
 * Mini-contador de billetes: tocas + por cada billete que tienes y la app suma. Es para el cuadre rápido del efectivo: más
 * fácil que sumar de cabeza. Las monedas se escriben como un total aparte (en la app van en su propia cuenta).
 */
import { signal } from '@preact/signals';
import { Check, Minus, Pencil, Plus, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear } from '../../../../../packages/core/src/index.ts';
import { subirDesdeAbajo } from '../../lib/efectos.ts';

export const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000] as const;

export interface ConteoEfectivo { billetes: number; monedas: number; escritoAMano: boolean }

interface Pedido { resolver: (c: ConteoEfectivo | null) => void }
const pedido = signal<Pedido | null>(null);

/** Abre el contador y espera. Devuelve lo contado, o null si se cancela. */
export const contarEfectivo = (): Promise<ConteoEfectivo | null> => new Promise(resolver => { pedido.value = { resolver }; });

/** Lo contado, en pesos, a partir de cuántos billetes hay de cada uno (por el orden de BILLETES). */
export const sumarBilletes = (cuantos: number[]): number => cuantos.reduce((s, n, i) => s + n * BILLETES[i], 0);

export function ContadorEfectivo() {
  const actual = pedido.value;
  const hoja = useRef<HTMLDivElement>(null);
  const [cuantos, setCuantos] = useState<number[]>(BILLETES.map(() => 0));
  const [monedas, setMonedas] = useState('');
  useEffect(() => { if (actual) { setCuantos(BILLETES.map(() => 0)); setMonedas(''); if (hoja.current) subirDesdeAbajo(hoja.current); } }, [actual]);
  if (!actual) return null;
  const cerrar = (c: ConteoEfectivo | null) => { actual.resolver(c); pedido.value = null; };
  const total = sumarBilletes(cuantos);
  const cambiar = (i: number, d: number) => setCuantos(prev => prev.map((n, k) => (k === i ? Math.max(0, Math.min(999, n + d)) : n)));
  const sueltas = Number(monedas.replace(/\D/g, '')) || 0;

  return createPortal(
    <div id="contador" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) cerrar(null); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(null); } }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Contar el efectivo" class="cristal max-h-[94%] w-full max-w-md overflow-y-auto rounded-t-[1.8rem] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0 !normal-case !tracking-normal !text-tx !text-base">Cuenta tu efectivo</h3>
        <p class="sub !mt-0">Toca + por cada billete que tienes. La app suma.</p>
        <ul class="lista !mt-2" id="contador-lista">
          {BILLETES.map((b, i) => (
            <li key={b} class="fila" style={{ cursor: 'default' }}>
              <span class="min-w-0"><b class="tabular-nums">{formatear(b)}</b><span class="sub block !text-xs">{cuantos[i] > 0 ? `${cuantos[i]} = ${formatear(cuantos[i] * b)}` : 'ninguno'}</span></span>
              <span class="flex shrink-0 items-center gap-1.5">
                <button type="button" class="secundario !min-h-10 !min-w-10 !px-0" aria-label={`Quitar un billete de ${formatear(b)}`} disabled={cuantos[i] === 0} onClick={() => cambiar(i, -1)}><Minus size={16} /></button>
                <span key={cuantos[i]} class={`w-8 text-center text-lg font-bold tabular-nums ${cuantos[i] > 0 ? "salta" : ""}`} data-billete={b}>{cuantos[i]}</span>
                <button type="button" class="primario !min-h-10 !min-w-10 !px-0" aria-label={`Agregar un billete de ${formatear(b)}`} data-mas={b} onClick={() => cambiar(i, 1)}><Plus size={16} /></button>
              </span>
            </li>
          ))}
        </ul>
        <label>Monedas sueltas, el total (opcional)<input id="contador-monedas" type="text" inputMode="numeric" placeholder="Ej.: 4500" value={monedas} onInput={e => setMonedas((e.target as HTMLInputElement).value)} /></label>
        <div class="my-3 flex items-baseline justify-between gap-3">
          <span class="etiqueta">Billetes</span>
          <b id="contador-total" class="text-[1.8rem] font-extrabold tabular-nums">{formatear(total)}</b>
        </div>
        <div class="acciones">
          <button type="button" class="primario" id="contador-usar" onClick={() => cerrar({ billetes: total, monedas: sueltas, escritoAMano: false })}><Check size={18} />Usar este total</button>
          <button type="button" class="secundario" id="contador-mano" onClick={() => cerrar({ billetes: -1, monedas: 0, escritoAMano: true })}><Pencil size={18} />Escribir el total</button>
          <button type="button" class="secundario" id="contador-cancelar" onClick={() => cerrar(null)}><X size={18} />Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
