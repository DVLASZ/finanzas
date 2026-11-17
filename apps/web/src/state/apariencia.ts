/**
 * Apariencia: piel, tema (claro, oscuro o automático) y tamaño de letra.
 *
 * Lo que la persona elige se guarda en el dispositivo (localStorage, para poder aplicarlo ANTES de
 * pintar y que no parpadee). Mientras no elija nada, vale lo que trae la instalación (atributos
 * data-*-defecto de <html>, puestos al compilar la app de cada instalación).
 */
export type Tema = 'claro' | 'oscuro' | 'auto';
export type Letra = 'normal' | 'grande';
export type Piel = 'libro' | 'tierra' | 'esmeralda' | 'oceano' | 'atardecer' | 'obsidiana';

interface Elegido { tema?: Tema; letra?: Letra; piel?: Piel }

const CLAVE = 'apariencia';
const html = document.documentElement;

function leer(): Elegido {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Elegido; } catch { return {}; }
}
function guardar(e: Elegido): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* sin almacenamiento (modo privado): vale la sesión */ }
}

const oscuroDelSistema = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;

/** Pone los atributos de <html> según lo elegido o lo de fábrica de la instalación. */
export function aplicar(): void {
  const e = leer();
  const tema = e.tema ?? (html.dataset.temaDefecto as Tema | undefined) ?? 'auto';
  html.dataset.piel = e.piel ?? html.dataset.pielDefecto ?? 'libro';
  html.dataset.temaElegido = tema;
  html.dataset.tema = tema === 'auto' ? (oscuroDelSistema() ? 'oscuro' : 'claro') : tema;
  html.dataset.letra = e.letra ?? html.dataset.letraDefecto ?? 'normal';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(html).getPropertyValue('--fondo').trim() || '#090d16');
  window.dispatchEvent(new Event('apariencia')); // para que la cabecera y Ajustes se pongan al día
}

export const actual = () => ({
  tema: (html.dataset.temaElegido as Tema) ?? 'auto',
  letra: (html.dataset.letra as Letra) ?? 'normal',
  piel: (html.dataset.piel as Piel) ?? 'libro',
  oscuro: html.dataset.tema === 'oscuro',
});

export function elegir(cambio: Elegido): void {
  guardar({ ...leer(), ...cambio });
  aplicar();
}

/** Un toque: de claro a oscuro y de oscuro a claro. */
export function alternarTema(): void {
  elegir({ tema: html.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' });
}

// Si está en automático y el teléfono cambia de tema, la app lo sigue.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (actual().tema === 'auto') aplicar(); });
