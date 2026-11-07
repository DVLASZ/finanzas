// Guía de usuario de una instalación, armada con lo que de verdad tiene su plantilla (cuentas, categorías,
// ejemplos). Así no se desactualiza cuando cambia la plantilla.
//   npm run guia -- <personal|familia|empresa>
// Escribe docs-privado/guia-<plantilla>.html (esa carpeta no va a git). Se abre en el navegador y se
// guarda como PDF desde Imprimir.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
const core = await import(pathToFileURL(join(raiz, 'packages', 'core', 'src', 'index.ts')).href);
const { PLANTILLAS, MemoriaRepo, procesar } = core;
if (!PLANTILLAS[id]) {
  console.error(`Uso: npm run guia -- <${Object.keys(PLANTILLAS).join('|')}>`);
  process.exit(1);
}
const pl = PLANTILLAS[id];
const repo = new MemoriaRepo();
repo.aplicarPlantilla(id);
const datos = await repo.cargar();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// La ayuda del bot ya trae ejemplos con las cuentas de esta app: se usa tal cual
const ayuda = (await procesar(repo, { texto: 'ayuda' }, new Date())).map(s => s.texto).join('\n');
const dinero = datos.cuentas.filter(c => c.tipo === 'dinero');
const cats = datos.cuentas.filter(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre');
const vende = datos.config.ventas === '1';

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Guía: ${esc(pl.nombre)}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 20px; line-height: 1.5; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 2rem; } h2 { margin-top: 2rem; border-bottom: 2px solid #999; padding-bottom: .2rem; }
  code, pre { background: #f3f0ea; padding: .15rem .4rem; border-radius: 6px; }
  pre { padding: .8rem; white-space: pre-wrap; } li { margin: .3rem 0; }
  @media print { h2 { break-after: avoid; } }
</style></head><body>
<h1>Guía de uso: ${esc(pl.nombre)}</h1>
<p>Esta app es un chat. Le escribes lo que gastaste o lo que te llegó, como se lo contarías a alguien, y ella lo anota. No necesitas internet para anotar: cuando vuelva la conexión, se sincroniza sola.</p>

<h2>1. Cómo se anota algo</h2>
<ol>
  <li>Escribe en el chat, por ejemplo: <code>almuerzo 12000</code>.</li>
  <li>La app te muestra lo que entendió. Si está bien, pulsa <b>Confirmar</b>.</li>
  <li>Si algo está mal, pulsa <b>Editar</b> y di solo lo que cambia (<code>monto 15000</code>, <code>ayer</code>) o pulsa <b>Cancelar</b>.</li>
  <li>Si ya lo guardaste y te equivocaste, pulsa <b>Deshacer</b> o escribe <code>deshacer</code>. Nada se borra de verdad: queda marcado como anulado.</li>
</ol>

<h2>2. Tus cuentas</h2>
<p>Estas son las cuentas de esta app. Las nombras al final de la frase (<code>almuerzo 12000 ${esc(dinero[2]?.nombre.toLowerCase() ?? 'efectivo')}</code>). Si no dices ninguna, se toma Efectivo.</p>
<ul>${dinero.map(c => `<li><b>${esc(c.nombre)}</b>${c.enDisponible === false ? ' (va aparte, no suma a lo disponible)' : ''}</li>`).join('')}</ul>

<h2>3. Tus categorías</h2>
<p>La app pone cada gasto en una categoría por las palabras que usas. Si no reconoce una palabra, te pregunta y aprende para la próxima.</p>
<ul>${cats.map(c => `<li>${esc(c.nombre)}</li>`).join('')}</ul>
<p>Puedes crear, renombrar y ponerles un tope mensual en <b>Más, Categorías y personas</b>.</p>

<h2>4. Ejemplos con tus cuentas</h2>
<pre>${esc(ayuda)}</pre>

<h2>5. Ver cómo vas</h2>
<ul>
  <li><b>Saldos</b>: cuánto tienes en cada cuenta.</li>
  <li><b>Movimientos</b>: todo lo que anotaste. Puedes filtrar por mes, por tipo, por categoría o por cuenta.</li>
  <li><b>Resumen</b>: en qué se fue la plata en la semana, el mes o el año, comparado con el periodo anterior.</li>
  <li>En el chat: <code>saldo</code>, <code>semana</code>, <code>mes</code>, <code>deudas</code>, <code>últimos</code>.</li>
</ul>

<h2>6. Cuando prestas o te prestan</h2>
<pre>presté 40000 a Ivan
Ivan me pagó 40000
le debo 54000 a Sergio antes del 31 de octubre
pagué 54000 a Sergio</pre>
<p>La pantalla <b>Deudas y préstamos</b> (en Más) muestra quién te debe y a quién le debes.</p>

<h2>7. Cosas que se repiten</h2>
<pre>cada mes el 5 internet 60000     (te avisa cuando toca)
meta moto 2000000                (una meta de ahorro)
ahorré 50000 para moto
compra: arroz 5000, sal 2000, 3 gaseosas a 2000   (una compra con varias cosas)</pre>
${vende ? `<h2>8. Ventas</h2>
<pre>vendí 3 botellas de jugo
15 galletas a granel
ventas                           (lo vendido en el mes, por producto)</pre>
<p>Los productos y sus precios se cambian en <b>Más, Productos y precios</b>.</p>` : ''}

<h2>${vende ? '9' : '8'}. Si algo sale raro</h2>
<ul>
  <li>Si la app no entiende una frase, escríbela más simple, con el monto y en qué fue.</li>
  <li>Si la plata de la app no coincide con la que tienes, cuéntala: <code>arqueo ${esc(ayuda.match(/arqueo ([^»]+)»/)?.[1] ?? 'efectivo 80000')}</code>. La diferencia queda anotada como Descuadre.</li>
  <li>Si la pantalla se ve con una versión vieja, ciérrala y ábrela de nuevo con internet.</li>
</ul>
</body></html>
`;
mkdirSync(join(raiz, 'docs-privado'), { recursive: true });
const salida = join(raiz, 'docs-privado', `guia-${id}.html`);
writeFileSync(salida, html, 'utf8');
console.log(`Guía lista: ${salida}\nÁbrela en el navegador y usa Imprimir, Guardar como PDF.`);
