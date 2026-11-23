import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activoEn, cambiarFijo, estadoDeFijo, estaPendiente, fechasQueFaltan, leerRecurrentes, ocurrencias, pagosProximos, quitarFijo,
  recurrentesPendientes, seguroParaGastar, vecesQueFaltanEsteMes, type Recurrente,
} from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

const base: Recurrente = { dia: 20, frase: 'internet 60000', concepto: 'Internet', monto: 60000 };
const cfg = (l: Recurrente[]) => ({ recurrentes: JSON.stringify(l) });
const HOY = '2026-10-19 15:42:00';

test('activoEn: pausado nunca, fin inclusive', () => {
  assert.equal(activoEn(base, '2026-10-19'), true);
  assert.equal(activoEn({ ...base, pausado: true }, '2026-10-19'), false);
  assert.equal(activoEn({ ...base, fin: '2026-12-21' }, '2026-12-21'), true);
  assert.equal(activoEn({ ...base, fin: '2026-12-21' }, '2026-12-22'), false);
});

test('leerRecurrentes conserva pausados y descarta fin invalido', () => {
  const l = leerRecurrentes(cfg([{ ...base, pausado: true }, { ...base, concepto: 'B', fin: 'mañana' }, { ...base, concepto: 'C', fin: '2026-12-21', pausado: 'si' as unknown as boolean }]));
  assert.equal(l.length, 3);
  assert.equal(l[0].pausado, true);
  assert.equal(l[1].fin, undefined);
  assert.equal(l[2].fin, '2026-12-21');
  assert.equal(l[2].pausado, undefined);
});

test('un pausado no genera nada', () => {
  const p = { ...base, pausado: true };
  assert.deepEqual(ocurrencias(p, '2026-10-01', '2026-12-31'), []);
  assert.equal(estaPendiente(p, [], HOY), false);
  assert.deepEqual(recurrentesPendientes(cfg([p]), [], HOY), []);
  assert.deepEqual(fechasQueFaltan(p, [], HOY, '2026-11-30'), []);
  assert.equal(vecesQueFaltanEsteMes(p, [], HOY), 0);
});

test('fin deja ocurrencias hasta esa fecha inclusive', () => {
  const r: Recurrente = { ...base, dia: 21, fin: '2026-12-21' };
  assert.deepEqual(ocurrencias(r, '2026-11-01', '2027-02-28'), ['2026-11-21', '2026-12-21']);
  const t = { ...r, fin: '2026-11-21' };
  assert.deepEqual(fechasQueFaltan(t, [], '2026-12-22 10:00:00', '2027-02-28'), []);
  assert.deepEqual(fechasQueFaltan(r, [], '2026-11-30 10:00:00', '2027-02-28').filter(f => f > '2026-12-21'), []);
});

test('terminado no avisa ni en mensual ni en semanal', () => {
  assert.equal(estaPendiente({ ...base, dia: 15, fin: '2026-09-15' }, [], HOY), false);
  assert.equal(estaPendiente({ ...base, dia: 1, frecuencia: 'semanal', fin: '2026-10-01' }, [], HOY), false);
  assert.equal(estaPendiente({ ...base, dia: 19, fin: '2026-10-19' }, [], HOY), true);
});

test('estadoDeFijo', () => {
  assert.equal(estadoDeFijo(base, '2026-10-19'), 'activo');
  assert.equal(estadoDeFijo({ ...base, pausado: true }, '2026-10-19'), 'pausado');
  assert.equal(estadoDeFijo({ ...base, fin: '2026-10-18' }, '2026-10-19'), 'terminado');
  assert.equal(estadoDeFijo({ ...base, fin: '2026-10-19' }, '2026-10-19'), 'activo');
  assert.equal(estadoDeFijo({ ...base, fin: '2026-10-18', pausado: true }, '2026-10-19'), 'terminado');
});

test('pausado no entra en seguro ni liquidez', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial nequi 500000');
  await bot.pulsa('ok');
  await bot.di('cada mes el 25 arriendo 100000 nequi');
  await bot.pulsa('ok');
  const d = await bot.repo.cargar();
  assert.ok(pagosProximos(d, AHORA, 30).length > 0);
  const pausado = { ...d, config: { ...d.config, recurrentes: JSON.stringify(leerRecurrentes(d.config).map(r => ({ ...r, pausado: true }))) } };
  assert.equal(pagosProximos(pausado, AHORA, 30).length, 0);
  assert.equal(seguroParaGastar(pausado, AHORA).fijos, 0);
});

test('cuentaId guardada manda sobre la frase; si no existe, se ignora', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial nequi 500000');
  await bot.pulsa('ok');
  await bot.di('cada mes el 25 arriendo 100000 nequi');
  await bot.pulsa('ok');
  const d = await bot.repo.cargar();
  const con = (id: string) => ({ ...d, config: { ...d.config, recurrentes: JSON.stringify(leerRecurrentes(d.config).map(r => ({ ...r, cuentaId: id }))) } });
  assert.equal(pagosProximos(con('efectivo'), AHORA, 30)[0].cuentaId, 'efectivo');
  assert.equal(pagosProximos(con('no-existe'), AHORA, 30)[0].cuentaId, 'nequi');
});

test('cambiarFijo y quitarFijo por concepto', () => {
  const l = [base, { ...base, concepto: 'Luz', frase: 'luz 30000', monto: 30000 }];
  const c = cambiarFijo(l, 'internet', { pausado: true, fin: '2026-12-01' });
  assert.equal(c.length, 2);
  assert.equal(c[0].pausado, true);
  assert.equal(c[0].fin, '2026-12-01');
  assert.equal(c[1].pausado, undefined);
  const m = cambiarFijo(l, 'Internet', { monto: 70000 });
  assert.equal(m[0].monto, 70000);
  assert.match(m[0].frase, /70000/);
  assert.equal(quitarFijo(l, 'INTERNET').length, 1);
  assert.equal(quitarFijo(l, 'nada').length, 2);
});
