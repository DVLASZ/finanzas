// Revisa que nada se desborde con letra grande en un celular de pantalla angosta, como el Redmi Note 14 de la mamá
// (1080 x 2400 px, unos 393 x 873 px CSS a 2,75x). La app instalada no tiene la barra del navegador, y la letra
// grande de la app (1,18) se suma a la del sistema, que Chrome aplica solo al texto, no a las cajas.
//   npm run e2e:letra            (compila la app de la mamá y revisa cada pantalla con varias escalas de texto)
//   ESCALAS=1,1.3 npm run e2e:letra
//   INSTALACION=personal npm run e2e:letra
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { mostrarMontos } from './_ojo.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATOS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const chrome = CANDIDATOS.find(p => existsSync(p));
if (!chrome) { console.error('No encuentro Chrome. Pon su ruta en CHROME_PATH.'); process.exit(1); }

const instalacion = process.env.INSTALACION ?? 'mama';
const escalas = (process.env.ESCALAS ?? '1,1.15,1.3').split(',').map(Number);
const capturas = process.env.CAPTURAS;
// los temas que se revisan (piel:tema). Por defecto los seis, en claro y en oscuro; TEMAS=obsidiana:oscuro,tierra:claro revisa solo esos
const TODOS = 'obsidiana:oscuro,obsidiana:claro,midnight:oscuro,midnight:claro,tierra:oscuro,tierra:claro,esmeralda:oscuro,esmeralda:claro,bordeaux:oscuro,bordeaux:claro,kinetix:oscuro,kinetix:claro';
const temas = (process.env.TEMAS === 'todos' || !process.env.TEMAS ? TODOS : process.env.TEMAS).split(',').map(x => x.split(':'));
if (capturas) mkdirSync(capturas, { recursive: true });

const prep = spawnSync('npm', ['run', 'instalar', '--', 'preparar', instalacion], { cwd: raiz, encoding: 'utf8', shell: true });
if (prep.status !== 0) { console.error(prep.stdout + prep.stderr); process.exit(1); }
const PUERTO = 5800 + Math.floor(Math.random() * 90);
const servidor = spawn('node', ['scripts/servir-web.mjs'], { cwd: raiz, env: { ...process.env, PORT: String(PUERTO), DIST: join(raiz, 'instalaciones', instalacion, 'dist') }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const espera = ms => new Promise(r => setTimeout(r, ms));

/** Lo que se ejecuta dentro de la página: sube el texto como lo hace Chrome en Android (solo el texto, no las cajas) y busca desbordes. */
const EN_PAGINA = {
  escalar: factor => {
    // dos pasadas: primero se leen todos los tamaños y después se cambian; si no, un hijo en «em» se escalaría dos veces
    const nuevos = [...document.querySelectorAll('body *')].filter(el => !el.dataset.zf && !el.closest('svg'));
    const tamanos = nuevos.map(el => parseFloat(getComputedStyle(el).fontSize));
    const delPadre = nuevos.map(el => (el.parentElement ? parseFloat(getComputedStyle(el.parentElement).fontSize) : 0));
    // el tamaño nuevo va en una hoja de estilo (con !important) y no en línea, para no pelear con los ajustes que hace la app
    let hoja = document.getElementById('zf-estilos');
    if (!hoja) { hoja = document.createElement('style'); hoja.id = 'zf-estilos'; document.head.append(hoja); window.__zf = 0; }
    let reglas = '';
    nuevos.forEach((el, i) => {
      el.dataset.zf = '1';
      if (Math.abs(tamanos[i] - delPadre[i]) > 0.01 || !el.parentElement || el.parentElement === document.body) { const n = window.__zf++; el.classList.add(`zf-${n}`); reglas += `.zf-${n}{font-size:${tamanos[i] * factor}px !important}\n`; }
    });
    hoja.append(reglas);
  },
  revisar: () => {
    const ancho = innerWidth;
    const hallazgos = [];
    // el compositor del chat con el campo y los tres botones en la misma fila
    const aviso = document.querySelector('#toast-deshacer')?.getBoundingClientRect();
    const caja = document.querySelector('#form')?.getBoundingClientRect();
    if (aviso && caja && aviso.bottom > caja.top) hallazgos.push({ tipo: 'el aviso de deshacer tapa la caja de escribir', el: '#toast-deshacer', texto: '', dato: '' });
    const campo = document.querySelector('#form #texto');
    const enviar = document.querySelector('#form button[type=submit]');
    if (campo && enviar && Math.abs(campo.getBoundingClientRect().top - enviar.getBoundingClientRect().top) > 24) hallazgos.push({ tipo: 'el compositor se apila en dos pisos', el: 'form#form', texto: '', dato: `campo ${Math.round(campo.getBoundingClientRect().top)} y botón ${Math.round(enviar.getBoundingClientRect().top)}` });
    if (document.documentElement.dataset.privado === '1') {
      const visible = document.body.innerText.match(/[-+]?(?:US)?\$\s?\d[\d.,]*|[-+]?\d+(?:[.,]\d+)?\s?%/);
      if (visible) hallazgos.push({ tipo: 'con la privacidad activa se ve una cifra', el: 'body', texto: visible[0], dato: '' });
    }
    const nombre = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`;
    const texto = el => (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const conScroll = el => { for (let p = el.parentElement; p && p !== document.body && p.id !== 'contenido'; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('[aria-hidden="true"]') || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (conScroll(el) || el.closest('.sr-only')) continue; // el h1 oculto mide 1px a propósito
      if (el.classList.contains('pointer-events-none') && cs.position === 'absolute') continue; // adornos que se salen a propósito
      // 1. se sale de la pantalla
      if (r.right > ancho + 1 || r.left < -1) { hallazgos.push({ tipo: 'fuera de la pantalla', el: nombre(el), texto: texto(el), dato: `${Math.round(r.left)}..${Math.round(r.right)} de ${ancho}` }); continue; }
      // 2. el texto no cabe en su caja y se corta (sin los puntos suspensivos que se ponen a propósito)
      const corta = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      // los adornos (círculos borrosos que se salen a propósito) no cuentan: solo lo que de verdad se corta
      const real = h => !h.closest('.pointer-events-none') && getComputedStyle(h).position !== 'absolute';
      if (corta && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const culpable = [...el.querySelectorAll('*')].find(h => real(h) && h.getBoundingClientRect().right > r.right + 1.5);
        if (culpable || !el.children.length) hallazgos.push({ tipo: 'texto cortado', el: nombre(el), texto: texto(el), dato: `${el.scrollWidth} > ${el.clientWidth}${culpable ? ` por ${nombre(culpable)} «${texto(culpable)}»` : ''}` });
      }
      if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && cs.textOverflow !== 'ellipsis' && !/line-clamp/.test(el.className)) {
        const culpable = [...el.querySelectorAll('*')].find(h => real(h) && h.getBoundingClientRect().bottom > r.bottom + 2);
        if (culpable || !el.children.length) hallazgos.push({ tipo: 'alto cortado', el: nombre(el), texto: texto(el), dato: `${el.scrollHeight} > ${el.clientHeight}${culpable ? ` por ${nombre(culpable)}` : ''}` });
      }
      // 2b. un texto que se sale de la caja que lo contiene (la barra de abajo, las pestañas, los chips)
      if (el.children.length === 0 && el.textContent.trim() && !/^(svg|path|circle|line|use)$/i.test(el.tagName)) {
        let caja = el.parentElement;
        while (caja && caja !== document.body && getComputedStyle(caja).display === 'inline') caja = caja.parentElement;
        const rc = caja?.getBoundingClientRect();
        const clip = caja && (getComputedStyle(caja).overflowX === 'hidden');
        if (rc && rc.width && !clip && (r.right > rc.right + 1.5 || r.left < rc.left - 1.5)) hallazgos.push({ tipo: 'texto fuera de su caja', el: `${nombre(caja)} > ${nombre(el)}`, texto: texto(el), dato: `${Math.round(r.right - rc.right)} px a la derecha, ${Math.round(rc.left - r.left)} a la izquierda` });
      }
      // 3. un texto que no se parte (nowrap) y es más ancho que su caja
      if (cs.whiteSpace === 'nowrap' && cs.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && el.children.length === 0) hallazgos.push({ tipo: 'no cabe en su caja', el: nombre(el), texto: texto(el), dato: `${el.scrollWidth} > ${el.clientWidth}` });
      // 4. un hijo que se sale de la tarjeta, la fila o el botón
      if (/(^| )(tarjeta|fila|chip|ficha|alerta|kpi|burbuja|primario|secundario|peligro|select-btn)( |$)/.test(typeof el.className === 'string' ? el.className : '')) {
        for (const h of el.children) {
          const rh = h.getBoundingClientRect();
          if (rh.width && getComputedStyle(h).position !== 'absolute' && (rh.right > r.right + 1.5 || rh.left < r.left - 1.5)) { hallazgos.push({ tipo: 'sale de su caja', el: `${nombre(el)} > ${nombre(h)}`, texto: texto(h), dato: `${Math.round(rh.right - r.right)} px a la derecha` }); break; }
        }
      }
    }
    // las etiquetas de la barra de abajo no se pisan entre sí
    const etiquetasBarra = [...document.querySelectorAll('nav#nav button > span:not([aria-hidden])')].filter(x => getComputedStyle(x).visibility !== 'hidden' && getComputedStyle(x).position !== 'absolute').map(x => x.getBoundingClientRect());
    for (let i = 1; i < etiquetasBarra.length; i++) if (etiquetasBarra[i].left - etiquetasBarra[i - 1].right < 2) hallazgos.push({ tipo: 'etiquetas pegadas', el: 'nav#nav', texto: '', dato: `${Math.round(etiquetasBarra[i].left - etiquetasBarra[i - 1].right)} px entre dos` });
    if (document.documentElement.scrollWidth > ancho + 1) hallazgos.push({ tipo: 'la página se mueve de lado', el: 'html', texto: '', dato: `${document.documentElement.scrollWidth} > ${ancho}` });
    return hallazgos;
  },
};

const navegador = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
let total = 0;
try {
  for (const escala of escalas) {
    const pag = await navegador.newPage();
    // el Redmi Note 14: la app instalada ocupa el alto de la pantalla menos la barra de estado y los botones de abajo
    await pag.setViewport({ width: 393, height: 790, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    let nativos = 0;
    pag.on('dialog', d => { nativos++; void d.dismiss(); });
    const errores = [];
    pag.on('pageerror', e => errores.push(e.message));
    await pag.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'networkidle0' });
    await espera(600);
    // la app arranca con los montos ocultos: se muestran para revisar el ancho de las cifras de verdad
    await mostrarMontos(pag);
    const escalar = () => pag.evaluate(EN_PAGINA.escalar, escala);

    const escribir = async t => { await pag.type('#texto', t); await pag.keyboard.press('Enter'); await espera(700); await escalar(); };
    const pulsar = async titulo => { await pag.evaluate(t => [...document.querySelectorAll('button')].filter(x => x.innerText.trim() === t).pop()?.click(), titulo); await espera(700); await escalar(); };
    const irA = async n => { await pag.evaluate(x => [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === x || b.innerText.trim() === x)?.click(), n); await espera(500); await escalar(); };
    const abrirEdicion = async () => {
      await pag.evaluate(() => document.querySelector('#editar')?.remove());
      await irA('Movimientos');
      await pag.evaluate(() => { const f = [...document.querySelectorAll('#lista .fila')].find(x => /carne|transporte|jornal|botellas/i.test(x.innerText)); f?.click(); });
      await espera(600); await escalar();
      await pag.evaluate(() => document.querySelector('#editar-mov')?.click()); await espera(500); await escalar();
    };
    const abrirDeMas = async n => { await irA('Más'); await pag.evaluate(x => [...document.querySelectorAll('button')].find(b => b.innerText.includes(x))?.click(), n); await espera(700); await escalar(); };

    // datos de ejemplo con textos largos, como los de la vida real
    await escribir('saldo inicial efectivo 3111000 monedas 6950 bancolombia 80413003');
    await pulsar('Confirmar');
    for (const t of ['carne cerdo 50000', 'transporte de cal para la finca 20000', 'jornal pedro 165000 nequi', 'compra de botellas para la asociación 63000']) {
      await escribir(t);
      await pulsar('Confirmar');
    }
    await escribir('ingreso 769000 venta carne');
    await pulsar('Confirmar');
    await escribir('presté 575000 a Marta');
    await pulsar('Confirmar');
    await escribir('tope comida 400000'); await escribir('meta viaje 8000000'); await escribir('ahorré 1200000 para viaje'); await escribir('cada quincena el 5 internet y teléfono 120000'); await pulsar('Confirmar');
    await escribir('falta arroz y sal y panela y aceite y harina de maíz'); await escribir('ayuda');

    const pantallas = [
      ['Chat', async () => { await irA('Chat'); }],
      ['Chat: ayuda por tema', async () => {
        await irA('Chat');
        await pag.evaluate(() => document.querySelector('#ayuda-detalle') || document.querySelector('[data-tema="deudas"]')?.click()); await espera(500); await escalar();
      }],
      ['Saldos: contador de billetes', async () => {
        await irA('Saldos'); await espera(700);
        await pag.evaluate(() => document.querySelector('#cuadre-rapido')?.click()); await espera(500);
        await pag.evaluate(() => { for (const b of document.querySelectorAll('[data-mas]')) { b.click(); b.click(); } }); await espera(200); await escalar();
      }],
      ['Resumen: corte de turno', async () => {
        await irA('Resumen'); await espera(700);
        const hay = await pag.evaluate(() => Boolean(document.querySelector('#corte-dia')));
        if (hay) { await pag.evaluate(() => document.querySelector('#corte-dia').click()); await espera(500); }
        await escalar();
      }],
      ['Chat: barra de deshacer', async () => {
        await irA('Chat'); await escribir('mecato 1111'); await pulsar('Confirmar'); await espera(700);
        await escalar();
      }],
      ['Atajos: editor', async () => {
        await irA('Chat');
        await pag.evaluate(() => document.querySelector('#atajo-mas')?.click()); await espera(500);
        await pag.evaluate(() => document.querySelector('#at-nuevo')?.click()); await espera(300);
        if (await pag.$('#at-frase')) await pag.type('#at-frase', 'recarga nequi para el celular de mi familia'); await escalar();
        await pag.evaluate(() => document.querySelector('#at-guardar')?.click()); await espera(300); await escalar();
      }],
      ['Saldos', async () => { await irA('Saldos'); await espera(900); await escalar(); }],
      ['Movimientos', async () => { await irA('Movimientos'); await espera(600); await escalar(); }],
      ['Movimientos: detalle', async () => { await irA('Movimientos'); await pag.evaluate(() => document.querySelector('#lista .fila')?.click()); await espera(700); await escalar(); }],
      ['Resumen', async () => { await irA('Resumen'); await espera(900); await escalar(); }],
      ['Editar: confirmar', async () => { await abrirEdicion(); }],
      ['Editar: formulario', async () => { await abrirEdicion(); await pag.evaluate(() => document.querySelector('#editar-si')?.click()); await espera(500); await escalar(); }],
      ['Editar: resumen', async () => {
        await abrirEdicion(); await pag.evaluate(() => document.querySelector('#editar-si')?.click()); await espera(500);
        await pag.$eval('#e-concepto', e => e.select()); await pag.type('#e-concepto', 'Compra de insumos para la finca con nombre largo'); await escalar();
        await pag.evaluate(() => document.querySelector('#e-monto') && (document.querySelector('#e-monto').focus())); await pag.keyboard.type('9');
        await pag.evaluate(() => document.querySelector('#e-guardar')?.click()); await espera(500); await escalar();
      }],
      ['Duplicar', async () => {
        await pag.evaluate(() => { document.querySelector('#editar')?.remove(); document.querySelector('#duplicar')?.remove(); });
        await irA('Movimientos');
        await pag.evaluate(() => { const f = [...document.querySelectorAll('#lista .fila')].find(x => /carne|transporte|jornal|botellas/i.test(x.innerText)); f?.click(); });
        await espera(600); await escalar();
        await pag.evaluate(() => document.querySelector('#duplicar-mov')?.click()); await espera(500); await escalar();
      }],
      ['Diálogo: anular', async () => {
        await pag.evaluate(() => { for (const id of ['editar', 'duplicar', 'dialogo']) document.querySelector('#' + id)?.remove(); });
        await irA('Movimientos');
        await pag.evaluate(() => { const f = [...document.querySelectorAll('#lista .fila')].find(x => /carne|transporte|jornal|botellas/i.test(x.innerText)); f?.click(); });
        await espera(600); await escalar();
        await pag.evaluate(() => document.querySelector('#anular')?.click()); await espera(600); await escalar();
      }],
      ['Diálogo: PIN', async () => {
        await pag.evaluate(() => { for (const id of ['editar', 'duplicar', 'dialogo', 'detalle']) document.querySelector('#' + id)?.remove(); });
        await abrirDeMas('Ajustes');
        await pag.evaluate(() => [...document.querySelectorAll('button')].find(b => /Crear PIN|Cambiar PIN/.test(b.innerText))?.click()); await espera(600); await escalar();
      }],
      ['Más', async () => { await irA('Más'); }],
      ['Deudas y préstamos', async () => abrirDeMas('Deudas y préstamos')],
      ['Categorías y personas', async () => abrirDeMas('Categorías y personas')],
      ['Alcancías', async () => abrirDeMas('Alcancías')],
      ['Pagos fijos', async () => abrirDeMas('Pagos fijos')],
      ['Lista de compras', async () => abrirDeMas('Lista de compras')],
      ['Pagos a trabajadores', async () => abrirDeMas('Pagos a trabajadores')],
      ['Revisión del mes', async () => abrirDeMas('Revisión del mes')],
      ['Conciliar', async () => abrirDeMas('Conciliar con el banco')],
      ['Buzón', async () => abrirDeMas('Buzón')],
      ['Ajustes', async () => abrirDeMas('Ajustes')],
      ['Primeros pasos', async () => abrirDeMas('Primeros pasos')],
    ];
    // lo que cada variante tenga en el menú «Más» y no esté arriba (Productos y precios en la de empresa, por ejemplo)
    await irA('Más');
    const delMenu = await pag.evaluate(() => [...document.querySelectorAll('[data-ir]')].map(b => b.querySelector('b')?.innerText.trim() ?? '').filter(Boolean));
    for (const n of delMenu) {
      if (n === 'Ayuda' || pantallas.some(([p]) => n.includes(p) || p.includes(n))) continue;
      pantallas.push([n, async () => abrirDeMas(n)]);
    }
    for (const [piel, tema] of temas) {
    await pag.evaluate((p, t) => { document.documentElement.dataset.piel = p; document.documentElement.dataset.tema = t; window.dispatchEvent(new Event('apariencia')); }, piel, tema);
    await espera(300);
    console.log(`\n=== ${instalacion}: texto x${escala}, tema ${piel} ${tema} (letra de la app: ${await pag.evaluate(() => document.documentElement.dataset.letra)}) ===`);
    for (const [nombre, ir] of pantallas) {
      try { await ir(); } catch (e) { console.log(`  ${nombre}: no pude abrirla (${e.message})`); continue; }
      await espera(400); const h = await pag.evaluate(EN_PAGINA.revisar);
      if (capturas) await pag.screenshot({ path: join(capturas, `x${escala}-${piel}-${tema}-${nombre.replace(/[^a-z0-9]+/gi, '-')}.png`) });
      await pag.evaluate(() => { document.querySelector('#at-cerrar')?.click(); document.querySelector('#ayuda-volver')?.click(); document.querySelector('#contador-cancelar')?.click(); document.querySelector('#corte-cerrar')?.click(); for (const id of ['dialogo', 'duplicar', 'editar']) document.querySelector('#' + id)?.remove(); });
      await espera(200);
      total += h.length;
      console.log(h.length ? `  ${nombre}: ${h.length} problema(s)` : `  ${nombre}: bien`);
      const vistos = new Set();
      for (const x of h) { const k = `${x.tipo}|${x.el}`; if (vistos.has(k) || vistos.size >= 8) continue; vistos.add(k); console.log(`      ${x.tipo}: ${x.el} «${x.texto}» ${x.dato}`); }
    }
    }
    if (nativos) { total++; console.log(`  salieron ${nativos} cuadro(s) del navegador`); }
    if (errores.length) { total++; console.log('  errores de JavaScript:', errores.join(' | ')); }
    await pag.close();
  }
} finally {
  await navegador.close();
  servidor.kill();
}
console.log(total ? `\n${total} problema(s) en total.` : '\nTodo cabe.');
process.exitCode = total ? 1 : 0;
