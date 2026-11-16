/**
 * Las cifras grandes (el disponible, los totales) no se parten en dos líneas: si con la letra del sistema y la de la
 * app no caben en su caja, se achican lo justo. Así «$101.143.544» se ve entero en un celular angosto con letra grande.
 *
 * Se aplica a lo que lleve `data-ajusta` y a las clases `.monto` y `.kpi-v`. También marca con `.apretado` las filas de
 * periodo («Anterior · octubre · Siguiente») que no caben en una línea, para que el CSS las parta en dos. Solo cambia el `font-size` en línea de ese
 * elemento (lo demás hereda de él), y vuelve a medir cuando cambia el contenido, la pantalla o la apariencia.
 */
const SELECTOR = '.monto, .kpi-v, [data-ajusta]';
const MINIMO = 0.55; // nunca más chico que esta fracción del tamaño original

function ajustar(): void {
  const elementos = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
  // primero se devuelve cada uno a su tamaño y después se mide: así el orden no cambia el resultado
  for (const el of elementos) el.style.removeProperty('font-size');
  const periodos = [...document.querySelectorAll<HTMLElement>('.periodo')];
  for (const p of periodos) p.classList.remove('apretado');
  for (const p of periodos) if (p.clientWidth && p.scrollWidth > p.clientWidth + 1) p.classList.add('apretado');
  for (const el of elementos) {
    if (!el.clientWidth || el.scrollWidth <= el.clientWidth + 1) continue;
    const base = parseFloat(getComputedStyle(el).fontSize);
    const factor = Math.max(MINIMO, (el.clientWidth / el.scrollWidth) * 0.98);
    el.style.setProperty('font-size', `${(base * factor).toFixed(2)}px`, 'important');
  }
}

let pendiente = 0;
const programar = (): void => {
  if (pendiente) return;
  pendiente = requestAnimationFrame(() => { pendiente = 0; ajustar(); });
};

/** Se llama una vez, con la interfaz ya montada. */
export function iniciarAjusteDeTexto(raiz: HTMLElement): void {
  new MutationObserver(programar).observe(raiz, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', programar);
  window.addEventListener('apariencia', programar);
  void document.fonts?.ready.then(programar);
  programar();
}
