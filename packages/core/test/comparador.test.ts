import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';
import {
  armarReporte, compararRangos, diaDeSemana, diaMasCaro, diasEntre, gastoPorDiaSemana, validarRango,
} from '../../../apps/web/src/lib/comparador.ts';

async function conGastos() {
  const bot = nuevoBot();
  const antes = deLocal('2026-09-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000', antes); await bot.pulsa('ok', antes);
  // 2026-10-19 es lunes
  for (const f of ['almuerzo 12000 hace 7 días', 'almuerzo 18000', 'mecato 8000 hace 2 días', 'ingreso 400000 trabajo hace 5 días', 'taxi 5000 hace 40 días']) {
    await bot.di(f, AHORA); await bot.pulsa('ok', AHORA);
  }
  return await bot.repo.cargar();
}

test('día de la semana: lunes es 0 y domingo es 6', () => {
  assert.equal(diaDeSemana('2026-10-19'), 0);
  assert.equal(diaDeSemana('2026-10-25'), 6);
  assert.equal(diasEntre('2026-10-01', '2026-10-31'), 31);
});

test('gasto por día de la semana: reparte el gasto y cuenta los días', async () => {
  const datos = await conGastos();
  const dias = gastoPorDiaSemana(datos, '2026-10-01 00:00:00', '2026-11-01 00:00:00');
  assert.equal(dias.length, 7);
  assert.equal(dias[0].total, 12000 + 18000);
  assert.equal(dias[0].veces, 4);
  assert.equal(dias[0].promedio, 7500);
  assert.equal(dias[5].total, 8000);
  assert.equal(dias.reduce((s, d) => s + d.total, 0), 38000);
  assert.equal(diaMasCaro(dias)?.indice, 0);
});

test('rangos: valida fin antes de inicio, fechas vacías o falsas y más de 2 años', () => {
  assert.equal(validarRango({ inicio: '2026-10-01', fin: '2026-10-31' }, 'A'), null);
  assert.match(validarRango({ inicio: '2026-10-31', fin: '2026-10-01' }, 'A') ?? '', /anterior/);
  assert.match(validarRango({ inicio: '', fin: '2026-10-01' }, 'B') ?? '', /Falta/);
  assert.match(validarRango({ inicio: '2026-02-30', fin: '2026-03-10' }, 'A') ?? '', /no existe/);
  assert.match(validarRango({ inicio: '2024-01-01', fin: '2026-10-01' }, 'B') ?? '', /2 años/);
});

test('comparar rangos: totales y categorías de A contra B', async () => {
  const datos = await conGastos();
  const c = compararRangos(datos, { inicio: '2026-10-01', fin: '2026-10-12' }, { inicio: '2026-10-13', fin: '2026-10-31' });
  assert.equal(c.a.gastos, 12000);
  assert.equal(c.b.gastos, 18000 + 8000);
  assert.equal(c.b.ingresos, 400000);
  assert.equal(c.b.balance, 400000 - 26000);
  assert.equal(c.categorias.reduce((s, f) => s + f.a, 0), c.a.gastos);
  assert.equal(c.categorias.reduce((s, f) => s + f.b, 0), c.b.gastos);
});

test('reporte: totales, categorías en orden y gastos más grandes', async () => {
  const datos = await conGastos();
  const r = armarReporte(datos, 'Octubre', 'Octubre 2026', '2026-10-01 00:00:00', '2026-11-01 00:00:00');
  assert.equal(r.gastos, 38000);
  assert.equal(r.ingresos, 400000);
  assert.equal(r.balance, 362000);
  assert.equal(r.mayores[0].monto, 18000);
  assert.equal(r.categorias.reduce((s, c) => s + c.total, 0), r.gastos);
});
