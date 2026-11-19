// Las paletas de la app, con la regla 60-30-10, y el generador de lo que sale de ellas.
//
//   npm run paletas
//
// Cada tema (una «piel» en oscuro y en claro) se define con tres colores de intención:
//   f   el 60 %: el fondo y el ambiente de toda la pantalla
//   s   el 30 %: las tarjetas y la estructura (con e, un tono más para lo elevado, y tx, el texto principal)
//   a   el 10 %: el acento, solo para lo clave (botón principal, pestaña activa, progreso, cifras destacadas), con a2 de segundo tono
// Lo demás (texto suave, bordes, el texto sobre el acento, los colores de ingreso, gasto, alerta y dato, el acento como texto, los
// brillos de la aurora) se deriva y se ajusta solo hasta cumplir AA (4,5 a 1) sobre todos los fondos donde se usa. Así un acento
// vibrante como el rojo tomate puede ser el relleno de un botón y, a la vez, tener una versión más oscura para usarse como texto.
//
// Escribe tres cosas, y no se editan a mano:
//   - el bloque entre «PALETAS:INICIO» y «PALETAS:FIN» de apps/web/estilos/temas.css
//   - los brillos de la aurora de cada tema (apps/web/estilos/auroras.css)
//   - la lista del selector de Ajustes (apps/web/src/features/ajustes/temas.generated.ts)
// y luego `npm run contraste` lo vuelve a comprobar desde el CSS, sin fiarse de este archivo.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- color
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const luz = h => { const c = rgb(h).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const razon = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mezcla = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const rgba = (h, a) => `rgba(${rgb(h).join(', ')}, ${a})`;
const aHsl = h => { const [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; const d = mx - mn;
  if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); const t = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(t * 60 + 360) % 360, s, l]; };
const deHsl = ([h, s, l]) => { const k = n => (n + h / 30) % 12; const q = s * Math.min(l, 1 - l); const f = n => l - q * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return hex([f(0) * 255, f(8) * 255, f(4) * 255]); };
const minimo = (c, fondos) => Math.min(...fondos.map(f => razon(c, f)));

/** Acerca `c` al blanco o al negro (el que aleja de los fondos) hasta que se lea con `meta` sobre todos los fondos. */
function ajustar(c, fondos, meta = 4.7) {
  if (minimo(c, fondos) >= meta) return c;
  const claro = fondos.reduce((s, f) => s + luz(f), 0) / fondos.length < 0.3; // fondos oscuros: el texto sube a claro
  const destino = claro ? '#ffffff' : '#000000';
  for (let t = 0.02; t <= 1.001; t += 0.02) { const x = mezcla(c, destino, t); if (minimo(x, fondos) >= meta) return x; }
  return destino;
}

/** El texto sobre el acento: el casi negro o el casi blanco (con el tinte del fondo, o puros) que mejor se lea sobre el primer tono. */
function sobreDe(a, f) {
  const candidatos = [mezcla('#000000', f, 0.12), mezcla('#ffffff', f, 0.06), '#000000', '#ffffff'];
  const bueno = candidatos.find(x => razon(x, a) >= 4.7);
  return bueno ?? candidatos.sort((p, q) => razon(q, a) - razon(p, a))[0];
}

/** Mueve `c` (aclarando u oscureciendo, hacia donde el texto se lea mejor) hasta que `texto` se lea sobre él con `meta`. */
function ajustarContra(c, texto, meta = 4.7) {
  if (razon(texto, c) >= meta) return c;
  const alejar = luz(texto) > luz(c) ? '#000000' : '#ffffff';
  for (let t = 0.02; t <= 1.001; t += 0.02) { const x = mezcla(c, alejar, t); if (razon(texto, x) >= meta) return x; }
  return c;
}

/** Si ningún texto llega a 4,5 sobre el acento, se oscurece o aclara el acento lo mínimo. */
function acentoLegible(a, f) {
  const prueba = x => Math.max(razon('#000000', x), razon('#ffffff', x));
  if (prueba(a) >= 4.7) return a;
  for (let t = 0.02; t < 0.6; t += 0.02) { const x = mezcla(a, luz(a) > 0.3 ? '#000000' : '#ffffff', t); if (prueba(x) >= 4.7) return x; }
  return a;
}

// ---------------------------------------------------------------- las paletas
// Cada entrada: piel, tema, nombre, f (60), s (30, superficie), e (30, elevado), tx (texto principal), a (10), a2 (10, segundo tono).
// Opcionales: tx2, atx (el acento como texto), pos/neg/adv/info (semánticos), p30 (el color de estructura que se muestra en la
// píldora del selector cuando no es la superficie), glow (cuatro colores de la aurora).
export const PALETAS = [
  // ---- los de siempre, rediseñados. El oscuro de Fintech y de Tierra se escriben a mano en temas.css (manual: no generan CSS, solo salen en el selector)
  { piel: 'libro', tema: 'oscuro', manual: true, f: '#090d16', s: '#111827', e: '#1b2538', tx: '#f1f5fb', a: '#38bdf8', a2: '#818cf8' },
  { piel: 'tierra', tema: 'oscuro', manual: true, f: '#17110c', s: '#211812', e: '#2c2118', tx: '#f5ebdd', a: '#f0a06a', a2: '#f2c14e' },
  { piel: 'libro', tema: 'claro', f: '#e4eaf2', s: '#f7f9fc', e: '#d6dfeb', tx: '#0f1c2e', tx2: '#45536a', a: '#0e7490', a2: '#4f46e5', p30: '#0f1c2e' },
  { piel: 'tierra', tema: 'claro', f: '#eee1c8', s: '#fbf4e6', e: '#e3d2b0', tx: '#3a2514', tx2: '#684f3c', a: '#b45309', a2: '#047857', p30: '#8a4b25' },
  { piel: 'esmeralda', tema: 'oscuro', f: '#06120e', s: '#0e1d17', e: '#17291f', tx: '#eef8f2', a: '#34d399', a2: '#2dd4bf', neg: '#fda4af' },
  { piel: 'esmeralda', tema: 'claro', f: '#d9eadf', s: '#f1faf4', e: '#c8dfd0', tx: '#0b2417', a: '#047857', a2: '#0f766e', p30: '#0b2417' },
  { piel: 'oceano', tema: 'oscuro', f: '#060f1c', s: '#0d1b2e', e: '#162a44', tx: '#eef6ff', a: '#22d3ee', a2: '#60a5fa', neg: '#fda4af' },
  { piel: 'oceano', tema: 'claro', f: '#d6e8f2', s: '#f0f8fc', e: '#c3dcea', tx: '#08202f', a: '#0369a1', a2: '#0e7490', p30: '#08202f' },
  { piel: 'atardecer', tema: 'oscuro', f: '#170c14', s: '#231320', e: '#321c2d', tx: '#fdf0f4', a: '#fb923c', a2: '#f472b6', pos: '#86efac', adv: '#fbbf24', info: '#7dd3fc' },
  { piel: 'atardecer', tema: 'claro', f: '#f8e1d5', s: '#fff5ef', e: '#efcbbb', tx: '#3a1420', tx2: '#6b4350', a: '#c2410c', a2: '#be185d', p30: '#7a2338' },
  { piel: 'obsidiana', tema: 'oscuro', f: '#000000', s: '#09090b', e: '#111114', tx: '#f4f4f6', tx2: '#9ca3af', a: '#d8c9a3', a2: '#bfc3cc', neg: '#f28b82', adv: '#e2b85c', info: '#9cb3d1', glow: false },
  { piel: 'obsidiana', tema: 'claro', f: '#f6f5f0', s: '#ffffff', e: '#eae8e1', tx: '#111114', tx2: '#585c67', a: '#8a6f2f', a2: '#585c67', glow: false },

  // ---- los siete nuevos
  // Veltro: crema editorial (60), verde abeto (30), rojo tomate (10)
  { piel: 'veltro', tema: 'claro', ring: '#1b4532', f: '#eee2cb', s: '#f8f0dd', e: '#e2d3b3', tx: '#1b4532', tx2: '#3f5f4d', a: '#ee4129', a2: '#f26b3a', atx: '#b3301c', p30: '#1b4532', bor: '#cdbb98', neg: '#a8281a' },
  { piel: 'veltro', tema: 'oscuro', f: '#0f2619', s: '#173526', e: '#20432f', tx: '#eee2cb', a: '#ee4129', a2: '#f26b3a', atx: '#ff7a63', p30: '#1b4532' },
  // Aether: ciruela eclipse (60), seda titanio (30), destello ámbar (10)
  { piel: 'aether', tema: 'oscuro', f: '#2b1c33', s: '#38264a', e: '#47325a', tx: '#d9d3cc', a: '#ff8c12', a2: '#ffb454', p30: '#d9d3cc' },
  { piel: 'aether', tema: 'claro', f: '#e8e1da', s: '#f7f3ee', e: '#d9d0c7', tx: '#2b1c33', tx2: '#5d4a66', a: '#ff8c12', a2: '#ffa640', atx: '#9c4f00', p30: '#2b1c33' },
  // Kinetix: índigo noche (60), lavanda eléctrico (30), verde voltio (10)
  { piel: 'kinetix', tema: 'oscuro', ring: '#8e7fe3', f: '#1e1830', s: '#2a2342', e: '#37305a', tx: '#ece9fa', a: '#c6ff24', a2: '#9be000', p30: '#8e7fe3', bor: '#4a4180' },
  { piel: 'kinetix', tema: 'claro', ring: '#8e7fe3', f: '#e9e5fa', s: '#f7f5ff', e: '#d9d3f3', tx: '#1e1830', tx2: '#52467c', a: '#c6ff24', a2: '#a6e810', atx: '#4a3dbd', p30: '#8e7fe3', bor: '#c8bff0' },
  // Abyss: azul abisal (60), cian nébula (30), rosa neón (10)
  { piel: 'abyss', tema: 'oscuro', ring: '#00b7cb', f: '#01485a', s: '#065e74', e: '#0b7088', tx: '#e8f9fc', a: '#ff3b8b', a2: '#ff6fa8', atx: '#ff9cc2', p30: '#00b7cb', bor: '#0d8aa0' },
  { piel: 'abyss', tema: 'claro', ring: '#00b7cb', f: '#d3eff4', s: '#ebfafc', e: '#bde3ea', tx: '#013544', tx2: '#1d5b6a', a: '#e0207a', a2: '#ff4f98', atx: '#c0136a', p30: '#00b7cb', bor: '#9fd3dd' },
  // Mocha Silk: crema seda (60), café mocha (30), azul cielo (10)
  { piel: 'mocha', tema: 'claro', f: '#f3e8d8', s: '#fbf6ec', e: '#e7d8c0', tx: '#433329', tx2: '#6c5849', a: '#86bcef', a2: '#a8d2f5', atx: '#2c6aa3', p30: '#433329' },
  { piel: 'mocha', tema: 'oscuro', f: '#2a211b', s: '#382d25', e: '#46392f', tx: '#f3e8d8', a: '#86bcef', a2: '#a8d2f5', p30: '#433329' },
  // Onyx Solar: negro esmeralda (60), amarillo solar (30), índigo vórtice (10)
  { piel: 'onyx', tema: 'oscuro', ring: '#e8c613', f: '#051a10', s: '#0b2a1b', e: '#133a27', tx: '#f4f1dc', a: '#3b2dff', a2: '#6a5cff', atx: '#e8c613', p30: '#e8c613', bor: '#2a4a38' },
  { piel: 'onyx', tema: 'claro', ring: '#c9a800', f: '#f1efd2', s: '#fffdf0', e: '#e3e0bb', tx: '#0a2418', tx2: '#3e5446', a: '#3b2dff', a2: '#6a5cff', atx: '#3b2dff', p30: '#e8c613' },
  // Bordeaux Sage: vino burdeos (60), rosa polvo (30), verde salvia (10)
  { piel: 'bordeaux', tema: 'oscuro', ring: '#f4c3c2', f: '#4a0e23', s: '#5e1a32', e: '#72263f', tx: '#f4c3c2', a: '#80a95b', a2: '#a3c57f', atx: '#a9cd85', p30: '#f4c3c2', neg: '#ffb3a7' },
  { piel: 'bordeaux', tema: 'claro', f: '#f6e4e2', s: '#fff6f5', e: '#ebcfcd', tx: '#4a0e23', tx2: '#7a4452', a: '#80a95b', a2: '#a3c57f', atx: '#4a6e2c', p30: '#4a0e23' },
  // Zafiro Real: azul cobalto (60), estructura azul real (30), cian eléctrico (10)
  { piel: 'zafiro', tema: 'oscuro', ring: '#00b4d8', f: '#0b132b', s: '#1c2541', e: '#1e3a8a', tx: '#eaf2ff', a: '#00b4d8', a2: '#48cae4', atx: '#48cae4', p30: '#1e3a8a', bor: '#2b4a9e' },
  { piel: 'zafiro', tema: 'claro', ring: '#0284c7', f: '#eef4ff', s: '#f9fbff', e: '#dbe7ff', tx: '#0b132b', tx2: '#34446e', a: '#0284c7', a2: '#38a9e6', atx: '#0369a1', p30: '#1e3a8a', bor: '#bccdee' },
];

/** Los nombres que se ven en el selector, y de dónde viene cada tema. */
export const NOMBRES = {
  libro: ['Midnight Fintech', 'Gris hielo y pizarra, con cian e índigo'], tierra: ['Tierra Editorial', 'Arena y café, con ámbar y esmeralda'],
  esmeralda: ['Esmeralda', 'Verde bosque y menta'], oceano: ['Océano', 'Azul marino y turquesa'], atardecer: ['Atardecer', 'Durazno, coral y ciruela'],
  obsidiana: ['Obsidiana', 'Negro puro, minimalista'], veltro: ['Veltro', 'Crema, abeto y rojo tomate'], aether: ['Aether', 'Ciruela, titanio y ámbar'],
  kinetix: ['Kinetix', 'Índigo, lavanda y verde voltio'], abyss: ['Abyss', 'Azul abisal, cian y rosa neón'], mocha: ['Mocha Silk', 'Crema seda, mocha y azul cielo'],
  onyx: ['Onyx Solar', 'Negro esmeralda, oro e índigo'], bordeaux: ['Bordeaux Sage', 'Burdeos, rosa polvo y salvia'], zafiro: ['Zafiro Real', 'Cobalto, azul real y cian eléctrico'],
};

// ---------------------------------------------------------------- derivar una paleta completa
function derivar(p) {
  const oscuro = p.tema === 'oscuro';
  const { f, s, e, tx } = p;
  const tinte = mezcla(mezcla(s, p.a, 0.09), p.a2, 0.07);
  const heroTint = mezcla(mezcla(s, p.a, 0.16), p.a2, 0.08); // la tarjeta grande de Saldos
  const fondos = [f, s, e, tinte, heroTint];
  const a = acentoLegible(p.a, f);
  const sobre = sobreDe(a, f);
  const a2 = ajustarContra(acentoLegible(p.a2, f), sobre);
  const tx2 = ajustar(p.tx2 ?? mezcla(tx, f, oscuro ? 0.38 : 0.34), fondos, 4.9);
  const atx = ajustar(p.atx ?? a, fondos, 4.9);
  const bor = p.bor ?? mezcla(f, tx, oscuro ? 0.16 : 0.18);
  const base = oscuro ? { pos: '#34d399', neg: '#fb7185', adv: '#fbbf24', info: '#7cc4f0' } : { pos: '#046c4e', neg: '#b4213a', adv: '#8f5200', info: '#0b5f8f' };
  const sem = k => ajustar(p[k] ?? base[k], fondos, 4.9);
  const marcaSup = mezcla(s, a, oscuro ? 0.2 : 0.16);
  const txMarcaSup = ajustar(mezcla(tx, a, oscuro ? 0.1 : 0.0), [marcaSup], 7);
  return {
    fondo: f, sup: s, elev: e, tx, tx2, bor,
    marca: a, 'marca-2': a2, sobre, 'marca-tx': atx, 'marca-sup': marcaSup, 'tx-marca-sup': txMarcaSup,
    pos: sem('pos'), neg: sem('neg'), adv: sem('adv'), info: sem('info'), acc: ajustar(mezcla(atx, tx, 0.25), fondos, 4.9),
    vidrio: rgba(f, oscuro ? 0.74 : 0.8), anillo: p.ring ? rgba(p.ring, oscuro ? 0.22 : 0.26) : oscuro ? rgba(tx, 0.1) : rgba(tx, 0.12), brillo: rgba(a, oscuro ? 0.22 : 0.18),
    'halo-1': rgba(a, oscuro ? 0.2 : 0.14), 'halo-2': rgba(a2, oscuro ? 0.14 : 0.1),
  };
}

// ---------------------------------------------------------------- la aurora: brillos que no apagan el texto
// El CSS mezcla cada brillo con el fondo a su intensidad máxima. Aquí se oscurece (o aclara) cada brillo hasta que, en el peor caso, el
// texto siga leyéndose; scripts/contraste.mjs lo vuelve a comprobar con los mismos números.
const INTENSIDAD = { oscuro: 0.62, claro: 0.32 };
const CRISTAL = { oscuro: 0.74, claro: 0.86 };

function brilloSeguro(g, v, tema) {
  const t = INTENSIDAD[tema];
  const aceptable = c => {
    const fondo = mezcla(v.fondo, c, t);
    if (razon(v.tx, fondo) < 4.6 || razon(v.tx2, fondo) < 4.6) return false;
    const vidrio = mezcla(mezcla(mezcla(fondo, v.sup, CRISTAL[tema]), v.marca, 0.09), v['marca-2'], 0.07);
    return ['tx', 'tx2', 'pos', 'neg', 'adv', 'info'].every(k => razon(v[k], vidrio) >= 4.6);
  };
  // se baja (o se sube, en claro) la luminosidad conservando el tono y la saturación: la aurora sigue siendo de color y no un gris
  let [h, s, l] = aHsl(g);
  let x = g;
  for (let i = 0; i < 60 && !aceptable(x); i++) { l = tema === 'oscuro' ? l - 0.015 : l + 0.012; x = deHsl([h, Math.min(1, s * 1.04), Math.max(0.02, Math.min(0.98, l))]); }
  return x;
}

function brillos(p, v) {
  const [r1, r2, r3, r4] = [p.a, p.a2, p.p30 ?? mezcla(p.a, p.a2, 0.5), mezcla(p.a, p.s, 0.5)];
  return [r1, r2, r3, r4].map(c => brilloSeguro(c, v, p.tema));
}

// ---------------------------------------------------------------- salida
const ORDEN = ['fondo', 'sup', 'elev', 'tx', 'tx2', 'bor', 'marca', 'marca-2', 'sobre', 'marca-tx', 'marca-sup', 'tx-marca-sup', 'pos', 'neg', 'adv', 'info', 'acc', 'vidrio', 'anillo', 'brillo', 'halo-1', 'halo-2'];

export function generar() {
  let temas = '';
  let auroras = '';
  const lista = [];
  for (const p of PALETAS) {
    if (p.manual) { lista.push({ piel: p.piel, tema: p.tema, f: p.f, e30: p.s, a: p.a }); continue; }
    const v = derivar(p);
    const linea = ks => '  ' + ks.map(k => `--${k}: ${v[k]};`).join(' ');
    temas += `html[data-piel="${p.piel}"][data-tema="${p.tema}"] {\n${linea(['fondo', 'sup', 'elev', 'tx', 'tx2', 'bor'])}\n${linea(['marca', 'marca-2', 'sobre', 'marca-tx', 'marca-sup', 'tx-marca-sup'])}\n${linea(['pos', 'neg', 'adv', 'info', 'acc'])}\n${linea(['vidrio', 'anillo', 'brillo'])}\n${linea(['halo-1', 'halo-2'])}\n}\n`;
    if (p.glow !== false) {
      const [g1, g2, g3, g4] = brillos(p, v);
      auroras += `html[data-piel="${p.piel}"][data-tema="${p.tema}"] { --glow-a: ${g1}; --glow-b: ${g2}; --glow-c: ${g3}; --glow-d: ${g4}; }\nhtml[data-piel="${p.piel}"][data-tema="${p.tema}"][data-seccion] { --sec: ${g1}; }\n`;
    }
    lista.push({ piel: p.piel, tema: p.tema, f: v.fondo, e30: p.p30 ?? v.sup, a: v.marca });
  }
  return { temas, auroras, lista };
}

if (process.argv[1] && process.argv[1].endsWith('paletas.mjs')) {
  const { temas, auroras, lista } = generar();
  const ruta = join(raiz, 'apps', 'web', 'estilos', 'temas.css');
  const css = readFileSync(ruta, 'utf8');
  const ini = css.indexOf('/* PALETAS:INICIO */'), fin = css.indexOf('/* PALETAS:FIN */');
  if (ini < 0 || fin < 0) throw new Error('Faltan las marcas PALETAS:INICIO y PALETAS:FIN en temas.css');
  writeFileSync(ruta, css.slice(0, ini) + '/* PALETAS:INICIO */\n/* Generado por scripts/paletas.mjs (npm run paletas). No se edita a mano: se cambia la paleta allá. */\n' + temas + css.slice(fin));
  writeFileSync(join(raiz, 'apps', 'web', 'estilos', 'auroras.css'), '/* Generado por scripts/paletas.mjs: los brillos de la aurora de cada tema, ya ajustados para que el texto se lea. */\n' + auroras);
  const piezas = Object.entries(NOMBRES).map(([piel, [nombre, detalle]]) => `  { piel: '${piel}', nombre: '${nombre}', detalle: '${detalle}' },`).join('\n');
  const temasTs = `// Generado por scripts/paletas.mjs (npm run paletas). No se edita a mano.\nimport type { Piel, Tema } from '../../state/apariencia.ts';\n\n/** Los colores de la píldora 60-30-10 de cada tema: el fondo (60), la estructura (30) y el acento (10). */\nexport const PILDORAS: { piel: Piel; tema: Tema; f: string; e30: string; a: string }[] = ${JSON.stringify(lista, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};\n\n/** Los temas, en el orden del selector. */\nexport const PIELES: { piel: Piel; nombre: string; detalle: string }[] = [\n${piezas}\n];\n`;
  writeFileSync(join(raiz, 'apps', 'web', 'src', 'features', 'ajustes', 'temas.generated.ts'), temasTs);
  console.log(`Paletas: ${lista.length} temas escritos.`);
}
