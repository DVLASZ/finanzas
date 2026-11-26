/**
 * Los cinco puntos de integridad que dejó la radiografía del bot (docs/ARQUITECTURA-BOT.md, sección 8):
 * ingresos que no se confunden con gastos, un gasto con dos cuentas, las palabras sueltas con una tarjeta pendiente,
 * más de 10 líneas sin perder ninguna en silencio y una IA que no inventa préstamos, transferencias ni comandos.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, validarFrasesIA } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const tarjeta = (t: string): string => /Entendí:\n([^\n]+)/.exec(t)?.[1] ?? '';

test('A1: lo que te llega o vendes es ingreso, nunca gasto', async () => {
  for (const [frase, monto] of [
    ['Recibiste 20.000 de ANA MARIA en tu Nequi', '$20.000'],
    ['vendí la bici 200000', '$200.000'],
    ['me llegaron 50000 de Ana', '$50.000'],
    ['me consignaron 80000 de mi tía', '$80.000'],
    ['te transfirieron 30000 de Luis', '$30.000'],
  ] as const) {
    const t = tarjeta(textoDe(await nuevoBot().di(frase)));
    assert.match(t, /^Ingreso/, `${frase}: ${t}`);
    assert.ok(t.includes(monto), `${frase}: ${t}`);
  }
});

test('A1: si Ana te debe, lo que te manda es un abono de su deuda', async () => {
  const bot = nuevoBot();
  await bot.di('presté 80000 a Ana');
  await bot.pulsa('ok');
  const t = tarjeta(textoDe(await bot.di('me llegaron 50000 de Ana')));
  assert.match(t, /^(Pago|Abono|Ingreso)/, t);
  assert.ok(t.includes('Ana') && t.includes('$50.000'), t);
});

test('A2: un gasto con dos cuentas son dos gastos, no una transferencia', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('pague 20k con nequi y 10k en efectivo'));
  assert.doesNotMatch(t, /Transferencia/);
  assert.match(t, /Movimiento 1 de 2/);
  assert.match(t, /Gasto[^\n]*\$20\.000[^\n]*Nequi/);
  const t2 = textoDe(await bot.pulsa('ok'));
  assert.match(t2, /Gasto[^\n]*\$10\.000[^\n]*Efectivo/);
});

test('A3: «borra», «no», «ok» y «gracias» con una tarjeta pendiente no tocan lo ya guardado', async () => {
  for (const palabra of ['borra', 'no', 'ok', 'gracias']) {
    const bot = nuevoBot();
    await bot.di('taxi 4000');
    await bot.pulsa('ok');
    const antes = (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;
    await bot.di('almuerzo 5000');
    await bot.di(palabra);
    const despues = (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;
    assert.ok(despues >= antes, `«${palabra}» anuló un movimiento guardado`);
    assert.ok(despues <= antes + 1, `«${palabra}» guardó más de la cuenta`);
  }
});

test('A3: escribir un gasto nuevo con una tarjeta pendiente avisa antes de descartarla', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 5000');
  const t = textoDe(await bot.di('pasaje 3000'));
  assert.match(t, /pendiente|antes de|primero|Movimiento 1 de 2/i, t);
});

test('A4: con más de 10 movimientos en un mensaje no se pierde ninguno en silencio', async () => {
  const lineas = Array.from({ length: 14 }, (_, i) => `almuerzo ${(i + 1) * 1000}`).join('\n');
  const t = textoDe(await nuevoBot().di(lineas));
  assert.ok(/de 14\b/.test(t) || (/\b10\b/.test(t) && /\b4\b/.test(t) && /(solo|sobran|quedan|faltan|pendient|primeros)/i.test(t)), t.slice(0, 200));
});

test('A5: la IA no puede inventar préstamos, transferencias, abonos ni comandos', async () => {
  const bot = nuevoBot();
  const ctx = contextoDe(await bot.repo.cargar(), AHORA);
  const original = 'almuerzo 12000 con Luis';
  assert.deepEqual(validarFrasesIA(['presté 12000 a Luis'], original, ctx), [], 'préstamo inventado');
  assert.deepEqual(validarFrasesIA(['cambio 12000 nequi a efectivo'], original, ctx), [], 'transferencia inventada');
  assert.deepEqual(validarFrasesIA(['le debo 12000 a Luis'], original, ctx), [], 'deuda inventada');
  assert.deepEqual(validarFrasesIA(['pagué 12000 a Luis'], original, ctx), [], 'abono inventado');
  assert.deepEqual(validarFrasesIA(['deshacer 5', 'cerrar mes septiembre', 'quitar meta moto'], original, ctx), [], 'comandos');
  assert.deepEqual(validarFrasesIA(['almuerzo 12000'], original, ctx), ['almuerzo 12000'], 'lo legítimo sí pasa');
  assert.deepEqual(validarFrasesIA(['presté 12000 a Luis'], 'le presté 12000 a Luis', ctx), ['presté 12000 a Luis'], 'si lo dijiste, pasa');
});
