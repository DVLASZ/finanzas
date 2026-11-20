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
  // Obsidiana: negro AMOLED (60), tarjetas casi negras (30), champán dorado (10). Sin aurora.
  { piel: 'obsidiana', tema: 'oscuro', f: '#000000', s: '#09090b', e: '#131316', tx: '#f4f4f6', tx2: '#9ca3af', a: '#e5c158', a2: '#c9a43a', neg: '#f28b82', adv: '#e2b85c', info: '#9cb3d1', glow: false },
  { piel: 'obsidiana', tema: 'claro', f: '#faf9f6', s: '#ffffff', e: '#eeece5', tx: '#111114', tx2: '#585c67', a: '#e5c158', a2: '#c9a43a', atx: '#7a5c0f', p30: '#ffffff', glow: false },
  // Midnight: azul noche (60), azul pizarra (30), cian eléctrico (10), vidrio y aurora azul-índigo
  { piel: 'midnight', tema: 'oscuro', f: '#0b1120', s: '#121a2e', e: '#1b2740', tx: '#eef3fc', a: '#38bdf8', a2: '#818cf8' },
  { piel: 'midnight', tema: 'claro', f: '#eef4ff', s: '#f9fbff', e: '#d9e5fb', tx: '#0d1a33', tx2: '#43557a', a: '#0284c7', a2: '#4f46e5', p30: '#0d1a33' },
  // Tierra: café tostado (60), cuero (30), terracota (10), mate y de papel
  { piel: 'tierra', tema: 'oscuro', f: '#1c1410', s: '#271c15', e: '#33261c', tx: '#f5ebdd', a: '#d97706', a2: '#f2c14e', pos: '#8bd48b', neg: '#ff9b8a', adv: '#f2c14e' },
  { piel: 'tierra', tema: 'claro', f: '#f5ede0', s: '#fcf7ee', e: '#e6d9c2', tx: '#3a2514', tx2: '#684f3c', a: '#c2410c', a2: '#b45309', p30: '#8a4b25' },
  // Esmeralda: verde bosque (60), verde pino (30), esmeralda vibrante (10)
  { piel: 'esmeralda', tema: 'oscuro', f: '#061e16', s: '#0d2c21', e: '#153b2d', tx: '#eefaf4', a: '#10b981', a2: '#2dd4bf', neg: '#fda4af' },
  { piel: 'esmeralda', tema: 'claro', f: '#ecfdf5', s: '#f7fffb', e: '#cfeedd', tx: '#0b2417', a: '#059669', a2: '#0f766e', p30: '#0b2417' },
  // Bordeaux: vino burdeos (60), vino claro (30), frambuesa y coral (10), editorial
  { piel: 'bordeaux', tema: 'oscuro', f: '#2a0813', s: '#3b1120', e: '#4c1b2d', tx: '#fdeef1', a: '#f43f5e', a2: '#fb7185', neg: '#ffb3a7' },
  { piel: 'bordeaux', tema: 'claro', f: '#fdf2f4', s: '#fff9fa', e: '#f3d9de', tx: '#4a0e23', tx2: '#7a4452', a: '#be123c', a2: '#e11d48', p30: '#4a0e23' },
  // Kinetix: morado profundo (60), violeta (30), lima voltio (10), angular y de alto contraste
  { piel: 'kinetix', tema: 'oscuro', ring: '#8e7fe3', f: '#161124', s: '#21193b', e: '#2e2452', tx: '#ece9fa', a: '#a3e635', a2: '#84cc16', p30: '#8e7fe3', bor: '#4a4180' },
  { piel: 'kinetix', tema: 'claro', ring: '#8e7fe3', f: '#f5f3ff', s: '#fcfbff', e: '#e4defa', tx: '#1e1830', tx2: '#52467c', a: '#4d7c0f', a2: '#65a30d', p30: '#8e7fe3', bor: '#b9aee8' },
];

/** Los nombres que se ven en el selector. */
export const NOMBRES = {
  obsidiana: ['Obsidiana', 'Negro puro, champán y nada de adorno'],
  midnight: ['Midnight', 'Azul noche de vidrio y cian eléctrico'],
  tierra: ['Tierra', 'Arena, café y terracota, como papel'],
  esmeralda: ['Esmeralda', 'Verde bosque y jade, fresco'],
  bordeaux: ['Bordeaux', 'Vino burdeos y coral, editorial'],
  kinetix: ['Kinetix', 'Morado profundo y lima voltio, angular'],
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
