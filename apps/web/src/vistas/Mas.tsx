/**
 * «Más»: el menú de todo lo demás como una cuadrícula de tarjetas (bento), y el marco de las pantallas que se
 * abren desde aquí. Las pantallas grandes de configuración siguen siendo las de siempre (HTML armado con
 * plantillas) montadas dentro de `VistaLegada`; llevan el mismo aspecto porque comparten las clases del CSS.
 */
import {
  ArrowLeft, BookOpen, CircleHelp, ClipboardCheck, HandCoins, Inbox, Landmark, Settings, ShoppingBasket, Tags, Users, Package,
} from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { hayTrabajadores, vendeProductos } from '../../../../packages/core/src/index.ts';
import { vistaCatalogo, vistaLista } from '../catalogoVista.ts';
import { vistaBuzon } from '../buzonVista.ts';
import { vistaConciliar } from '../conciliarVista.ts';
import { vistaCuentas } from '../cuentasVista.ts';
import { vistaGuia } from '../guiaVista.ts';
import { ctx as contexto, datos as datosSignal } from '../estado/store.ts';
import { irA, prellenarChat, type Pantalla } from '../estado/nav.ts';
import { Escalonado, tintaDe } from '../ui/piezas.tsx';
import { vistaAjustes } from './ajustes.ts';
import { vistaDeudas } from './deudas.ts';
import { vistaRevision } from './revision.ts';
import { vistaTrabajadores } from './trabajadores.ts';

interface Entrada { id: Pantalla | 'ayuda'; nombre: string; detalle: string; Icono: typeof Settings; ancho?: boolean; soloSiVende?: boolean; soloSiTrabajadores?: boolean }

const ENTRADAS: Entrada[] = [
  { id: 'revision', nombre: 'Revisión del mes', detalle: 'Descuadres y cobros viejos', Icono: ClipboardCheck, ancho: true },
  { id: 'deudas', nombre: 'Deudas y préstamos', detalle: 'Quién te debe y a quién le debes', Icono: HandCoins, ancho: true },
  { id: 'trabajadores', nombre: 'Pagos a trabajadores', detalle: 'Cuánto se pagó a cada uno', Icono: Users, soloSiTrabajadores: true },
  { id: 'cuentas', nombre: 'Categorías y personas', detalle: 'Crear, renombrar y poner topes', Icono: Tags },
  { id: 'lista', nombre: 'Lista de compras', detalle: 'Lo que falta comprar', Icono: ShoppingBasket },
  { id: 'catalogo', nombre: 'Productos y precios', detalle: 'Lo que vendes y cuánto cuesta', Icono: Package, soloSiVende: true },
  { id: 'conciliar', nombre: 'Conciliar con el banco', detalle: 'Sube el extracto y ve qué falta', Icono: Landmark },
  { id: 'buzon', nombre: 'Buzón', detalle: 'Avisos entre tus apps', Icono: Inbox },
  { id: 'guia', nombre: 'Primeros pasos', detalle: 'Cinco ejemplos para empezar', Icono: BookOpen },
  { id: 'ajustes', nombre: 'Ajustes', detalle: 'Letra, colores, copia de seguridad', Icono: Settings },
  { id: 'ayuda', nombre: 'Ayuda', detalle: 'Cómo escribirme', Icono: CircleHelp },
];

export function Mas() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  // cada app muestra solo lo suyo: «Productos y precios» solo existe donde se vende
  const vende = vendeProductos(ctx);
  const conTrabajadores = hayTrabajadores(datos.cuentas, datos.movimientos);
  const visibles = ENTRADAS.filter(x => (!x.soloSiVende || vende) && (!x.soloSiTrabajadores || conTrabajadores));
  const abrir = (id: Entrada['id']) => {
    if (id === 'ayuda') { prellenarChat('ayuda'); irA('chat'); } else irA(id);
  };
  return (
    <div>
      <h2 class="!mt-0">Más</h2>
      <Escalonado class="mas-lista grid grid-cols-2 gap-3">
        {visibles.map(({ id, nombre, detalle, Icono, ancho }) => {
          const tinta = tintaDe(id);
          return (
            <button key={id} data-ir={id} onClick={() => abrir(id)}
              class={`tarjeta group flex flex-col items-start gap-3 text-left transition active:scale-[.97] ${ancho ? 'col-span-2 sm:col-span-1' : ''}`}>
              <span class={`grid h-11 w-11 place-items-center rounded-2xl ${tinta.fondo} ${tinta.texto} transition group-active:scale-90`}><Icono size={22} /></span>
              <span><b class="block">{nombre}</b><span class="sub">{detalle}</span></span>
            </button>
          );
        })}
      </Escalonado>
    </div>
  );
}

/** Monta una pantalla hecha con HTML plano dentro de un componente. Con `repintar`, se vuelve a armar cuando cambian los datos. */
function VistaLegada({ dibujar, repintar = false }: { dibujar: (caja: HTMLElement) => unknown; repintar?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const datos = repintar ? datosSignal.value : null;
  useEffect(() => { if (ref.current) void dibujar(ref.current); }, [datos]);
  return <div ref={ref} />;
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
  return (
    <>
      <button class="volver" aria-label="Volver al menú Más" onClick={() => irA('mas')}><ArrowLeft size={20} /><span>Volver</span></button>
      {pantallas[pantalla]}
    </>
  );
}

