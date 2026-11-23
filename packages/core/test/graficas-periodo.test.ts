import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';
import { barrasHistorico, barrasPorMes, rangoAnterior, semanasDelRango, serieDiaria, totalesPeriodo, vistaDe } from '../../../apps/web/src/lib/graficasResumen.ts';

async function datosConHistorial() {
  const bot = nuevoBot();
  const antes = deLocal('2025-03-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000', antes); await bot.pulsa('ok', antes);
  for (const f of ['almuerzo 12000 hace 3 días', 'ingreso 400000 trabajo hace 5 días', 'almuerzo 5000 3 de marzo de 2025', 'almuerzo 7000 5 de febrero de 2026']) {
    await bot.di(f, AHORA); await bot.pulsa('ok', AHORA);
  }
  return await bot.repo.cargar();
}

test('vistaDe: un rango suelto se trata según su duración', () => {
  assert.equal(vistaDe('semana', 'x', 'y'), 'semana');
  assert.equal(vistaDe('rango', '2026-10-01', '2026-10-08'), 'semana');
  assert.equal(vistaDe('rango', '2026-09-01', '2026-10-15'), 'mes');
  assert.equal(vistaDe('rango', '2026-01-01', '2026-12-01'), 'anio');
  assert.equal(vistaDe('rango', '2020-01-01', '2026-12-01'), 'todo');
});

test('rangoAnterior: meses enteros hacia atrás o los mismos días', () => {
  assert.deepEqual(rangoAnterior('2026-10-01 00:00:00', '2026-11-01 00:00:00'), { desde: '2026-09-01 00:00:00', hasta: '2026-10-01 00:00:00' });
  assert.deepEqual(rangoAnterior('2026-01-01 00:00:00', '2027-01-01 00:00:00'), { desde: '2025-01-01 00:00:00', hasta: '2026-01-01 00:00:00' });
  assert.deepEqual(rangoAnterior('2026-10-12 00:00:00', '2026-10-19 00:00:00'), { desde: '2026-10-05 00:00:00', hasta: '2026-10-12 00:00:00' });
});

test('un año sin movimientos da cero y barras de doce meses vacías', async () => {
  const d = await datosConHistorial();
  assert.deepEqual(totalesPeriodo(d, '2024-01-01', '2025-01-01'), { ingresos: 0, gastos: 0 });
  const barras = barrasPorMes(d, '2024-01-01', '2025-01-01');
  assert.equal(barras.length, 12);
  assert.equal(barras.every(b => b.gastos === 0 && b.ingresos === 0), true);
});

test('barras de un año traen enero a diciembre y suman lo del año', async () => {
  const d = await datosConHistorial();
  const barras = barrasPorMes(d, '2026-01-01', '2027-01-01');
  assert.equal(barras.length, 12);
  assert.equal(barras[0].etiqueta, 'ene');
  assert.equal(barras.reduce((s, b) => s + b.gastos, 0), totalesPeriodo(d, '2026-01-01', '2027-01-01').gastos);
});

test('histórico: solo meses con datos y años si pasan de doce', async () => {
  const d = await datosConHistorial();
  const h = barrasHistorico(d);
  assert.equal(h.every(b => b.gastos > 0 || b.ingresos > 0), true);
  assert.equal(h.length <= 12, true);
});

test('serie diaria y semanas del mes cubren el rango sin salirse de él', async () => {
  const d = await datosConHistorial();
  const dias = serieDiaria(d, '2026-10-01', '2026-11-01');
  assert.equal(dias.length, 31);
  assert.equal(dias.reduce((s, x) => s + x.gasto, 0), totalesPeriodo(d, '2026-10-01', '2026-11-01').gastos);
  const sem = semanasDelRango(d, '2026-10-01', '2026-11-01', AHORA);
  assert.equal(sem[0].desde, '2026-10-01 00:00:00');
  assert.equal(sem.at(-1)!.hasta, '2026-11-01 00:00:00');
  assert.equal(sem.reduce((s, x) => s + x.gastos, 0), totalesPeriodo(d, '2026-10-01', '2026-11-01').gastos);
  assert.equal(sem.filter(x => x.actual).length, 1);
});
