/**
 * La ventana flotante de detalle: cualquier bloque informativo (una fila del Resumen, una cuenta de Saldos, una deuda) abre aquí lo que
 * hay detrás: los movimientos que lo forman, un cuerpo libre y las acciones rápidas. Sube con resorte, se cierra con «atrás» como una
 * hoja más y, al tocar un movimiento, abre su detalle encima sin cerrarse.
 */
import { signal } from '@preact/signals';
import { X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { describirFecha, type Movimiento } from '../../../../../packages/core/src/index.ts';
import { montoVisible } from '../../lib/montoMov.ts';
import { abrirDetalle, abrirHojaInfo, atras, infoAbierta } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { verMonto } from '../../state/privacidad.ts';
import { Insignia, visualDeMovimiento } from './iconos.tsx';

export interface AccionInfo { id: string; texto: string; icono?: ComponentChildren; alTocar: () => void }
export interface ContenidoInfo {
  /** Para las pruebas y para saber qué bloque abrió la ventana. */
  id: string;
  titulo: string;
  sub?: string;
  /** Un cuerpo libre (una comparativa, una lista de pagos), antes de los movimientos. */
  cuerpo?: ComponentChildren;
  movimientos?: Movimiento[];
  acciones?: AccionInfo[];
}

const LIMITE = 40;
export const info = signal<ContenidoInfo | null>(null);

export function abrirInfo(c: ContenidoInfo): void {
  // si ya hay una ventana abierta (una comparativa que abre una categoría), solo cambia su contenido: «atrás» sigue cerrando de una vez
  const yaAbierta = infoAbierta.value;
  info.value = c;
  if (!yaAbierta) abrirHojaInfo();
  else document.querySelector('.info-hoja')?.scrollTo(0, 0);
}

/** Cierra la ventana y, un instante después (cuando el historial ya retrocedió), hace lo que sigue: ir a otra pantalla, por ejemplo. */
export function cerrarYLuego(f: () => void): void {
  atras();
  setTimeout(f, 90);
}

/** La lista de movimientos de una ventana: cada fila abre su detalle encima. Se puede usar también dentro de un cuerpo libre (la comparativa pone dos). */
export function ListaMovimientos({ movs, id = 'info-movs', vacio = 'No hay movimientos para mostrar.' }: { movs: Movimiento[]; id?: string; vacio?: string }) {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return null;
  return (
    <>
      {movs.length === 0
        ? <p class="sub" id={`${id}-vacio`}>{vacio}</p>
        : <ul class="lista !mt-2" id={id}>
            {movs.slice(0, LIMITE).map((m, i) => {
              const v = montoVisible(m, datos.cuentas);
              return (
                <li key={m.id} class="fila fila-entra" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} data-id={m.id} onClick={() => abrirDetalle(m.id)}>
                  <div class="flex min-w-0 items-center gap-3">
                    <Insignia v={visualDeMovimiento(m, datos.cuentas)} tam={38} />
                    <div class="min-w-0"><div class="titulo">{m.descripcion}</div><div class="sub">{describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora)}</div></div>
                  </div>
                  <div class={`monto tabular-nums ${v.clase}`}>{v.texto ? verMonto(v.texto) : ''}</div>
                </li>
              );
            })}
          </ul>}
      {movs.length > LIMITE && <p class="sub">Y {movs.length - LIMITE} más. Míralos todos en Movimientos.</p>}
    </>
  );
}

export function HojaInfo() {
  const abierta = infoAbierta.value;
  const [montada, setMontada] = useState<ContenidoInfo | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const hoja = useRef<HTMLDivElement>(null);
  const datos = datosSignal.value;
  const ctx = contexto.value;

  // al cerrarse, la hoja se queda un instante para poder bajar con animación
  useEffect(() => {
    if (abierta && info.value) { setMontada(info.value); setSaliendo(false); return; }
    if (!abierta && montada) {
      setSaliendo(true);
      const t = window.setTimeout(() => { setMontada(null); setSaliendo(false); }, 260);
      return () => window.clearTimeout(t);
    }
  }, [abierta, info.value]);
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('#detalle, #editar, #duplicar, #dialogo, #selector-capa')) atras(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta]);

  if (!montada || !datos || !ctx) return null;
  const c = montada;
  const movs = c.movimientos ?? [];
  return createPortal(
    <div id="info" class={`fixed inset-0 z-[54] flex items-end justify-center bg-black/55 backdrop-blur-[2px] ${saliendo ? 'saliendo' : ''}`} data-info={c.id} onClick={e => { if (e.target === e.currentTarget) atras(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label={c.titulo} class="info-hoja max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-anillo">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0">{c.titulo}</h3>
        {c.sub && <p class="sub">{c.sub}</p>}
        {c.cuerpo}
        {c.movimientos && <ListaMovimientos movs={movs} />}
        <div class="acciones">
          {(c.acciones ?? []).map(a => <button key={a.id} id={a.id} class="secundario" onClick={a.alTocar}>{a.icono}{a.texto}</button>)}
          <button class="secundario" id="info-cerrar" onClick={atras}><X size={18} />Cerrar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
