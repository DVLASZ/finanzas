/**
 * El cascarón de la app: sin cabecera (todo el alto es para la pantalla), la pantalla que toca (con transición) y la barra de abajo
 * flotante con un indicador que se desliza entre las cinco secciones. En pantalla ancha la barra pasa a un lado.
 */
import { BarChart3, MessageCircle, MoreHorizontal, Receipt, WalletCards } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { enBarra, irA, pantalla, type Pantalla } from './state/nav.ts';
import { datos, estadoSync, pendientes } from './state/store.ts';
import { entrarPantalla } from './lib/efectos.ts';
import { HojaSelector } from './components/ui/Selector.tsx';
import { Confirmacion } from './components/ui/Confirmacion.tsx';
import { Dialogo } from './components/ui/Dialogo.tsx';
import { AvisoSync } from './components/ui/EstadoSync.tsx';
import { BotonOjo } from './components/ui/BotonOjo.tsx';
import { EditorAtajos } from './features/chat/EditorAtajos.tsx';
import { Bloqueo } from './features/ajustes/Bloqueo.tsx';
import { ToastDeshacer } from './components/ui/ToastDeshacer.tsx';
import { ContadorEfectivo } from './features/saldos/ContadorEfectivo.tsx';
import { Chat } from './features/chat/Chat.tsx';
import { Saldos } from './features/saldos/Saldos.tsx';
import { DetalleGlobal, Movimientos } from './features/movimientos/Movimientos.tsx';
import { HojaInfo } from './components/ui/HojaInfo.tsx';
import { Resumen } from './features/resumen/Resumen.tsx';
import { Mas, Subvista } from './features/mas/Mas.tsx';

const BARRA: { id: Pantalla; nombre: string; corto?: string; Icono: typeof MessageCircle }[] = [
  { id: 'chat', nombre: 'Chat', Icono: MessageCircle },
  { id: 'saldos', nombre: 'Saldos', Icono: WalletCards },
  { id: 'movimientos', nombre: 'Movimientos', corto: 'Movim.', Icono: Receipt },
  { id: 'resumen', nombre: 'Resumen', Icono: BarChart3 },
  { id: 'mas', nombre: 'Más', Icono: MoreHorizontal },
];

function Barra() {
  const activa = enBarra(pantalla.value);
  const nav = useRef<HTMLElement>(null);
  // con letra muy grande «Movimientos» pisa a la pestaña de al lado: se mide y, si no cabe, se usa la forma corta
  const [apretada, setApretada] = useState(false);
  useEffect(() => {
    const medir = () => {
      const botones = [...(nav.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      setApretada(!botones.every(b => { const l = b.querySelector<HTMLElement>('.lbl-largo'); return !l || l.scrollWidth <= b.clientWidth - 4; }));
    };
    medir();
    void document.fonts?.ready.then(medir);
    window.addEventListener('resize', medir);
    window.addEventListener('apariencia', medir);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('apariencia', medir); };
  }, []);
  const i = Math.max(0, BARRA.findIndex(b => b.id === activa));
  return (
    <nav ref={nav} id="nav" aria-label="Secciones" class={`${apretada ? 'apretada ' : ''}vidrio fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+.6rem)] z-40 mx-auto flex max-w-md rounded-[1.6rem] p-1.5 shadow-[0_18px_50px_-14px_rgba(0,0,0,.55)] ring-1 ring-anillo lg:static lg:col-start-1 lg:row-start-1 lg:m-0 lg:max-w-none lg:flex-col lg:gap-1 lg:rounded-none lg:bg-transparent lg:p-3 lg:shadow-none lg:ring-0 lg:backdrop-blur-none`}>
      <span aria-hidden="true" class="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-[calc((100%-.75rem)/5)] rounded-[1.2rem] bg-marca-sup ring-1 ring-anillo transition-transform duration-[380ms] ease-[cubic-bezier(.22,1.2,.36,1)] lg:hidden" style={{ transform: `translateX(${i * 100}%)` }} />
      {BARRA.map(({ id, nombre, corto, Icono }) => (
        <button key={id} data-p={id} aria-label={nombre} aria-current={id === activa ? 'page' : undefined} onClick={() => irA(id)}
          class={`relative z-10 flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.2rem] text-[.7rem] font-semibold transition-colors active:scale-95 lg:min-h-12 lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base ${id === activa ? 'text-tx-marca-sup lg:bg-marca-sup' : 'text-tx2 hover:text-tx'}`}>
          <Icono size={22} strokeWidth={id === activa ? 2.3 : 1.8} />
          <span class={`lbl-largo ${corto ? 'tiene-corto' : ''}`}>{nombre}</span>{corto && <span class="lbl-corto" aria-hidden="true">{corto}</span>}
        </button>
      ))}
    </nav>
  );
}

function Contenido() {
  const ref = useRef<HTMLDivElement>(null);
  const p = pantalla.value;
  const antes = useRef(p);
  useEffect(() => {
    // hacia dónde se va: según el lugar de cada sección en la barra
    const orden = (x: Pantalla) => BARRA.findIndex(b => b.id === enBarra(x));
    const dir = Math.sign(orden(p) - orden(antes.current));
    antes.current = p;
    if (ref.current) { ref.current.parentElement?.scrollTo(0, 0); entrarPantalla(ref.current, dir); }
  }, [p]);
  // el fondo cambia de color suavemente según la sección (ver estilos: html[data-seccion])
  useEffect(() => { document.documentElement.dataset.seccion = enBarra(p); }, [p]);
  const interna = enBarra(p) === 'mas' && p !== 'mas';
  return (
    <main id="contenido" aria-live="polite" class={`contenido mx-auto w-full flex-1 overflow-y-auto overscroll-contain ${p === 'chat' ? 'flex max-w-3xl flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+5.3rem)] lg:pb-0' : 'max-w-3xl px-4 pb-32 pt-[calc(env(safe-area-inset-top)+1rem)] lg:pb-8'} lg:col-start-2 lg:row-start-1 lg:max-w-none`}>
      <h1 class="sr-only">{document.title}</h1>
      <div ref={ref} key={p} class={p === 'chat' ? 'mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col' : 'mx-auto w-full max-w-3xl'}>
        {p === 'chat' && <Chat />}
        {p === 'saldos' && <Saldos />}
        {p === 'movimientos' && <Movimientos />}
        {p === 'resumen' && <Resumen />}
        {p === 'mas' && <Mas />}
        {interna && <Subvista pantalla={p} />}
      </div>
    </main>
  );
}

export function App() {
  return (
    <div id="raiz-preact" data-listo="1" data-estado={estadoSync.value} data-pendientes={pendientes.value} data-movimientos={datos.value?.movimientos.length ?? 0} class="marco flex h-[100dvh] flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <Contenido />
      <div aria-hidden="true" class="fixed inset-x-0 bottom-0 z-30 h-[calc(env(safe-area-inset-bottom)+.7rem)] bg-vidrio backdrop-blur-xl lg:hidden" />
      <Barra />
      <BotonOjo />
      <HojaInfo />
      <DetalleGlobal />
      <HojaSelector />
      <Confirmacion />
      <EditorAtajos />
      <ContadorEfectivo />
      <div class="pila-superior"><AvisoSync /><ToastDeshacer /></div>
      <Bloqueo />
      <Dialogo />
    </div>
  );
}
