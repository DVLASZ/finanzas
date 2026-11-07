// Comprueba que cada par de colores de apps/web/styles.css se pueda leer (AA: 4,5 a 1 para texto normal).
// Lee las variables de cada piel y tema directamente del CSS, así no hay una segunda lista que se desactualice.
// Uso: npm run contraste   (también corre dentro de `npm run check`)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'styles.css'), 'utf8');

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
];
const combos = [['libro', 'claro', ''], ['libro', 'oscuro', ''], ['tierra', 'claro', ''], ['tierra', 'oscuro', ''], ['tierra', 'claro', 'azulado'], ['tierra', 'oscuro', 'azulado']];

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
console.log(mal ? `\n${mal} par(es) de colores no se leen bien.` : 'OK   Todos los pares de colores llegan a AA (4,5 a 1).');
process.exit(mal ? 1 : 0);
