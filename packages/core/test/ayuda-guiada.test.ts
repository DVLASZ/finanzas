import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayudaGuiada, contextoDe, interpretar, MemoriaRepo } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

const ctx = contextoDe(new MemoriaRepo().datos, AHORA);

const DUDAS: [string, string][] = [
  ['cómo anoto que presté plata', 'Préstamo'],
  ['me fiaron en la tienda', 'Deuda'],
  ['salí con amigos y dividimos la cuenta', 'Compartido'],
  ['saqué plata del cajero', 'Cajero'],
  ['quiero pasar plata de una cuenta a otra', 'Pasar plata'],
  ['me llegó la quincena', 'Ingreso'],
  ['quiero ahorrar para una moto', 'Meta'],
  ['pago el internet cada mes', 'Pago fijo'],
  ['me equivoqué con el monto', 'Corregir'],
  ['cuánto tengo', 'Saldos'],
  ['compré un almuerzo', 'Gasto'],
];

for (const [duda, tema] of DUDAS) {
  test(`ayuda guiada: «${duda}» da el tema ${tema}`, () => {
    assert.equal(ayudaGuiada(duda, ctx)?.tema, tema);
  });
}

test('ayuda guiada: lo que no se reconoce da null', () => {
  assert.equal(ayudaGuiada('hola', ctx), null);
  assert.equal(ayudaGuiada('', ctx), null);
});

test('ayuda guiada: cada ejemplo que da es una frase que el bot entiende', () => {
  for (const [duda] of DUDAS) {
    const r = ayudaGuiada(duda, ctx);
    assert.ok(r, duda);
    assert.notEqual(interpretar(r.ejemplo, ctx).clase, 'error', `${duda} -> «${r.ejemplo}»`);
  }
});
