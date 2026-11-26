// Pruebas de extremo a extremo: abre la app en Chrome de verdad y recorre las pantallas como una persona.
//   npm run e2e           (compila la app, la sirve en un puerto libre y corre las pruebas)
//   npm run e2e:celular   (lo mismo, pero en el Chrome de tu celular conectado por USB; ver docs/CELULAR.md)
// Usa el Chrome que ya tienes (CHROME_PATH si está en otro lado). No usa internet ni toca ninguna base.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { mostrarMontos, ocultarMontos } from './_ojo.mjs';

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
  // la política de contenido del servidor (la misma que usa el Worker) no debe bloquear nada de la app
  const bloqueos = [];
  pag.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) bloqueos.push(m.text().slice(0, 160)); });
  // los cuadros del navegador (alert, confirm, prompt) no deberían salir nunca: la app tiene los suyos
  let nativos = 0;
  pag.on('dialog', d => { nativos++; void d.dismiss(); });
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

  await prueba('privacidad: la app arranca con los montos ocultos y el ojo los muestra', async () => {
    igual(await pag.evaluate(() => document.documentElement.dataset.privado), '1', 'arranca oculta');
    await irA('Saldos'); await espera(700);
    igual(await pag.evaluate(() => document.querySelectorAll('[data-oculto]').length > 0), true, 'puntos en lugar de montos');
    igual(await pag.evaluate(() => /\$\s?\d/.test(document.querySelector('#contenido').innerText)), false, 'ningún monto a la vista');
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(400);
    igual(await pag.evaluate(() => document.documentElement.dataset.privado), '0', 'el ojo los muestra');
    igual(await pag.evaluate(() => document.querySelectorAll('[data-oculto]').length), 0, 'ya no hay puntos');
    await irA('Chat');
  });
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
    contiene(t.toLowerCase(), 'dónde se fue', 'resumen'); contiene(t, 'Informe para imprimir', 'botón del informe');
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
  await prueba('selector: Escape dos veces seguidas cierra la hoja una sola vez y no saca de la app', async () => {
    await irA('Movimientos'); await espera(400);
    await pag.evaluate(() => document.querySelector('#f-categoria').click()); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('[role=listbox]'))), true, 'la hoja abre');
    await pag.keyboard.press('Escape'); await pag.keyboard.press('Escape'); await espera(700);
    igual(await pag.evaluate(() => Boolean(document.querySelector('[role=listbox]'))), false, 'la hoja cierra');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#lista'))), true, 'sigue en Movimientos');
  });
  await prueba('escanear: el botón pregunta si es cámara o galería, y hay una entrada para cada una', async () => {
    await irA('Chat'); await espera(400);
    await pag.evaluate(() => document.querySelector('#escanear').click()); await espera(500);
    igual(await pag.evaluate(() => [...document.querySelectorAll('[role=option]')].map(o => o.dataset.valor).join(',')), 'camara,galeria', 'opciones');
    await pag.keyboard.press('Escape'); await espera(500);
    igual(await pag.evaluate(() => document.querySelector('#fotoEscanear').getAttribute('capture')), 'environment', 'la cámara usa capture');
    igual(await pag.evaluate(() => document.querySelector('#archivoEscanear').hasAttribute('capture')), false, 'la galería no usa capture');
  });
  await prueba('Más: deudas, lista de compras, pagos fijos y ajustes (hechos con componentes) funcionan', async () => {
    const texto = () => pag.evaluate(() => document.body.innerText);
    await abrirDeMas('Deudas y préstamos'); contiene((await texto()).toLowerCase(), 'por cobrar', 'deudas');
    await irA('Chat'); await escribir('falta arroz y sal');
    await abrirDeMas('Lista de compras'); contiene(await texto(), 'Ya lo compré', 'la lista trae lo anotado en el chat');
    await pag.type('input[aria-label="Agregar a la lista"]', 'panela'); await pag.keyboard.press('Enter'); await espera(600);
    contiene(await texto(), 'panela', 'agregar desde la pantalla');
    await pag.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText.includes('Ya lo compré'))?.click()); await espera(600);
    contiene((await texto()).toLowerCase(), 'avance de la compra','la barra de avance aparece al comprar');
    await abrirDeMas('Pagos fijos'); contiene(await texto(), 'Cada mes', 'el formulario de pagos fijos ofrece frecuencias');
    igual(await pag.evaluate(() => Boolean(document.querySelector('button[aria-label^="Cada cuánto"]'))), true, 'selector de frecuencia');
    await abrirDeMas('Ajustes');
    contiene(await texto(), 'Zona de peligro', 'ajustes');
    const antes = await pag.evaluate(() => document.querySelectorAll('.tema-card[aria-pressed="true"]').length);
    await pag.evaluate(() => [...document.querySelectorAll('.tema-card')].find(b => b.getAttribute('aria-pressed') !== 'true')?.click()); await espera(400);
    igual(await pag.evaluate(() => document.querySelectorAll('.tema-card[aria-pressed="true"]').length), antes, 'un solo tema elegido a la vez');
    await pag.evaluate(() => [...document.querySelectorAll('.tema-card')].find(b => b.innerText.includes('Midnight'))?.click()); await espera(300);
  });
  await prueba('Movimientos: etiquetas, rango de fechas y exportar CSV o JSON', async () => {
    await irA('Chat'); await escribir('pizza 12000 #cumple'); await pulsar('Confirmar');
    await irA('Movimientos'); await espera(500);
    await pag.evaluate(() => document.querySelector('#limpiar')?.click()); await espera(300);
    await pag.evaluate(() => document.querySelector('#f-etiqueta').click()); await espera(500);
    igual(await pag.evaluate(() => [...document.querySelectorAll('[role=option]')].map(b => b.innerText.trim().split(/\s/)[0]).join(',')), 'Etiquetas,#cumple', 'el desplegable lista #cumple');
    const filas = () => pag.evaluate(() => document.querySelectorAll('#lista .fila').length);
    const todas = await filas();
    await pag.evaluate(() => document.querySelector('[role=option][data-valor="cumple"]')?.click()); await espera(400);
    igual(await filas(), 1, 'solo lo de la etiqueta');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#exportar-csv') && document.querySelector('#exportar-json'))), true, 'botones de exportar');
    await pag.evaluate(() => document.querySelector('#f-etiqueta').click()); await espera(500);
    await pag.evaluate(() => document.querySelector('[role=option][data-valor=""]')?.click()); await espera(400);
    igual(await filas(), todas, 'quitar la etiqueta devuelve todo');
    await pag.evaluate(() => document.querySelector('[data-periodo="rango"]').click()); await espera(400);
    igual(await pag.evaluate(() => document.querySelectorAll('#rango input[type=date]').length), 2, 'dos fechas');
    await pag.evaluate(() => document.querySelector('[data-periodo="mes"]').click()); await espera(300);
  });
  await prueba('editar un movimiento: confirmar, cambiar el monto, ver antes y después y guardar', async () => {
    const texto = () => pag.evaluate(() => document.body.innerText);
    const clic = async sel => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, sel); if (!ok) throw new Error(`no hay ${sel}`); await espera(450); };
    await irA('Chat'); await escribir('almuerzo 4500'); await pulsar('Confirmar');
    await irA('Movimientos'); await espera(500);
    const abrirFila = () => pag.evaluate(() => [...document.querySelectorAll('#lista .fila')].find(f => f.innerText.includes('4.500'))?.click());
    await abrirFila(); await espera(500);
    await clic('#editar-mov');
    contiene((await texto()).toLowerCase(), '¿seguro que quieres editar este movimiento?', 'primer filtro');
    // «No, volver» cierra sin abrir el formulario
    await clic('#editar-no');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#editar'))), false, 'se cerró');
    await clic('#editar-mov');
    await clic('#editar-si');
    igual(await pag.evaluate(() => document.querySelector('#e-guardar').disabled), true, 'sin cambios no se puede guardar');
    await pag.$eval('#e-monto', e => e.select()); await pag.type('#e-monto', '6000'); await espera(300);
    await pag.$eval('#e-concepto', e => e.select()); await pag.type('#e-concepto', 'Almuerzo con Ana'); await espera(300);
    await clic('#e-guardar');
    const resumen = await texto();
    contiene(resumen.toLowerCase(), 'esto es lo que cambia', 'segundo filtro');
    contiene(resumen, 'Antes:', 'antes'); contiene(resumen, 'Después:', 'después');
    contiene(resumen, '$4.500', 'monto anterior'); contiene(resumen, '$6.000', 'monto nuevo');
    contiene(resumen.toLowerCase(), 'cómo quedan los saldos', 'saldos');
    await clic('#r-volver');
    igual(await pag.evaluate(() => document.querySelector('#e-monto').value), '6000', 'volver conserva lo escrito');
    await clic('#e-guardar');
    await clic('#r-confirmar');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#editar'))), false, 'se cerró al guardar');
    contiene(await texto(), 'Editado', 'queda constancia en el detalle');
    contiene(await texto(), 'Almuerzo con Ana', 'el concepto nuevo');
    await clic('#cerrar');
    contiene(await pag.evaluate(() => document.querySelector('#lista').innerText), '$6.000', 'la lista muestra el monto nuevo');
  });
  await prueba('editar la cuenta de un gasto: el selector abre por encima de la hoja, se elige con un toque real y se guarda', async () => {
    const clic = async sel => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, sel); if (!ok) throw new Error(`no hay ${sel}`); await espera(450); };
    await irA('Chat'); await escribir('almuerzo 7300'); await pulsar('Confirmar');
    await irA('Movimientos'); await espera(500);
    await pag.evaluate(() => [...document.querySelectorAll('#lista .fila')].find(f => f.innerText.includes('7.300'))?.click()); await espera(500);
    await clic('#editar-mov'); await clic('#editar-si');
    const antes = await pag.evaluate(() => document.querySelector('#e-cuenta').dataset.valor);
    await clic('#e-cuenta');
    // la capa del selector tiene que quedar por encima de la hoja de edición, y la opción tiene que ser lo que se toca de verdad
    const arriba = await pag.evaluate(() => {
      const op = [...document.querySelectorAll('#selector-capa [role=option]')].find(o => o.dataset.valor !== document.querySelector('#e-cuenta').dataset.valor);
      const r = op.getBoundingClientRect();
      const tocado = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { valor: op.dataset.valor, x: r.left + r.width / 2, y: r.top + r.height / 2, ok: op.contains(tocado) };
    });
    igual(arriba.ok, true, 'la opción del selector queda por encima de la hoja de edición');
    await pag.mouse.click(arriba.x, arriba.y); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#selector-capa'))), false, 'el selector se cerró');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#editar'))), true, 'la hoja de edición sigue abierta');
    igual(await pag.evaluate(() => document.querySelector('#e-cuenta').dataset.valor), arriba.valor, 'la cuenta cambió');
    igual(await pag.evaluate(() => document.querySelector('#e-guardar').disabled), false, 'se puede guardar');
    await clic('#e-guardar'); await clic('#r-confirmar');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#editar'))), false, 'se guardó y se cerró');
    igual(antes !== arriba.valor, true, 'la cuenta era otra');
    // el movimiento es recién creado: la app ofrece guardar el cambio como regla, con un cuadro propio (no el del navegador)
    await espera(400);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#dialogo'))), true, 'sale la pregunta de la regla');
    contiene(await pag.evaluate(() => document.querySelector('#dialogo').innerText), 'La próxima vez que escriba', 'la pregunta');
    await pag.evaluate(() => document.querySelector('#dialogo-aceptar').click()); await espera(600);
    await clic('#cerrar');
    await abrirDeMas('Ajustes'); await espera(500);
    contiene(await pag.evaluate(() => document.querySelector('#reglas-aprendidas')?.innerText ?? ''), 'almuerzo', 'la regla aparece en Ajustes');
  });
  await prueba('chat: la barra no trae botones inventados (nada de «Pasaje» con monto), solo Ayuda y el +', async () => {
    await irA('Chat'); await espera(400);
    // los pagos fijos que ya tocan sí salen solos (llevan monto y cuenta reales); lo demás lo arma la persona
    const botones = await pag.evaluate(() => [...document.querySelectorAll('.atajos [data-atajo]:not([data-tipo="fijo"])')].map(b => b.dataset.atajo));
    igual(botones.join(','), 'ayuda', 'solo el botón de Ayuda');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#atajo-mas'))), true, 'el + para armar los propios');
  });
  await prueba('atajos propios: plantilla deja el texto escrito, frase arma la tarjeta; se ordenan, se ocultan y se quitan', async () => {
    const clicEn = sel => pag.evaluate(x => document.querySelector(x)?.click(), sel);
    await clicEn('#atajo-mas'); await espera(500);
    await clicEn('#at-nuevo'); await espera(300);
    await pag.type('#at-frase', 'recarga nequi'); await espera(100);
    igual(await pag.evaluate(() => document.querySelector('#at-modo-plantilla').getAttribute('aria-pressed')), 'true', 'sin monto es plantilla');
    await clicEn('#at-guardar'); await espera(300);
    await clicEn('#at-nuevo'); await espera(300);
    await pag.type('#at-frase', 'mecato 3500 efectivo'); await espera(100);
    igual(await pag.evaluate(() => document.querySelector('#at-modo-frase').getAttribute('aria-pressed')), 'true', 'con monto es frase');
    await clicEn('#at-guardar'); await espera(300);
    contiene(await pag.evaluate(() => document.querySelector('#at-lista').innerText), 'Mecato efectivo', 'la etiqueta sale de la frase sin el monto');
    await pag.evaluate(() => document.querySelector('[aria-label="Subir Mecato efectivo"]')?.click()); await espera(200);
    igual(await pag.evaluate(() => document.querySelector('#at-lista .fila').innerText.includes('Mecato efectivo')), true, 'subir cambia el orden');
    await clicEn('#at-cerrar'); await espera(400);
    // plantilla: queda escrita en el cuadro, sin enviar
    await clicEn('[data-atajo="recarga nequi"]'); await espera(300);
    igual(await pag.evaluate(() => document.querySelector('#texto').value), 'recarga nequi ', 'la plantilla queda escrita para ponerle el monto');
    await pag.$eval('#texto', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    // frase completa: sale la tarjeta por confirmar
    await clicEn('[data-atajo="mecato 3500 efectivo"]'); await espera(900);
    contiene(await ultima(), 'Gasto', 'la tarjeta de ese gasto');
    await pulsar('Confirmar');
    // ocultar la barra y volver a mostrarla
    await clicEn('#atajo-mas'); await espera(400); await clicEn('#at-mostrar'); await clicEn('#at-cerrar'); await espera(400);
    igual(await pag.evaluate(() => document.querySelectorAll('.atajos [data-atajo]').length), 0, 'barra oculta');
    await clicEn('#atajos-mostrar'); await espera(400);
    igual(await pag.evaluate(() => document.querySelectorAll('.atajos [data-atajo]').length > 0), true, 'barra visible otra vez');
    // quitar uno con confirmación
    await clicEn('#atajo-mas'); await espera(400);
    await pag.evaluate(() => document.querySelector('[aria-label="Quitar Recarga nequi"]')?.click()); await espera(400);
    await clicEn('#dialogo-aceptar'); await espera(400);
    igual(await pag.evaluate(() => document.querySelector('#at-lista').innerText.includes('Recarga nequi')), false, 'se quitó');
    await clicEn('#at-cerrar'); await espera(300);
  });
  await prueba('etiquetas en la tarjeta: se agrega una escrita, se quita con la equis y la tarjeta se corrige antes de confirmar', async () => {
    await irA('Chat');
    await escribir('mecato 4500'); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('[data-etiquetas]'))), true, 'la fila de etiquetas sale siempre');
    await pag.evaluate(() => document.querySelector('[data-etiqueta-nueva]')?.click()); await espera(200);
    await pag.type('[data-etiqueta-campo]', 'Viaje'); await pag.keyboard.press('Enter'); await espera(800);
    contiene(await ultima(), '#viaje', 'la tarjeta nueva trae la etiqueta');
    await pag.evaluate(() => document.querySelector('[data-quitar-etiqueta="viaje"]')?.click()); await espera(800);
    igual((await ultima()).includes('#viaje'), false, 'sin etiqueta otra vez');
    await pulsar('Confirmar');
  });
  await prueba('ayuda: primero pregunta el tema y solo al tocar uno muestra sus ejemplos', async () => {
    await irA('Chat');
    await pag.evaluate(() => document.querySelector('[data-atajo="ayuda"]')?.click()); await espera(900);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#ayuda-temas'))), true, 'salen los temas');
    igual(await pag.evaluate(() => document.querySelectorAll('.ayuda-tema').length >= 5), true, 'al menos cinco temas');
    igual(await pag.evaluate(() => document.querySelectorAll('.ejemplo').length), 0, 'todavía no hay ejemplos');
    contiene((await ultima()).toLowerCase(), 'sobre qué quieres saber', 'la pregunta');
    await pag.evaluate(() => document.querySelector('[data-tema="deudas"]')?.click()); await espera(600);
    contiene(await pag.evaluate(() => document.querySelector('#ayuda-detalle').innerText.toLowerCase()), 'presté', 'ejemplos de préstamos');
    igual(await pag.evaluate(() => document.querySelectorAll('.ejemplo').length > 0), true, 'ejemplos para tocar');
    await pag.evaluate(() => document.querySelector('#ayuda-volver')?.click()); await espera(400);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#ayuda-temas'))), true, 'se vuelve a los temas');
  });
  await prueba('consultas habladas: «¿cuánto hay en efectivo?» y «¿cuánto puedo gastar esta semana?» responden en el chat', async () => {
    await irA('Chat');
    await escribir('¿cuánto hay en efectivo?');
    contiene(await ultima(), 'Efectivo', 'el saldo de esa cuenta');
    await escribir('¿cuánto puedo gastar esta semana?');
    contiene(await ultima(), 'Esta semana puedes gastar', 'el presupuesto de la semana');
  });
  await prueba('saldos: la semana, la salud patrimonial y el cuadre rápido del efectivo', async () => {
    await irA('Saldos'); await espera(800);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#presupuesto-semana'))), true, 'tarjeta de la semana');
    contiene((await pag.evaluate(() => document.querySelector('#contenido').innerText)).toLowerCase(), 'salud patrimonial', 'la barra de salud patrimonial');
    await pag.evaluate(() => document.querySelector('#cuadre-rapido').click()); await espera(500);
    // el mini-contador de billetes: dos de 50.000 suman 100.000; se quitan y se cuenta cero para que falte plata
    igual(await pag.evaluate(() => Boolean(document.querySelector('#contador'))), true, 'abre el contador de billetes');
    await pag.evaluate(() => { const m = document.querySelector('[data-mas="50000"]'); m.click(); m.click(); }); await espera(200);
    contiene(await pag.evaluate(() => document.querySelector('#contador-total').innerText), '100.000', 'suma los billetes');
    await pag.evaluate(() => { for (const b of document.querySelectorAll('[aria-label^="Quitar un billete"]')) { b.click(); b.click(); } }); await espera(200);
    contiene(await pag.evaluate(() => document.querySelector('#contador-total').innerText), '$0', 'vuelve a cero');
    await pag.evaluate(() => document.querySelector('#contador-usar').click()); await espera(500);
    contiene(await pag.evaluate(() => document.querySelector('#dialogo')?.innerText ?? ''), 'Te faltan', 'dice cuánto falta');
    await pag.evaluate(() => document.querySelector('#dialogo-aceptar').click()); await espera(1000);
    contiene(await ultima(), 'Otros', 'arma el gasto «Gastos varios sin anotar»');
    contiene(await ultima(), 'gastos varios sin anotar', 'con ese concepto');
    await pulsar('Cancelar');
  });
  await prueba('resumen: la semana, el mapa de calor y las barras de seis meses', async () => {
    await irA('Resumen'); await espera(800);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#presupuesto-semana'))), true, 'la semana');
    igual(await pag.evaluate(() => document.querySelectorAll('#mapa-calor .calor-dia').length >= 28), true, 'un cuadro por día del mes');
    igual(await pag.evaluate(() => document.querySelectorAll('#seis-meses .mes-par').length), 6, 'seis meses');
    await pag.evaluate(() => document.querySelector('#mapa-calor .calor-dia:not(.nf)')?.click()); await espera(300);
    contiene(await pag.evaluate(() => document.querySelector('#calor-dato').innerText), ' de ', 'toca un día y dice cuánto se gastó');
  });
  await prueba('temas: se puede elegir una atmósfera nueva y volver a la de siempre', async () => {
    await abrirDeMas('Ajustes'); await espera(500);
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="obsidiana"]')?.click()); await espera(400);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'obsidiana', 'piel obsidiana');
    igual(await pag.evaluate(() => document.querySelectorAll('.tema-card .pildora-6030').length === 6), true, 'los seis temas traen su píldora 60-30-10');
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="kinetix"]')?.click()); await espera(300);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'kinetix', 'otro de los seis');
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="midnight"]')?.click()); await espera(400);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'midnight', 'vuelve a midnight');
    await pag.evaluate(() => document.querySelector('#sonidos').click()); await espera(200);
    igual(await pag.evaluate(() => document.querySelector('#sonidos').checked), true, 'el interruptor de sonido');
    await pag.evaluate(() => document.querySelector('#sonidos').click()); await espera(200);
    await irA('Chat');
  });
  await prueba('temas: quien tenía guardado un tema que ya no existe pasa al más parecido, sin errores', async () => {
    const otra = await navegador.newPage();
    const errores = [];
    otra.on('pageerror', e => errores.push(e.message));
    await otra.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });
    const quedan = {};
    for (const viejo of ['libro', 'zafiro', 'oceano', 'abyss', 'mocha', 'veltro', 'aether', 'onyx', 'atardecer', 'inventado']) {
      await otra.evaluate(v => localStorage.setItem('apariencia', JSON.stringify({ piel: v })), viejo);
      await otra.reload({ waitUntil: 'networkidle0' });
      quedan[viejo] = await otra.evaluate(() => document.documentElement.dataset.piel);
    }
    await otra.evaluate(() => localStorage.removeItem('apariencia'));
    await otra.close();
    igual(JSON.stringify(quedan), JSON.stringify({ libro: 'midnight', zafiro: 'midnight', oceano: 'midnight', abyss: 'midnight', mocha: 'tierra', veltro: 'esmeralda', aether: 'kinetix', onyx: 'obsidiana', atardecer: 'bordeaux', inventado: 'obsidiana' }), 'cada tema viejo pasa al suyo');
    igual(errores.length, 0, 'sin errores de JavaScript al migrar');
    // abrir otra pestaña esconde los montos (así debe ser); el resto de la visita mira cifras
    await pag.bringToFront(); await mostrarMontos(pag);
  });
  await prueba('resumen: compara cada categoría con el mes pasado', async () => {
    await irA('Resumen'); await espera(700);
    const t = (await pag.evaluate(() => document.body.innerText)).toLowerCase();
    contiene(t, 'contra el mes pasado', 'la tarjeta de comparativa');
    igual(await pag.evaluate(() => document.querySelectorAll('#contra-mes-pasado .var-chip').length > 0), true, 'hay una variación por categoría');
  });
  await prueba('duplicar: crea otro movimiento con la fecha de hoy y muestra la palomita', async () => {
    await irA('Movimientos'); await espera(500);
    const filas = () => pag.evaluate(() => document.querySelectorAll('#lista .fila').length);
    const antes = await filas();
    await pag.evaluate(() => [...document.querySelectorAll('#lista .fila')].find(f => f.innerText.includes('3.500'))?.click()); await espera(500);
    igual(await pag.evaluate(() => /Anotado/.test(document.querySelector('#historial-mov')?.innerText ?? '')), true, 'el detalle dice cuándo se anotó');
    await pag.evaluate(() => document.querySelector('#duplicar-mov').click()); await espera(500);
    contiene((await pag.evaluate(() => document.querySelector('#d-resumen')?.innerText ?? '')), '$3.500', 'resumen del duplicado');
    await pag.evaluate(() => document.querySelector('#d-confirmar').click()); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('.confirmacion'))), true, 'palomita de confirmación');
    await espera(1500);
    igual(await filas(), antes + 1, 'una fila más');
  });
  await prueba('editar: el saldo inicial no se puede editar y lo explica', async () => {
    await irA('Movimientos'); await pag.evaluate(() => document.querySelector('[data-periodo="todo"]').click()); await espera(400);
    const hay = await pag.evaluate(() => { const f = [...document.querySelectorAll('#lista .fila')].find(x => /saldo inicial/i.test(x.innerText)); f?.click(); return Boolean(f); });
    if (!hay) { await pag.evaluate(() => document.querySelector('[data-periodo="mes"]').click()); return; }
    await espera(500);
    await pag.evaluate(() => document.querySelector('#editar-mov').click()); await espera(500);
    contiene((await pag.evaluate(() => document.body.innerText)).toLowerCase(), 'no se puede editar', 'explica');
    await pag.evaluate(() => document.querySelector('#editar-no').click()); await espera(300);
    await pag.evaluate(() => document.querySelector('#cerrar')?.click()); await espera(300);
    await pag.evaluate(() => document.querySelector('[data-periodo="mes"]').click()); await espera(300);
  });
  await prueba('gráficos: tocar la curva de saldo muestra el día y el valor', async () => {
    await irA('Saldos'); await espera(700);
    const caja = await pag.evaluate(() => { const r = document.querySelector('svg[aria-label^="Evolución del saldo"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
    if (!caja) throw new Error('no hay curva de saldo');
    await pag.mouse.move(caja.x, caja.y); await pag.mouse.down(); await espera(250);
    contiene(await pag.evaluate(() => document.body.innerText), '$', 'la burbuja muestra un monto');
    igual(await pag.evaluate(() => Boolean(document.querySelector('.pointer-events-none.absolute.z-10'))), true, 'burbuja visible');
    await pag.mouse.up();
  });
  await prueba('Resumen: se puede compartir el resumen y bajar el CSV', async () => {
    await irA('Resumen'); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#compartir-resumen') && document.querySelector('#resumen-csv'))), true, 'botones');
  });
  await prueba('ninguna pantalla se sale del ancho del celular', async () => {
    for (const n of ['Chat', 'Saldos', 'Movimientos', 'Resumen', 'Más']) { await irA(n); if (!(await sinDesborde())) throw new Error(`«${n}» se sale de 390 px`); }
  });
  await prueba('anular y pedir el PIN: salen los cuadros de la app, con Cancelar y Sí, anular', async () => {
    const hay = sel => pag.evaluate(s => Boolean(document.querySelector(s)), sel);
    const clic = async sel => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, sel); if (!ok) throw new Error(`no hay ${sel}`); await espera(500); };
    await irA('Chat'); await escribir('mecato 1234'); await pulsar('Confirmar');
    await irA('Movimientos'); await espera(500);
    const filas = () => pag.evaluate(() => [...document.querySelectorAll('#lista .fila')].filter(f => f.innerText.includes('1.234')).length);
    igual(await filas(), 1, 'el movimiento está en la lista');
    await pag.evaluate(() => [...document.querySelectorAll('#lista .fila')].find(f => f.innerText.includes('1.234'))?.click()); await espera(500);
    await clic('#anular');
    igual(await hay('#dialogo'), true, 'sale el cuadro de la app');
    contiene((await pag.evaluate(() => document.querySelector('#dialogo').innerText)).toLowerCase(), '¿anular', 'pregunta');
    contiene(await pag.evaluate(() => document.querySelector('#dialogo-aceptar').innerText), 'Sí, anular', 'botón de aceptar');
    await clic('#dialogo-cancelar');
    igual(await hay('#dialogo'), false, 'Cancelar lo cierra');
    igual(await hay('#detalle'), true, 'y el detalle sigue abierto');
    igual(await filas(), 1, 'sin anular nada');
    await clic('#anular'); await clic('#dialogo-aceptar'); await espera(500);
    igual(await hay('#detalle'), false, 'al anular se cierra el detalle');
    igual(await filas(), 0, 'el movimiento anulado ya no sale en la lista');
    // el PIN se pide en un cuadro con la clave escondida
    await abrirDeMas('Ajustes');
    await pag.evaluate(() => [...document.querySelectorAll('button')].find(b => /Crear PIN|Cambiar PIN/.test(b.innerText))?.click()); await espera(500);
    if (!(await hay('#dialogo'))) { await pag.evaluate(() => document.querySelector('#dialogo-cancelar')?.click()); }
    igual(await pag.evaluate(() => document.querySelector('#dialogo input')?.type), 'password', 'el PIN no se ve al escribirlo');
    await pag.type('#dialogo input', '1234'); await pag.keyboard.press('Enter'); await espera(500);
    contiene(await pag.evaluate(() => document.body.innerText), 'Cambiar PIN', 'quedó guardado el PIN');
    // un PIN mal escrito avisa con otro cuadro
    await pag.evaluate(() => [...document.querySelectorAll('button')].find(b => /Cambiar PIN/.test(b.innerText))?.click()); await espera(400);
    await pag.type('#dialogo input', '9999'); await pag.keyboard.press('Enter'); await espera(500);
    contiene((await pag.evaluate(() => document.querySelector('#dialogo')?.innerText ?? '')).toLowerCase(), 'pin incorrecto', 'aviso propio');
    await clic('#dialogo-aceptar');
    igual(await hay('#dialogo'), false, 'Entendido lo cierra');
  });
  await prueba('privacidad total: ni montos ni porcentajes se ven en el chat, saldos, movimientos ni resumen', async () => {
    const cifras = () => pag.evaluate(() => document.body.innerText.match(/[-+]?(?:US)?\$\s?\d[\d.,]*|[-+]?\d+(?:[.,]\d+)?\s?%/)?.[0] ?? null);
    await ocultarMontos(pag);
    await irA('Chat'); await escribir('mecato 4000');
    igual(await cifras(), null, 'la tarjeta del chat y lo que escribiste');
    await pulsar('Confirmar');
    igual(await cifras(), null, 'el «Guardado» con «Quedó en...»');
    for (const n of ['Saldos', 'Movimientos', 'Resumen']) { await irA(n); await espera(900); igual(await cifras(), null, n); }
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(400);
    igual(await pag.evaluate(() => /\$\s?\d/.test(document.querySelector('#contenido').innerText)), true, 'al mostrar vuelven las cifras');
    await irA('Chat');
  });
  await prueba('sin cabecera: no hay barra de arriba, el aviso de sincronizar solo sale si pasa algo y el estado vive en Ajustes', async () => {
    await irA('Chat'); await espera(300);
    igual(await pag.evaluate(() => document.querySelector('header')), null, 'no hay cabecera');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#aviso-sync'))), false, 'con todo en orden no hay aviso');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#cambiar-tema'))), false, 'el botón de tema ya no está arriba');
    const alto = await pag.evaluate(() => document.querySelector('#contenido').getBoundingClientRect().top);
    igual(alto < 8, true, 'el contenido arranca arriba del todo');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#ojo'))), true, 'en el chat sí está el botón de privacidad');
    await irA('Saldos'); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#ojo'))), true, 'el ojo está en Saldos');
    await irA('Resumen'); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#ojo'))), true, 'el ojo está en Resumen');
    await ocultarMontos(pag); await abrirDeMas('Ajustes'); await espera(700);
    const r = await pag.evaluate(() => { const e = document.querySelector('#estado'); return { texto: e?.innerText.trim(), sw: Boolean(document.querySelector('#ojo-ajustes')), modo: [...document.querySelectorAll('.opciones button')].some(b => b.innerText.trim() === 'Oscuro'), escala: [...document.querySelectorAll('[data-sin-mascara] .opciones button')].map(b => b.innerText.toLowerCase()).join('|'), privado: document.documentElement.dataset.privado }; });
    igual(Boolean(r.texto), true, 'el estado de sincronización está en Ajustes');
    igual(r.sw, true, 'el interruptor de privacidad está en Ajustes');
    igual(r.modo, true, 'el modo claro y oscuro está junto a los temas');
    igual(r.privado, '1', 'los montos siguen ocultos');
    igual(r.escala, 'compacta 85 %|normal 100 %|grande 115 %|extra grande 130 %', 'la escala de letra no se oculta con la privacidad');
    await irA('Chat');
  });
  await prueba('botón flotante de privacidad: fijo sobre la barra, en tres pantallas, y al minimizar todo vuelve a ocultarse', async () => {
    const caja = () => pag.evaluate(() => { const o = document.querySelector('#ojo'); if (!o) return null; const r = o.getBoundingClientRect(); const n = document.querySelector('#nav').getBoundingClientRect(); return { fijo: getComputedStyle(o).position, abajo: r.bottom, navArriba: n.top, derecha: innerWidth - r.right }; });
    for (const nombre of ['Saldos', 'Movimientos', 'Resumen']) {
      await irA(nombre); await espera(500);
      const c = await caja();
      igual(Boolean(c), true, 'hay botón en ' + nombre);
      igual(c.fijo, 'fixed', 'es flotante en ' + nombre);
      igual(c.abajo <= c.navArriba, true, 'queda encima de la barra en ' + nombre);
    }
    await ocultarMontos(pag);
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(500);
    igual(await pag.evaluate(() => document.documentElement.dataset.privado), '0', 'el botón muestra los montos');
    // se simula que la app pasa a segundo plano
    await pag.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await espera(300);
    igual(await pag.evaluate(() => document.documentElement.dataset.privado), '1', 'al minimizar vuelve a ocultarse');
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(300);
    await pag.evaluate(() => window.dispatchEvent(new Event('blur'))); await espera(300);
    igual(await pag.evaluate(() => document.documentElement.dataset.privado), '1', 'al perder el foco vuelve a ocultarse');
    // el resto de la visita mira cifras: se dejan a la vista
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(300);
    await irA('Chat');
  });
  await prueba('aviso de deshacer: sale arriba, no tapa la caja de escribir ni la barra, y se cierra con la equis', async () => {
    await irA('Chat');
    await escribir('mecato 2468'); await pulsar('Confirmar'); await espera(700);
    const r = await pag.evaluate(() => { const t = document.querySelector('#toast-deshacer').getBoundingClientRect(); const f = document.querySelector('#form').getBoundingClientRect(); const n = document.querySelector('#nav').getBoundingClientRect(); return { arriba: t.top, abajo: t.bottom, form: f.top, nav: n.top }; });
    igual(r.arriba < 80, true, 'pegado al borde de arriba');
    igual(r.abajo < r.form && r.abajo < r.nav, true, 'no pisa el campo de texto ni la barra de abajo');
    await pag.evaluate(() => document.querySelector('#cerrar-toast').click()); await espera(500);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#toast-deshacer'))), false, 'la equis lo cierra');
  });
  await prueba('metas: con fecha objetivo sale la cuota semanal y el botón aparta la cuota', async () => {
    await irA('Chat'); await escribir('meta bici 800000');
    await abrirDeMas('Alcancías'); await espera(700);
    const futuro = new Date(Date.now() + 63 * 86400000).toISOString().slice(0, 10);
    await pag.evaluate(f => { const i = document.querySelector('[data-cuota="Bici"] input[type=date]'); i.value = f; i.dispatchEvent(new Event('input', { bubbles: true })); }, futuro); await espera(800);
    contiene(await pag.evaluate(() => document.querySelector('[data-cuota="Bici"]').innerText), 'por semana', 'la cuota semanal');
    await pag.evaluate(() => document.querySelector('[data-apartar-cuota="Bici"]').click()); await espera(900);
    contiene(await pag.evaluate(() => document.querySelector('[data-meta="Bici"]').innerText), '$', 'queda algo apartado');
    igual(await pag.evaluate(() => /apartad|Faltan/i.test(document.querySelector('[data-meta="Bici"]').innerText)), true, 'la tarjeta de la meta sigue ahí');
    await irA('Chat');
  });
  await prueba('deshacer global: al guardar sale la barra de 8 segundos y el botón revierte; si no se toca, se va sola', async () => {
    await irA('Chat');
    await escribir('mecato 1234'); await pulsar('Confirmar');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#toast-deshacer'))), true, 'sale la barra');
    await pag.evaluate(() => document.querySelector('#deshacer-toast').click()); await espera(1200);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#toast-deshacer'))), false, 'se cierra al deshacer');
    contiene(await pag.evaluate(() => document.querySelector('#chat').innerText), 'Deshacer', 'queda dicho en el chat');
    await escribir('mecato 4321'); await pulsar('Confirmar');
    await espera(8600);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#toast-deshacer'))), false, 'a los 8 segundos se va sola');
  });
  await prueba('pegar una alerta del banco: se lee el monto, el comercio y la cuenta sin IA', async () => {
    await irA('Chat');
    await pag.evaluate(() => document.querySelector('#pegar-notificacion').click()); await espera(2800);
    // en la prueba no hay permiso del portapapeles: la app pide el texto en un cuadro
    if (await pag.evaluate(() => Boolean(document.querySelector('#dialogo input')))) {
      await pag.type('#dialogo input', 'Nequi: Pagaste $15.000 en TIENDA DON PEPE. Tu saldo disponible es $85.000.'); await pag.keyboard.press('Enter'); await espera(900);
    }
    contiene(await pag.evaluate(() => document.querySelector('#chat').innerText), '$15.000', 'la tarjeta con el monto');
    contiene(await pag.evaluate(() => document.querySelector('#chat').innerText), 'Nequi', 'en la cuenta Nequi');
    await pulsar('Cancelar');
  });
  await prueba('bloqueo: con PIN, al pasar a segundo plano pide el PIN; equivocarse hace esperar; acertar entra', async () => {
    await abrirDeMas('Ajustes'); await espera(500);
    // ya hay un PIN (1234) de la prueba anterior: se cambia a 2468 (pide el de ahora y luego el nuevo)
    await pag.evaluate(() => [...document.querySelectorAll('button')].find(b => /Crear PIN|Cambiar PIN/.test(b.innerText))?.click()); await espera(400);
    await pag.type('#dialogo input', '1234'); await pag.keyboard.press('Enter'); await espera(700);
    await pag.type('#dialogo input', '2468'); await pag.keyboard.press('Enter'); await espera(900);
    await pag.evaluate(() => document.querySelector('#bloqueo-modo').click()); await espera(400);
    await pag.evaluate(() => document.querySelector('[role=option][data-valor="fondo"]')?.click()); await espera(400);
    const fondo = async oculto => { await pag.evaluate(o => { Object.defineProperty(document, 'hidden', { value: o, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, oculto); await espera(400); };
    await fondo(true); await fondo(false);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#bloqueo'))), true, 'quedó bloqueada');
    for (let i = 0; i < 3; i++) { await pag.type('#bloqueo-pin', '1111'); await pag.evaluate(() => document.querySelector('#bloqueo-entrar').click()); await espera(500); }
    contiene(await pag.evaluate(() => document.querySelector('#bloqueo-mensaje').innerText), 'Espera', 'después de tres errores hace esperar');
    igual(await pag.evaluate(() => document.querySelector('#bloqueo-pin').disabled), true, 'el campo se apaga durante la espera');
    await espera(5600);
    await pag.type('#bloqueo-pin', '2468'); await pag.evaluate(() => document.querySelector('#bloqueo-entrar').click()); await espera(900);
    igual(await pag.evaluate(() => Boolean(document.querySelector('#bloqueo'))), false, 'el PIN correcto entra');
    contiene(await pag.evaluate(() => document.querySelector('#actividad')?.innerText ?? ''), 'Se desbloqueó', 'queda en la actividad reciente');
    await pag.evaluate(() => document.querySelector('#bloqueo-modo').click()); await espera(300);
    await pag.evaluate(() => document.querySelector('[role=option][data-valor="nunca"]')?.click()); await espera(300);
    await irA('Chat');
  });
  await prueba('lenguaje natural: «hicimos vaca» pregunta con botones y al elegir anota el gasto compartido', async () => {
    await irA('Chat');
    await escribir('hicimos vaca de 60k con Ana y Luis para el almuerzo');
    contiene(await ultima(), 'Con Ana y Luis', 'la pregunta de reparto');
    contiene(await ultima(), 'Dividir entre los 3', 'el botón de dividir');
    await pulsar(await pag.evaluate(() => [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(t => t.startsWith('Dividir entre los 3')).pop()));
    contiene(await ultima(), 'Tu parte', 'la tarjeta del gasto compartido');
    await pulsar('Confirmar'); await espera(400);
    if (await pag.evaluate(() => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Guardar igual'))) await pulsar('Guardar igual');
    contiene(await ultima(), 'GUARDADO', 'el gasto compartido se guardó');
  });
  await prueba('ayuda: «Pregúntale cómo decirlo» da el ejemplo y el botón lo deja escrito en el chat', async () => {
    await irA('Chat');
    await pag.evaluate(() => document.querySelector('[data-atajo="ayuda"]')?.click()); await espera(900);
    await pag.type('#ayuda-duda', 'cómo anoto que presté plata'); await pag.keyboard.press('Enter'); await espera(400);
    contiene(await pag.evaluate(() => document.querySelector('#ayuda-respuesta')?.innerText ?? ''), 'presté', 'el ejemplo de préstamo');
    await pag.evaluate(() => document.querySelector('#ayuda-usar')?.click()); await espera(400);
    contiene(await pag.evaluate(() => document.querySelector('#texto').value), 'presté', 'el ejemplo queda escrito');
    await pag.evaluate(() => { const t = document.querySelector('#texto'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await prueba('resumen: flujo del mes, ranking de conceptos y anillo de medios de pago', async () => {
    await irA('Resumen'); await espera(900);
    const hay = id => pag.evaluate(i => Boolean(document.querySelector(i)), id);
    igual(await hay('#flujo-mes svg'), true, 'la línea del flujo');
    igual(await hay('#ranking-lista li'), true, 'el ranking');
    igual(await hay('#anillo-medios svg'), true, 'el anillo de medios');
    await pag.evaluate(() => { const s = document.querySelector('#flujo-mes svg').getBoundingClientRect(); window.__r = s; });
    await pag.mouse.move(150, await pag.evaluate(() => window.__r.top + 20)); await espera(200);
    contiene((await pag.evaluate(() => document.querySelector('#flujo-dato')?.innerText ?? '')).toLowerCase(), 'balance acumulado', 'el dato del día');
  });
  await prueba('ventanas flotantes: tocar una fila del Resumen abre sus movimientos, un movimiento abre su detalle encima y atrás cierra de a una', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const capa = (s) => pag.evaluate(x => { const e = document.querySelector(x); return e ? Number(getComputedStyle(e).zIndex) : -1; }, s);
    await irA('Resumen'); await espera(700);
    // el ranking de conceptos
    await clic('#ranking-lista [data-concepto]');
    igual(await hay('#info'), true, 'el ranking abre la ventana');
    igual(await pag.evaluate(() => document.querySelectorAll('#info-movs li').length > 0), true, 'con los movimientos del concepto');
    // un movimiento de la ventana abre su detalle por encima, sin cerrar la ventana
    await clic('#info-movs li');
    igual(await hay('#detalle'), true, 'el movimiento abre su detalle');
    igual(await hay('#info'), true, 'la ventana sigue debajo');
    igual((await capa('#detalle')) > (await capa('#info')), true, 'el detalle queda por encima de la ventana');
    await clic('#cerrar');
    igual(await hay('#detalle'), false, 'cerrar el detalle');
    igual(await hay('#info'), true, 'la ventana sigue abierta');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'la ventana se cierra');
    // las categorías, los medios de pago y las comparativas
    for (const [sel, id] of [['[data-categoria]', 'categoria'], ['#anillo-medios [data-medio="efectivo"]', 'medio'], ['#comp-gastos', 'comparativa-gastos']]) {
      if (id === 'categoria') { await pag.evaluate(() => { if (!document.querySelector('[data-categoria]')) document.querySelector('svg[aria-label="Gastos por categoría"]')?.parentElement?.querySelector('ul li button')?.click(); }); await espera(300); }
      await clic(sel);
      igual(await pag.evaluate(i => document.querySelector('#info')?.dataset.info, id), id, 'abre ' + id);
      await clic('#info-cerrar'); await espera(400);
    }
    // el atajo a Movimientos filtra de verdad
    await pag.evaluate(() => { if (!document.querySelector('[data-categoria]')) document.querySelector('svg[aria-label="Gastos por categoría"]')?.parentElement?.querySelector('ul li button')?.click(); }); await espera(300);
    await clic('[data-categoria]'); await clic('#info-ver-movimientos'); await espera(700);
    igual(await pag.evaluate(() => document.querySelector('nav [aria-current=page]')?.dataset.p), 'movimientos', 'va a Movimientos');
    igual(await hay('#info'), false, 'y la ventana ya no está');
  });
  await prueba('ventanas flotantes: una cuenta de Saldos y una deuda abren sus movimientos y sus acciones', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Saldos'); await espera(700);
    await clic('[data-saldo-cuenta="efectivo"]');
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'cuenta-efectivo', 'la tarjeta de Efectivo abre su ventana');
    for (const id of ['#info-cuadrar', '#info-desde', '#info-hacia', '#info-ver-movimientos']) igual(await hay(id), true, 'trae ' + id);
    await clic('#info-desde'); await espera(700);
    igual(await pag.evaluate(() => document.querySelector('nav [aria-current=page]')?.dataset.p), 'chat', 'pasar plata deja la frase en el chat');
    contiene(await pag.evaluate(() => document.querySelector('#texto').value), 'pasé', 'la frase quedó escrita');
    await pag.evaluate(() => { const x = document.querySelector('#texto'); x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); });
    // una deuda
    await irA('Chat'); await escribir('le debo 54000 a Pedro por la bici'); await pulsar('Compras'); await pulsar('Confirmar'); await espera(500);
    await abrirDeMas('Deudas y préstamos'); await espera(700);
    await clic('[data-persona]');
    igual(await pag.evaluate(() => (document.querySelector('#info')?.dataset.info ?? '').startsWith('ficha-')), true, 'la deuda abre su ventana');
    igual(await hay('#info-registrar'), true, 'con el botón de registrar el pago');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'se cierra');
    await irA('Chat');
  });
  await prueba('abono parcial: la hoja de Deudas precarga el saldo, avisa si es de más y deja la frase en el chat', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const poner = async (s, v) => { await pag.evaluate((x, t) => { const e = document.querySelector(x); e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })); }, s, v); await espera(250); };
    const chipDe = async nombre => { const ok = await pag.evaluate(n => { const li = [...document.querySelectorAll('[data-persona]')].find(x => x.innerText.includes(n)); const c = li?.querySelector('.chip'); c?.click(); return Boolean(c); }, nombre); if (!ok) throw new Error('no hay chip de ' + nombre + ' | ' + (await pag.evaluate(() => document.body.innerText)).slice(0, 700).split('\n').join(' ~ ')); await espera(600); };
    await irA('Chat'); await escribir('le debo 54000 a Marta por el mercado'); await pulsar('Comida'); await pulsar('Confirmar'); await espera(500);
    await abrirDeMas('Deudas y préstamos'); await espera(700);
    await chipDe('Marta');
    igual(await hay('#hoja-abono'), true, 'el chip abre la hoja de abono');
    contiene(await pag.evaluate(() => document.querySelector('#abono-nombre').innerText.toLowerCase()), 'marta', 'dice a quién');
    igual(await pag.evaluate(() => document.querySelector('#abono-monto').value), '54000', 'el monto viene con el saldo');
    igual(await pag.evaluate(() => { const r = document.querySelector('#hoja-abono > div').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1; }), true, 'no se sale de la pantalla');
    await poner('#abono-monto', '80000');
    igual(await hay('#abono-aviso'), true, 'avisa que es más de lo que debe');
    await poner('#abono-monto', '0');
    igual(await pag.evaluate(() => document.querySelector('#abono-confirmar').disabled), true, 'con cero no deja confirmar');
    await poner('#abono-monto', '20000');
    igual(await hay('#abono-aviso'), false, 'un abono parcial no avisa');
    await pag.evaluate(() => history.back()); await espera(500);
    igual(await hay('#hoja-abono'), false, 'atrás cierra la hoja');
    await chipDe('Marta'); await poner('#abono-monto', '20000');
    await clic('#abono-confirmar'); await espera(800);
    igual(await pag.evaluate(() => document.querySelector('nav [aria-current=page]')?.dataset.p), 'chat', 'pasa al chat');
    contiene(await pag.evaluate(() => document.body.innerText), 'Marta', 'la tarjeta de confirmación nombra a Marta');
    await mostrarMontos(pag); await espera(500);
    await pulsar('Cancelar'); await espera(400); // el abono queda como tarjeta pendiente: se descarta para que no estorbe a las pruebas siguientes
    contiene(await pag.evaluate(() => document.body.innerText), '20.000', 'con el monto del abono');
  });

  await prueba('movimientos: ya no trae Mostrar anulados ni el engranaje de opciones', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    await irA('Movimientos'); await espera(700);
    igual(await hay('#opciones-mov'), false, 'sin botón de opciones');
    igual(await hay('#anulados'), false, 'sin interruptor de anulados');
    igual(await hay('#f-etiqueta'), true, 'las etiquetas son un desplegable');
    igual(await pag.evaluate(() => document.querySelectorAll('#lista li.grupo-dia').length > 0), true, 'cada día lleva su encabezado');
  });

  await prueba('ventanas flotantes: las tarjetas de Resumen y la comparativa por categoría abren su desglose', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const id = () => pag.evaluate(() => document.querySelector('#info')?.dataset.info);
    await irA('Resumen'); await espera(700);
    igual(await pag.evaluate(() => document.querySelector('#card-gastos')?.getAttribute('role')), 'button', 'la tarjeta de gastos es un botón');
    for (const [sel, esperado] of [['#card-gastos', 'info-gastos'], ['#card-ingresos', 'info-ingresos'], ['#card-balance', 'info-balance']]) {
      if (!(await hay(sel))) continue;
      await clic(sel); igual(await id(), esperado, 'abre ' + esperado);
      await clic('#info-cerrar'); await espera(400);
    }
    // la comparativa: tocar una categoría la compara contra el periodo anterior, con las dos listas
    await clic('#comp-gastos'); igual(await id(), 'comparativa-gastos', 'abre la comparativa');
    await clic('#info [data-comparar]'); igual(await id(), 'comparar-categoria', 'una categoría abre su comparación');
    igual(await hay('#info-movs-ahora, #info-movs-ahora-vacio'), true, 'la lista de ahora');
    igual(await hay('#info-movs-antes, #info-movs-antes-vacio'), true, 'la lista de antes');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'un solo atrás cierra la ventana');
    // la tarjeta «Contra el mes pasado» abre lo mismo
    if (await hay('#contra-mes-pasado [data-comparar]')) {
      await clic('#contra-mes-pasado [data-comparar]'); igual(await id(), 'comparar-categoria', 'la tarjeta del mes abre la comparación');
      await clic('#info-cerrar'); await espera(400);
    }
  });
  await prueba('ventanas flotantes: el gasto por día de la semana abre la ventana de cada día', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Resumen'); await espera(700);
    igual(await pag.evaluate(() => document.querySelectorAll('#grafica-dia-semana [data-dia-semana]').length), 7, 'siete barras, lunes a domingo');
    igual(await pag.evaluate(() => document.querySelector('#grafica-dia-semana [data-dia-semana]')?.getAttribute('role')), 'button', 'cada barra es un botón');
    await clic('#grafica-dia-semana [data-dia-semana="0"]');
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-dia-semana', 'abre la ventana del día');
    igual(await pag.evaluate(() => document.querySelector('#info-dia-semana-cifras')?.dataset.diaSemana), '0', 'es el lunes');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'se cierra');
  });
  await prueba('ventanas flotantes: el comparador muestra A y B, valida los rangos y abre una categoría con los dos', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const poner = async (s, v) => { await pag.evaluate((x, y) => { const e = document.querySelector(x); e.value = y; e.dispatchEvent(new Event('input', { bubbles: true })); }, s, v); await espera(300); };
    await irA('Resumen'); await espera(700);
    igual(await hay('#comparador-fechas'), false, 'el comparador ya no está fijo en la página');
    await clic('#abrir-comparador');
    igual(await hay('#info #comparador-fechas'), true, 'se abre en una ventana flotante');
    igual(await pag.evaluate(() => document.querySelectorAll('#comparador-fechas input[type=date]').length), 4, 'cuatro fechas: A y B');
    igual(await hay('#comparador-resultado'), true, 'con los rangos de ejemplo ya compara');
    // un rango al revés avisa y no calcula
    await poner('#cmp-a-inicio', '2099-01-02'); await poner('#cmp-a-fin', '2099-01-01');
    contiene(await pag.evaluate(() => document.querySelector('#comparador-error')?.innerText ?? ''), 'anterior', 'explica el rango al revés');
    igual(await hay('#comparador-resultado'), false, 'sin resultado mientras el rango no sirva');
    // más de dos años
    await poner('#cmp-a-inicio', '2020-01-01'); await poner('#cmp-a-fin', '2026-01-01');
    contiene(await pag.evaluate(() => document.querySelector('#comparador-error')?.innerText ?? ''), '2 años', 'avisa que pasa de dos años');
    // los dos rangos buenos: tocar una categoría abre la ventana con A y B
    await poner('#cmp-a-inicio', '2026-01-01'); await poner('#cmp-a-fin', '2026-12-31');
    await poner('#cmp-b-inicio', '2026-01-01'); await poner('#cmp-b-fin', '2026-12-31');
    igual(await hay('#comparador-error'), false, 'rangos buenos, sin error');
    if (await hay('#comparador-categorias [data-comparar-rango]')) {
      await clic('#comparador-categorias [data-comparar-rango]');
      igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'comparar-categoria', 'abre la comparación de la categoría');
      igual(await pag.evaluate(() => document.querySelectorAll('#info [data-lado]').length), 2, 'con la lista de A y la de B');
      await clic('#info-cerrar'); await espera(400);
    }
  });
  await prueba('reporte PDF: el botón existe, pide confirmar con la privacidad activa y solo entonces arma la hoja e imprime', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Resumen'); await espera(700);
    // la impresión del sistema no se abre en las pruebas: se cuenta cuántas veces se pidió
    await pag.evaluate(() => { window.__imprimio = 0; window.print = () => { window.__imprimio++; }; });
    if (await pag.evaluate(() => document.documentElement.dataset.privado) !== '1') { await clic('#ojo'); }
    igual(await hay('#reporte-pdf'), true, 'el botón del reporte está en Resumen');
    await clic('#abrir-comparador');
    igual(await hay('#reporte-pdf-comparador'), true, 'y el del comparador, dentro de su ventana');
    await clic('#info-cerrar'); await espera(400);
    await clic('#reporte-pdf');
    igual(await hay('#dialogo'), true, 'sale el diálogo de confirmación');
    contiene(await pag.evaluate(() => document.querySelector('#dialogo').innerText), 'El reporte muestra las cifras', 'dice que muestra las cifras');
    await clic('#dialogo-cancelar'); await espera(300);
    igual(await pag.evaluate(() => window.__imprimio), 0, 'si no confirma, no imprime');
    igual(await hay('#reporte-impresion'), false, 'ni arma la hoja');
    await clic('#reporte-pdf'); await clic('#dialogo-aceptar'); await espera(500);
    igual(await pag.evaluate(() => window.__imprimio), 1, 'al confirmar, pide imprimir una vez');
    const hoja = await pag.evaluate(() => { const e = document.querySelector('#reporte-impresion'); return { texto: e?.innerText ?? e?.textContent ?? '', visible: e ? getComputedStyle(e).display : 'no' }; });
    igual(hoja.visible, 'none', 'en pantalla la hoja no se ve');
    igual(/•{3,}/.test(hoja.texto), false, 'la hoja lleva cifras reales, no puntos');
    contiene(hoja.texto, 'Generado el', 'lleva la fecha de generación');
  });
  await prueba('ventanas flotantes: Saldos abre Disponible, seguro para hoy, salud patrimonial y alertas', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const id = () => pag.evaluate(() => document.querySelector('#info')?.dataset.info);
    await irA('Saldos'); await espera(700);
    for (const [sel, esperado, calculo] of [['#hero-disponible', 'info-disponible', '#info-disponible-calculo'], ['#seguro-hoy', 'info-seguro', '#info-seguro-calculo'], ['#salud-patrimonial', 'info-salud', '#info-salud-calculo']]) {
      await clic(sel); igual(await id(), esperado, 'abre ' + esperado);
      igual(await hay(calculo), true, 'trae el cálculo de ' + esperado);
      await clic('#info-cerrar'); await espera(400);
      igual(await hay('#info'), false, 'se cierra ' + esperado);
    }
    // lo de adentro no abre lo de afuera: «entró» y «salió» tienen su propia ventana, y los chips no abren nada
    await clic('#hero-salio'); igual(await id(), 'info-gastos', 'salió abre los gastos del mes');
    await clic('#info-cerrar'); await espera(400);
    await clic('#salud-cobrar'); igual(await id(), 'info-por-cobrar', 'te deben abre su lista');
    await clic('#info-cerrar'); await espera(400);
    if (await hay('[data-alerta]')) {
      await clic('[data-alerta]'); igual(await id(), 'info-alerta', 'la alerta abre su porqué');
      contiene(await pag.evaluate(() => (document.querySelector('#info-alerta-detalle')?.innerText ?? '').toLowerCase()), 'por qué sale', 'explica el motivo');
      await clic('#info-cerrar'); await espera(400);
    }
  });
  await prueba('ciclo de un pago fijo: se pausa, se reanuda, se programa su fin y se elimina sin tocar los movimientos', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Chat'); await escribir('cada mes el 5 gimnasio 50000'); await espera(500);
    await abrirDeMas('Pagos fijos'); await espera(700);
    const abrirGimnasio = async () => { await pag.evaluate(() => [...document.querySelectorAll('li[data-fijo]')].find(l => l.innerText.toLowerCase().includes('gimnasio'))?.click()); await espera(600); };
    await abrirGimnasio();
    igual(await hay('#fijo-pausar'), true, 'el detalle trae Pausar');
    await clic('#fijo-pausar'); await espera(500);
    igual(await hay('#fijos-inactivos'), true, 'en pausa pasa a la sección de pausados');
    await abrirGimnasio();
    contiene((await pag.evaluate(() => document.querySelector('#info')?.innerText ?? '')).toLowerCase(), 'en pausa', 'el detalle dice que está en pausa');
    await clic('#fijo-pausar'); await espera(500);
    igual(await hay('#fijos-inactivos'), false, 'reanudado vuelve a la lista normal');
    await abrirGimnasio();
    await clic('#fijo-fin');
    await pag.evaluate(() => { const e = document.querySelector('#fijo-fin-fecha'); e.value = '2020-01-01'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await clic('#fijo-fin-guardar'); await espera(500);
    igual(await hay('#fijos-inactivos'), true, 'con fin ya pasado queda terminado');
    await abrirGimnasio();
    await clic('#fijo-eliminar'); await espera(400);
    await pulsar('Sí, eliminar').catch(async () => { await clic('#dialogo-aceptar'); });
    await espera(600);
    igual(await pag.evaluate(() => [...document.querySelectorAll('li[data-fijo]')].some(l => l.innerText.toLowerCase().includes('gimnasio'))), false, 'eliminado no sale');
    await irA('Chat');
  });
  await prueba('personas: se crean desde el chat sin monto y al escribir su nombre sale su tarjeta', async () => {
    await irA('Chat'); await escribir('agregar persona Sofia');
    contiene(await ultima(), 'Sofia', 'confirma la persona');
    await escribir('Sofia');
    contiene((await ultima()).toLowerCase(), 'sin pendientes', 'la tarjeta de estado');
    igual(await pag.evaluate(() => [...document.querySelectorAll('.burbuja button')].some(b => /abono/i.test(b.innerText))), true, 'con el botón de abono');
  });
  await prueba('ayuda en el chat: las preguntas de uso se responden con ejemplos tocables y no se cobran como gasto', async () => {
    await irA('Chat');
    for (const [pregunta, esperado] of [['Como anoto un gasto', 'Un gasto es lo que compraste'], ['como agrego una persona', 'Una persona es alguien'], ['como pauso un pago fijo', 'Pausa un pago fijo'], ['como uso etiquetas', 'Con # juntas'], ['para qué sirve esto', 'cuaderno de plata']]) {
      await escribir(pregunta);
      const u = await ultima();
      contiene(u, esperado, pregunta);
      if (/Me falta|lista de compras/.test(u)) throw new Error('trató la pregunta como un gasto: ' + u);
    }
    await escribir('Como anoto un gasto');
    await pulsar('almuerzo 12000');
    igual(await pag.evaluate(() => document.querySelector('#texto').value.trim()), 'almuerzo 12000', 'el ejemplo queda escrito en el cuadro');
    await pag.evaluate(() => { const x = document.querySelector('#texto'); x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await prueba('chat: el hilo no se desplaza hacia los lados y nada se sale de su ancho', async () => {
    await irA('Chat');
    await escribir('como meto plata que me entro');
    contiene(await ultima(), 'Un ingreso lleva', 'la pregunta de ingresos se responde');
    await escribir('almuerzo con ana luis y marta 60000 nequi con una descripcion larguisima larguisima larguisima larguisima');
    const r = await pag.evaluate(() => { const c = document.querySelector('#chat'); const ancho = c.clientWidth; const fuera = [...c.querySelectorAll('.burbuja, .burbuja *')].filter(e => e.getBoundingClientRect().right > c.getBoundingClientRect().right + 1).length; return { sw: c.scrollWidth, cw: ancho, ov: getComputedStyle(c).overflowX, fuera }; });
    igual(r.ov, 'hidden', 'el hilo no tiene scroll horizontal');
    igual(r.sw <= r.cw, true, 'el contenido no es más ancho que el hilo');
    igual(r.fuera, 0, 'ninguna burbuja ni tarjeta se pasa del borde');
    await pulsar('Cancelar');
  });
  await prueba('calor del mes: tocar un día con gastos abre la hoja de ese día', async () => {
    await irA('Resumen'); await espera(700);
    await pag.evaluate(() => document.querySelector('#mapa-calor .calor-dia:not(.nf)')?.click()); await espera(500);
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-calor-dia', 'abre la hoja del día');
    await pag.evaluate(() => document.querySelector('#info-cerrar')?.click()); await espera(400);
  });
  await prueba('ventanas flotantes: alcancías, pagos fijos y deudas abren su detalle desde sus tarjetas', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    const id = () => pag.evaluate(() => document.querySelector('#info')?.dataset.info);
    await abrirDeMas('Alcancías'); await espera(700);
    await clic('#total-apartado'); igual(await id(), 'info-metas', 'el total apartado abre las metas');
    await clic('#info-cerrar'); await espera(400);
    if (await hay('[data-meta-abrir]')) {
      await clic('[data-meta-abrir]'); igual(await id(), 'info-meta', 'una alcancía abre sus aportes');
      igual(await hay('#info-meta-detalle'), true, 'con su avance');
      await clic('#info-cerrar'); await espera(400);
    }
    await abrirDeMas('Pagos fijos'); await espera(700);
    await clic('#kpi-fijos-mes'); igual(await id(), 'info-fijos-mes', 'el total del mes abre sus pagos');
    await clic('#info-cerrar'); await espera(400);
    await clic('#kpi-fijos-pendiente'); igual(await id(), 'info-fijos-pendientes', 'lo que falta abre sus pagos');
    await clic('#info-cerrar'); await espera(400);
    if (await hay('li[data-fijo]')) {
      await clic('li[data-fijo]'); igual(await id(), 'info-fijo', 'un pago fijo abre su detalle');
      await clic('#info-cerrar'); await espera(400);
    }
    await abrirDeMas('Deudas y préstamos'); await espera(700);
    await clic('#kpi-por-cobrar'); igual(await id(), 'info-por-cobrar', 'por cobrar abre su lista');
    await clic('#info-cerrar'); await espera(400);
    await clic('#kpi-por-pagar'); igual(await id(), 'info-por-pagar', 'por pagar abre su lista');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'todo cerrado');
    await irA('Chat');
  });
  await prueba('ventanas flotantes: un día del ritmo, una semana y una meta de las gráficas del Resumen abren sus ventanas', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.dispatchEvent(new MouseEvent('click', { bubbles: true })); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Resumen'); await espera(700);
    for (const id of ['#grafica-ritmo', '#grafica-semanal', '#grafica-ahorro']) igual(await hay(id), true, 'la tarjeta ' + id);
    // un día del ritmo: el de hoy, que ya tiene el acumulado
    const hoy = await pag.evaluate(() => Number(document.querySelector('#ritmo-dato .etiqueta')?.textContent.match(/\d+/)?.[0]));
    await clic(`#grafica-ritmo [data-dia="${hoy}"]`);
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-ritmo-dia', 'el día abre su ventana');
    igual(await hay('#info-ritmo-cifras'), true, 'con el acumulado del mes');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'se cierra');
    // una semana
    await clic('#grafica-semanal [data-semana]:last-child');
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-semana', 'la semana abre su ventana');
    igual(await hay('#info-semana-cifras'), true, 'con ingresos y gastos');
    await clic('#info-cerrar'); await espera(400);
    // una meta
    await clic('#grafica-ahorro [data-meta-grafica]');
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-meta-ahorro', 'la meta abre su ventana');
    await clic('#info-cerrar'); await espera(400);
    igual(await hay('#info'), false, 'se cierra');
  });
  await prueba('ventanas flotantes: las etiquetas se escriben en cualquier frase, salen en el Resumen y filtran Movimientos', async () => {
    const hay = s => pag.evaluate(x => Boolean(document.querySelector(x)), s);
    const clic = async s => { const ok = await pag.evaluate(x => { const e = document.querySelector(x); e?.click(); return Boolean(e); }, s); if (!ok) throw new Error('no hay ' + s); await espera(600); };
    await irA('Chat'); await espera(400);
    await pag.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^(Cancelar|Descartar la pendiente)$/.test(b.innerText.trim())).pop()?.click()); await espera(400); // una tarjeta pendiente de antes se descarta
    await escribir('#viaje cena 14000 #claude'); await pulsar('Guardar igual');
    await escribir('taxi de terminal a casa 6000 #viaje'); await pulsar('Guardar igual');
    await irA('Resumen'); await espera(700);
    igual(await hay('#tarjeta-etiquetas [data-etiqueta="viaje"]'), true, 'la tarjeta de etiquetas lista #viaje');
    igual(await hay('#tarjeta-etiquetas [data-etiqueta="claude"]'), true, 'y #claude');
    await clic('#tarjeta-etiquetas [data-etiqueta="viaje"]');
    igual(await pag.evaluate(() => document.querySelector('#info')?.dataset.info), 'info-etiqueta', 'la fila abre la ventana de la etiqueta');
    igual(await pag.evaluate(() => document.querySelectorAll('#info-movs li').length), 2, 'con los dos movimientos');
    await clic('#info-ver-movimientos'); await espera(700);
    igual(await pag.evaluate(() => document.querySelector('nav [aria-current=page]')?.dataset.p), 'movimientos', 'va a Movimientos');
    igual(await pag.evaluate(() => document.querySelectorAll('li.fila[data-id]').length), 2, 'filtrado por la etiqueta');
    igual(await pag.evaluate(() => document.querySelector('li.fila[data-id] [data-etiqueta="viaje"]') !== null), true, 'cada fila muestra su etiqueta como chip');
    await pag.evaluate(() => document.querySelector('#limpiar')?.click()); await espera(300);
  });
  await prueba('resumen con privacidad total: las cifras de las gráficas nuevas salen ocultas', async () => {
    const estaba = await pag.evaluate(() => document.documentElement.dataset.privado === '1');
    if (!estaba) await pag.evaluate(() => document.querySelector('#ojo')?.click()); await espera(500);
    const t = await pag.evaluate(() => (document.querySelector('#ranking-conceptos')?.innerText ?? '') + (document.querySelector('#medios-pago')?.innerText ?? ''));
    igual(/$s?d/.test(t), false, 'ninguna cifra a la vista');
    if (!estaba) await pag.evaluate(() => document.querySelector('#ojo')?.click()); await espera(300);
  });
  await prueba('movimientos: el gasto compartido despliega su reparto (tu gasto real y lo que te deben)', async () => {
    await irA('Movimientos'); await espera(500);
    await pag.evaluate(() => document.querySelector('#limpiar')?.click()); await espera(300);
    await pag.click('[data-tipo=todos]').catch(() => {}); await espera(300);
    // se abre cada almuerzo de la lista hasta dar con el compartido
    for (let k = 0; k < 20; k++) {
      const abrio = await pag.evaluate(n => { const f = [...document.querySelectorAll('li.fila[data-id]')].filter(x => /(almuerzo|comida)/i.test(x.innerText))[n]; f?.click(); return Boolean(f); }, k); await espera(500);
      if (!abrio || await pag.evaluate(() => Boolean(document.querySelector('#ver-desglose')))) break;
      await pag.evaluate(() => document.querySelector('#cerrar')?.click()); await espera(300);
    }
    const hay = await pag.evaluate(() => Boolean(document.querySelector('#ver-desglose')));
    if (hay) {
      await pag.evaluate(() => document.querySelector('#ver-desglose').click()); await espera(500);
      contiene(await pag.evaluate(() => document.querySelector('#desglose-detalle')?.innerText ?? ''), 'Por cobrar a Ana', 'lo que debe Ana');
    } else { throw new Error('ningún almuerzo de la lista es compartido'); }
    await pag.evaluate(() => document.querySelector('#cerrar')?.click()); await espera(300);
  });
  await prueba('la política de contenido no bloqueó nada en toda la visita', async () => igual(bloqueos.join(' | '), '', 'bloqueos de la política de contenido'));
  await prueba('ningún cuadro del navegador salió en toda la visita', async () => igual(nativos, 0, 'cuadros nativos'));
  await prueba('sin errores de JavaScript en toda la visita', async () => igual(errores.join(' | '), '', 'errores'));
} finally {
  if (celular) { for (const p of await navegador.pages()) if (p.url().startsWith(`http://localhost:${PUERTO}`)) await p.close().catch(() => {}); await navegador.disconnect(); } else await navegador.close();
  servidor.kill();
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
