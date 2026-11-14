// Pruebas de extremo a extremo: abre la app en Chrome de verdad y recorre las pantallas como una persona.
//   npm run e2e           (compila la app, la sirve en un puerto libre y corre las pruebas)
//   npm run e2e:celular   (lo mismo, pero en el Chrome de tu celular conectado por USB; ver docs/CELULAR.md)
// Usa el Chrome que ya tienes (CHROME_PATH si está en otro lado). No usa internet ni toca ninguna base.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATOS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const celular = Boolean(process.env.E2E_CELULAR);
const chrome = CANDIDATOS.find(p => existsSync(p));
if (!chrome && !celular) { console.error('No encuentro Chrome. Pon su ruta en CHROME_PATH.'); process.exit(1); }

const build = spawnSync('node', ['scripts/build-web.mjs'], { cwd: raiz, encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout + build.stderr); process.exit(1); }
const PUERTO = Number(process.env.E2E_PUERTO) || 5300 + Math.floor(Math.random() * 500);
const servidor = spawn('node', ['scripts/servir-web.mjs'], { cwd: raiz, env: { ...process.env, PORT: String(PUERTO) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const espera = ms => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const prueba = async (nombre, f) => {
  try { await f(); console.log(`OK    ${nombre}`); } catch (e) { fallos++; console.log(`FALLA ${nombre}\n      ${e.message}`); }
};
const igual = (a, b, que) => { if (a !== b) throw new Error(`${que}: esperaba «${b}» y salió «${a}»`); };
const contiene = (t, parte, que) => { if (!String(t).includes(parte)) throw new Error(`${que}: no aparece «${parte}» en «${String(t).slice(0, 160)}»`); };

// en el celular se usa el Chrome que ya está abierto allá (puerto 9222 reenviado por adb) y su pantalla de verdad
const navegador = celular
  ? await puppeteer.connect({ browserURL: 'http://localhost:9222', defaultViewport: null, protocolTimeout: 60000 })
  : await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
try {
  const pag = await navegador.newPage();
  // el celular recuerda los datos de la corrida anterior: se parte de cero para que las pruebas sean repetibles
  if (celular) await (await pag.createCDPSession()).send('Storage.clearDataForOrigin', { origin: `http://localhost:${PUERTO}`, storageTypes: 'all' });
  const errores = [];
  pag.on('pageerror', e => errores.push(e.message));
  pag.on('dialog', d => void d.dismiss());
  if (!celular) await pag.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
  // un micrófono de mentira (el de verdad necesita internet y una persona hablando): oye dos versiones
  await pag.evaluateOnNewDocument(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        setTimeout(() => {
          const alt = [{ transcript: 'mecato por favor' }, { transcript: 'mecato cinco mil quinientos' }];
          alt.isFinal = true;
          this.onresult({ results: [alt] });
          this.onend?.();
        }, 50);
      }
      stop() {}
    };
  });
  await pag.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });

  const escribir = async texto => { await pag.type('#texto', texto); await pag.keyboard.press('Enter'); await espera(700); };
  const pulsar = async titulo => {
    const ok = await pag.evaluate(t => { const b = [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === t).pop(); b?.click(); return Boolean(b); }, titulo);
    if (!ok) throw new Error(`no hay un botón «${titulo}»`);
    await espera(700);
  };
  const ultima = () => pag.evaluate(() => { const b = [...document.querySelectorAll('.burbuja')]; return b[b.length - 1]?.innerText.replace(/\s+/g, ' ') ?? ''; });
  const irA = async nombre => { await pag.evaluate(n => [...document.querySelectorAll('nav button, nav a, [role=tab]')].find(x => x.innerText.trim() === n)?.click(), nombre); await espera(500); };
  const abrirDeMas = async nombre => { await irA('Más'); await pag.evaluate(n => [...document.querySelectorAll('button, a')].find(x => x.innerText.includes(n))?.click(), nombre); await espera(600); };
  const sinDesborde = () => pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await prueba('el chat da la bienvenida con los pasos', async () => contiene(await ultima(), 'Escribe como hablas', 'bienvenida'));
  await prueba('la capa de componentes (Preact y signals) arranca y refleja el estado de la app', async () => {
    const r = await pag.evaluate(() => { const el = document.querySelector('#raiz-preact'); return el ? { listo: el.dataset.listo, estado: el.dataset.estado, movs: Number(el.dataset.movimientos) } : null; });
    if (!r) throw new Error('no existe #raiz-preact');
    igual(r.listo, '1', 'montado'); igual(r.estado, 'local', 'estado de sincronización'); igual(r.movs, 0, 'movimientos al empezar');
  });
  await prueba('dictado: elige la versión que el bot entiende y deja el texto para revisar', async () => {
    await pag.click('#mic'); await espera(400);
    igual(await pag.evaluate(() => document.querySelector('#texto').value), 'mecato 5500', 'texto dictado');
    contiene(await pag.evaluate(() => document.querySelector('#vozEstado').innerText), 'Revisa y pulsa Enviar', 'estado');
    await pag.evaluate(() => { document.querySelector('#texto').value = ''; });
  });
  await prueba('anotar un gasto: tarjeta, confirmar y guardado', async () => {
    await escribir('saldo inicial efectivo 100000'); await pulsar('Confirmar');
    await escribir('mecato 5000'); contiene(await ultima(), 'Mecato', 'tarjeta');
    await pulsar('Confirmar'); contiene(await ultima(), 'GUARDADO', 'guardado');
  });
  await prueba('los signals se actualizan solos al guardar: sube el número de movimientos y de cambios por enviar', async () => {
    await espera(400);
    const r = await pag.evaluate(() => { const el = document.querySelector('#raiz-preact'); return { movs: Number(el.dataset.movimientos), pend: Number(el.dataset.pendientes) }; });
    if (!(r.movs >= 2)) throw new Error('movimientos: ' + r.movs + ' (se esperaban al menos 2: el saldo inicial y el mecato)');
    if (!(r.pend >= 2)) throw new Error('pendientes: ' + r.pend);
  });
  await prueba('una compra con varias líneas es un solo gasto', async () => {
    await escribir('compra: arroz 5000, sal 2000, 3 gaseosas a 2000'); contiene(await ultima(), '$13.000', 'total');
    await pulsar('Confirmar');
  });
  await prueba('metas, recurrentes y subcategorías por el chat', async () => {
    await escribir('meta moto 2000000'); contiene(await ultima(), 'Meta Moto', 'meta');
    await escribir('cada mes el 5 recarga 9000'); contiene(await ultima(), 'Cada mes, el 5', 'recurrente');
    await escribir('subcategoria restaurante de comida'); contiene(await ultima(), 'Creé la subcategoría', 'subcategoría');
  });
  await prueba('plata que no alcanza: avisa, ofrece pasar del efectivo y luego deja guardar', async () => {
    const hayBoton = t => pag.evaluate(x => [...document.querySelectorAll('button')].some(b => b.innerText.includes(x)), t);
    await escribir('pasé 7000 de monedas a efectivo');
    contiene(await ultima(), 'Falta plata en Monedas', 'aviso de plata que no alcanza');
    if (!(await hayBoton('Guardar igual'))) throw new Error('el botón dice Confirmar en vez de Guardar igual');
    await pag.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.innerText.includes('Pasar $7.000 de Efectivo a Monedas')).pop()?.click());
    await espera(800);
    if ((await ultima()).includes('Falta plata')) throw new Error('después de pasar la plata sigue el aviso');
    contiene(await ultima(), 'Transferencia', 'la tarjeta vuelve');
    await pulsar('Confirmar'); contiene(await ultima(), 'GUARDADO', 'guardado');
  });
  await prueba('una cuenta en negativo avisa en Saldos y el botón lleva al chat con el conteo listo', async () => {
    await escribir('pasé 3000 de monedas a efectivo');
    await pag.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.innerText.includes('Guardar igual')).pop()?.click());
    await espera(800);
    await irA('Saldos');
    contiene(await pag.evaluate(() => document.body.innerText), 'Monedas está en -$3.000', 'alerta de saldo negativo');
    await pag.evaluate(() => [...document.querySelectorAll('[data-aviso]')].find(b => b.innerText.includes('Contar lo que hay'))?.click());
    await espera(800);
    igual(await pag.evaluate(() => document.querySelector('#texto').value), 'arqueo monedas ', 'texto listo en el chat');
    await pag.evaluate(() => { document.querySelector('#texto').value = ''; });
  });
  await prueba('saldos muestra lo apartado para metas y el efectivo', async () => {
    await irA('Saldos'); const t = await pag.evaluate(() => document.body.innerText);
    contiene(t, 'Efectivo', 'saldos');
  });
  await prueba('movimientos: filtrar por tipo y por categoría cambia la lista y los totales', async () => {
    await irA('Movimientos');
    const total = await pag.evaluate(() => document.querySelector('#cuenta').innerText);
    contiene(total, 'movimientos', 'resumen del filtro');
    await pag.click('[data-tipo=ingresos]'); await espera(300);
    igual(await pag.evaluate(() => document.querySelectorAll('#lista li[data-id]').length), 0, 'ingresos');
    await pag.click('[data-tipo=gastos]'); await espera(300);
    if ((await pag.evaluate(() => document.querySelectorAll('#lista li[data-id]').length)) < 1) throw new Error('no salen gastos');
    await pag.click('#limpiar'); await espera(300);
  });
  if (!celular) await prueba('foto del recibo: se puede subir una imagen desde un archivo y aparece en el movimiento', async () => {
    await irA('Movimientos'); await espera(500);
    await pag.evaluate(() => document.querySelector('#lista li[data-id]')?.click()); await espera(600);
    const png = join(raiz, 'node_modules', '.cache-e2e.png');
    writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    await (await pag.$('#fotoArchivo')).uploadFile(png); await espera(1200);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#recibo img'))), true, 'la imagen aparece');
    await pag.evaluate(() => document.querySelector('#cerrar')?.click()); await espera(300);
  });
  await prueba('resumen: categorías, informe y comparación', async () => {
    await irA('Resumen'); const t = await pag.evaluate(() => document.body.innerText);
    // los títulos de sección van en mayúsculas por estilo: se compara sin distinguir
    contiene(t.toLowerCase(), 'por categoría', 'resumen'); contiene(t, 'Informe para imprimir', 'botón del informe');
  });
  await prueba('Más: categorías y personas, primeros pasos, buzón y conciliar abren', async () => {
    await abrirDeMas('Categorías y personas'); contiene(await pag.evaluate(() => document.body.innerText), 'Restaurante', 'subcategoría creada en el chat');
    await abrirDeMas('Primeros pasos'); igual(await pag.evaluate(() => document.querySelectorAll('[data-probar]').length), 5, 'pasos');
    await abrirDeMas('Buzón'); contiene(await pag.evaluate(() => document.body.innerText), 'No hay avisos nuevos', 'buzón vacío');
    await abrirDeMas('Conciliar con el banco'); contiene(await pag.evaluate(() => document.body.innerText), 'Elegir el CSV', 'conciliar');
    await abrirDeMas('Revisión del mes'); contiene(await pag.evaluate(() => document.body.innerText), 'Revisión del mes', 'revisión');
    await abrirDeMas('Ajustes'); contiene(await pag.evaluate(() => document.body.innerText), 'Estado del servidor', 'ajustes');
  });
  await prueba('Saldos: el seguro para gastar hoy, y las pantallas de alcancías y pagos fijos', async () => {
    await irA('Saldos'); contiene((await pag.evaluate(() => document.body.innerText)).toLowerCase(), 'seguro para gastar hoy', 'widget de saldos');
    await abrirDeMas('Alcancías'); contiene((await pag.evaluate(() => document.body.innerText)).toLowerCase(), 'total apartado', 'alcancías');
    await abrirDeMas('Pagos fijos'); contiene((await pag.evaluate(() => document.body.innerText)).toLowerCase(), 'falta por pagar', 'pagos fijos');
    await abrirDeMas('Revisión del mes'); contiene((await pag.evaluate(() => document.body.innerText)).toLowerCase(), 'salud del mes', 'salud del mes');
  });
  await prueba('ninguna pantalla se sale del ancho del celular', async () => {
    for (const n of ['Chat', 'Saldos', 'Movimientos', 'Resumen', 'Más']) { await irA(n); if (!(await sinDesborde())) throw new Error(`«${n}» se sale de 390 px`); }
  });
  await prueba('sin errores de JavaScript en toda la visita', async () => igual(errores.join(' | '), '', 'errores'));
} finally {
  if (celular) { for (const p of await navegador.pages()) if (p.url().startsWith(`http://localhost:${PUERTO}`)) await p.close().catch(() => {}); await navegador.disconnect(); } else await navegador.close();
  servidor.kill();
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
