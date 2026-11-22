/**
 * Integridad de deudas, abonos, edición y metas: lo que pasa al deshacer, abonar de más o editar un reparto.
 * Todo con el bot y el repositorio en memoria.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, deudasPorPersona } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

async function guardar(bot: Bot, texto: string): Promise<string> {
  const tarjeta = textoDe(await bot.di(texto));
  assert.match(tarjeta, /Entendí:/, `«${texto}» debía mostrar una tarjeta, pero respondió: ${tarjeta}`);
  return textoDe(await bot.pulsa('ok'));
}

async function saldo(bot: Bot, cuenta: string, moneda = 'COP'): Promise<number> {
  const d = await bot.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|${moneda}`) ?? 0;
}

const ids = (s: { botones?: { id: string }[] }[]) => s.at(-1)?.botones?.map(b => b.id) ?? [];

// ---------------------------------------------------------------- 1. deuda saldada que se reabre

test('deshacer un pago que saldó la deuda la deja activa otra vez, con su motivo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'le debo 8000 a marta por almuerzo');
  await guardar(bot, 'pagué 9000 a marta');
  let d = await bot.repo.cargar();
  assert.equal(d.compromisos[0].estado, 'saldada');
  await bot.di('deshacer');
  d = await bot.repo.cargar();
  assert.equal(d.compromisos[0].estado, 'activa');
  assert.equal(d.compromisos[0].monto, 8000, 'el monto original no cambia');
  const deuda = deudasPorPersona(d.movimientos, d.cuentas, d.compromisos, '2000-01-01 00:00:00')[0];
  assert.equal(deuda.saldo, -8000);
  assert.equal(deuda.compromisos[0]?.motivo, 'almuerzo');
});

test('restaurar un pago anulado vuelve a saldar la deuda', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'le debo 8000 a marta por almuerzo');
  await guardar(bot, 'pagué 8000 a marta');
  await bot.di('deshacer');
  assert.equal((await bot.repo.cargar()).compromisos[0].estado, 'activa');
  const pago = (await bot.repo.cargar()).movimientos.find(m => m.tipo === 'pago')!;
  await bot.repo.restaurarMovimiento(pago.id, '2026-10-19 16:00:00');
  assert.equal((await bot.repo.cargar()).compromisos[0].estado, 'saldada');
});

// ---------------------------------------------------------------- 2. anular una deuda con abonos

test('anular un compartido con abonos avisa y ofrece anular también los abonos', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'cena 10000 entre ivan, daniel y yo');
  await guardar(bot, 'ivan me pagó 1000');
  const compartido = (await bot.repo.cargar()).movimientos.find(m => m.tipo === 'compartido')!;
  const r = await bot.pulsa(`undo:${compartido.id}`);
  assert.match(textoDe(r), /abono/i);
  assert.ok(ids(r).some(i => i.startsWith('unds!:')), 'ofrece anular todo junto');
  assert.ok(!ids(r).some(i => i.startsWith('undo!:')), 'no deja anular solo el préstamo');
  assert.equal((await bot.repo.cargar()).movimientos.find(m => m.id === compartido.id)!.estado, 'ok', 'todavía no se anuló nada');
  await bot.pulsa(ids(r).find(i => i.startsWith('unds!:'))!);
  assert.equal(await saldo(bot, 'per:ivan'), 0);
  assert.equal(await saldo(bot, 'per:daniel'), 0);
});

test('anular un préstamo sin abonos sigue siendo directo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'ivan me debe 3333');
  const r = await bot.di('deshacer');
  assert.match(textoDe(r), /Anulado/);
  assert.equal(await saldo(bot, 'per:ivan'), 0);
});

// ---------------------------------------------------------------- 3. abono mayor que el saldo

test('«me pagó» de más avisa, ofrece registrar solo lo justo y deja guardar igual', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'ivan me debe 3333');
  await guardar(bot, 'ivan me pagó 2000');
  const r = await bot.di('ivan me pagó 5000');
  assert.match(textoDe(r), /más de lo que/);
  assert.match(textoDe(r), /\$1\.333/);
  assert.ok(ids(r).includes('exacto'));
  assert.ok(ids(r).includes('ok'), 'guardar igual sigue disponible');
  const justo = await bot.pulsa('exacto');
  assert.match(textoDe(justo), /\$1\.333/);
  assert.ok(!/más de lo que/.test(textoDe(justo)));
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'per:ivan'), 0);
});

test('«me pagó» de más y guardar igual: el resto queda a favor de la otra persona, y se dice', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'ivan me debe 3333');
  const r = await bot.di('ivan me pagó 5000');
  assert.match(textoDe(r), /quedarían a favor de Ivan|quedan a favor de Ivan/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'per:ivan'), -1667);
});

test('«le pagué» de más: avisa y «registrar solo» deja la deuda en cero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'le debo 8000 a marta por almuerzo');
  const r = await bot.di('pagué 9000 a marta');
  assert.match(textoDe(r), /más de lo que/);
  assert.match(textoDe(r), /a tu favor/);
  const boton = r.at(-1)!.botones!.find(b => b.id === 'exacto')!;
  assert.match(boton.titulo, /\$8\.000/);
  await bot.pulsa('exacto');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'per:marta'), 0);
});

test('un abono justo no lleva aviso de exceso', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'ivan me debe 3333');
  const r = await bot.di('ivan me pagó 3333');
  assert.ok(!/más de lo que/.test(textoDe(r)));
  assert.ok(!ids(r).includes('exacto'));
});

// ---------------------------------------------------------------- 4. abono en otra moneda

test('un abono en dólares a una deuda en pesos no se guarda', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'ivan me debe 3333');
  const antes = (await bot.repo.cargar()).movimientos.length;
  const r = await bot.di('ivan me pagó 10 usd');
  assert.match(textoDe(r), /Ivan no te debe dólares/);
  const guardado = await bot.pulsa('ok');
  assert.match(textoDe(guardado), /No pude guardarlo/);
  assert.equal((await bot.repo.cargar()).movimientos.length, antes);
  assert.equal(await saldo(bot, 'efectivo', 'USD'), 0);
  assert.equal(await saldo(bot, 'per:ivan', 'USD'), 0);
});

// ---------------------------------------------------------------- 5. editar el monto de un compartido

test('editar el monto de un compartido en partes iguales reparte de nuevo y lo dice', async () => {
  const bot = nuevoBot();
  await bot.di('pizza 9000 entre ivan, daniel y yo');
  await bot.pulsa('edit');
  const r = await bot.di('monto 12000');
  const t = textoDe(r);
  assert.match(t, /Repartí de nuevo: cada uno \$4\.000/);
  assert.match(t, /Ivan te debe \$4\.000/);
  assert.match(t, /Tu parte: \$4\.000/);
});

test('editar el monto de un compartido con partes manuales avisa que las partes no cambian', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 20000 pagué por ivan 3000 y daniel 2500');
  await bot.pulsa('edit');
  const t = textoDe(await bot.di('monto 25000'));
  assert.match(t, /Ivan te debe \$3\.000/);
  assert.match(t, /partes de las personas no cambian/);
});

// ---------------------------------------------------------------- 6. saldo inicial

test('el botón de deshacer no anula el saldo inicial', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'apertura efectivo 100000');
  const ap = (await bot.repo.cargar()).movimientos.find(m => m.tipo === 'apertura')!;
  const t = textoDe(await bot.pulsa(`undo:${ap.id}`));
  assert.match(t, /saldo inicial no se deshace/i);
  const d = await bot.repo.cargar();
  assert.equal(d.movimientos.find(m => m.id === ap.id)!.estado, 'ok');
  assert.ok(d.config.fecha_apertura);
  const t2 = textoDe(await bot.pulsa(`undo!:${ap.id}`));
  assert.match(t2, /saldo inicial no se deshace/i);
});

// ---------------------------------------------------------------- 7. metas

test('«deshacer» tras apartar para una meta avisa de la meta y no anula otro movimiento', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  await bot.di('meta moto 2000000');
  const r = await bot.di('ahorré 50000 para moto');
  assert.ok(ids(r).some(i => i.startsWith('undometa:')), 'la respuesta trae «Deshacer aporte»');
  const aviso = await bot.di('deshacer');
  assert.match(textoDe(aviso), /último comando fue de una meta/);
  assert.equal((await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length, 1, 'el mecato sigue');
  const boton = ids(aviso).find(i => i.startsWith('undometa:'))!;
  const hecho = await bot.pulsa(boton);
  assert.match(textoDe(hecho), /Quité|Deshice/);
  const metas = JSON.parse((await bot.repo.cargar()).config.metas);
  assert.equal(metas[0].apartado, 0);
  // y ahora «deshacer» vuelve a anular el mecato
  assert.match(textoDe(await bot.di('deshacer')), /Anulado: /);
});

test('el botón «Deshacer aporte» revierte solo ese aporte y solo una vez', async () => {
  const bot = nuevoBot();
  await bot.di('meta moto 2000000');
  await bot.di('ahorré 30000 para moto');
  const r = await bot.di('ahorré 50000 para moto');
  const boton = ids(r).find(i => i.startsWith('undometa:'))!;
  await bot.pulsa(boton);
  assert.equal(JSON.parse((await bot.repo.cargar()).config.metas)[0].apartado, 30000);
  assert.match(textoDe(await bot.pulsa(boton)), /ya no/i);
  assert.equal(JSON.parse((await bot.repo.cargar()).config.metas)[0].apartado, 30000);
});

test('apartar más de lo que hay libre pide confirmación', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'apertura efectivo 100000');
  await bot.di('meta moto 2000000');
  const r = await bot.di('ahorré 150000 para moto');
  assert.match(textoDe(r), /más de lo que tienes libre/);
  assert.equal(JSON.parse((await bot.repo.cargar()).config.metas)[0].apartado, 0, 'todavía no aparta nada');
  const igual = ids(r).find(i => i.startsWith('metaok:'))!;
  await bot.pulsa(igual);
  assert.equal(JSON.parse((await bot.repo.cargar()).config.metas)[0].apartado, 150000);
});

// ---------------------------------------------------------------- 8. editar con reemplazo

test('si guardar el movimiento nuevo falla, el original sigue vivo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  const original = (await bot.repo.cargar()).movimientos[0];
  await bot.pulsa(`edit:${original.id}`);
  await bot.di('monto 6000');
  bot.repo.guardarMovimiento = async () => { throw new Error('sin conexión'); };
  await assert.rejects(bot.pulsa('ok'));
  assert.equal((await bot.repo.cargar()).movimientos.find(m => m.id === original.id)!.estado, 'ok');
});

test('deshacer tras editar devuelve el original', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  const original = (await bot.repo.cargar()).movimientos[0];
  await bot.pulsa(`edit:${original.id}`);
  await bot.di('monto 6000');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'cat:mecato'), 6000);
  const t = textoDe(await bot.di('deshacer'));
  assert.match(t, /original/);
  const d = await bot.repo.cargar();
  assert.equal(d.movimientos.find(m => m.id === original.id)!.estado, 'ok');
  assert.equal(d.movimientos.filter(m => m.estado === 'ok').length, 1);
  assert.equal(await saldo(bot, 'cat:mecato'), 5000);
});
