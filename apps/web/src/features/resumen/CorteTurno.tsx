/**
 * Corte de turno (apps que venden): el resumen del día o de la semana con ventas, gastos, utilidad neta y lo que se está
 * acabando. Se puede compartir como texto o imprimir. Las cuentas están en el núcleo (`corteDeTurno`).
 */
import { signal } from '@preact/signals';
import { ClipboardList, Printer, Share2, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { corteDeTurno, textoCorte } from '../../../../../packages/core/src/index.ts';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { mostrarConfirmacion } from '../../components/ui/Confirmacion.tsx';

const abierto = signal<'dia' | 'semana' | null>(null);

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function BotonesCorte() {
  return (
    <section class="tarjeta" id="corte-turno" aria-label="Corte de turno">
      <h3 class="!mt-0 flex items-center gap-1.5"><ClipboardList size={14} />Corte de turno</h3>
      <p class="sub !mt-0">Ventas, gastos, utilidad neta y lo que se está acabando, listo para compartir o imprimir.</p>
      <div class="acciones">
        <button class="primario" id="corte-dia" onClick={() => { abierto.value = 'dia'; }}>Corte de hoy</button>
        <button class="secundario" id="corte-semana" onClick={() => { abierto.value = 'semana'; }}>Corte de la semana</button>
      </div>
    </section>
  );
}

export function HojaCorte() {
  const periodo = abierto.value;
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const hoja = useRef<HTMLDivElement>(null);
  useEffect(() => { if (periodo && hoja.current) subirDesdeAbajo(hoja.current); }, [periodo]);
  if (!periodo || !datos || !ctx) return null;
  const cerrar = () => { abierto.value = null; };
  const texto = textoCorte(corteDeTurno(datos, ctx.ahora, periodo), document.title);
  const compartir = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: document.title, text: texto }); return; }
      await navigator.clipboard.writeText(texto);
      mostrarConfirmacion('Corte copiado');
    } catch { /* se canceló */ }
  };
  const imprimir = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(document.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;white-space:pre-wrap;line-height:1.5}</style></head><body>${esc(texto)}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  return createPortal(
    <div id="corte" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Corte de turno" class="cristal max-h-[92%] w-full max-w-md overflow-y-auto rounded-t-[1.8rem] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <pre id="corte-texto" class="whitespace-pre-wrap break-words font-[inherit] text-[.95rem] leading-relaxed">{texto}</pre>
        <div class="acciones">
          <button class="primario" id="corte-compartir" onClick={() => void compartir()}><Share2 size={18} />Compartir</button>
          <button class="secundario" id="corte-imprimir" onClick={imprimir}><Printer size={18} />Imprimir</button>
          <button class="secundario" id="corte-cerrar" onClick={cerrar}><X size={18} />Cerrar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
