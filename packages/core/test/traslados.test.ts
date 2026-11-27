import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { dinero } from '../src/semilla.ts';

function conBancos() {
  const b = nuevoBot();
  const d = b.repo.datos;
  for (const n of ['Bancolombia', 'Davivienda']) d.cuentas.push(dinero(n.toLowerCase(), n, 'COP', true));
  d.config.alias_cuentas = JSON.stringify({ bancolombia: ['bancolombia'], davivienda: ['davivienda'] });
  return b;
}

test('traslados: entre cuentas propias es una transferencia, no un gasto', async () => {
  const t = textoDe(await conBancos().di('Me mandé 80 lucas de Bancolombia pa Nequi'));
  assert.match(t, /Transferencia · \$80\.000 · Bancolombia → Nequi/);
});

test('traslados: «bueno, eran 105k» manda el último monto', async () => {
  const t = textoDe(await conBancos().di('Pasé 150k de Nequi a Bancolombia, bueno, eran 105k'));
  assert.match(t, /Transferencia · \$105\.000 · Nequi → Bancolombia/);
});

test('traslados: lo programado o rechazado no se anota', async () => {
  const b = conBancos();
  assert.match(textoDe(await b.di('Intenté pasar 80k a Nequi, pero la transacción salió rechazada')), /no lo anoté/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('traslados: un retiro con comisión son dos movimientos y la comisión es gasto del banco', async () => {
  const t = textoDe(await conBancos().di('Saqué 100 mil de Bancolombia y me cobraron 4 mil por usar el cajero'));
  assert.match(t, /Movimiento 1 de 2/);
  assert.match(t, /Transferencia · \$100\.000 · Bancolombia → Efectivo/);
});

test('traslados: el 4x1000 sin valor se pregunta, no se calcula', async () => {
  const t = textoDe(await conBancos().di('Retiré 250k de Bancolombia y me descontaron el cuatro por mil'));
  assert.match(t, /¿Cuánto te descontó el banco/);
});

test('traslados: sin decir las cuentas, pregunta', async () => {
  const t = textoDe(await conBancos().di('Me pasé 35 mil entre mis cuentas, no me cobraron nada'));
  assert.match(t, /¿De qué cuenta a cuál/);
});

test('traslados: un envío a otra persona nunca es un traslado propio', async () => {
  const t = textoDe(await conBancos().di('Le mandé 70k a Jorge a su Nequi, eso no es mío'));
  assert.doesNotMatch(t, /Transferencia ·/);
});

test('tarjeta: con la persona Tarjeta, la compra es deuda y el abono la paga', async () => {
  const b = nuevoBot();
  b.repo.datos.cuentas.push({ id: 'p:tarjeta', nombre: 'Tarjeta', clave: 'tarjeta', tipo: 'persona', moneda: 'COP', grupo: 'empresa' });
  let s = textoDe(await b.di('Compré unos audífonos de 240k a 3 cuotas con la tarjeta de crédito'));
  assert.match(s, /Deuda · le debes a Tarjeta · \$240\.000/);
  await b.pulsa('ok');
  s = textoDe(await b.di('Aboné 150k a la tarjeta desde Nequi'));
  assert.match(s, /Pago|Abono|le pagas a Tarjeta/i);
  assert.match(s, /\$150\.000/);
});

test('tarjeta: sin la persona Tarjeta, nada cambia', async () => {
  const t = textoDe(await nuevoBot().di('Compré unos audífonos de 240k con la tarjeta de crédito'));
  assert.doesNotMatch(t, /le debes a Tarjeta/);
});
