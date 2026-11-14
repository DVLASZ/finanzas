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
import { crearIconos } from './icono.mjs';

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
// La barra del sistema y la pantalla de arranque usan el fondo del tema de fábrica: así nada de otro color asoma bajo la app.
const FONDOS = { libro: { oscuro: '#090d16', claro: '#f3f5fa' }, tierra: { oscuro: '#17110c', claro: '#f7f0e6' } };
const fondoApp = FONDOS[pielApp]?.[temaApp === 'claro' ? 'claro' : 'oscuro'] ?? '#090d16';
// El nombre de la app cambia por instalación (así se distinguen en el celular).
writeFileSync(join(dist, 'index.html'), readFileSync(join(web, 'index.html'), 'utf8')
  .replace('data-plantilla="personal"', `data-plantilla="${plantillaApp}"`)
  .replace('<title>Mis finanzas</title>', `<title>${nombreApp}</title>`)
  // lo de fábrica de esta instalación (la persona puede cambiarlo dentro de la app)
  .replace('data-piel-defecto="libro" data-tema-defecto="oscuro" data-letra-defecto="normal" data-piel="libro" data-tema="oscuro" data-letra="normal"', `data-piel-defecto="${pielApp}" data-tema-defecto="${temaApp}" data-letra-defecto="${letraApp}" data-piel="${pielApp}" data-tema="${temaApp === 'auto' ? 'claro' : temaApp}" data-letra="${letraApp}"${matizApp ? ` data-matiz="${matizApp}"` : ''}`));
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({ ...JSON.parse(readFileSync(join(web, 'manifest.webmanifest'), 'utf8')), name: nombreApp, short_name: nombreCorto, theme_color: fondoApp, background_color: fondoApp }, null, 2));
writeFileSync(join(dist, 'sw.js'), readFileSync(join(web, 'sw.js'), 'utf8').replaceAll('__VERSION__', Date.now().toString(36)));

// ---- Íconos: ver scripts/icono.mjs (el acento cambia por plantilla) ----
const iconos = crearIconos(plantillaApp, colorApp);
writeFileSync(join(dist, 'icon.svg'), iconos.svg);
writeFileSync(join(dist, 'icon-192.png'), iconos.png192);
writeFileSync(join(dist, 'icon-512.png'), iconos.png512);

console.log(`App compilada en ${dist}`);
