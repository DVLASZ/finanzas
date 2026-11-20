// Generado por scripts/paletas.mjs (npm run paletas). No se edita a mano.
import type { Piel, Tema } from '../../state/apariencia.ts';

/** Los colores de la píldora 60-30-10 de cada tema: el fondo (60), la estructura (30) y el acento (10). */
export const PILDORAS: { piel: Piel; tema: Tema; f: string; e30: string; a: string }[] = [
  {
    piel: 'obsidiana',
    tema: 'oscuro',
    f: '#000000',
    e30: '#09090b',
    a: '#e5c158'
  },
  {
    piel: 'obsidiana',
    tema: 'claro',
    f: '#faf9f6',
    e30: '#ffffff',
    a: '#e5c158'
  },
  {
    piel: 'midnight',
    tema: 'oscuro',
    f: '#0b1120',
    e30: '#121a2e',
    a: '#38bdf8'
  },
  {
    piel: 'midnight',
    tema: 'claro',
    f: '#eef4ff',
    e30: '#0d1a33',
    a: '#0284c7'
  },
  {
    piel: 'tierra',
    tema: 'oscuro',
    f: '#1c1410',
    e30: '#271c15',
    a: '#d97706'
  },
  {
    piel: 'tierra',
    tema: 'claro',
    f: '#f5ede0',
    e30: '#8a4b25',
    a: '#c2410c'
  },
  {
    piel: 'esmeralda',
    tema: 'oscuro',
    f: '#061e16',
    e30: '#0d2c21',
    a: '#10b981'
  },
  {
    piel: 'esmeralda',
    tema: 'claro',
    f: '#ecfdf5',
    e30: '#0b2417',
    a: '#059669'
  },
  {
    piel: 'bordeaux',
    tema: 'oscuro',
    f: '#2a0813',
    e30: '#3b1120',
    a: '#f43f5e'
  },
  {
    piel: 'bordeaux',
    tema: 'claro',
    f: '#fdf2f4',
    e30: '#4a0e23',
    a: '#be123c'
  },
  {
    piel: 'kinetix',
    tema: 'oscuro',
    f: '#161124',
    e30: '#8e7fe3',
    a: '#a3e635'
  },
  {
    piel: 'kinetix',
    tema: 'claro',
    f: '#f5f3ff',
    e30: '#8e7fe3',
    a: '#4d7c0f'
  }
];

/** Los temas, en el orden del selector. */
export const PIELES: { piel: Piel; nombre: string; detalle: string }[] = [
  { piel: 'obsidiana', nombre: 'Obsidiana', detalle: 'Negro puro, champán y nada de adorno' },
  { piel: 'midnight', nombre: 'Midnight', detalle: 'Azul noche de vidrio y cian eléctrico' },
  { piel: 'tierra', nombre: 'Tierra', detalle: 'Arena, café y terracota, como papel' },
  { piel: 'esmeralda', nombre: 'Esmeralda', detalle: 'Verde bosque y jade, fresco' },
  { piel: 'bordeaux', nombre: 'Bordeaux', detalle: 'Vino burdeos y coral, editorial' },
  { piel: 'kinetix', nombre: 'Kinetix', detalle: 'Morado profundo y lima voltio, angular' },
];
