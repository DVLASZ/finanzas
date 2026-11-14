/**
 * «Más»: el menú de todo lo demás como una cuadrícula de tarjetas (bento), y el marco de las pantallas que se
 * abren desde aquí. Las pantallas grandes de configuración siguen siendo las de siempre (HTML armado con
 * plantillas) montadas dentro de `VistaLegada`; llevan el mismo aspecto porque comparten las clases del CSS.
 */
import { ArrowLeft, Info, BookOpen, ChevronRight, CircleHelp, ClipboardCheck, HandCoins, Inbox, Landmark, Settings, ShoppingBasket, Tags, Users, Package } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { hayTrabajadores, vendeProductos } from '../../../../packages/core/src/index.ts';
import { vistaCatalogo, vistaLista } from '../catalogoVista.ts';
import { vistaBuzon } from '../buzonVista.ts';
import { vistaConciliar } from '../conciliarVista.ts';
import { vistaCuentas } from '../cuentasVista.ts';
import { vistaGuia } from '../guiaVista.ts';
import { ctx as contexto, datos as datosSignal } from '../estado/store.ts';
import { atras, irA, prellenarChat, type Pantalla } from '../estado/nav.ts';
import { Insignia, T, iconoHtml, type Icono, type Visual } from '../ui/iconos.tsx';
import { Escalonado } from '../ui/piezas.tsx';
import { vistaAjustes } from './ajustes.ts';
import { vistaDeudas } from './deudas.ts';
import { vistaRevision } from './revision.ts';
import { vistaTrabajadores } from './trabajadores.ts';

interface Entrada { id: Pantalla | 'ayuda'; nombre: string; detalle: string; Icono: Icono; tema: keyof typeof T; soloSiVende?: boolean; soloSiTrabajadores?: boolean }
interface Grupo { titulo: string; destacadas?: boolean; entradas: Entrada[] }

const GRUPOS: Grupo[] = [
  { titulo: 'Control y cierre', destacadas: true, entradas: [
    { id: 'revision', nombre: 'Revisión del mes', detalle: 'Descuadres y cobros viejos', Icono: ClipboardCheck, tema: 'esmeralda' },
    { id: 'conciliar', nombre: 'Conciliar con el banco', detalle: 'Sube el extracto y ve qué falta', Icono: Landmark, tema: 'azul' },
  ] },
  { titulo: 'Gestión y catálogos', entradas: [
    { id: 'deudas', nombre: 'Deudas y préstamos', detalle: 'Quién te debe y a quién le debes', Icono: HandCoins, tema: 'ambar' },
    { id: 'cuentas', nombre: 'Categorías y personas', detalle: 'Crear, renombrar y poner topes', Icono: Tags, tema: 'violeta' },
    { id: 'lista', nombre: 'Lista de compras', detalle: 'Lo que falta comprar', Icono: ShoppingBasket, tema: 'rosa' },
    { id: 'catalogo', nombre: 'Productos y precios', detalle: 'Lo que vendes y cuánto cuesta', Icono: Package, tema: 'cian', soloSiVende: true },
    { id: 'trabajadores', nombre: 'Pagos a trabajadores', detalle: 'Cuánto se pagó a cada uno', Icono: Users, tema: 'lima', soloSiTrabajadores: true },
  ] },
  { titulo: 'Sistema y ayuda', entradas: [
    { id: 'buzon', nombre: 'Buzón', detalle: 'Avisos entre tus apps', Icono: Inbox, tema: 'cian' },
    { id: 'ajustes', nombre: 'Ajustes', detalle: 'Letra, colores, copia de seguridad', Icono: Settings, tema: 'gris' },
    { id: 'guia', nombre: 'Primeros pasos', detalle: 'Cinco ejemplos para empezar', Icono: BookOpen, tema: 'esmeralda' },
    { id: 'ayuda', nombre: 'Ayuda', detalle: 'Cómo escribirme', Icono: CircleHelp, tema: 'coral' },
  ] },
];
const TODAS = GRUPOS.flatMap(g => g.entradas);

function Ficha({ e, grande, alAbrir }: { e: Entrada; grande: boolean; alAbrir: () => void }) {
  const v: Visual = { Icono: e.Icono, ...T[e.tema] };
  return (
    <button data-ir={e.id} onClick={alAbrir} class={`tarjeta group text-left transition active:scale-[.98] ${grande ? 'flex flex-col items-start gap-3' : 'flex items-center gap-3 !py-3'}`}>
      <Insignia v={v} tam={grande ? 48 : 42} />
      <span class="min-w-0 flex-1"><b class="block">{e.nombre}</b><span class="sub">{e.detalle}</span></span>
      {!grande && <ChevronRight size={18} class="shrink-0 text-tx2 transition group-active:translate-x-0.5" />}
    </button>
  );
}

export function Mas() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  // cada app muestra solo lo suyo: «Productos y precios» solo existe donde se vende
  const vende = vendeProductos(ctx);
  const conTrabajadores = hayTrabajadores(datos.cuentas, datos.movimientos);
  const abrir = (id: Entrada['id']) => {
    if (id === 'ayuda') { prellenarChat('ayuda'); irA('chat'); } else irA(id);
  };
  return (
    <div class="mas-lista">
      {GRUPOS.map(g => {
        const visibles = g.entradas.filter(x => (!x.soloSiVende || vende) && (!x.soloSiTrabajadores || conTrabajadores));
        if (!visibles.length) return null;
        return (
          <section key={g.titulo}>
            <h3 class="!mt-5 !mb-2 px-1 first:!mt-0">{g.titulo}</h3>
            <Escalonado class={`grid gap-3 ${g.destacadas ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {visibles.map(e => <Ficha key={e.id} e={e} grande={Boolean(g.destacadas)} alAbrir={() => abrir(e.id)} />)}
            </Escalonado>
          </section>
        );
      })}
    </div>
  );
}

/** Las notas sueltas (párrafos con la clase `sub`) pasan a ser un cuadro con ícono, para que no queden pegadas al borde. */
function decorarNotas(raiz: HTMLElement): void {
  raiz.querySelectorAll<HTMLElement>('p.sub:not([id]):not(.callout)').forEach(p => {
    if (!p.textContent?.trim() || p.closest('.fila, .alerta')) return;
    const txt = document.createElement('span');
    txt.className = 'callout-txt';
    while (p.firstChild) txt.append(p.firstChild);
    const ico = document.createElement('span');
    ico.className = 'callout-ico';
    ico.innerHTML = iconoHtml(Info, 16);
    p.classList.add('callout');
    p.append(ico, txt);
  });
}

/** Monta una pantalla hecha con HTML plano dentro de un componente. Con `repintar`, se vuelve a armar cuando cambian los datos. */
function VistaLegada({ dibujar, repintar = false }: { dibujar: (caja: HTMLElement) => unknown; repintar?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const datos = repintar ? datosSignal.value : null;
  useEffect(() => { if (ref.current) void dibujar(ref.current); }, [datos]);
  // las pantallas se vuelven a armar a cada acción: las notas se decoran cada vez
  useEffect(() => {
    const caja = ref.current;
    if (!caja) return;
    const ob = new MutationObserver(() => { ob.disconnect(); decorarNotas(caja); ob.observe(caja, { childList: true, subtree: true }); });
    ob.observe(caja, { childList: true, subtree: true });
    return () => ob.disconnect();
  }, []);
  return <div ref={ref} class="pb-10" />;
}

export function Subvista({ pantalla }: { pantalla: Pantalla }) {
  const alChat = () => irA('chat');
  const pantallas: Partial<Record<Pantalla, ComponentChildren>> = {
    deudas: <VistaLegada repintar dibujar={c => vistaDeudas(c, alChat)} />,
    ajustes: <VistaLegada dibujar={vistaAjustes} />,
    lista: <VistaLegada dibujar={vistaLista} />,
    catalogo: <VistaLegada dibujar={vistaCatalogo} />,
    cuentas: <VistaLegada dibujar={vistaCuentas} />,
    guia: <VistaLegada dibujar={c => vistaGuia(c, alChat)} />,
    conciliar: <VistaLegada dibujar={c => vistaConciliar(c, alChat)} />,
    buzon: <VistaLegada dibujar={c => vistaBuzon(c, alChat)} />,
    trabajadores: <VistaLegada repintar dibujar={vistaTrabajadores} />,
    revision: <VistaLegada repintar dibujar={c => vistaRevision(c, alChat)} />,
  };
  const e = TODAS.find(x => x.id === pantalla);
  return (
    <>
      <button class="volver" aria-label="Volver al menú Más" onClick={atras}><ArrowLeft size={20} /><span>Volver</span></button>
      {e && <div class="mb-3 flex items-center gap-3"><Insignia v={{ Icono: e.Icono, ...T[e.tema] }} tam={44} /><h2 class="!m-0 min-w-0 truncate">{e.nombre}</h2></div>}
      {pantallas[pantalla]}
    </>
  );
}

