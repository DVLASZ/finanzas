/**
 * La identidad visual de la app: un ícono de Lucide y un color para cada categoría, cuenta o tipo de movimiento,
 * más los estados vacíos, las barras de avance y los esqueletos de carga. Las pantallas hechas con HTML plano
 * piden su ícono como texto con `iconoHtml`.
 */
import {
  ArrowLeftRight, Banknote, Bus, Cake, Coins, Cookie, DollarSign, Gamepad2, GraduationCap, Gift, HandCoins, HeartPulse, Inbox, Landmark,
  PartyPopper, PiggyBank, Receipt, Repeat, Shapes, ShoppingBag, Smartphone, Tag, TrendingUp, User, UtensilsCrossed, Wallet, Wrench,
} from 'lucide-preact';
import { render, type ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Cuenta, Movimiento } from '../../../../packages/core/src/index.ts';
import { tintaDe } from './piezas.tsx';

export type Icono = ComponentType<{ size?: number; class?: string; strokeWidth?: number }>;
/** Un color temático: degradado suave de fondo y color del ícono. Las clases van escritas completas para que Tailwind las encuentre. */
interface Tema { fondo: string; texto: string }

export const T = {
  ambar: { fondo: 'bg-gradient-to-br from-amber-400/30 to-amber-500/10', texto: 'text-amber-400' },
  cian: { fondo: 'bg-gradient-to-br from-cyan-400/30 to-cyan-500/10', texto: 'text-cyan-400' },
  violeta: { fondo: 'bg-gradient-to-br from-violet-400/30 to-violet-500/10', texto: 'text-violet-400' },
  azul: { fondo: 'bg-gradient-to-br from-blue-400/30 to-blue-500/10', texto: 'text-blue-400' },
  esmeralda: { fondo: 'bg-gradient-to-br from-emerald-400/30 to-emerald-500/10', texto: 'text-emerald-400' },
  rosa: { fondo: 'bg-gradient-to-br from-pink-400/30 to-pink-500/10', texto: 'text-pink-400' },
  coral: { fondo: 'bg-gradient-to-br from-rose-400/30 to-rose-500/10', texto: 'text-rose-400' },
  lima: { fondo: 'bg-gradient-to-br from-lime-400/30 to-lime-500/10', texto: 'text-lime-400' },
  gris: { fondo: 'bg-gradient-to-br from-slate-400/30 to-slate-500/10', texto: 'text-slate-400' },
} satisfies Record<string, Tema>;

/** Palabra que aparece en el nombre, ícono y color. La primera que coincide gana. */
const REGLAS: [RegExp, Icono, Tema][] = [
  [/mecato|dulce|snack|golosina/, Cookie, T.ambar],
  [/comida|almuerzo|desayuno|cena|mercado|restaurante|domicilio|alimento/, UtensilsCrossed, T.ambar],
  [/transporte|viaje|uber|bus|taxi|gasolina|pasaje|metro/, Bus, T.cian],
  [/recarga|celular|minutos|datos|plan/, Smartphone, T.cian],
  [/banco|costos|comision|cuota de manejo|gmf|impuesto/, Landmark, T.azul],
  [/juego|gaming|videojuego/, Gamepad2, T.violeta],
  [/suscripcion|netflix|spotify|streaming/, Repeat, T.violeta],
  [/compra|ropa|tienda|shopping/, ShoppingBag, T.violeta],
  [/salida|fiesta|rumba|cine|evento|amigos/, PartyPopper, T.rosa],
  [/regalo|detalle/, Gift, T.rosa],
  [/cumple/, Cake, T.rosa],
  [/universidad|estudio|colegio|curso|libro|matricula/, GraduationCap, T.azul],
  [/salud|medic|farmacia|doctor|odont|eps/, HeartPulse, T.coral],
  [/reparacion|arreglo|mantenimiento|herramienta/, Wrench, T.gris],
  [/personal|aseo|peluquer|cuidado/, User, T.lima],
  [/jornal|trabajador|nomina|sueldo/, HandCoins, T.lima],
  [/otro|varios|imprevisto/, Shapes, T.gris],
];

const limpio = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface Visual { Icono: Icono; fondo: string; texto: string }

/** El ícono y el color de una categoría o fuente por su nombre. Lo que no se reconoce toma un color estable según el nombre. */
export function visualDeNombre(nombre: string): Visual {
  const n = limpio(nombre);
  const r = REGLAS.find(([re]) => re.test(n));
  if (r) return { Icono: r[1], fondo: r[2].fondo, texto: r[2].texto };
  const t = tintaDe(nombre);
  return { Icono: Tag, fondo: t.fondo, texto: t.texto };
}

/** El ícono de un movimiento: ingresos en esmeralda, transferencias en azul, deudas y pagos, y si no, el de su categoría. */
export function visualDeMovimiento(m: Movimiento, cuentas: Cuenta[]): Visual {
  if (m.tipo === 'ingreso') return { Icono: TrendingUp, ...T.esmeralda };
  if (m.tipo === 'transferencia' || m.tipo === 'cambio_moneda') return { Icono: ArrowLeftRight, ...T.azul };
  if (m.tipo === 'prestamo' || m.tipo === 'deuda' || m.tipo === 'pago') return { Icono: HandCoins, ...T.ambar };
  if (m.tipo === 'apertura') return { Icono: PiggyBank, ...T.gris };
  const cat = m.asientos.map(a => cuentas.find(c => c.id === a.cuentaId)).find(c => c?.tipo === 'categoria');
  return cat ? visualDeNombre(cat.nombre) : { Icono: Receipt, ...T.gris };
}

/** Una persona: ícono de usuario con un color estable según su nombre. */
export function visualDePersona(nombre: string): Visual {
  const t = tintaDe(nombre);
  return { Icono: User, fondo: t.fondo, texto: t.texto };
}

/** El ícono de una cuenta de dinero. */
export function visualDeCuenta(c: Cuenta): Visual {
  if (c.id === 'efectivo') return { Icono: Banknote, ...T.esmeralda };
  if (c.id === 'monedas') return { Icono: Coins, ...T.ambar };
  if (c.id === 'alcancia') return { Icono: PiggyBank, ...T.rosa };
  if (c.moneda === 'USD') return { Icono: DollarSign, ...T.lima };
  if (/nequi|daviplata|movii|dale/i.test(c.nombre)) return { Icono: Smartphone, ...T.violeta };
  if (/banco|bancol|bogot|ahorro|cuenta/i.test(c.nombre)) return { Icono: Landmark, ...T.azul };
  return { Icono: Wallet, ...T.cian };
}

/** Un cuadrito redondeado con el ícono y su color. */
export function Insignia({ v, tam = 40, redondo = false }: { v: Visual; tam?: number; redondo?: boolean }) {
  const I = v.Icono;
  return (
    <span aria-hidden="true" class={`grid shrink-0 place-items-center ring-1 ring-white/10 ${redondo ? 'rounded-full' : 'rounded-[14px]'} ${v.fondo} ${v.texto}`} style={{ width: `${tam}px`, height: `${tam}px` }}>
      <I size={Math.round(tam * 0.5)} />
    </span>
  );
}

function comoHtml(nodo: preact.VNode): string {
  const div = document.createElement('div');
  render(nodo, div);
  return div.innerHTML;
}

/** Lo mismo que los componentes, pero como texto HTML para las pantallas que arman HTML a mano. */
export const iconoHtml = (I: Icono, tam = 18): string => comoHtml(<I size={tam} />);
export const insigniaHtml = (v: Visual, tam = 40): string => comoHtml(<Insignia v={v} tam={tam} />);

/** Estado vacío: un ícono que flota suavemente y una frase. */
export function Vacio({ Icono = Inbox, titulo, detalle, tono = 'gris' }: { Icono?: Icono; titulo: string; detalle?: string; tono?: keyof typeof T }) {
  const t = T[tono];
  return (
    <div class="vacio-caja" role="status">
      <span class={`vacio-icono grid h-16 w-16 place-items-center rounded-[22px] ring-1 ring-white/10 ${t.fondo} ${t.texto}`}><Icono size={30} /></span>
      <b>{titulo}</b>
      {detalle && <span class="sub">{detalle}</span>}
    </div>
  );
}
export const vacioHtml = (I: Icono, titulo: string, detalle = '', tono: keyof typeof T = 'gris'): string => comoHtml(<Vacio Icono={I} titulo={titulo} detalle={detalle} tono={tono} />);

/** Barra de avance: crece al aparecer y cambia de esmeralda a ámbar y a coral según se acerca al límite. */
export function BarraAvance({ porcentaje, alto = 10 }: { porcentaje: number; alto?: number }) {
  const [ancho, setAncho] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setAncho(Math.min(100, Math.max(2, porcentaje)))); return () => cancelAnimationFrame(id); }, [porcentaje]);
  const color = porcentaje >= 100 ? 'var(--neg)' : porcentaje >= 80 ? 'var(--adv)' : 'var(--pos)';
  return (
    <span class="barra-fondo" style={{ height: `${alto}px` }} role="progressbar" aria-valuenow={Math.min(100, porcentaje)} aria-valuemin={0} aria-valuemax={100}>
      <span class="barra-relleno" style={{ width: `${ancho}%`, background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white))`, transition: 'width .8s cubic-bezier(.22,1,.36,1), background .4s' }} />
    </span>
  );
}

/** Rectángulo con brillo que pasa mientras algo carga. */
export function Esqueleto({ class: clase = 'h-24 w-full' }: { class?: string }) {
  return <div class={`esqueleto rounded-2xl ${clase}`} aria-hidden="true" />;
}
