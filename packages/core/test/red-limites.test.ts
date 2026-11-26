/** Ronda 3: decimales en pesos, nombres que chocan con cuentas o categorías, montos enormes y emojis sueltos. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { avisoDeMontoAlto, reaccionSuelta } from '../src/limites.ts';

const di = async (frase: string): Promise<string> => textoDe(await nuevoBot().di(frase));

test('un decimal en pesos pregunta en vez de redondear', async () => {
  assert.match(await di('pagué 12500.75 de almuerzo'), /¿Fueron \$12\.500, \$12\.501/);
  // el limpiador de dictado puede quitar el «0.5» antes: en los dos caminos se pregunta, nunca se guarda
  assert.match(await di('compré un tinto por 0.5 pesos'), /¿(?:Quisiste decir \$500 o \$5\.000|Cuánto fue)\?/);
});

test('los montos con unidad o con miles no cuentan como decimales', async () => {
  assert.match(await di('almuerzo 12.500'), /Entendí/);
  assert.match(await di('almuerzo 12,5k'), /Entendí/);
});

test('un monto muy alto sale con aviso en la tarjeta', async () => {
  assert.match(await di('mercado 500000000'), /Monto muy alto/);
  assert.doesNotMatch(await di('mercado 50000'), /Monto muy alto/);
  assert.equal(avisoDeMontoAlto(5_000_000, 'COP'), null);
});

test('una categoría o una cuenta dicha como persona se pregunta', async () => {
  assert.match(await di('le pagué 30k a Mercado'), /¿Mercado es una persona o la categoría\?/);
  assert.match(await di('me transfirió Efectivo 50k'), /¿Efectivo es una de tus cuentas/);
});

test('un nombre de persona normal no se pregunta', async () => {
  assert.match(await di('le pagué 30k a Ana'), /Entendí/);
});

test('los emojis se reconocen con tonos y variantes', () => {
  for (const e of ['👍', '👌', '✅', '👍🏽']) assert.equal(reaccionSuelta(e), 'confirma', e);
  for (const e of ['❌', '✖️', '🚫', '👎']) assert.equal(reaccionSuelta(e), 'cancela', e);
  for (const e of ['🔄', '??']) assert.equal(reaccionSuelta(e), 'duda', e);
  assert.equal(reaccionSuelta('mecato 5000'), null);
});

test('con tarjeta pendiente, el pulgar confirma y la equis cancela; sin tarjeta no pasa nada raro', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 12000');
  assert.match(textoDe(await bot.di('👍')), /Guardado|✅|guard/i);
  await bot.di('almuerzo 9000');
  assert.match(textoDe(await bot.di('❌')), /cancel|descart|Listo/i);
  assert.match(textoDe(await bot.di('👍')), /no hay nada pendiente/);
});
