import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

function conGente() {
  const b = nuevoBot();
  for (const n of ['Tarjeta', 'Alejandro', 'Daniel', 'Paula', 'Laura']) {
    b.repo.datos.cuentas.push({ id: 'p:' + n.toLowerCase(), nombre: n, clave: n.toLowerCase(), tipo: 'persona', moneda: 'COP', grupo: 'amigos' });
  }
  return b;
}

test('cola: corregir por el monto o por el concepto («los 22 eran de comida», «el tinto era de 3 mil, no de 8»)', async () => {
  const b = nuevoBot();
  await b.di('Registra 25 mil de almuerzo, 8 mil de tinto y 10 mil de bus.');
  assert.match(textoDe(await b.di('El tinto era de 3 mil, no de 8.')), /3000/);
  assert.match(textoDe(await b.di('Borra el bus, ese lo pagó Laura.')), /Quité 1/);
});

test('cola: «los 22» es un monto y no «los 22 movimientos»', async () => {
  const b = nuevoBot();
  await b.di('Pagué 40 mil en una farmacia y 22 mil en una tienda.');
  const t = textoDe(await b.di('Los 22 eran de comida, no de tienda.'));
  assert.doesNotMatch(t, /cambié 1 de 2/);
});

test('totales con lo que está sin confirmar: se dice que todavía no cuenta', async () => {
  const b = nuevoBot();
  await b.di('almuerzo 12000');
  assert.match(textoDe(await b.di('¿Cuánto gasté hoy?')), /sin confirmar/);
});

test('una frase con varias operaciones enredadas se propone por separado con un botón', async () => {
  const s = await nuevoBot().di('Saqué 200k del cajero con 4k de comisión, pagué 60k del almuerzo entre David, Laura y yo, y Laura me pasó su parte por Nequi');
  assert.match(textoDe(s), /¿Las anoto por separado así\?/);
  assert.ok(s.flatMap(x => x.botones ?? []).length >= 2);
});

test('una cuenta seguida de una pregunta: primero se anota lo que pasó', async () => {
  assert.match(textoDe(await nuevoBot().di('Jorge me debía 200 mil, me pagó 80 por transferencia, yo le debía 50 y hoy le mandé esos 50. ¿Cuánto me debe?')), /¿Anoto primero lo que pasó\?/);
});

test('tarjeta: la compra, el abono y el interés son tres movimientos', async () => {
  const t = textoDe(await conGente().di('Compré un celular de 900 mil con tarjeta, pagué 300 mil de la tarjeta desde Bancolombia y me cobraron 18 mil de interés'));
  assert.match(t, /Movimiento 1 de 3/);
});

test('asociación: cuota y multa que se debían y el abono de hoy; la cena entre tres y lo que ya pagó uno', async () => {
  const b = conGente();
  assert.match(textoDe(await b.di('Alejandro debía 40 mil de cuota y 10 de multa; pagó 30 hoy y quedó en pasar 20 mañana')), /Movimiento 1 de 3/);
  const t = textoDe(await conGente().di('Pagué 150 mil de una cena con Daniel y Paula, éramos tres; Daniel me mandó 50 por Nequi y Paula todavía no'));
  assert.match(t, /Tu parte: \$50\.000/);
  assert.match(t, /Movimiento 1 de 2/);
});

test('el pago con billete y el cambio de una compra no son movimientos aparte', async () => {
  const t = textoDe(await nuevoBot().di('Compré mercado por 78 mil, pagué con 100 mil en efectivo, me dieron 22 mil, y luego compré pan por 6 mil'));
  assert.match(t, /Movimiento 1 de 2/);
});
