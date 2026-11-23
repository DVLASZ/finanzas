// Saca las capturas de la guía de usuario (docs/GUIA-USUARIO.html) con datos inventados, en un Chrome de verdad con pantalla de
// celular y el tema Obsidiana oscuro.
//   npm run capturas:guia            (deja los .webp en instalaciones/guia-capturas, que git ignora)
//   node scripts/capturas-guia.mjs <carpeta>
// Compila la app, la sirve en un puerto libre y trabaja con datos que viven solo en el navegador de prueba (Ana, Luis, Marta y
// Pedro son inventados). No usa internet ni toca ninguna base, y nunca abre tus datos reales.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { mostrarMontos, ocultarMontos } from './_ojo.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(process.argv[2] ?? join(raiz, 'instalaciones', 'guia-capturas'));
const CANDIDATOS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const chrome = CANDIDATOS.find(p => p && existsSync(p));
if (!chrome) { console.error('No encuentro Chrome. Pon su ruta en CHROME_PATH.'); process.exit(1); }
mkdirSync(salida, { recursive: true });

const build = spawnSync('node', ['scripts/build-web.mjs'], { cwd: raiz, encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout + build.stderr); process.exit(1); }
const PUERTO = 5600 + Math.floor(Math.random() * 90);
const servidor = spawn('node', ['scripts/servir-web.mjs'], { cwd: raiz, env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const espera = ms => new Promise(r => setTimeout(r, ms));

const navegador = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
try {
  const pag = await navegador.newPage();
  await pag.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pag.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });
  // Obsidiana oscuro, letra normal: la estética de la guía
  await pag.evaluate(() => { const h = document.documentElement; h.dataset.piel = 'obsidiana'; h.dataset.tema = 'oscuro'; h.dataset.letra = 'normal'; window.dispatchEvent(new Event('apariencia')); });
  await espera(800);

  const escribir = async texto => { await pag.type('#texto', texto); await pag.keyboard.press('Enter'); await espera(650); };
  const pulsar = async titulo => pag.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === t).pop(); b?.click(); return Boolean(b); }, titulo);
  const anotar = async (frase, respuesta) => {
    await escribir(frase);
    if (respuesta) await escribir(respuesta);
    if (!(await pulsar('Confirmar'))) throw new Error(`no salió la tarjeta de «${frase}»`);
    await espera(650);
    // si la tarjeta sigue esperando (un paso de más), se vuelve a confirmar
    for (let i = 0; i < 3; i++) {
      const sigue = await pag.evaluate(() => { const u = [...document.querySelectorAll('.burbuja')].pop(); return Boolean(u && [...u.querySelectorAll('button')].some(b => b.innerText.trim() === 'Confirmar')); });
      if (!sigue) break;
      await pulsar('Confirmar'); await espera(650);
    }
  };
  const irA = async nombre => { await pag.evaluate(n => [...document.querySelectorAll('nav button')].find(b => b.innerText.trim() === n)?.click(), nombre); await espera(1700); };
  const deMas = async id => { await irA('Más'); await pag.evaluate(i => document.querySelector(`[data-ir=${i}]`)?.click(), id); await espera(1500); };
  const clic = async sel => { const ok = await pag.evaluate(s => { const e = document.querySelector(s); e?.click(); return Boolean(e); }, sel); if (!ok) throw new Error(`no hay ${sel}`); await espera(700); };
  const arriba = () => pag.evaluate(() => { document.querySelector('#contenido')?.scrollTo(0, 0); document.querySelector('#chat')?.scrollTo(0, 99999); });
  const foto = async nombre => {
    await pag.screenshot({ path: join(salida, nombre + '.webp'), type: 'webp', quality: 72 });
    console.log('  ' + nombre + '.webp');
  };
  const centrar = async sel => { await pag.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await espera(700); };

  await mostrarMontos(pag);

  // ---- datos inventados
  await anotar('saldo inicial efectivo 85000 nequi 240000 daviplata 60000 hace 14 días');
  await anotar('me pagaron 900000 de nómina hace 12 días');
  await anotar('almuerzo 15000 hace 4 días');
  await anotar('taxi 8000 nequi hace 6 días');
  await anotar('mecato 4200 hace 3 días');
  await anotar('netflix 38000 nequi hace 10 días');
  await anotar('cine 24000 hace 7 días');
  await anotar('presté 40000 a Ana hace 6 días');
  await anotar('presté 25000 a Luis hace 4 días');
  await anotar('le debo 54000 a Pedro por la bici hace 5 días', 'Compras');
  await anotar('almuerzo 60000 entre Ana, Luis y yo ayer');
  await escribir('agregar persona Marta');
  await escribir('cada mes el 5 internet 60000');
  await escribir('meta viaje 800000');
  await escribir('ahorré 120000 para viaje');
  await escribir('tope mecato 80000');
  await anotar('mecato 6000 #viaje hace 2 días');

  // ---- chat: una tarjeta antes de confirmar, con la plata a la vista
  await irA('Chat');
  await espera(8500);
  await escribir('almuerzo 15000 nequi');
  await arriba(); await espera(500);
  await foto('chat-gasto');
  await pulsar('Confirmar'); await espera(9000);

  await escribir('almuerzo 12000 #viaje');
  await arriba(); await espera(500);
  await foto('chat-etiqueta');
  await pulsar('Cancelar'); await espera(9000);

  await escribir('como anoto un gasto');
  await arriba(); await espera(600);
  await foto('chat-ayuda');

  // ---- comprobante: el detalle de un movimiento trae Tomar foto y Subir imagen
  await irA('Movimientos');
  await pag.evaluate(() => document.querySelector('#lista .fila')?.click());
  await espera(1100);
  await pag.evaluate(() => { const h = document.querySelector('#detalle [role=dialog]'); h?.scrollTo(0, 99999); });
  await espera(500);
  await foto('comprobante');
  await clic('#cerrar'); await espera(500);

  // ---- movimientos con filtros puestos
  await pag.evaluate(() => document.querySelector('[data-tipo=gastos]')?.click()); await espera(500);
  await pag.evaluate(() => document.querySelector('#contenido')?.scrollTo(0, 0));
  await espera(600);
  await foto('movimientos-filtros');
  await pag.evaluate(() => document.querySelector('[data-tipo=todos]')?.click()); await espera(400);

  // ---- personas y deudas
  await deMas('cuentas');
  await centrar('#nueva-persona');
  await foto('personas');
  await deMas('deudas');
  await foto('deudas');

  // ---- saldos y arqueo
  await irA('Saldos');
  await arriba(); await espera(500);
  await foto('saldos');
  await centrar('#cuadre-rapido');
  await clic('#cuadre-rapido');
  await pag.evaluate(() => { const filas = [...document.querySelectorAll('#contador-lista li')]; [[0, 1], [1, 2], [2, 3], [3, 1]].forEach(([i, n]) => { const bs = filas[i]?.querySelectorAll('button'); const b = bs?.[bs.length - 1]; for (let k = 0; k < n; k++) b?.click(); }); });
  await espera(700);
  await foto('arqueo');
  await pag.evaluate(() => document.querySelector('#contador')?.click()); await espera(500);

  // ---- pagos fijos y alcancías
  await deMas('pagosfijos');
  await foto('pagos-fijos');
  await deMas('alcancias');
  await foto('alcancias');

  // ---- resumen y calor del mes
  await irA('Resumen');
  await arriba(); await espera(600);
  await foto('resumen');
  await centrar('#mapa-calor');
  await pag.evaluate(() => { const d = new Date(Date.now() - 4 * 86400000); const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; (document.querySelector(`#mapa-calor [data-fecha="${f}"]`) ?? document.querySelector('#mapa-calor .calor-dia:not(.nf)'))?.click(); });
  await espera(1200);
  await foto('calor-dia');
  await pag.evaluate(() => document.querySelector('#info-cerrar')?.click()); await espera(500);

  // ---- el ojo: con los montos escondidos
  await irA('Saldos');
  await arriba(); await espera(500);
  await ocultarMontos(pag); await espera(1000);
  await foto('ojo');
  await mostrarMontos(pag);

  // ---- tamaño de letra
  await deMas('ajustes');
  await pag.evaluate(() => document.querySelector('[data-sin-mascara]')?.scrollIntoView({ block: 'center' }));
  await espera(700);
  await foto('letra');
} finally {
  await navegador.close();
  servidor.kill();
}

const hechas = readdirSync(salida).filter(f => f.endsWith('.webp'));
console.log(`${hechas.length} capturas en ${salida} (${Math.round(hechas.reduce((s, f) => s + statSync(join(salida, f)).size, 0) / 1024)} KB)`);
