/**
 * Hoja rápida para registrar un pago o un abono desde «Deudas y préstamos». Muestra a quién y cuánto queda, deja el
 * monto precargado con el saldo (se puede bajar para un abono parcial) y deja elegir la cuenta. Al confirmar no
 * inventa asientos: escribe la frase natural y la manda al chat, donde sale la tarjeta de siempre para confirmar.
 * Se cierra con «atrás» como las demás hojas y sube por encima de las ventanas flotantes (z 58, bajo editar y selector).
 */
import { signal } from '@preact/signals';
import { AlertTriangle, Check, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear, hallarMontos, type Moneda } from '../../../../../packages/core/src/index.ts';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { abonoAbierto, abrirHojaAbono, atras, irA, prellenarChat } from '../../state/nav.ts';
import { datos as datosSignal } from '../../state/store.ts';
import { Selector } from './Selector.tsx';

export interface ContenidoAbono {
  nombre: string;
  /** 'debo': le pagas tú. 'me_deben': te paga esa persona. */
  direccion: 'debo' | 'me_deben';
  /** Lo que queda pendiente, en pesos o dólares (no en centavos). */
  saldo: number;
  moneda: Moneda;
}

const contenido = signal<ContenidoAbono | null>(null);

export function abrirAbono(c: ContenidoAbono): void {
  contenido.value = c;
  if (!abonoAbierto.value) abrirHojaAbono();
}

/** La frase que entiende el bot: «pagué 20000 a ana nequi» o «ana me pagó 20000 nequi» (en dólares lleva «usd»). */
export function fraseDeAbono(c: ContenidoAbono, monto: number, cuentaNombre: string): string {
  const usd = c.moneda === 'USD' ? ' usd' : '';
  const cuenta = cuentaNombre.toLowerCase();
  return c.direccion === 'debo'
    ? `pagué ${monto}${usd} a ${c.nombre} ${cuenta}`
    : `${c.nombre} me pagó ${monto}${usd} ${cuenta}`;
}

export function HojaAbono() {
  const abierto = abonoAbierto.value;
  const c = contenido.value;
  const datos = datosSignal.value;
  const hoja = useRef<HTMLDivElement>(null);
  const [monto, setMonto] = useState('');
  const [cuentaId, setCuentaId] = useState('');

  // al abrirse con otra persona se vuelve a precargar el saldo y la cuenta por defecto
  useEffect(() => {
    if (!abierto || !c || !datos) return;
    setMonto(String(c.saldo));
    const cuentas = datos.cuentas.filter(x => x.tipo === 'dinero' && x.moneda === c.moneda && x.id !== 'monedas');
    setCuentaId((cuentas.find(x => x.id === 'efectivo') ?? cuentas[0])?.id ?? '');
    if (hoja.current) subirDesdeAbajo(hoja.current);
  }, [abierto, c]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('#selector-capa, #editar, #dialogo')) atras(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto]);

  if (!abierto || !c || !datos) return null;
  const cuentas = datos.cuentas
    .filter(x => x.tipo === 'dinero' && x.moneda === c.moneda && x.id !== 'monedas')
    .map(x => ({ valor: x.id, etiqueta: x.nombre }));
  const cuenta = cuentas.find(x => x.valor === cuentaId);

  const valor = hallarMontos(monto)[0]?.valor ?? NaN;
  const decimalesMal = c.moneda === 'COP' && Number.isFinite(valor) && !Number.isInteger(valor);
  const invalido = !monto.trim() || !Number.isFinite(valor) || !(valor > 0) || decimalesMal || !cuenta;
  const pasa = !invalido && valor > c.saldo;
  const aMinor = (n: number) => (c.moneda === 'USD' ? n * 100 : n);
  const verbo = c.direccion === 'debo' ? 'pago' : 'abono';

  const confirmar = () => {
    if (invalido || !cuenta) return;
    const frase = fraseDeAbono(c, valor, cuenta.etiqueta);
    atras();
    // el historial ya retrocedió: ahora sí se pasa al chat con la tarjeta lista para confirmar
    setTimeout(() => { prellenarChat(frase, true); irA('chat'); }, 90);
  };

  return createPortal(
    <div id="hoja-abono" class="fixed inset-0 z-[58] flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) atras(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label={`Registrar ${verbo}`} class="max-h-[94%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-anillo">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0" id="abono-nombre">{c.nombre}</h3>
        <p class="sub" id="abono-saldo">{c.direccion === 'debo' ? 'Le debes' : 'Te debe'} <b class="tabular-nums">{formatear(aMinor(c.saldo), c.moneda)}</b></p>

        <div class="campo-edicion">
          <div class="etiqueta">{c.direccion === 'debo' ? 'Cuánto pagas' : 'Cuánto te abona'}</div>
          <input type="text" id="abono-monto" inputMode="decimal" value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} />
        </div>
        <div class="campo-edicion">
          <div class="etiqueta">{c.direccion === 'debo' ? 'Sale de' : 'Entra a'}</div>
          <Selector id="abono-cuenta" etiqueta="Cuenta" valor={cuentaId} alCambiar={setCuentaId} opciones={cuentas} />
        </div>

        {pasa && (
          <div class="callout" role="status" id="abono-aviso">
            <span class="callout-ico"><AlertTriangle size={16} /></span>
            <span class="callout-txt">Es más de lo que debes: quedaría a tu favor por {formatear(aMinor(valor - c.saldo), c.moneda)}. Si así es, confirma.</span>
          </div>
        )}
        {decimalesMal && <p class="sub abono-error" id="abono-error">En pesos el monto va sin decimales.</p>}

        <div class="acciones">
          <button class="primario" id="abono-confirmar" disabled={invalido} onClick={confirmar}><Check size={18} />Confirmar</button>
          <button class="secundario" id="abono-cancelar" onClick={atras}><X size={18} />Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
