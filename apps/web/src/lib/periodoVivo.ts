/**
 * Vida para las barras de periodo de Movimientos y Resumen: la pildora que se desliza hasta la pestaña activa
 * y la entrada direccional del contenido al cambiar de periodo. Solo mueve transform y opacity.
 */
import { signal } from '@preact/signals';
import { animate } from 'motion/mini';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { menosMovimiento } from './efectos.ts';

/** Hacia donde se fue la persona: 1 = Siguiente (el contenido entra por la derecha), -1 = Anterior, 0 = cambio de pestaña (solo fundido). */
export const dirPeriodo = signal(0);

/**
 * Mide la pestaña activa y deja su posición en variables CSS del contenedor (--px, --py, --sx, --ph).
 * La pildora (un solo span absoluto) se mueve con translate + scaleX; el resorte lo pone el CSS.
 * Se vuelve a medir cuando cambia la clase `activa`, el tamaño de la barra o el de cualquier pestaña
 * (cambia la letra, gira el celular, una pestaña baja de línea).
 */
export function usarPildora() {
  const ref = useRef<HTMLDivElement>(null);
  const montada = useRef<{ barra: HTMLDivElement; limpiar: () => void } | null>(null);
  // sin lista de dependencias: la barra puede aparecer después (la pantalla empieza en "Cargando") y hay que engancharla cuando exista
  useLayoutEffect(() => {
    const barra = ref.current;
    if (montada.current && montada.current.barra === barra) return;
    montada.current?.limpiar();
    montada.current = null;
    if (!barra) return;
    const BASE = 100; // ancho en px de la pildora en el CSS; scaleX la lleva al ancho real
    let primera = true;
    const medir = () => {
      const activa = barra.querySelector<HTMLElement>('.pestana.activa');
      if (!activa || !activa.offsetWidth) return;
      barra.style.setProperty('--px', `${activa.offsetLeft}px`);
      barra.style.setProperty('--py', `${activa.offsetTop}px`);
      barra.style.setProperty('--sx', String(activa.offsetWidth / BASE));
      barra.style.setProperty('--ph', `${activa.offsetHeight}px`);
      if (primera) {
        primera = false;
        // la primera posición se fija sin viaje; después ya se anima
        requestAnimationFrame(() => barra.classList.add('lista'));
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    const observar = () => { ro.observe(barra); barra.querySelectorAll('.pestana').forEach(b => ro.observe(b)); };
    observar();
    const mo = new MutationObserver(() => { observar(); medir(); });
    mo.observe(barra, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    montada.current = { barra, limpiar: () => { ro.disconnect(); mo.disconnect(); } };
  });
  useLayoutEffect(() => () => montada.current?.limpiar(), []);
  return ref;
}

/**
 * Anima el contenido de la pantalla cuando cambia `clave` (periodo + desplazamiento). Deja quieta la barra de
 * pestañas, la de Anterior/Siguiente y el rango de fechas; todo lo demás entra con la dirección de `dirPeriodo`.
 */
export function usarEntradaPeriodo(clave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const antes = useRef(clave);
  useLayoutEffect(() => {
    if (antes.current === clave) return;
    antes.current = clave;
    const raiz = ref.current;
    const dir = dirPeriodo.value;
    dirPeriodo.value = 0;
    if (!raiz || menosMovimiento()) return;
    for (const hijo of Array.from(raiz.children)) {
      if (hijo.matches('.pestanas, .periodo, #rango')) continue;
      if (dir) animate(hijo, { opacity: [0, 1], transform: [`translateX(${dir * 16}px)`, 'translateX(0px)'] }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] });
      else animate(hijo, { opacity: [0, 1] }, { duration: 0.16, ease: 'easeOut' });
    }
  }, [clave]);
  return ref;
}
