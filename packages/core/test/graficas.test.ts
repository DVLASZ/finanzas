import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal, flujoAcumulado, gastoPorMedio, topConceptos } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

async function conMovimientos() {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000 nequi 300000', antes); await bot.pulsa('ok', antes);
  for (const f of ['almuerzo 12000 hace 3 días', 'almuerzo 18000 hace 2 días', 'mecato 8000 nequi hace 2 días', 'ingreso 400000 trabajo hace 5 días', 'mecato 4000']) {
    await bot.di(f, AHORA); await bot.pulsa('ok', AHORA);
  }
  return await bot.repo.cargar();
}

test('flujo acumulado: suma ingresos menos gastos día a día y corta en hoy', async () => {
  const datos = await conMovimientos();
  const f = flujoAcumulado(datos, 2026, 10, 19);
  assert.equal(f.length, 19);
  assert.equal(f.at(-1)!.acumulado, 400000 - 12000 - 18000 - 8000 - 4000);
  assert.equal(f[0].fecha, '2026-10-01');
  assert.equal(f.reduce((s, p) => s + p.neto, 0), f.at(-1)!.acumulado);
});

test('flujo acumulado: un mes entero trae todos sus días', async () => {
  const datos = await conMovimientos();
  assert.equal(flujoAcumulado(datos, 2026, 10).length, 31);
});

test('top de conceptos: ordena por plata y suma los porcentajes', async () => {
  const datos = await conMovimientos();
  const top = topConceptos(datos, '2026-10-01 00:00:00', '2026-11-01 00:00:00');
  assert.equal(top[0].concepto.toLowerCase(), 'almuerzo');
  assert.equal(top[0].veces, 2);
  assert.equal(top[0].total, 30000);
  assert.equal(top.reduce((s, x) => s + x.pct, 0) >= 99, true);
  assert.equal(topConceptos(datos, '2026-10-01 00:00:00', '2026-11-01 00:00:00', 1).length, 1);
});

test('medio de pago: separa efectivo de lo digital', async () => {
  const datos = await conMovimientos();
  const m = gastoPorMedio(datos, '2026-10-01 00:00:00', '2026-11-01 00:00:00');
  const ef = m.filter(x => x.efectivo).reduce((s, x) => s + x.total, 0);
  const di = m.filter(x => !x.efectivo).reduce((s, x) => s + x.total, 0);
  assert.equal(ef, 34000);
  assert.equal(di, 8000);
});

test('sin gastos, las gráficas vienen vacías', () => {
  const vacio = { movimientos: [], cuentas: [] };
  assert.deepEqual(topConceptos(vacio, '2026-10-01 00:00:00', '2026-11-01 00:00:00'), []);
  assert.deepEqual(gastoPorMedio(vacio, '2026-10-01 00:00:00', '2026-11-01 00:00:00'), []);
});
