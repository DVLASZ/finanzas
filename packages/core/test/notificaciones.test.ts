/** Alertas del banco pegadas: se leen con reglas y pasan por la tarjeta de confirmación. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, deLocal, leerNotificacion, MemoriaRepo } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function ctx() {
  const r = new MemoriaRepo();
  return contextoDe(await r.cargar(), AHORA);
}

test('Nequi: pagaste en un comercio, con saldo y todo', async () => {
  const n = leerNotificacion('Nequi: Pagaste $15.000 en TIENDA DON PEPE. Tu saldo disponible es $85.000.', await ctx());
  assert.ok(n);
  assert.equal(n.tipo, 'gasto');
  assert.equal(n.monto, 15000, 'toma el primer monto, no el saldo');
  assert.equal(n.quien, 'Tienda Don Pepe');
  assert.equal(n.cuenta, 'nequi');
  assert.match(n.frase, /^tienda don pepe 15000 nequi/);
});

test('Nequi: recibiste plata de alguien', async () => {
  const n = leerNotificacion('Recibiste $80.000 de Juan Perez en Nequi', await ctx());
  assert.ok(n);
  assert.equal(n.tipo, 'ingreso');
  assert.equal(n.monto, 80000);
  assert.equal(n.quien, 'Juan Perez');
  assert.match(n.frase, /^ingreso 80000 nequi juan perez/);
});

test('Bancolombia: compra con tarjeta, con hora y fecha', async () => {
  const n = leerNotificacion('Bancolombia le informa Compra por $45.900 en D1 TIENDAS 14:32. T.Cred *1234 el 16/11/2026', await ctx());
  assert.ok(n);
  assert.equal(n.tipo, 'gasto');
  assert.equal(n.monto, 45900);
  assert.equal(n.hora, '2:32 pm');
  assert.equal(n.fecha, '16/11');
  assert.equal(n.banco, 'bancolombia');
  assert.match(n.resumen, /no encontré esa cuenta|Bancolombia/, 'avisa si la app no tiene esa cuenta');
});

test('Banco de Bogotá: transferencia recibida y compra aprobada', async () => {
  const a = leerNotificacion('Banco de Bogota: Transferencia recibida por $300.000 el 19/10/2026 09:15', await ctx());
  assert.ok(a);
  assert.equal(a.tipo, 'ingreso');
  assert.equal(a.monto, 300000);
  assert.equal(a.hora, '9:15 am');
  assert.equal(a.fecha, undefined, 'el 19/10 es hoy: no hace falta decirlo');
  const b = leerNotificacion('Banco de Bogota: Compra aprobada por $32.000 en EXITO el 19/10/2026 18:45', await ctx());
  assert.ok(b);
  assert.equal(b.tipo, 'gasto');
  assert.equal(b.quien, 'Exito');
  assert.equal(b.hora, '6:45 pm');
});

test('lo que no es una alerta de plata no se inventa', async () => {
  const c = await ctx();
  assert.equal(leerNotificacion('hola, cómo vas', c), null);
  assert.equal(leerNotificacion('Tu código de verificación es 482913', c), null);
  assert.equal(leerNotificacion('Promoción: llévate 2x1 en pizzas $15.000', c), null, 'sin verbo de movimiento');
});

test('la frase armada pasa por la tarjeta y se guarda como cualquier mensaje', async () => {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 100000 nequi 100000', antes); await bot.pulsa('ok', antes);
  const n = leerNotificacion('Nequi: Pagaste $15.000 en TIENDA DON PEPE. Tu saldo disponible es $85.000.', contextoDe(await bot.repo.cargar(), AHORA));
  assert.ok(n);
  const s = textoDe(await bot.di(n.frase, AHORA));
  assert.match(s, /\$15\.000/);
  assert.match(s, /Nequi/);
});
