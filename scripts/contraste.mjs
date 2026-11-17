// Comprueba que cada par de colores de apps/web/estilos/temas.css se pueda leer (AA: 4,5 a 1 para texto normal).
// Lee las variables de cada piel y tema directamente del CSS, así no hay una segunda lista que se desactualice.
// Uso: npm run contraste   (también corre dentro de `npm run check`)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'estilos', 'temas.css'), 'utf8');

const luz = h => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const razon = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// html[data-piel="X"][data-tema="Y"] { --a: #...; }  (y la variante con data-matiz)
const bloques = [...css.matchAll(/html((?:\[[^\]]+\])+)\s*\{([^}]*)\}/g)].map(m => ({
  sel: Object.fromEntries([...m[1].matchAll(/\[data-([a-z]+)="([^"]+)"\]/g)].map(x => [x[1], x[2]])),
  vars: Object.fromEntries([...m[2].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map(x => [x[1], x[2]])),
})).filter(b => Object.keys(b.vars).length);

const PARES = [
  ['tx', 'fondo'], ['tx', 'sup'], ['tx2', 'fondo'], ['tx2', 'sup'], ['tx2', 'elev'], ['sobre', 'marca'], ['marca', 'sup'], ['marca', 'fondo'],
  ['tx-marca-sup', 'marca-sup'], ['pos', 'sup'], ['neg', 'sup'], ['adv', 'sup'], ['pos', 'fondo'], ['neg', 'fondo'], ['tx', 'elev'],
  // el botón principal es un degradado de marca a marca-2: el texto tiene que leerse sobre los dos extremos
  ['sobre', 'marca-2'], ['info', 'sup'], ['acc', 'sup'], ['pos', 'elev'], ['neg', 'elev'], ['adv', 'elev'], ['info', 'fondo'], ['acc', 'fondo'],
];
const combos = [['libro', 'claro', ''], ['libro', 'oscuro', ''], ['tierra', 'claro', ''], ['tierra', 'oscuro', ''], ['tierra', 'claro', 'azulado'], ['tierra', 'oscuro', 'azulado'],
  ['esmeralda', 'claro', ''], ['esmeralda', 'oscuro', ''], ['oceano', 'claro', ''], ['oceano', 'oscuro', ''], ['atardecer', 'claro', ''], ['atardecer', 'oscuro', ''],
  ['obsidiana', 'claro', ''], ['obsidiana', 'oscuro', '']];

let mal = 0;
for (const [piel, tema, matiz] of combos) {
  const v = {};
  for (const b of bloques) {
    const s = b.sel;
    if (s.piel === piel && s.tema === tema && (!s.matiz || s.matiz === matiz)) Object.assign(v, b.vars);
  }
  for (const [a, b] of PARES) {
    if (!v[a] || !v[b]) { console.log(`FALTA ${piel}/${tema}${matiz ? '/' + matiz : ''}: --${a} o --${b}`); mal++; continue; }
    const r = razon(v[a], v[b]);
    if (r < 4.5) { console.log(`NO LLEGA ${piel}/${tema}${matiz ? '/' + matiz : ''}: --${a} ${v[a]} sobre --${b} ${v[b]} = ${r.toFixed(2)}`); mal++; }
  }
}
// El fondo es una aurora: brillos de color (estilos/tailwind.css, --c-*) sobre el fondo del tema, a su intensidad máxima. Se toma el peor
// caso: cada color con la intensidad más alta, sin contar el desenfoque. El texto que va directo sobre el fondo tiene que leerse sobre
// esa mezcla. Lo que va dentro de tarjetas, burbujas y hojas es vidrio: la superficie con --cristal-a de opacidad sobre esa misma
// mezcla (más un tinte de la marca), y ahí también tienen que leerse el texto y los colores de estado.
const tw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'estilos', 'tailwind.css'), 'utf8');
const colores = bloque => Object.values(Object.fromEntries([...bloque.matchAll(/--c-([a-z]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]])));
const bloqueOscuro = /\n  html \{([^}]*--c-cian[^}]*)\}/.exec(tw)?.[1] ?? '';
const bloqueClaro = /html\[data-tema="claro"\]\s*\{([^}]*--c-[^}]*)\}/.exec(tw)?.[1] ?? '';
const brillos = { oscuro: colores(bloqueOscuro), claro: colores(bloqueClaro) };
const num = (re, def = 0) => Number(re.exec(tw)?.[1] ?? def) / 100;
const intensidad = { oscuro: Math.max(num(/data-tema="oscuro"\]\s*\{\s*--glow-i:\s*(\d+)%/), num(/data-tema="oscuro"\]\s*\{[^}]*--glow-j:\s*(\d+)%/)), claro: Math.max(num(/data-tema="claro"\]\s*\{\s*--glow-i:\s*(\d+)%/), num(/data-tema="claro"\]\s*\{[^}]*--glow-j:\s*(\d+)%/)) };
const cristal = { oscuro: num(/--cristal-a:\s*(\d+)%/), claro: num(/data-tema="claro"\][^}]*--cristal-a:\s*(\d+)%/) };
const mezclar = (base, color, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(base.slice(i, i + 2), 16) * (1 - t) + parseInt(color.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
for (const tema of ['oscuro', 'claro']) {
  if (!brillos[tema].length || !intensidad[tema] || !cristal[tema]) { console.log(`FALTAN los colores, la intensidad o la opacidad de vidrio del fondo (${tema}) en tailwind.css`); mal++; }
}
for (const [piel, tema, matiz] of combos) {
  const v = {};
  for (const b of bloques) { const x = b.sel; if (x.piel === piel && x.tema === tema && (!x.matiz || x.matiz === matiz)) Object.assign(v, b.vars); }
  const t = intensidad[tema];
  for (const brillo of brillos[tema]) {
    const fondo = mezclar(v.fondo, brillo, t);
    for (const texto of ['tx', 'tx2']) {
      const r = razon(v[texto], fondo);
      if (r < 4.5) { console.log(`NO LLEGA ${piel}/${tema}: --${texto} sobre el brillo ${brillo} = ${r.toFixed(2)}`); mal++; }
    }
    // vidrio: la superficie semiopaca sobre el brillo, con el tinte de la marca (9 % y 7 %, peor caso sumados)
    const vidrio = mezclar(mezclar(mezclar(fondo, v.sup, cristal[tema]), v.marca, 0.09), v['marca-2'], 0.07);
    for (const texto of ['tx', 'tx2', 'pos', 'neg', 'adv', 'info']) {
      const r = razon(v[texto], vidrio);
      if (r < 4.5) { console.log(`NO LLEGA ${piel}/${tema}: --${texto} sobre el vidrio con el brillo ${brillo} = ${r.toFixed(2)}`); mal++; }
    }
  }
}
// el mapa de calor: el número de cada día va sobre una mezcla de la superficie con la marca (22 % y 42 %; los dos días más fuertes usan marca y marca-2 con el texto «sobre»)
for (const [piel, tema, matiz] of combos) {
  const v = {};
  for (const b of bloques) { const x = b.sel; if (x.piel === piel && x.tema === tema && (!x.matiz || x.matiz === matiz)) Object.assign(v, b.vars); }
  for (const [t, texto] of [[0.22, 'tx'], [0.42, 'tx']]) {
    const r = razon(v[texto], mezclar(v.sup, v.marca, t));
    if (r < 4.5) { console.log(`NO LLEGA ${piel}/${tema}: --${texto} sobre el mapa de calor al ${t * 100} % = ${r.toFixed(2)}`); mal++; }
  }
}
console.log(mal ? `\n${mal} par(es) de colores no se leen bien.` : 'OK   Todos los pares de colores llegan a AA (4,5 a 1).');
process.exit(mal ? 1 : 0);
