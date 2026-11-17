/**
 * Duplicar un movimiento: se muestra cómo quedaría el nuevo (con la fecha de hoy) y los avisos, y una sola confirmación.
 * Lo que arma el nuevo movimiento es `previsualizarDuplicado` (núcleo); aquí solo se muestra y se pide el «sí».
 */
import { signal } from '@preact/signals';
import { AlertTriangle, Check, Copy, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { aLocal, aplicarDuplicado, previsualizarDuplicado } from '../../../../../packages/core/src/index.ts';
import { mostrarConfirmacion } from '../../components/ui/Confirmacion.tsx';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { app } from '../../services/estado.ts';
import { anotarActividad } from '../../services/actividad.ts';
import { mostrarDeshacer } from '../../components/ui/ToastDeshacer.tsx';
import { guardarCambio } from '../../state/acciones.ts';
import { atras, detalle } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

/** El movimiento que se quiere duplicar. */
export const duplicandoId = signal<string | null>(null);

export function DuplicarMovimiento() {
  const id = duplicandoId.value;
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const hoja = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setError(''); setGuardando(false); if (id && hoja.current) subirDesdeAbajo(hoja.current); }, [id]);
  useEffect(() => { if (id && detalle.value !== id) duplicandoId.value = null; }, [id, detalle.value]);
  if (!id || !datos || !ctx) return null;
  const prev = previsualizarDuplicado(datos, ctx.ahora, id);
  const cerrar = () => { duplicandoId.value = null; };

  const duplicar = async () => {
    setGuardando(true); setError('');
    try {
      let nuevoId = '';
      await guardarCambio(async () => { nuevoId = await aplicarDuplicado(app.repo, new Date(), id); anotarActividad('duplicado', 'Se duplicó un movimiento'); });
      cerrar();
      atras(); // cierra también el detalle: el movimiento nuevo ya está en la lista, con la fecha de hoy
      mostrarConfirmacion('Movimiento duplicado');
      mostrarDeshacer('Movimiento duplicado', () => guardarCambio(() => app.repo.anularMovimiento(nuevoId, aLocal(new Date()))));
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  };

  return createPortal(
    <div id="duplicar" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Duplicar movimiento" class="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        {prev.ok ? <>
          <h3 class="!mt-0">Duplicar este movimiento</h3>
          <p class="sub">Se crea uno nuevo, igual a este pero con la fecha de hoy. El original no cambia.</p>
          <ul class="lista" id="d-resumen">
            {prev.resumen.map((r, i) => <li key={i} class="fila" style={{ cursor: 'default' }}><span class={i === 0 ? 'titulo' : 'sub'}>{r}</span></li>)}
          </ul>
          {prev.avisos.length > 0 && (
            <div class="callout" id="d-avisos"><span class="callout-ico text-adv"><AlertTriangle size={16} /></span><span class="callout-txt">{prev.avisos.map(a => <span key={a} class="block">{a}</span>)}</span></div>
          )}
          {error && <p class="sub text-neg" role="alert">{error}</p>}
          <div class="acciones">
            <button class="primario" id="d-confirmar" disabled={guardando} onClick={() => void duplicar()}><Copy size={18} />{guardando ? 'Guardando...' : 'Sí, duplicar'}</button>
            <button class="secundario" id="d-cancelar" disabled={guardando} onClick={cerrar}><X size={18} />Cancelar</button>
          </div>
        </> : <>
          <h3 class="!mt-0">Este movimiento no se puede duplicar</h3>
          <p class="sub">{prev.motivo}</p>
          <div class="acciones"><button class="secundario" id="d-cancelar" onClick={cerrar}><Check size={18} />Entendido</button></div>
        </>}
      </div>
    </div>,
    document.body,
  );
}
