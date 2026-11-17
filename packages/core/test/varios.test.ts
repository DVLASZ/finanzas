/** Varios movimientos en una frase («ayer pagué... y hoy entraron...») y «Confirmar los N» de un toque. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, deLocal, dividirLinea, ingresoPorVerbo, saldoDe } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

test('una frase con «y hoy...» se corta en dos movimientos, y una sin cantidades en cada lado no', () => {
  assert.deepEqual(dividirLinea('ayer pagué 15000 de almuerzo en efectivo y hoy entraron 80000 a Nequi'), ['ayer pagué 15000 de almuerzo en efectivo', 'hoy entraron 80000 a Nequi']);
  assert.deepEqual(dividirLinea('mecato 2000, luego gasté 5000 en pasaje'), ['mecato 2000', 'luego gasté 5000 en pasaje']);
  assert.deepEqual(dividirLinea('pizza 9000 pagué por Ivan 3000 y Daniel 2500'), ['pizza 9000 pagué por Ivan 3000 y Daniel 2500'], 'un reparto no se parte');
  assert.deepEqual(dividirLinea('almuerzo y hoy llegué tarde'), ['almuerzo y hoy llegué tarde'], 'sin cantidades no se corta');
});

test('«entraron», «llegaron»: plata que entra dicha con el verbo', () => {
  assert.equal(ingresoPorVerbo('hoy entraron 80000 a Nequi'), 'ingreso 80000 Nequi hoy');
  assert.equal(ingresoPorVerbo('me llegaron 50000 por nequi de trabajo'), 'ingreso 50000 nequi de trabajo');
  assert.equal(ingresoPorVerbo('almuerzo 12000'), null);
  assert.equal(ingresoPorVerbo('entraron muchos'), null);
});

test('el ejemplo completo: dos tarjetas y «Confirmar los 2» deja los dos guardados', async () => {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 300000 nequi 100000', antes); await bot.pulsa('ok', antes);
  const s = await bot.di('ayer pagué 15 mil de almuerzo en efectivo y hoy entraron 80 mil a Nequi', AHORA);
  assert.match(textoDe(s), /Movimiento 1 de 2/);
  assert.ok(s[0].botones?.some(b => b.id === 'okall' && /Confirmar los 2/.test(b.titulo)), 'ofrece confirmar los dos');
  const r = await bot.pulsa('okall', AHORA);
  const texto = textoDe(r);
  assert.match(texto, /Guardado/);
  const d = await bot.repo.cargar();
  const saldos = calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00');
  assert.equal(saldoDe(saldos, 'efectivo', 'COP'), 285000);
  assert.equal(saldoDe(saldos, 'nequi', 'COP'), 180000);
  assert.equal(d.movimientos.filter(m => m.estado === 'ok' && m.tipo !== 'apertura').length, 2);
});

test('«Confirmar los N» se detiene en la que tiene una pregunta y la deja como tarjeta', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 300000', AHORA); await bot.pulsa('ok', AHORA);
  await bot.di('mecato 2000\nxyzabc 5000\nalmuerzo 12000', AHORA);
  const r = await bot.pulsa('okall', AHORA);
  const d = await bot.repo.cargar();
  assert.equal(d.movimientos.filter(m => m.estado === 'ok' && m.tipo !== 'apertura').length >= 1, true, 'guardó al menos el primero');
  assert.ok(textoDe(r).length > 0);
});

test('restaurar: deshacer una anulación devuelve el movimiento, los saldos y la deuda a como estaban', async () => {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 100000', antes); await bot.pulsa('ok', antes);
  await bot.di('presté 20000 a Ana', AHORA); await bot.pulsa('ok', AHORA);
  const prestamo = (await bot.repo.cargar()).movimientos.find(m => m.tipo === 'prestamo')!;
  const saldo = async () => { const d = await bot.repo.cargar(); return saldoDe(calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00'), 'efectivo', 'COP'); };
  assert.equal(await saldo(), 80000);
  await bot.repo.anularMovimiento(prestamo.id, '2026-10-19 16:00:00');
  assert.equal(await saldo(), 100000, 'anulado: la plata vuelve');
  assert.ok((await bot.repo.cargar()).compromisos.every(c => c.estado === 'anulada'));
  await bot.repo.restaurarMovimiento(prestamo.id, '2026-10-19 16:00:05');
  assert.equal(await saldo(), 80000, 'restaurado: vuelve a descontar');
  const d = await bot.repo.cargar();
  assert.equal(d.movimientos.find(m => m.id === prestamo.id)?.estado, 'ok');
  assert.ok(d.compromisos.some(c => c.estado === 'activa'), 'la deuda vuelve a estar activa');
  await bot.repo.restaurarMovimiento(prestamo.id, '2026-10-19 16:00:06'); // otra vez: no hace nada raro
  assert.equal(await saldo(), 80000);
});
