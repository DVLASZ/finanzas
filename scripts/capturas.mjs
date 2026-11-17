// Saca las capturas del README (docs/screenshots/) con datos inventados, en un Chrome de verdad con pantalla de celular.
//   npm run capturas
// Compila la app, la sirve en un puerto libre, anota unos movimientos de ejemplo por el chat y fotografía cinco pantallas.
// Usa el Chrome que ya tienes (CHROME_PATH si está en otro lado). No usa internet ni toca ninguna base: los datos viven solo
// en el navegador de prueba. Si cambias el diseño, vuelve a correrlo para que las imágenes sigan al día.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'docs', 'screenshots');
const CANDIDATOS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const chrome = CANDIDATOS.find(p => existsSync(p));
if (!chrome) { console.error('No encuentro Chrome. Pon su ruta en CHROME_PATH.'); process.exit(1); }
mkdirSync(salida, { recursive: true });

const build = spawnSync('node', ['scripts/build-web.mjs'], { cwd: raiz, encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout + build.stderr); process.exit(1); }
const PUERTO = 5900 + Math.floor(Math.random() * 90);
const servidor = spawn('node', ['scripts/servir-web.mjs'], { cwd: raiz, env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const espera = ms => new Promise(r => setTimeout(r, ms));

const navegador = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
try {
  const pag = await navegador.newPage();
  await pag.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pag.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });
  await espera(800);

  const escribir = async texto => { await pag.type('#texto', texto); await pag.keyboard.press('Enter'); await espera(650); };
  const pulsar = async titulo => pag.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === t).pop(); b?.click(); return Boolean(b); }, titulo);
  /** Escribe una frase y confirma la tarjeta. */
  const anotar = async (frase, respuesta) => {
    await escribir(frase);
    if (respuesta) await escribir(respuesta);
    if (!(await pulsar('Confirmar'))) throw new Error(`no salió la tarjeta de «${frase}»`);
    await espera(650);
  };
  const irA = async nombre => { await pag.evaluate(n => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === n)?.click(), nombre); await espera(1900); };
  const foto = async nombre => { await pag.evaluate(() => document.querySelector('#contenido')?.scrollTo(0, 0)); await pag.screenshot({ path: join(salida, nombre + '.png') }); console.log('  ' + nombre + '.png'); };

  // la app arranca con los montos escondidos: se muestran para la foto
  await pag.evaluate(() => { if (document.documentElement.dataset.privado === '1') document.querySelector('#ojo')?.click(); });
  const tema = async (piel, t) => { await pag.evaluate((p, x) => { document.documentElement.dataset.piel = p; document.documentElement.dataset.tema = x; window.dispatchEvent(new Event('apariencia')); }, piel, t); await espera(500); };

  // los datos de ejemplo: nombres y cifras inventados
  await anotar('saldo inicial efectivo 85000 nequi 240000 dolares 45 usd hace 14 días');
  await anotar('ingreso 900000 trabajo hace 12 días');
  await anotar('ingreso 120000 clases hace 5 días');
  await anotar('comida 38000 hace 9 días');
  await anotar('almuerzo 15000 hace 4 días');
  await anotar('mecato 4200 hace 3 días');
  await anotar('taxi 8000 hace 6 días');
  await anotar('recarga 9000 hace 8 días');
  await anotar('netflix 38000 hace 10 días');
  await anotar('cine 24000 hace 7 días');
  await anotar('farmacia 16500 hace 11 días');
  await anotar('pasaje hace 2 días');
  await anotar('presté 40000 a Ana hace 6 días');
  await anotar('presté 25000 a Luis hace 4 días');
  await anotar('le debo 54000 a Pedro por la bici hace 5 días', 'Compras');
  await anotar('almuerzo 60000 entre Ana, Luis y yo ayer');
  await escribir('tope comida 200000');
  await escribir('meta viaje 800000');
  await escribir('ahorré 120000 para viaje');

  await irA('Saldos');
  await foto('saldos');
  await irA('Movimientos');
  await foto('movimientos');
  await irA('Resumen');
  await foto('resumen');
  await irA('Más');
  await pag.evaluate(() => document.querySelector('[data-ir=deudas]')?.click());
  await espera(1500);
  await foto('deudas');
  await irA('Resumen');
  await pag.evaluate(() => document.querySelector('#mapa-calor')?.scrollIntoView({ block: 'start' }));
  await espera(900);
  await pag.screenshot({ path: join(salida, 'calor.png') }); console.log('  calor');
  await irA('Chat');
  await pag.evaluate(() => document.querySelector('[data-atajo="ayuda"]')?.click());
  await espera(900);
  await pag.evaluate(() => document.querySelector('[data-tema="inicio"]')?.click());
  await espera(700);
  await foto('ayuda');
  await pag.evaluate(() => document.querySelector('#ayuda-volver')?.click());
  await escribir('almuerzo 18500 nequi');
  await espera(700);
  await foto('chat');
  // las atmósferas nuevas
  await tema('oceano', 'oscuro'); await irA('Saldos'); await foto('tema-oceano');
  await tema('atardecer', 'oscuro'); await irA('Resumen'); await foto('tema-atardecer');
  await tema('esmeralda', 'claro'); await irA('Chat'); await foto('tema-esmeralda');
} finally {
  await navegador.close();
  servidor.kill();
}
console.log('Listo: docs/screenshots/');
