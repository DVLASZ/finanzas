import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const confirmar = async (bot: ReturnType<typeof nuevoBot>, f: string): Promise<void> => {
  let s = await bot.di(f);
  for (let i = 0; i < 3 && textoDe(s).includes('¿En qué categoría'); i++) s = await bot.pulsa('resp:0');
  await bot.pulsa('ok');
};
const vivos = async (bot: ReturnType<typeof nuevoBot>) => (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok');

test('«cambia el almuerzo de ayer de 15k a 17k» corrige el guardado, no abre otro', async () => {
  const bot = nuevoBot();
  await confirmar(bot, 'almuerzo 15000 ayer');
  assert.match(textoDe(await bot.di('Cambia el almuerzo de ayer de 15k a 17k')), /Corregí/);
  const v = await vivos(bot);
  assert.equal(v.length, 1);
  assert.equal(v[0].asientos.filter(a => a.monto > 0).reduce((s, a) => s + a.monto, 0), 17000);
});

test('corregir el principal de una deuda cambia la deuda y no anota ningún abono', async () => {
  const bot = nuevoBot();
  await confirmar(bot, 'Le debo 20k a Karla');
  await bot.di('Corrige la deuda con Karla, ya no son 20k sino 15k');
  const v = await vivos(bot);
  assert.equal(v.length, 1);
  assert.equal(v[0].tipo, 'deuda');
  assert.ok(!v.some(m => m.tipo === 'pago'));
});

test('con dos iguales pregunta cuál y no cambia ninguno', async () => {
  const bot = nuevoBot();
  await confirmar(bot, 'almuerzo 20000 ayer');
  await confirmar(bot, 'almuerzo 20000 ayer');
  assert.match(textoDe(await bot.di('Cambia el almuerzo de 20k de ayer a 18k')), /¿Cuál quieres cambiar\?/);
  assert.deepEqual((await vivos(bot)).map(m => m.asientos.filter(a => a.monto > 0).reduce((s, a) => s + a.monto, 0)), [20000, 20000]);
});

test('con dos del mismo monto, «borra el de 20k» pregunta y la respuesta elige uno', async () => {
  const bot = nuevoBot();
  await confirmar(bot, 'Gasté 20k en comida');
  await confirmar(bot, 'mercado 20000');
  assert.match(textoDe(await bot.di('Borra el de 20k')), /¿Cuál borro\?/);
  assert.equal((await vivos(bot)).length, 2);
  await bot.di('El de la comida');
  const v = await vivos(bot);
  assert.equal(v.length, 1);
  assert.match(v[0].descripcion, /ercado/);
});

test('«borra los dos últimos» y «la devolví y me devolvieron toda la plata»', async () => {
  const bot = nuevoBot();
  for (const f of ['pan 10000', 'tinto 12000', 'almuerzo 20000']) await confirmar(bot, f);
  await bot.di('Borra los dos últimos');
  assert.equal((await vivos(bot)).length, 1);
  const b2 = nuevoBot();
  await confirmar(b2, 'Compré una camiseta por 60k');
  assert.match(textoDe(await b2.di('La devolví y me devolvieron toda la plata')), /Ingreso · .* · \$60\.000/);
});
