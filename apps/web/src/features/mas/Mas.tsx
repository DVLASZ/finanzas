/**
 * «Más»: el menú de todo lo demás como una cuadrícula de tarjetas (bento), y el marco de las pantallas que se
 * abren desde aquí. Todas son componentes de Preact que leen sus datos de `state/store.ts`.
 */
import { ArrowLeft, CalendarClock, PiggyBank, BookOpen, ChevronRight, CircleHelp, ClipboardCheck, HandCoins, Inbox, Landmark, Settings, ShoppingBasket, Tags, Users, Package } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { hayTrabajadores, vendeProductos } from '../../../../../packages/core/src/index.ts';
import { Buzon } from '../buzon/Buzon.tsx';
import { Catalogo } from '../catalogo/Catalogo.tsx';
import { Lista } from '../catalogo/Lista.tsx';
import { Conciliar } from '../conciliar/Conciliar.tsx';
import { Cuentas } from '../cuentas/Cuentas.tsx';
import { Guia } from '../guia/Guia.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { atras, irA, prellenarChat, type Pantalla } from '../../state/nav.ts';
import { Insignia, T, type Icono, type Visual } from '../../components/ui/iconos.tsx';
import { Escalonado } from '../../components/ui/piezas.tsx';
import { Ajustes } from '../ajustes/Ajustes.tsx';
import { Deudas } from '../deudas/Deudas.tsx';
import { Revision } from '../revision/Revision.tsx';
import { Alcancias } from '../metas/Alcancias.tsx';
import { PagosFijos } from '../recurrentes/PagosFijos.tsx';
import { Trabajadores } from '../trabajadores/Trabajadores.tsx';

interface Entrada { id: Pantalla | 'ayuda'; nombre: string; detalle: string; Icono: Icono; tema: keyof typeof T; soloSiVende?: boolean; soloSiTrabajadores?: boolean }
interface Grupo { titulo: string; destacadas?: boolean; entradas: Entrada[] }

const GRUPOS: Grupo[] = [
  { titulo: 'Control y cierre', destacadas: true, entradas: [
    { id: 'revision', nombre: 'Revisión del mes', detalle: 'Descuadres y cobros viejos', Icono: ClipboardCheck, tema: 'esmeralda' },
    { id: 'conciliar', nombre: 'Conciliar con el banco', detalle: 'Sube el extracto y ve qué falta', Icono: Landmark, tema: 'azul' },
  ] },
  { titulo: 'Gestión y catálogos', entradas: [
    { id: 'alcancias', nombre: 'Alcancías', detalle: 'Metas de ahorro con avance', Icono: PiggyBank, tema: 'rosa' },
    { id: 'pagosfijos', nombre: 'Pagos fijos', detalle: 'Arriendo, internet, cuotas', Icono: CalendarClock, tema: 'ambar' },
    { id: 'deudas', nombre: 'Deudas y préstamos', detalle: 'Quién te debe y a quién le debes', Icono: HandCoins, tema: 'ambar' },
    { id: 'cuentas', nombre: 'Categorías y personas', detalle: 'Categorías, topes y directorio de personas', Icono: Tags, tema: 'violeta' },
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
            <Escalonado class={`grid gap-3 ${g.destacadas ? '[grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr))]' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {visibles.map(e => <Ficha key={e.id} e={e} grande={Boolean(g.destacadas)} alAbrir={() => abrir(e.id)} />)}
            </Escalonado>
          </section>
        );
      })}
    </div>
  );
}

export function Subvista({ pantalla }: { pantalla: Pantalla }) {
  const pantallas: Partial<Record<Pantalla, ComponentChildren>> = {
    deudas: <Deudas />,
    ajustes: <Ajustes />,
    lista: <Lista />,
    catalogo: <Catalogo />,
    cuentas: <Cuentas />,
    guia: <Guia />,
    conciliar: <Conciliar />,
    buzon: <Buzon />,
    trabajadores: <Trabajadores />,
    revision: <Revision />,
    alcancias: <Alcancias />,
    pagosfijos: <PagosFijos />,
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

