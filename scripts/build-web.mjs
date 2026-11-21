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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearIconos } from './icono.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(raiz, 'apps', 'web');

const arg = (n, porDefecto) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : porDefecto; };
const dist = arg('out', join(web, 'dist'));
const nombreApp = arg('nombre', 'Mis finanzas');
const nombreCorto = arg('corto', 'Finanzas');
const colorApp = arg('color', '#1f7a5a');
const pielApp = arg('piel', 'obsidiana');
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
const FONDOS = { obsidiana: { oscuro: '#000000', claro: '#faf9f6' }, midnight: { oscuro: '#0b1120', claro: '#eef4ff' }, tierra: { oscuro: '#1c1410', claro: '#f5ede0' }, esmeralda: { oscuro: '#061e16', claro: '#ecfdf5' }, bordeaux: { oscuro: '#2a0813', claro: '#fdf2f4' }, kinetix: { oscuro: '#161124', claro: '#f5f3ff' } };
const fondoApp = FONDOS[pielApp]?.[temaApp === 'claro' ? 'claro' : 'oscuro'] ?? '#0b1120';
// El nombre de la app cambia por instalación (así se distinguen en el celular).
writeFileSync(join(dist, 'index.html'), readFileSync(join(web, 'index.html'), 'utf8')
  .replace('data-plantilla="personal"', `data-plantilla="${plantillaApp}"`)
  .replace('<title>Mis finanzas</title>', `<title>${nombreApp}</title>`)
  // lo de fábrica de esta instalación (la persona puede cambiarlo dentro de la app)
  .replace('data-piel-defecto="obsidiana" data-tema-defecto="oscuro" data-letra-defecto="normal" data-piel="obsidiana" data-tema="oscuro" data-letra="normal"', `data-piel-defecto="${pielApp}" data-tema-defecto="${temaApp}" data-letra-defecto="${letraApp}" data-piel="${pielApp}" data-tema="${temaApp === 'auto' ? 'claro' : temaApp}" data-letra="${letraApp}"${matizApp ? ` data-matiz="${matizApp}"` : ''}`));
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({ ...JSON.parse(readFileSync(join(web, 'manifest.webmanifest'), 'utf8')), name: nombreApp, short_name: nombreCorto, theme_color: fondoApp, background_color: fondoApp }, null, 2));
writeFileSync(join(dist, 'tema.js'), readFileSync(join(web, 'tema.js'), 'utf8'));
writeFileSync(join(dist, 'sw.js'), readFileSync(join(web, 'sw.js'), 'utf8').replaceAll('__VERSION__', Date.now().toString(36)));

// ---- Íconos: ver scripts/icono.mjs (el acento cambia por plantilla) ----
const iconos = crearIconos(plantillaApp, colorApp);
writeFileSync(join(dist, 'icon.svg'), iconos.svg);
writeFileSync(join(dist, 'icon-192.png'), iconos.png192);
writeFileSync(join(dist, 'icon-512.png'), iconos.png512);

// ---- Cabeceras de seguridad para la página: los archivos de la app los sirve Cloudflare directo (sin pasar por el código del
// Worker), así que las mismas cabeceras que pone el Worker a la API van aquí, en el archivo _headers.
const { CABECERAS_SEGURAS } = await import(pathToFileURL(join(raiz, 'apps', 'worker', 'src', 'seguridad.ts')).href);
writeFileSync(join(dist, '_headers'), ['/*', ...Object.entries(CABECERAS_SEGURAS).map(([k, v]) => `  ${k}: ${v}`), ''].join(String.fromCharCode(10)));

console.log(`App compilada en ${dist}`);
