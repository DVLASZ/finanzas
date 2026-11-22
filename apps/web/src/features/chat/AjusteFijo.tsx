/**
 * Hoja corta para ajustar el monto de un pago fijo antes de anotarlo: hay cobros que cambian cada mes (Claude, en dólares,
 * con la TRM del día). El monto viene precargado; si la cuenta es de dólares se queda en dólares, sin pasar a pesos.
 * Confirmar manda al chat la frase del pago fijo con el monto elegido, y de ahí sale la tarjeta de siempre. Como la frase
 * conserva el concepto del pago fijo, al guardarla cuenta como pagado del mes (así lo ve `yaRegistrado`).
 */
import { Check, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ajusteDeFijo, formatear, fraseConMonto, hallarMontos, type Recurrente } from '../../../../../packages/core/src/index.ts';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { ctx as contexto } from '../../state/store.ts';

export function AjusteFijo({ fijo, alConfirmar, alCerrar }: { fijo: Recurrente; alConfirmar: (frase: string) => void; alCerrar: () => void }) {
  const ctx = contexto.value;
  const hoja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const ajuste = ctx ? ajusteDeFijo(fijo, ctx) : { monto: fijo.monto, moneda: 'COP' as const, cuentaNombre: undefined };
  const [texto, setTexto] = useState(String(ajuste.monto));

  useEffect(() => {
    if (hoja.current) subirDesdeAbajo(hoja.current);
    campo.current?.select();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const valor = hallarMontos(texto)[0]?.valor ?? NaN;
  const decimalesMal = ajuste.moneda === 'COP' && Number.isFinite(valor) && !Number.isInteger(valor);
  const invalido = !texto.trim() || !Number.isFinite(valor) || !(valor > 0) || decimalesMal;
  const confirmar = () => { if (!invalido) alConfirmar(fraseConMonto(fijo, valor)); };
  const mostrado = ajuste.moneda === 'USD' ? formatear(Math.round(ajuste.monto * 100), 'USD') : formatear(ajuste.monto);

  return createPortal(
    <div id="hoja-fijo" class="fixed inset-0 z-[58] flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label={`Pagar ${fijo.concepto}`} class="max-h-[94%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-anillo">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0" id="fijo-nombre">{fijo.concepto}</h3>
        <p class="sub" id="fijo-detalle">Lo habitual es <b class="tabular-nums">{mostrado}</b>{ajuste.cuentaNombre ? ` desde ${ajuste.cuentaNombre}` : ''}. Si hoy cambió, ajústalo.</p>
        <form onSubmit={e => { e.preventDefault(); confirmar(); }}>
          <div class="campo-edicion">
            <div class="etiqueta">{ajuste.moneda === 'USD' ? 'Monto en dólares (USD)' : 'Monto'}</div>
            <input ref={campo} type="text" id="fijo-monto" inputMode="decimal" autoComplete="off" value={texto} onInput={e => setTexto((e.target as HTMLInputElement).value)} />
          </div>
          {decimalesMal && <p class="sub abono-error" id="fijo-error" role="alert">En pesos el monto va sin decimales.</p>}
          {ajuste.moneda === 'USD' && <p class="sub">Se queda en dólares: no lo paso a pesos.</p>}
          <div class="acciones">
            <button type="submit" class="primario" id="fijo-confirmar" disabled={invalido}><Check size={18} />Confirmar</button>
            <button type="button" class="secundario" id="fijo-cancelar" onClick={alCerrar}><X size={18} />Cancelar</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
