/** Cortes de varios movimientos en una frase: tildes, ingresos, listas y signos + y -. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dividirLinea } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

test('el corte funciona con verbos con tilde', () => {
  assert.deepEqual(dividirLinea('gasté 5000 en mecato y pagué 3000 de pasaje'), ['gasté 5000 en mecato', 'pagué 3000 de pasaje']);
  assert.deepEqual(dividirLinea('compré pan 2000 y compré leche 3000'), ['compré pan 2000', 'compré leche 3000']);
  assert.deepEqual(dividirLinea('mecato 5000 y presté 3000 a ana'), ['mecato 5000', 'presté 3000 a ana']);
  assert.deepEqual(dividirLinea('almuerzo 12000 y vendí 5000'), ['almuerzo 12000', 'vendí 5000']);
});

test('«invité yo» es un gasto simple, no una pregunta de reparto', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('almuerzo 30000 con ana y luis invité yo'));
  assert.match(t, /Comida · \$30\.000/);
});

test('un gasto seguido de un ingreso se parte', () => {
  assert.deepEqual(dividirLinea('gasté 5000 en mecato y me pagaron 20000'), ['gasté 5000 en mecato', 'me pagaron 20000']);
  assert.deepEqual(dividirLinea('gasté 5000 en mecato y recibí 20000'), ['gasté 5000 en mecato', 'recibí 20000']);
  assert.deepEqual(dividirLinea('gasté 5000 en mecato y cobré 20000 de ana'), ['gasté 5000 en mecato', 'cobré 20000 de ana']);
  assert.deepEqual(dividirLinea('mecato 5000 y me pagó ana 20000'), ['mecato 5000', 'me pagó ana 20000']);
});

test('listas de concepto y monto separadas por coma, y o barra', () => {
  assert.deepEqual(dividirLinea('mecato 5000, pasaje 3000 y almuerzo 12k'), ['mecato 5000', 'pasaje 3000', 'almuerzo 12k']);
  assert.deepEqual(dividirLinea('mecato 5000 y pasaje 3000'), ['mecato 5000', 'pasaje 3000']);
  assert.deepEqual(dividirLinea('mecato 5000 / pasaje 3000'), ['mecato 5000', 'pasaje 3000']);
  assert.deepEqual(dividirLinea('mecato 5000 ayer, pasaje 3000 hoy'), ['mecato 5000 ayer', 'pasaje 3000 hoy']);
});

test('lo que es un solo movimiento o un reparto no se parte', () => {
  assert.deepEqual(dividirLinea('almuerzo con ana y luis 30000'), ['almuerzo con ana y luis 30000']);
  assert.deepEqual(dividirLinea('arroz, sal y papa 12000'), ['arroz, sal y papa 12000']);
  assert.deepEqual(dividirLinea('cena 60000 entre ana y luis'), ['cena 60000 entre ana y luis']);
  assert.deepEqual(dividirLinea('cena 40000 a medias con ana'), ['cena 40000 a medias con ana']);
  assert.deepEqual(dividirLinea('debo 5000 a ana y 3000 a luis'), ['debo 5000 a ana y 3000 a luis']);
});

test('+ y - como separadores', () => {
  assert.deepEqual(dividirLinea('mecato 5000 + pasaje 3000'), ['mecato 5000', 'pasaje 3000']);
  assert.deepEqual(dividirLinea('+50000 nomina -12000 mecato'), ['ingreso 50000 nomina', '12000 mecato']);
  assert.deepEqual(dividirLinea('+50000 nomina -12000 mecato +5000 ana'), ['ingreso 50000 nomina', '12000 mecato', 'ingreso 5000 ana']);
  assert.deepEqual(dividirLinea('-12000 mecato'), ['12000 mecato']);
  assert.deepEqual(dividirLinea('mecato 5000\n-12000 taxi'), ['mecato 5000', '12000 taxi']);
});

test('un descuento con guion no crea un segundo gasto', () => {
  assert.deepEqual(dividirLinea('pasaje 3000 - 500 descuento'), ['pasaje 3000 - 500 descuento']);
});

test('bot: «mecato 5000, pasaje 3000» da dos tarjetas', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('mecato 5000, pasaje 3000'));
  assert.match(t, /Movimiento 1 de 2/);
});
