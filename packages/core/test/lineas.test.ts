/** Varios movimientos en un mismo mensaje: se parten y salen de a uno, cada uno con su tarjeta. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dividirLinea, MAX_MOVIMIENTOS_POR_MENSAJE } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

test('dividirLinea: saltos de línea y punto y coma', () => {
  assert.deepEqual(dividirLinea('mecato 5000\nalmuerzo 12000'), ['mecato 5000', 'almuerzo 12000']);
  assert.deepEqual(dividirLinea('mecato 5000; taxi 8000'), ['mecato 5000', 'taxi 8000']);
  assert.deepEqual(dividirLinea('  mecato 5000  \r\n\r\n  almuerzo 12000 '), ['mecato 5000', 'almuerzo 12000']);
});

test('dividirLinea: un + o - con espacios entre cantidades separa; lo que sigue a + es plata que entra', () => {
  assert.deepEqual(dividirLinea('150000 Ana + 500000 Ana - 75000 llanta'), ['150000 Ana', 'ingreso 500000 Ana', '75000 llanta']);
});

test('dividirLinea: no parte lo que es un solo movimiento', () => {
  assert.deepEqual(dividirLinea('+mesada 100k -30k'), ['+mesada 100k -30k']);
  assert.deepEqual(dividirLinea('mecato 5000'), ['mecato 5000']);
  assert.deepEqual(dividirLinea('taxi 7900 pagué por ivan 3000 y daniel 2500'), ['taxi 7900 pagué por ivan 3000 y daniel 2500']);
  // un - sin cantidad al otro lado no separa
  assert.deepEqual(dividirLinea('arroz 8000 - el bueno'), ['arroz 8000 - el bueno']);
});

test('dividirLinea: tope de movimientos por mensaje', () => {
  const muchas = Array.from({ length: 30 }, (_, i) => `gasto ${i + 1}000`).join('\n');
  assert.equal(dividirLinea(muchas).length, MAX_MOVIMIENTOS_POR_MENSAJE);
});

test('bot: dos gastos en un mensaje salen uno por uno y se guardan los dos', async () => {
  const bot = nuevoBot();
  const t1 = textoDe(await bot.di('mecato 5000\nalmuerzo 12000'));
  assert.match(t1, /Movimiento 1 de 2/);
  assert.match(t1, /Mecato · \$5\.000/);
  const t2 = textoDe(await bot.pulsa('ok'));
  assert.match(t2, /✅ Guardado/);
  assert.match(t2, /Movimiento 2 de 2/);
  assert.match(t2, /Comida · \$12\.000/);
  await bot.pulsa('ok');
  assert.equal((await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length, 2);
});

test('bot: cancelar uno sigue con el siguiente', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000\nalmuerzo 12000');
  const t = textoDe(await bot.pulsa('no'));
  assert.match(t, /Cancelado/);
  assert.match(t, /Movimiento 2 de 2/);
  await bot.pulsa('ok');
  const movs = (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok');
  assert.equal(movs.length, 1);
  assert.match(movs[0].descripcion, /almuerzo/i);
});

test('bot: una parte que no se entiende se avisa y se sigue con las demás', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('hola que tal\nmecato 5000'));
  assert.match(t, /No pude con «hola que tal»/);
  assert.match(t, /Mecato · \$5\.000/);
});

test('bot: la línea de las notas de la mamá se vuelve tres tarjetas', async () => {
  const bot = nuevoBot();
  const t1 = textoDe(await bot.di('50000 mecato + 100000 chamba - 75000 salud'));
  assert.match(t1, /Movimiento 1 de 3/);
  const t2 = textoDe(await bot.pulsa('ok'));
  assert.match(t2, /Movimiento 2 de 3/);
  assert.match(t2, /Ingreso/);
  const t3 = textoDe(await bot.pulsa('ok'));
  assert.match(t3, /Movimiento 3 de 3/);
  assert.match(t3, /Salud/);
});
