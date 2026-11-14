/**
 * Piezas pequeñas que usan todas las pantallas: números que cuentan, entrada escalonada, títulos de sección.
 * Los estilos están en estilos/tailwind.css (clases tarjeta, chip, primario...).
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear, type Moneda } from '../../../../packages/core/src/index.ts';
import { contar, entrar } from '../efectos.ts';

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
  return <span class={`tabular-nums ${clase}`}>{formatear(mostrado, moneda)}</span>;
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
