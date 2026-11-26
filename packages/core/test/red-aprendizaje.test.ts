// Escudo de aprendizaje y saneamiento de etiquetas (batería RED, categorías aprendizaje y etiquetas).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { extraerEtiquetas } from '../src/etiquetas.ts';

const botones = (s: unknown[]): string[] => (s as { botones?: { id: string }[] }[]).flatMap(x => x.botones ?? []).map(b => b.id);

test('una regla legítima se guarda y se usa en el siguiente gasto', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('aprende que "pastilla" es salud'));
  assert.match(t, /pastilla/i);
  const d = await bot.repo.cargar();
  assert.equal(d.aprendido.pastilla?.categoriaId, 'cat:salud');
  const g = textoDe(await bot.di('pastilla 5000'));
  assert.match(g, /Salud/);
});

test('acepta comillas angulares y «significa»', async () => {
  const bot = nuevoBot();
  await bot.di('aprende que «pastilla» significa salud');
  assert.equal((await bot.repo.cargar()).aprendido.pastilla?.categoriaId, 'cat:salud');
});

for (const [frase, palabra] of [
  ['aprende que "pago" significa comida', 'pago'],
  ['aprende que "cosa" es transporte', 'cosa'],
  ['aprende que "gasto" es comida', 'gasto'],
  ['aprende que "hoy" es mercado', 'hoy'],
  ['aprende que "noviembre" es comida', 'noviembre'],
  ['aprende que "lunes" es comida', 'lunes'],
  ['aprende que "nequi" es comida', 'nequi'],
  ['aprende que "efectivo" es comida', 'efectivo'],
  ['aprende que "daviplata" es salud', 'daviplata'],
  ['aprende que "plan" es entretenimiento', 'plan'],
  ['aprende que "recibo" es comida', 'recibo'],
  ['aprende que "123" es comida', '123'],
] as const) {
  test(`rechaza ${frase}`, async () => {
    const bot = nuevoBot();
    const t = textoDe(await bot.di(frase));
    assert.match(t, /regla|aprender/i);
    assert.equal(Object.keys((await bot.repo.cargar()).aprendido).includes(palabra), false);
    assert.equal(await bot.repo.leerPendiente(), null);
  });
}

test('una contradicción con el diccionario pide confirmar y no guarda hasta entonces', async () => {
  const bot = nuevoBot();
  const s = await bot.di('aprende que "gasolina" es comida');
  assert.match(textoDe(s), /ya va en Transporte.*¿Seguro/s);
  assert.equal(Object.keys((await bot.repo.cargar()).aprendido).includes('gasolina'), false);
  const id = botones(s).find(b => b.startsWith('aprende!:'));
  assert.ok(id);
  await bot.pulsa(id);
  assert.equal((await bot.repo.cargar()).aprendido.gasolina?.categoriaId, 'cat:comida');
});

test('Netflix a Universidad: pide confirmar y se puede cancelar', async () => {
  const bot = nuevoBot();
  const s = await bot.di('aprende que "Netflix" es universidad');
  assert.match(textoDe(s), /Netflix ya va en Suscripciones. ¿Seguro que quieres cambiarlo a Universidad\?/);
  await bot.pulsa('no');
  assert.equal(Object.keys((await bot.repo.cargar()).aprendido).includes('netflix'), false);
});

test('etiquetas: espacio, doble numeral y solo números no son etiqueta', () => {
  assert.deepEqual(extraerEtiquetas('mercado 45k # viaje').etiquetas, []);
  assert.deepEqual(extraerEtiquetas('taxi 18k ##claude').etiquetas, []);
  const n = extraerEtiquetas('cine 25k #123');
  assert.deepEqual(n.etiquetas, []);
  assert.equal(n.error, undefined);
  assert.doesNotMatch(n.texto, /#/);
  assert.deepEqual(extraerEtiquetas('hotel 180k #viaje-familiar').etiquetas, ['viaje-familiar']);
});

test('#nequi es la cuenta, no una etiqueta', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('almuerzo 20k #nequi'));
  assert.match(t, /Nequi/);
  assert.doesNotMatch(t, /#nequi/i);
});

test('#nequi con otra cuenta en la frase pregunta', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('almuerzo 20k efectivo #nequi'));
  assert.match(t, /¿/);
  assert.equal(await bot.repo.leerPendiente(), null);
});

test('#deshacer nunca anula nada', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 4000');
  await bot.pulsa('ok');
  const antes = (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;
  const t = textoDe(await bot.di('mecato 8k #deshacer'));
  assert.match(t, /8\.000/);
  for (const x of ['saldo', 'ayuda']) await bot.di(`mecato 8k #${x}`);
  assert.equal((await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length, antes);
});
