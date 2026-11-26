// Hacia dónde va la plata (ingreso, préstamo, abono) y quién es la persona: casos de la batería red team.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

async function confirmar(bot: Bot, frase: string): Promise<void> {
  let s = await bot.di(frase);
  for (let i = 0; i < 3 && textoDe(s).includes('¿En qué categoría'); i++) s = await bot.pulsa('resp:0');
  await bot.pulsa('ok');
}

async function decir(frase: string, antes: string[] = []) {
  const bot = nuevoBot();
  for (const f of antes) await confirmar(bot, f);
  const s = await bot.di(frase);
  return { bot, texto: textoDe(s), botones: s.flatMap(x => x.botones ?? []).map(b => b.id) };
}

const carta = (t: string): string => /Entendí:\n([^\n]+)/.exec(t)?.[1] ?? '';

for (const [frase, esperado] of [
  ['Recibiste 20.000 de ANA MARIA en tu Nequi', /^Ingreso · Ana Maria · \$20\.000 · Nequi/],
  ['vendí la bici 200000', /^Ingreso · .*\$200\.000 · Efectivo/],
  ['me llegaron 50000 de Ana', /^Ingreso · Ana · \$50\.000/],
  ['me consignaron 80000 nequi', /^Ingreso · .*\$80\.000 · Nequi/],
  ['te transfirieron 30000 a nequi', /^Ingreso · .*\$30\.000 · Nequi/],
  ['me encontre 50 mil en el parque', /^Ingreso · .*\$50\.000 · Efectivo/],
  ['mi tia me regalo diez mil pesitos para comprarme un helado', /^Ingreso · Tia · \$10\.000/],
  ['le preste mi juguete a tomas y me dio 2 mil por cuidarselo', /^Ingreso · Tomas · \$2\.000/],
  ['me devolvieron 15k de nequi', /^Ingreso · .*\$15\.000 · Nequi/],
  ['me devolvieron 20k que me debian ayer', /^Ingreso · .*\$20\.000 · Efectivo · ayer/],
  ['me pagaron ciento veinte mil pesos de una actividad en popayan', /^Ingreso · Actividad.*\$120\.000 · Efectivo/],
  ['me devolvieron quince mil quinientos de una compra que hice', /^Ingreso · Compra.*\$15\.500/],
  ['me pagaron 2 millones de la quincena', /^Ingreso · Quincena · \$2\.000\.000/],
  ['me pagaron 50k', /^Ingreso · Otros · \$50\.000/],
  ['mk me devolvieron 20k q me debian ayer', /^Ingreso · .*\$20\.000 · Efectivo · ayer/],
] as [string, RegExp][]) {
  test(`plata que entra: «${frase}»`, async () => {
    const { texto } = await decir(frase);
    assert.match(carta(texto), esperado, texto);
  });
}

test('«me pagaron 30k de Ana» sigue siendo de Ana, no de una cosa', async () => {
  const { texto } = await decir('me pagaron 30k de Ana');
  assert.match(carta(texto), /Ana/, texto);
});

test('«me devolvieron 20k» sin decir quién pregunta si alguien te debe', async () => {
  const { texto, botones } = await decir('me devolvieron 20k que me debian', ['presté 40k a Ana']);
  assert.equal(carta(texto), '', texto);
  assert.ok(botones.includes('ia:Ana me pagó 20000'), botones.join(' '));
  assert.ok(botones.some(b => b.startsWith('ia:ingreso 20000')), botones.join(' '));
});

test('«le mandé 25k a juan» pregunta si fue préstamo, pago o regalo', async () => {
  const { bot, texto, botones } = await decir('le mande 25k a juan para que me compre algo');
  assert.equal(carta(texto), '', texto);
  assert.match(texto, /¿/);
  assert.ok(botones.includes('ia:presté 25000 a Juan'), botones.join(' '));
  const s = textoDe(await bot.pulsa('ia:presté 25000 a Juan'));
  assert.match(carta(s), /^Préstamo · le prestas a Juan · \$25\.000/);
});

test('«ayer ayer ayer le mande 40k a juan» guarda la fecha en las opciones', async () => {
  const { botones } = await decir('ayer ayer ayer le mande 40k a juan');
  assert.ok(botones.includes('ia:presté 40000 a Juan ayer'), botones.join(' '));
});

test('«faber me devolvió 20k de los 40 que le presté» es un abono de Faber, no otro préstamo', async () => {
  const { texto } = await decir('faber me devolvio 20k de los 40 que le preste', ['presté 40k a Faber']);
  assert.match(carta(texto), /^Pago · Faber te paga · \$20\.000/, texto);
});

test('«quedamos a mano con maria por 15k» no es un gasto: pregunta', async () => {
  const { texto, botones } = await decir('quedamos a mano con maria por 15k');
  assert.equal(carta(texto), '', texto);
  assert.ok(botones.includes('ia:Maria me pagó 15000'), botones.join(' '));
  assert.ok(botones.includes('ia:pagué 15000 a Maria'), botones.join(' '));
});

test('«le di 20k a carlos para el bus y no me los devuelve» es un préstamo', async () => {
  const { texto } = await decir('le di 20k a carlos para el bus y no me los devuelve');
  assert.match(carta(texto), /^Préstamo · le prestas a Carlos · \$20\.000/, texto);
});

test('«preste 10000 a Ana y Luis» son dos personas: pregunta cuánto a cada una', async () => {
  const { bot, texto, botones } = await decir('preste 10000 a Ana y Luis');
  assert.equal(carta(texto), '', texto);
  assert.doesNotMatch(texto, /Ana Luis/);
  const cada = botones.find(b => b.includes('presté 10000 a Ana\npresté 10000 a Luis'));
  assert.ok(cada, botones.join(' | '));
  assert.ok(botones.some(b => b.includes('presté 5000 a Ana\npresté 5000 a Luis')), botones.join(' | '));
  const s = textoDe(await bot.pulsa(cada));
  assert.match(s, /Movimiento 1 de 2/);
  assert.match(carta(s), /le prestas a Ana · \$10\.000/);
});

test('«preste 5k a juan no a jose» presta a Juan', async () => {
  const { texto } = await decir('preste 5k a juan no a jose');
  assert.match(carta(texto), /^Préstamo · le prestas a Juan · \$5\.000/, texto);
  assert.doesNotMatch(texto, /Jose/);
});

test('«pague 60k por mi y por ana y luis» es un gasto compartido entre tres', async () => {
  const { texto } = await decir('pague 60k por mi y por ana y luis');
  assert.match(carta(texto), /^Gasto compartido · .*\$60\.000/, texto);
  assert.match(texto, /Ana te debe \$20\.000/);
  assert.match(texto, /Luis te debe \$20\.000/);
});

test('con Daniel guardado, «preste 25k a danyel» pregunta si es Daniel', async () => {
  const bot = nuevoBot();
  bot.repo.aplicarPlantilla('personal', { personas: [{ nombre: 'Daniel', grupo: 'amigos' }] });
  const t = textoDe(await bot.di('preste 25k a danyel'));
  assert.match(t, /¿A quién te refieres con «Danyel»\? ¿Es Daniel/);
});
