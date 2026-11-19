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
    igual(await pag.evaluate(() => [...document.querySelectorAll('[aria-label="Etiquetas"] button')].map(b => b.innerText.trim().split(/\s/)[0]).join(',')), '#cumple', 'chip de la etiqueta');
    const filas = () => pag.evaluate(() => document.querySelectorAll('#lista .fila').length);
    const todas = await filas();
    await pag.evaluate(() => document.querySelector('[aria-label="Etiquetas"] button').click()); await espera(400);
    igual(await filas(), 1, 'solo lo de la etiqueta');
    igual(await pag.evaluate(() => Boolean(document.querySelector('#exportar-csv') && document.querySelector('#exportar-json'))), true, 'botones de exportar');
    await pag.evaluate(() => document.querySelector('[aria-label="Etiquetas"] button').click()); await espera(400);
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
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="oceano"]')?.click()); await espera(400);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'oceano', 'piel océano');
    igual(await pag.evaluate(() => document.querySelectorAll('.tema-card .pildora-6030').length >= 13), true, 'cada tema trae su píldora 60-30-10');
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="veltro"]')?.click()); await espera(300);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'veltro', 'uno de los nuevos');
    await pag.evaluate(() => document.querySelector('.tema-card[data-piel="libro"]')?.click()); await espera(400);
    igual(await pag.evaluate(() => document.documentElement.dataset.piel), 'libro', 'vuelve a libro');
    await pag.evaluate(() => document.querySelector('#sonidos').click()); await espera(200);
    igual(await pag.evaluate(() => document.querySelector('#sonidos').checked), true, 'el interruptor de sonido');
    await pag.evaluate(() => document.querySelector('#sonidos').click()); await espera(200);
    await irA('Chat');
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
    await pag.evaluate(() => { if (document.documentElement.dataset.privado !== '1') document.querySelector('#ojo').click(); }); await espera(400);
    await irA('Chat'); await escribir('mecato 4000');
    igual(await cifras(), null, 'la tarjeta del chat y lo que escribiste');
    await pulsar('Confirmar');
    igual(await cifras(), null, 'el «Guardado» con «Quedó en...»');
    for (const n of ['Saldos', 'Movimientos', 'Resumen']) { await irA(n); await espera(900); igual(await cifras(), null, n); }
    await pag.evaluate(() => document.querySelector('#ojo').click()); await espera(400);
    igual(await pag.evaluate(() => /\$\s?\d/.test(document.querySelector('#contenido').innerText)), true, 'al mostrar vuelven las cifras');
    await irA('Chat');
  });
  await prueba('cabecera: con todo guardado es un indicador chiquito, sin texto largo', async () => {
    const r = await pag.evaluate(() => { const e = document.querySelector('#estado'); return { texto: e.innerText.trim(), alto: document.querySelector('header').getBoundingClientRect().height, aria: e.getAttribute('aria-label') }; });
    igual(r.texto, '', 'sin texto');
    igual(Boolean(r.aria), true, 'con nombre para lectores de pantalla');
    igual(r.alto < 72, true, 'una sola fila');
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
  await prueba('la política de contenido no bloqueó nada en toda la visita', async () => igual(bloqueos.join(' | '), '', 'bloqueos de la política de contenido'));
  await prueba('ningún cuadro del navegador salió en toda la visita', async () => igual(nativos, 0, 'cuadros nativos'));
  await prueba('sin errores de JavaScript en toda la visita', async () => igual(errores.join(' | '), '', 'errores'));
} finally {
  if (celular) { for (const p of await navegador.pages()) if (p.url().startsWith(`http://localhost:${PUERTO}`)) await p.close().catch(() => {}); await navegador.disconnect(); } else await navegador.close();
  servidor.kill();
}
console.log(fallos ? `\n${fallos} prueba(s) fallaron.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
