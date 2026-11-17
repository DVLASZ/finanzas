/** Preguntas como se dicen (voz o texto) y el presupuesto de la semana. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deLocal, presupuestoSemanal } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function conPlata() {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 300000 nequi 200000', deLocal('2026-10-01 08:00:00'));
  await bot.pulsa('ok', deLocal('2026-10-01 08:00:00'));
  await bot.di('almuerzo 12000 nequi', deLocal('2026-10-05 13:00:00'));
  await bot.pulsa('ok', deLocal('2026-10-05 13:00:00'));
  return bot;
}

test('«¿cuánto hay en Nequi?» responde solo con esa cuenta', async () => {
  const bot = await conPlata();
  for (const frase of ['¿cuánto hay en nequi?', 'cuanto tengo en Nequi', 'saldo de nequi']) {
    const r = textoDe(await bot.di(frase, AHORA));
    assert.match(r, /Nequi: \$188\.000/, frase);
    assert.doesNotMatch(r, /Efectivo/, 'no mezcla otras cuentas');
  }
  assert.match(textoDe(await bot.di('cuanto hay en la caja fuerte', AHORA)), /No encuentro una cuenta/);
});

test('«¿cuánto llevo en comida este mes?» entiende el «este mes» y la categoría', async () => {
  const bot = await conPlata();
  const r = textoDe(await bot.di('¿cuánto llevo en comida este mes?', AHORA));
  assert.match(r, /Comida: .* este mes/);
  assert.match(r, /\$12\.000 este mes/);
});

test('«¿quién me debe plata?» muestra las deudas', async () => {
  const bot = await conPlata();
  await bot.di('presté 40000 a Ana', AHORA); await bot.pulsa('ok', AHORA);
  assert.match(textoDe(await bot.di('¿quién me debe plata?', AHORA)), /Ana/);
});

test('presupuesto semanal: lo libre del mes repartido en los días que quedan', async () => {
  const bot = await conPlata();
  const d = await bot.repo.cargar();
  const p = presupuestoSemanal(d, AHORA); // lunes 19 de octubre: quedan 13 días de mes y 7 de semana
  // 500000 - 12000 = 488000 libres entre 13 días, por 7
  assert.equal(p.porSemana, Math.floor((488000 / 13) * 7));
  assert.equal(p.diasDeLaSemana, 7);
  assert.equal(p.restoDeLaSemana, Math.floor(488000 / 13) * 7);
  assert.equal(p.enRojo, false);
  const r = textoDe(await bot.di('¿cuánto puedo gastar esta semana?', AHORA));
  assert.match(r, /Esta semana puedes gastar \$/);
});

test('presupuesto semanal: un pago fijo que falta se descuenta antes de repartir', async () => {
  const bot = await conPlata();
  await bot.di('cada mes el 25 arriendo 100000', AHORA); await bot.pulsa('ok', AHORA);
  const con = presupuestoSemanal(await bot.repo.cargar(), AHORA);
  assert.equal(con.fijos, 100000);
  assert.equal(con.porSemana, Math.floor((388000 / 13) * 7));
});
