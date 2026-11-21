/**
 * Entrada en cascada de Saldos, Movimientos, Resumen y Más: las tarjetas y filas de primer nivel aparecen una tras otra
 * con un resorte suave. Solo se dispara cuando cambia la pantalla activa o el periodo que se ve; volver de una ventana
 * flotante o refrescar datos en segundo plano no la repite. Solo transform y opacity (nada de filter).
 *
 * Usa la API de animaciones del navegador con `fill: backwards`: no deja ningún estilo puesto, así que si algo falla
 * los elementos quedan visibles y tocables desde el primer cuadro.
 */
import { effect } from '@preact/signals';
import { pantalla } from '../state/nav.ts';
import { menosMovimiento, RESORTE } from './efectos.ts';

const CON_CASCADA = new Set(['saldos', 'movimientos', 'resumen', 'mas']);
const PASO_MS = 45;
const MAXIMO = 12;

/** Los elementos de primer nivel de la pantalla: si todo cuelga de un solo contenedor, se baja un nivel. */
function primerNivel(): Element[] {
  let nivel: Element[] = Array.from(document.querySelectorAll('#contenido > div > *'));
  for (let i = 0; i < 2 && nivel.length === 1; i++) nivel = Array.from(nivel[0]!.children);
  return nivel.filter(el => getComputedStyle(el).position !== 'fixed' && el.getBoundingClientRect().height > 0);
}

function cascada(): void {
  if (menosMovimiento()) return;
  const vp = innerHeight;
  const visibles = primerNivel().filter(el => el.getBoundingClientRect().top < vp);
  visibles.slice(0, MAXIMO).forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 520, delay: i * PASO_MS, easing: `cubic-bezier(${RESORTE.join(',')})`, fill: 'backwards' },
    );
  });
}

/** Lo que identifica el periodo en pantalla: el texto de las barras de periodo. Cambia solo si la persona cambia de periodo. */
const huellaPeriodo = (): string => Array.from(document.querySelectorAll('#contenido .periodo, #contenido [data-periodo]')).map(e => e.textContent).join('|');

export function iniciarCascada(): void {
  let ultima = '';
  let huella = '';
  let cola = 0;
  const programar = (nueva: boolean) => {
    cancelAnimationFrame(cola);
    // dos cuadros: deja que Preact monte la pantalla nueva antes de medirla
    cola = requestAnimationFrame(() => { cola = requestAnimationFrame(() => {
      huella = huellaPeriodo();
      if (nueva) cascada();
    }); });
  };
  effect(() => {
    const p = pantalla.value;
    if (p === ultima) return;
    ultima = p;
    huella = '';
    if (CON_CASCADA.has(p)) programar(true);
  });
  // cambio de periodo dentro de la misma pantalla: la huella de las barras de periodo cambia
  const obs = new MutationObserver(() => {
    if (!CON_CASCADA.has(ultima)) return;
    const ahora = huellaPeriodo();
    if (!huella) { huella = ahora; return; } // primera lectura tras montar: solo se anota
    if (ahora && ahora !== huella) { huella = ahora; cancelAnimationFrame(cola); cola = requestAnimationFrame(cascada); }
  });
  const arranque = () => { const c = document.getElementById('contenido'); if (c) obs.observe(c, { childList: true, subtree: true, characterData: true }); else requestAnimationFrame(arranque); };
  arranque();
}
