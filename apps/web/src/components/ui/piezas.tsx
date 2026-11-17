/**
 * Piezas pequeñas que usan todas las pantallas: números que cuentan, entrada escalonada, títulos de sección.
 * Los estilos están en estilos/tailwind.css (clases tarjeta, chip, primario...).
 */
import { Info } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear, type Moneda } from '../../../../../packages/core/src/index.ts';
import { contar, entrar } from '../../lib/efectos.ts';
import { montosOcultos, PUNTOS } from '../../state/privacidad.ts';

/** Un monto que «llega» contando desde cero cuando aparece y cuando cambia. */
export function MontoAnimado({ valor, moneda = 'COP', class: clase = '' }: { valor: number; moneda?: Moneda; class?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef<number | null>(null);
  useEffect(() => {
    const desde = anterior.current;
    anterior.current = valor;
    // la primera vez cuenta desde cero; después, solo si cambió
    if (desde === valor) return;
    return contar(valor, setMostrado);
  }, [valor]);
  if (montosOcultos.value) return <span class={`tabular-nums ${clase}`} data-oculto="1" aria-label="Monto oculto">{PUNTOS}</span>;
  // el valor final, invisible, reserva el ancho: la cifra no cambia de tamaño ni de sitio mientras cuenta
  return (
    <span class={`tabular-nums inline-grid ${clase}`}>
      <span class="invisible col-start-1 row-start-1" aria-hidden="true">{formatear(valor, moneda)}</span>
      <span class="col-start-1 row-start-1">{formatear(mostrado, moneda)}</span>
    </span>
  );
}

/** Hijos que entran uno tras otro (efecto escalonado). */
export function Escalonado({ children, class: clase = '', paso = 0.045 }: { children: ComponentChildren; class?: string; paso?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hijos = ref.current ? Array.from(ref.current.children) : [];
    hijos.slice(0, 14).forEach((h, i) => entrar(h, i * paso));
  }, []);
  return <div ref={ref} class={clase}>{children}</div>;
}

export function Seccion({ titulo, children }: { titulo: string; children: ComponentChildren }) {
  return <section><h3>{titulo}</h3>{children}</section>;
}

/** Un color de fondo suave y un ícono tintado para marcar cada tipo de cosa (cuenta, categoría, alerta). */
export const TINTAS = [
  { fondo: 'bg-info/15', texto: 'text-info' },
  { fondo: 'bg-acc/15', texto: 'text-acc' },
  { fondo: 'bg-pos/15', texto: 'text-pos' },
  { fondo: 'bg-adv/15', texto: 'text-adv' },
  { fondo: 'bg-neg/15', texto: 'text-neg' },
  { fondo: 'bg-marca/15', texto: 'text-marca' },
] as const;

/** La misma tinta para el mismo texto, siempre (así cada categoría o cuenta tiene «su» color). */
export function tintaDe(texto: string): (typeof TINTAS)[number] {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTAS[h % TINTAS.length];
}

/** Una nota suelta con ícono: lo que antes eran párrafos `p.sub` decorados a mano. */
export function Nota({ children }: { children: ComponentChildren }) {
  return <p class="callout"><span class="callout-ico"><Info size={16} /></span><span class="callout-txt">{children}</span></p>;
}

/** Lo que se muestra mientras los datos terminan de cargar. */
export const Cargando = () => <p class="vacio">Cargando…</p>;
