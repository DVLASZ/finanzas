// Compila la app web a apps/web/dist (lo que sirve el Worker o cualquier hosting estático).
//
//   - Empaqueta apps/web/src/main.tsx (y el núcleo) en un solo app.js con esbuild.
//   - Compila Tailwind (CLI) a styles.css; copia index.html y manifest.
//   - Escribe sw.js con una versión nueva (así los dispositivos se actualizan solos).
//   - Genera los íconos (SVG y PNG) sin depender de ninguna imagen externa.
//
// Uso: npm run web:build
//      node scripts/build-web.mjs --out <carpeta> --nombre "Empresa" --corto "Empresa" --color "#0f766e"
//      (así se compila la app de cada instalación con su nombre y el color de su ícono; ver instalar.mjs)

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(raiz, 'apps', 'web');

const arg = (n, porDefecto) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : porDefecto; };
const dist = arg('out', join(web, 'dist'));
const nombreApp = arg('nombre', 'Mis finanzas');
const nombreCorto = arg('corto', 'Finanzas');
const colorApp = arg('color', '#1f7a5a');
const pielApp = arg('piel', 'libro');
const temaApp = arg('tema', 'oscuro');
const letraApp = arg('letra', 'normal');
const matizApp = arg('matiz', '');
const plantillaApp = arg('plantilla', 'personal');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(web, 'src', 'main.tsx')],
  outfile: join(dist, 'app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  // Preact con JSX automático; lo que pida «react» se resuelve con preact/compat (así sirven las librerías hechas para React)
  jsx: 'automatic',
  jsxImportSource: 'preact',
  alias: { react: 'preact/compat', 'react-dom': 'preact/compat' },
  minify: true,
  logLevel: 'info',
});

// Estilos: todo sale de Tailwind (apps/web/estilos). Se corre con su CLI (viene en node_modules, sin red) y solo
// escribe las clases que encuentra en apps/web/src.
const tailwind = join(raiz, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
const salidaTailwind = join(dist, 'tailwind.css');
const rt = spawnSync(process.execPath, [tailwind, '-i', join(web, 'estilos', 'tailwind.css'), '-o', salidaTailwind, '--minify'], { cwd: raiz, encoding: 'utf8' });
if (rt.status !== 0) { console.error(rt.stdout + rt.stderr); process.exit(1); }
renameSync(salidaTailwind, join(dist, 'styles.css'));
// El nombre y el color de la app cambian por instalación (así se distinguen en el celular).
writeFileSync(join(dist, 'index.html'), readFileSync(join(web, 'index.html'), 'utf8')
  .replace('data-plantilla="personal"', `data-plantilla="${plantillaApp}"`)
  .replace('<title>Mis finanzas</title>', `<title>${nombreApp}</title>`)
  // lo de fábrica de esta instalación (la persona puede cambiarlo dentro de la app)
  .replace('data-piel-defecto="libro" data-tema-defecto="oscuro" data-letra-defecto="normal" data-piel="libro" data-tema="oscuro" data-letra="normal"', `data-piel-defecto="${pielApp}" data-tema-defecto="${temaApp}" data-letra-defecto="${letraApp}" data-piel="${pielApp}" data-tema="${temaApp === 'auto' ? 'claro' : temaApp}" data-letra="${letraApp}"${matizApp ? ` data-matiz="${matizApp}"` : ''}`));
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({ ...JSON.parse(readFileSync(join(web, 'manifest.webmanifest'), 'utf8')), name: nombreApp, short_name: nombreCorto, theme_color: colorApp }, null, 2));
writeFileSync(join(dist, 'sw.js'), readFileSync(join(web, 'sw.js'), 'utf8').replaceAll('__VERSION__', Date.now().toString(36)));

// ---- Íconos: una moneda blanca sobre fondo verde ----
const VERDE = [1, 3, 5].map(i => parseInt(colorApp.slice(i, i + 2), 16));
const BLANCO = [0xff, 0xff, 0xff];

writeFileSync(join(dist, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${colorApp}"/>
  <circle cx="256" cy="256" r="150" fill="#fff"/>
  <circle cx="256" cy="256" r="104" fill="${colorApp}"/>
  <text x="256" y="298" font-family="system-ui,sans-serif" font-size="140" font-weight="700" text-anchor="middle" fill="#fff">$</text>
</svg>
`);

const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const trozo = (tipo, datos) => {
  const t = Buffer.from(tipo);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([largo, t, datos, crc]);
};

function png(tam) {
  const filas = [];
  const c = tam / 2;
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 4); // filtro 0 + RGBA
    for (let x = 0; x < tam; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const color = d <= tam * 0.29 && d >= tam * 0.2 ? BLANCO : VERDE; // anillo blanco
      fila.set([...color, 255], 1 + x * 4);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(Buffer.concat(filas))),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}
writeFileSync(join(dist, 'icon-192.png'), png(192));
writeFileSync(join(dist, 'icon-512.png'), png(512));

console.log(`App compilada en ${dist}`);
