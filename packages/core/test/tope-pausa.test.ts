import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { estadoPresupuesto, pasarMovimientosDeCategoria, topesPausados } from '../src/index.ts';

test('pausar un tope: sigue guardado, no cuenta ni avisa, y se reanuda con su monto', async () => {
  const b = nuevoBot();
  await b.di('tope mecato 60000');
  assert.match(textoDe(await b.di('pausar tope mecato')), /en pausa/);
  let d = await b.repo.cargar();
  assert.equal(d.presupuestos['cat:mecato'], 60000);
  assert.deepEqual(topesPausados(d.config), ['cat:mecato']);
  assert.equal(estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', '2026-10-01 00:00:00', '2026-11-01 00:00:00', false, d.config), null);
  // un gasto grande no dispara el aviso del tope en pausa
  await b.di('mecato 59000');
  assert.doesNotMatch(textoDe(await b.pulsa('ok')), /tope|Tope/);
  assert.match(textoDe(await b.di('reanudar tope mecato')), /activo otra vez: \$60\.000/);
  d = await b.repo.cargar();
  assert.deepEqual(topesPausados(d.config), []);
  assert.ok(estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', '2026-10-01 00:00:00', '2026-11-01 00:00:00', false, d.config));
});

test('pausar un tope que no existe lo dice, y quitarlo o fijarlo de nuevo limpia la pausa', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('pausar tope comida')), /no tiene tope/);
  await b.di('tope comida 100000'); await b.di('pausar tope comida');
  await b.di('tope comida 120000');
  assert.deepEqual(topesPausados((await b.repo.cargar()).config), []);
  await b.di('pausar tope comida'); await b.di('quitar tope comida');
  assert.deepEqual(topesPausados((await b.repo.cargar()).config), []);
});

test('pasar los movimientos de una categoría a otra antes de archivarla', async () => {
  const b = nuevoBot();
  await b.di('mecato 1000'); await b.pulsa('ok');
  await b.di('mecato 2500'); await b.pulsa('ok');
  const r = await pasarMovimientosDeCategoria(b.repo, AHORA, 'cat:mecato', 'cat:comida');
  assert.deepEqual(r, { hechos: 2, fallaron: 0 });
  const d = await b.repo.cargar();
  assert.equal(d.movimientos.filter(m => m.estado === 'ok' && m.asientos.some(a => a.cuentaId === 'cat:mecato')).length, 0);
  assert.equal(d.movimientos.filter(m => m.estado === 'ok' && m.asientos.some(a => a.cuentaId === 'cat:comida')).length, 2);
});
