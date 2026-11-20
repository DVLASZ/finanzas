/**
 * Apariencia: piel, tema (claro, oscuro o automático) y tamaño de letra.
 *
 * Lo que la persona elige se guarda en el dispositivo (localStorage, para poder aplicarlo ANTES de
 * pintar y que no parpadee). Mientras no elija nada, vale lo que trae la instalación (atributos
 * data-*-defecto de <html>, puestos al compilar la app de cada instalación).
 */
import { momentanea } from '../lib/efectos.ts';
export type Tema = 'claro' | 'oscuro' | 'auto';
export type Letra = 'normal' | 'grande';
export type Piel = 'obsidiana' | 'midnight' | 'tierra' | 'esmeralda' | 'bordeaux' | 'kinetix';

/**
 * Los temas que ya no existen y el que los reemplaza. Quien tenía guardado uno de estos sigue con algo parecido, sin errores.
 * Se repite en tema.js (que corre antes de pintar): si cambias uno, cambia el otro.
 */
const LEGADO: Record<string, Piel> = {
  libro: 'midnight', oceano: 'midnight', zafiro: 'midnight', abyss: 'midnight',
  mocha: 'tierra', veltro: 'esmeralda', aether: 'kinetix', onyx: 'obsidiana', atardecer: 'bordeaux',
};
const VIGENTES: string[] = ['obsidiana', 'midnight', 'tierra', 'esmeralda', 'bordeaux', 'kinetix'];

/** Un nombre de tema guardado o de fábrica, llevado a uno que existe. */
export function pielValida(p: string | undefined): Piel {
  if (p && VIGENTES.includes(p)) return p as Piel;
  return (p && LEGADO[p]) || 'midnight';
}

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
  html.dataset.piel = pielValida(e.piel ?? html.dataset.pielDefecto);
  html.dataset.temaElegido = tema;
  html.dataset.tema = tema === 'auto' ? (oscuroDelSistema() ? 'oscuro' : 'claro') : tema;
  html.dataset.letra = e.letra ?? html.dataset.letraDefecto ?? 'normal';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(html).getPropertyValue('--fondo').trim() || '#0b1120');
  window.dispatchEvent(new Event('apariencia')); // para que la cabecera y Ajustes se pongan al día
}

export const actual = () => ({
  tema: (html.dataset.temaElegido as Tema) ?? 'auto',
  letra: (html.dataset.letra as Letra) ?? 'normal',
  piel: pielValida(html.dataset.piel),
  oscuro: html.dataset.tema === 'oscuro',
});

export function elegir(cambio: Elegido): void {
  momentanea('cambiando-tema', 500);
  guardar({ ...leer(), ...cambio });
  aplicar();
}

/** Un toque: de claro a oscuro y de oscuro a claro. */
export function alternarTema(): void {
  elegir({ tema: html.dataset.tema === 'oscuro' ? 'claro' : 'oscuro' });
}

// Si está en automático y el teléfono cambia de tema, la app lo sigue.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (actual().tema === 'auto') aplicar(); });
