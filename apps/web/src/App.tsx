/**
 * El cascarón de la app: cabecera de vidrio, la pantalla que toca (con transición) y la barra de abajo
 * flotante con un indicador que se desliza entre las cinco secciones. En pantalla ancha la barra pasa a un lado.
 */
import { BarChart3, Check, MessageCircle, MoreHorizontal, Moon, Receipt, Sun, WalletCards, WifiOff } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { actual, alternarTema } from './state/apariencia.ts';
import { enBarra, irA, pantalla, type Pantalla } from './state/nav.ts';
import { conServidor, datos, estadoSync, pendientes } from './state/store.ts';
import { entrarPantalla } from './lib/efectos.ts';
import { HojaSelector } from './components/ui/Selector.tsx';
import { Chat } from './features/chat/Chat.tsx';
import { Saldos } from './features/saldos/Saldos.tsx';
import { Movimientos } from './features/movimientos/Movimientos.tsx';
import { Resumen } from './features/resumen/Resumen.tsx';
import { Mas, Subvista } from './features/mas/Mas.tsx';
import { signal } from '@preact/signals';

const BARRA: { id: Pantalla; nombre: string; Icono: typeof MessageCircle }[] = [
  { id: 'chat', nombre: 'Chat', Icono: MessageCircle },
  { id: 'saldos', nombre: 'Saldos', Icono: WalletCards },
  { id: 'movimientos', nombre: 'Movimientos', Icono: Receipt },
  { id: 'resumen', nombre: 'Resumen', Icono: BarChart3 },
  { id: 'mas', nombre: 'Más', Icono: MoreHorizontal },
];

/** Se vuelve a leer cuando cambia la apariencia (tema claro u oscuro). */
const oscuro = signal(actual().oscuro);
window.addEventListener('apariencia', () => { oscuro.value = actual().oscuro; });

function Estado() {
  const e = estadoSync.value;
  const p = pendientes.value;
  const sinRed = conServidor.value && navigator.onLine === false;
  const texto = !conServidor.value ? 'Solo en este aparato'
    : sinRed ? (p ? `Sin internet · ${p} sin enviar` : 'Sin internet')
    : e === 'sincronizando' ? 'Sincronizando'
    : p ? `${p} sin enviar` : 'Todo guardado';
  const tono = e === 'ok' && !sinRed ? 'text-pos bg-pos/12' : e === 'local' ? 'text-tx2 bg-elev' : 'text-adv bg-adv/12';
  return (
    <span id="estado" class={`estado inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${tono}`}>
      {sinRed ? <WifiOff size={13} /> : e === 'ok' ? <Check size={13} /> : <span class="h-1.5 w-1.5 rounded-full bg-current" />}
      {texto}
    </span>
  );
}

function Cabecera() {
  return (
    <header class="vidrio sticky top-0 z-30 flex lg:col-span-2 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+.6rem)] ring-1 ring-anillo">
      <h1 class="min-w-[6rem] flex-[1_1_0] truncate">{document.title}</h1>
      <div class="ml-auto flex items-center gap-2">
        <Estado />
        <button id="cambiar-tema" class="grid h-11 w-11 place-items-center rounded-full bg-sup text-tx ring-1 ring-anillo transition active:scale-90" aria-label="Cambiar entre tema claro y oscuro" title="Claro u oscuro" onClick={alternarTema}>
          {oscuro.value ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </div>
    </header>
  );
}

function Barra() {
  const activa = enBarra(pantalla.value);
  const i = Math.max(0, BARRA.findIndex(b => b.id === activa));
  return (
    <nav id="nav" aria-label="Secciones" class="vidrio fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+.6rem)] z-40 mx-auto flex max-w-md rounded-[1.6rem] p-1.5 shadow-[0_18px_50px_-14px_rgba(0,0,0,.55)] ring-1 ring-anillo lg:static lg:col-start-1 lg:row-start-2 lg:m-0 lg:max-w-none lg:flex-col lg:gap-1 lg:rounded-none lg:bg-transparent lg:p-3 lg:shadow-none lg:ring-0 lg:backdrop-blur-none">
      <span aria-hidden="true" class="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-[calc((100%-.75rem)/5)] rounded-[1.2rem] bg-marca-sup ring-1 ring-anillo transition-transform duration-[380ms] ease-[cubic-bezier(.22,1.2,.36,1)] lg:hidden" style={{ transform: `translateX(${i * 100}%)` }} />
      {BARRA.map(({ id, nombre, Icono }) => (
        <button key={id} data-p={id} aria-label={nombre} aria-current={id === activa ? 'page' : undefined} onClick={() => irA(id)}
          class={`relative z-10 flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.2rem] text-[.7rem] font-semibold transition-colors active:scale-95 lg:min-h-12 lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base ${id === activa ? 'text-tx-marca-sup lg:bg-marca-sup' : 'text-tx2 hover:text-tx'}`}>
          <Icono size={22} strokeWidth={id === activa ? 2.3 : 1.8} />
          <span>{nombre}</span>
        </button>
      ))}
    </nav>
  );
}

function Contenido() {
  const ref = useRef<HTMLDivElement>(null);
  const p = pantalla.value;
  useEffect(() => { if (ref.current) { ref.current.parentElement?.scrollTo(0, 0); entrarPantalla(ref.current); } }, [p]);
  const interna = enBarra(p) === 'mas' && p !== 'mas';
  return (
    <main id="contenido" aria-live="polite" class={`contenido mx-auto w-full flex-1 overflow-y-auto overscroll-contain ${p === 'chat' ? 'flex max-w-3xl flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom)+5.3rem)] lg:pb-0' : 'max-w-3xl px-4 pb-32 pt-4 lg:pb-8'} lg:col-start-2 lg:row-start-2 lg:max-w-none`}>
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
    <div id="raiz-preact" data-listo="1" data-estado={estadoSync.value} data-pendientes={pendientes.value} data-movimientos={datos.value?.movimientos.length ?? 0} class="marco flex h-[100dvh] flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <Cabecera />
      <Contenido />
      <div aria-hidden="true" class="fixed inset-x-0 bottom-0 z-30 h-[calc(env(safe-area-inset-bottom)+.7rem)] bg-fondo lg:hidden" />
      <Barra />
      <HojaSelector />
    </div>
  );
}
