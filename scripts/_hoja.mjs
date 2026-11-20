import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const out = 'C:/Users/edwar/AppData/Local/Temp/claude/b387cb9e8eb93630/4cfde460-32f1-497b-a047-f251c6f7d0f1/scratchpad';
mkdirSync(out, { recursive: true });
const PUERTO = 5950 + Math.floor(Math.random() * 40);
const srv = spawn('node', ['scripts/servir-web.mjs'], { env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const espera = ms => new Promise(r => setTimeout(r, ms));
const nav = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const PIELES = ['obsidiana', 'midnight', 'tierra', 'esmeralda', 'bordeaux', 'kinetix'];
const solo = process.env.SOLO ? process.env.SOLO.split(',') : PIELES;
try {
  const pag = await nav.newPage();
  await pag.setViewport({ width: 393, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await pag.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });
  await espera(700);
  await pag.evaluate(() => { if (document.documentElement.dataset.privado === '1') document.querySelector('#ojo')?.click(); });
  const esc = async t => { await pag.type('#texto', t); await pag.keyboard.press('Enter'); await espera(650); };
  const pulsar = t => pag.evaluate(x => { const b = [...document.querySelectorAll('button')].filter(y => y.innerText.trim() === x).pop(); b?.click(); }, t);
  await esc('saldo inicial efectivo 500000 nequi 300000 hace 12 días'); await pulsar('Confirmar'); await espera(500);
  for (const f of ['almuerzo 12000 hace 3 días', 'mecato 3500 hace 2 días', 'ingreso 400000 trabajo hace 5 días', 'transporte 8000 ayer']) { await esc(f); await pulsar('Confirmar'); await espera(500); }
  await esc('almuerzo 18500 nequi');
  const ir = async n => { await pag.evaluate(t => [...document.querySelectorAll('nav#nav button')].find(b => b.innerText.includes(t))?.click(), n); await espera(1300); };
  const fotos = { claro: [], oscuro: [] };
  for (const piel of solo) for (const tema of ['oscuro', 'claro']) {
    await pag.evaluate((p, t) => { const h = document.documentElement; h.dataset.piel = p; h.dataset.tema = t; window.dispatchEvent(new Event('apariencia')); }, piel, tema);
    await espera(900);
    await ir('Saldos');
    fotos[tema].push([piel, (await pag.screenshot({ encoding: 'base64' }))]);
    await ir('Chat');
    fotos[tema].push([piel + ' chat', (await pag.screenshot({ encoding: 'base64' }))]);
  }
  for (const tema of ['oscuro', 'claro']) {
    const hoja = await nav.newPage();
    const cols = 6;
    await hoja.setViewport({ width: cols * 200, height: 10 });
    await hoja.setContent(`<body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(${cols},200px);gap:0">${fotos[tema].map(([n, b]) => `<div style="position:relative"><img src="data:image/png;base64,${b}" width="200"><b style="position:absolute;left:4px;top:2px;font:700 11px sans-serif;color:#fff;background:#000a;padding:1px 4px">${n}</b></div>`).join('')}</body>`);
    await espera(500);
    await hoja.screenshot({ path: `${out}/hoja-${tema}.png`, fullPage: true });
    await hoja.close();
  }
} finally { await nav.close(); srv.kill(); }
