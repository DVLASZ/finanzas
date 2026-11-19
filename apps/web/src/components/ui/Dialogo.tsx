/**
 * Los cuadros de diálogo de la app, en lugar de los del navegador («...workers.dev dice»), que rompen el diseño y no
 * respetan el tema ni la letra grande. Se usan como funciones que esperan la respuesta:
 *
 *   if (await confirmar({ titulo: '¿Anular este movimiento?', aceptar: 'Sí, anular', peligro: true })) { ... }
 *   await avisar('Ya tienes una categoría con ese nombre.');
 *   const nombre = await pedir({ titulo: 'Nuevo nombre', valor: actual });   // null si se cancela
 *
 * `<Dialogo />` se monta una sola vez en `App`. Si piden varios a la vez, salen uno tras otro.
 */
import { signal } from '@preact/signals';
import { AlertTriangle, CircleHelp, Info, KeyRound, Pencil } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { vibrar } from '../../lib/haptico.ts';

type Tono = 'normal' | 'peligro' | 'info';

export interface OpcionesConfirmar {
  titulo: string;
  texto?: string;
  aceptar?: string;
  cancelar?: string;
  /** Lo que sigue es difícil de deshacer: el botón de aceptar va en rojo y lleva el ícono de advertencia. */
  peligro?: boolean;
}
export interface OpcionesPedir {
  titulo: string;
  texto?: string;
  valor?: string;
  placeholder?: string;
  aceptar?: string;
  /** 'clave' esconde lo que se escribe (un PIN); 'numero' abre el teclado numérico. */
  tipo?: 'texto' | 'clave' | 'numero';
}

type Pedido =
  | { clase: 'confirmar'; o: OpcionesConfirmar; resolver: (v: boolean) => void }
  | { clase: 'avisar'; titulo: string; texto?: string; tono: Tono; resolver: () => void }
  | { clase: 'pedir'; o: OpcionesPedir; resolver: (v: string | null) => void };

const cola = signal<Pedido[]>([]);

function encolar(p: Pedido): void {
  cola.value = [...cola.value, p];
  vibrar(10);
}

export const confirmar = (o: OpcionesConfirmar): Promise<boolean> => new Promise(resolver => encolar({ clase: 'confirmar', o, resolver }));

/** Un aviso con un solo botón. Si es un texto largo, el primero es el título y el resto va debajo. */
export function avisar(mensaje: string | { titulo: string; texto?: string; tono?: Tono }): Promise<void> {
  const o = typeof mensaje === 'string' ? { titulo: mensaje } : mensaje;
  return new Promise(resolver => encolar({ clase: 'avisar', titulo: o.titulo, texto: o.texto, tono: o.tono ?? 'info', resolver }));
}

/** Pide un texto. Devuelve lo escrito, o null si la persona cancela. */
export const pedir = (o: OpcionesPedir): Promise<string | null> => new Promise(resolver => encolar({ clase: 'pedir', o, resolver }));

export function Dialogo() {
  const actual = cola.value[0];
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [escrito, setEscrito] = useState('');

  useEffect(() => {
    if (!actual) return;
    setEscrito(actual.clase === 'pedir' ? actual.o.valor ?? '' : '');
    // el foco va al cuadro de texto, o al botón principal, para poder contestar con el teclado
    const id = requestAnimationFrame(() => (campo.current ?? caja.current?.querySelector<HTMLElement>('[data-principal]'))?.focus());
    return () => cancelAnimationFrame(id);
  }, [actual]);

  if (!actual) return null;
  const cerrar = (valor: boolean | string | null) => {
    if (actual.clase === 'confirmar') actual.resolver(Boolean(valor));
    else if (actual.clase === 'avisar') actual.resolver();
    else actual.resolver(typeof valor === 'string' ? valor : null);
    cola.value = cola.value.slice(1);
  };
  const cancelar = () => cerrar(actual.clase === 'pedir' ? null : false);
  const peligro = (actual.clase === 'confirmar' && actual.o.peligro) || (actual.clase === 'avisar' && actual.tono === 'peligro');
  const Icono = actual.clase === 'pedir' ? (actual.o.tipo === 'clave' ? KeyRound : Pencil) : peligro ? AlertTriangle : actual.clase === 'confirmar' ? CircleHelp : Info;
  const titulo = actual.clase === 'confirmar' ? actual.o.titulo : actual.clase === 'pedir' ? actual.o.titulo : actual.titulo;
  const texto = actual.clase === 'confirmar' ? actual.o.texto : actual.clase === 'pedir' ? actual.o.texto : actual.texto;

  return createPortal(
    <div id="dialogo" class="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-[3px] sm:items-center"
      onClick={e => { if (e.target === e.currentTarget && actual.clase !== 'avisar') cancelar(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelar(); } }}>
      <form ref={caja} role="alertdialog" aria-modal="true" aria-label={titulo}
        class={`dialogo-hoja w-full max-w-md rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)] sm:rounded-[1.8rem] sm:pb-5 ${peligro ? 'dialogo-peligro' : ''}`}
        onSubmit={e => { e.preventDefault(); cerrar(actual.clase === 'pedir' ? escrito : true); }}>
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor sm:hidden" />
        <div class="flex items-start gap-3">
          <span class={`dialogo-icono grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${peligro ? 'bg-neg/15 text-neg' : 'bg-marca/15 text-marca-tx'}`}><Icono size={22} /></span>
          <div class="min-w-0 flex-1">
            <h3 class="dialogo-titulo !m-0 !text-base !normal-case !tracking-normal !text-tx">{titulo}</h3>
            {texto && <p class="sub !mt-1.5 whitespace-pre-line">{texto}</p>}
          </div>
        </div>
        {actual.clase === 'pedir' && (
          <input ref={campo} class="!mt-3" type={actual.o.tipo === 'clave' ? 'password' : 'text'} inputMode={actual.o.tipo === 'numero' ? 'numeric' : undefined}
            autocomplete="off" placeholder={actual.o.placeholder} aria-label={titulo} value={escrito} onInput={e => setEscrito((e.target as HTMLInputElement).value)} />
        )}
        <div class="acciones !mt-4">
          {actual.clase === 'avisar'
            ? <button type="submit" class="primario" data-principal id="dialogo-aceptar">Entendido</button>
            : <>
              <button type="submit" class={peligro ? 'peligro-lleno' : 'primario'} data-principal id="dialogo-aceptar">
                {actual.clase === 'confirmar' ? actual.o.aceptar ?? 'Aceptar' : actual.o.aceptar ?? 'Aceptar'}
              </button>
              <button type="button" class="secundario" id="dialogo-cancelar" onClick={cancelar}>{actual.clase === 'confirmar' ? actual.o.cancelar ?? 'Cancelar' : 'Cancelar'}</button>
            </>}
        </div>
      </form>
    </div>,
    document.body,
  );
}
