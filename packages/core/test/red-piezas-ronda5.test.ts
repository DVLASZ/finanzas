import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const vivos = async (bot: ReturnType<typeof nuevoBot>): Promise<number> => (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;

test('un ingreso se vuelve préstamo, un regalo se vuelve préstamo y un gasto se vuelve deuda sin duplicar la tarjeta', async () => {
  let bot = nuevoBot();
  await bot.di('Me entraron 50k de Mateo');
  assert.match(textoDe(await bot.di('No fue un regalo, fue un préstamo que me hizo')), /Deuda · Mateo te presta/);
  bot = nuevoBot();
  await bot.di('Le pasé 30k a Sofía');
  assert.match(textoDe(await bot.di('Eso era un préstamo, no un regalo')), /Préstamo/);
  bot = nuevoBot();
  await bot.di('Pagué 20k de la comida de David');
  assert.match(textoDe(await bot.di('Perdón, David fue el que pagó mi comida')), /Deuda · le debes a David/);
});

test('«éramos cuatro, no tres» recalcula tu parte y «mi parte era 25» corrige la deuda', async () => {
  let bot = nuevoBot();
  await bot.di('Pagué 60k de la pizza entre tres');
  assert.match(textoDe(await bot.di('Éramos cuatro, no tres')), /\$15\.000/);
  bot = nuevoBot();
  await bot.di('Alejandro pagó 90k de la comida y yo le debo 30');
  assert.match(textoDe(await bot.di('No, mi parte era 25, él invitó cinco')), /\$25\.000/);
});

test('con dos en cola, «ese taxi fue por Nequi» y «corrige el almuerzo: fueron 22k» tocan solo ese', async () => {
  const bot = nuevoBot();
  await bot.di('Gasté 14k en taxi');
  await bot.di('También compré 6k de agua');
  const t = textoDe(await bot.di('Ese taxi fue por Nequi'));
  assert.match(t, /Nequi/);
  const p = await bot.repo.leerPendiente();
  assert.equal(p?.siguientes?.length, 1);
  const b2 = nuevoBot();
  await b2.di('Gasté 20k en almuerzo');
  await b2.di('Pagué 8k de bus');
  await b2.di('Corrige el almuerzo: fueron 22k');
  const q = await b2.repo.leerPendiente();
  assert.equal(q?.propuesta.monto, 22000);
  assert.equal(q?.siguientes?.length, 1);
});

test('«aunque mejor déjalo» restaura lo que se acababa de borrar', async () => {
  const bot = nuevoBot();
  await bot.di('Gasté 30k en comida ayer');
  await bot.pulsa('ok');
  await bot.di('Borra el gasto de 30k de ayer');
  assert.equal(await vivos(bot), 0);
  await bot.di('Aunque mejor déjalo');
  assert.equal(await vivos(bot), 1);
});
