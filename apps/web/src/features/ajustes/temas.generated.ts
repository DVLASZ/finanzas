// Generado por scripts/paletas.mjs (npm run paletas). No se edita a mano.
import type { Piel, Tema } from '../../state/apariencia.ts';

/** Los colores de la píldora 60-30-10 de cada tema: el fondo (60), la estructura (30) y el acento (10). */
export const PILDORAS: { piel: Piel; tema: Tema; f: string; e30: string; a: string }[] = [
  {
    piel: 'libro',
    tema: 'oscuro',
    f: '#090d16',
    e30: '#111827',
    a: '#38bdf8'
  },
  {
    piel: 'tierra',
    tema: 'oscuro',
    f: '#17110c',
    e30: '#211812',
    a: '#f0a06a'
  },
  {
    piel: 'libro',
    tema: 'claro',
    f: '#e4eaf2',
    e30: '#0f1c2e',
    a: '#0e7490'
  },
  {
    piel: 'tierra',
    tema: 'claro',
    f: '#eee1c8',
    e30: '#8a4b25',
    a: '#b45309'
  },
  {
    piel: 'esmeralda',
    tema: 'oscuro',
    f: '#06120e',
    e30: '#0e1d17',
    a: '#34d399'
  },
  {
    piel: 'esmeralda',
    tema: 'claro',
    f: '#d9eadf',
    e30: '#0b2417',
    a: '#047857'
  },
  {
    piel: 'oceano',
    tema: 'oscuro',
    f: '#060f1c',
    e30: '#0d1b2e',
    a: '#22d3ee'
  },
  {
    piel: 'oceano',
    tema: 'claro',
    f: '#d6e8f2',
    e30: '#08202f',
    a: '#0369a1'
  },
  {
    piel: 'atardecer',
    tema: 'oscuro',
    f: '#170c14',
    e30: '#231320',
    a: '#fb923c'
  },
  {
    piel: 'atardecer',
    tema: 'claro',
    f: '#f8e1d5',
    e30: '#7a2338',
    a: '#c2410c'
  },
  {
    piel: 'obsidiana',
    tema: 'oscuro',
    f: '#000000',
    e30: '#09090b',
    a: '#d8c9a3'
  },
  {
    piel: 'obsidiana',
    tema: 'claro',
    f: '#f6f5f0',
    e30: '#ffffff',
    a: '#8a6f2f'
  },
  {
    piel: 'veltro',
    tema: 'claro',
    f: '#eee2cb',
    e30: '#1b4532',
    a: '#ee4129'
  },
  {
    piel: 'veltro',
    tema: 'oscuro',
    f: '#0f2619',
    e30: '#1b4532',
    a: '#ee4129'
  },
  {
    piel: 'aether',
    tema: 'oscuro',
    f: '#2b1c33',
    e30: '#d9d3cc',
    a: '#ff8c12'
  },
  {
    piel: 'aether',
    tema: 'claro',
    f: '#e8e1da',
    e30: '#2b1c33',
    a: '#ff8c12'
  },
  {
    piel: 'kinetix',
    tema: 'oscuro',
    f: '#1e1830',
    e30: '#8e7fe3',
    a: '#c6ff24'
  },
  {
    piel: 'kinetix',
    tema: 'claro',
    f: '#e9e5fa',
    e30: '#8e7fe3',
    a: '#c6ff24'
  },
  {
    piel: 'abyss',
    tema: 'oscuro',
    f: '#01485a',
    e30: '#00b7cb',
    a: '#ff3b8b'
  },
  {
    piel: 'abyss',
    tema: 'claro',
    f: '#d3eff4',
    e30: '#00b7cb',
    a: '#e1247d'
  },
  {
    piel: 'mocha',
    tema: 'claro',
    f: '#f3e8d8',
    e30: '#433329',
    a: '#86bcef'
  },
  {
    piel: 'mocha',
    tema: 'oscuro',
    f: '#2a211b',
    e30: '#433329',
    a: '#86bcef'
  },
  {
    piel: 'onyx',
    tema: 'oscuro',
    f: '#051a10',
    e30: '#e8c613',
    a: '#3b2dff'
  },
  {
    piel: 'onyx',
    tema: 'claro',
    f: '#f1efd2',
    e30: '#e8c613',
    a: '#3b2dff'
  },
  {
    piel: 'bordeaux',
    tema: 'oscuro',
    f: '#4a0e23',
    e30: '#f4c3c2',
    a: '#80a95b'
  },
  {
    piel: 'bordeaux',
    tema: 'claro',
    f: '#f6e4e2',
    e30: '#4a0e23',
    a: '#80a95b'
  }
];

/** Los temas, en el orden del selector. */
export const PIELES: { piel: Piel; nombre: string; detalle: string }[] = [
  { piel: 'libro', nombre: 'Midnight Fintech', detalle: 'Gris hielo y pizarra, con cian e índigo' },
  { piel: 'tierra', nombre: 'Tierra Editorial', detalle: 'Arena y café, con ámbar y esmeralda' },
  { piel: 'esmeralda', nombre: 'Esmeralda', detalle: 'Verde bosque y menta' },
  { piel: 'oceano', nombre: 'Océano', detalle: 'Azul marino y turquesa' },
  { piel: 'atardecer', nombre: 'Atardecer', detalle: 'Durazno, coral y ciruela' },
  { piel: 'obsidiana', nombre: 'Obsidiana', detalle: 'Negro puro, minimalista' },
  { piel: 'veltro', nombre: 'Veltro', detalle: 'Crema, abeto y rojo tomate' },
  { piel: 'aether', nombre: 'Aether', detalle: 'Ciruela, titanio y ámbar' },
  { piel: 'kinetix', nombre: 'Kinetix', detalle: 'Índigo, lavanda y verde voltio' },
  { piel: 'abyss', nombre: 'Abyss', detalle: 'Azul abisal, cian y rosa neón' },
  { piel: 'mocha', nombre: 'Mocha Silk', detalle: 'Crema seda, mocha y azul cielo' },
  { piel: 'onyx', nombre: 'Onyx Solar', detalle: 'Negro esmeralda, oro e índigo' },
  { piel: 'bordeaux', nombre: 'Bordeaux Sage', detalle: 'Burdeos, rosa polvo y salvia' },
];
