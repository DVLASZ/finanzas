import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esDudaDeUso } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

test('una duda de uso con montos explica y no saca tarjeta ni cambia nada', async () => {
  const b = nuevoBot();
  for (const duda of ['Anoté 80 mil pero eran 18 mil cómo lo arreglo', 'Cómo le subo el límite a mercado de 400 a 500 mil', 'Cómo registro un celular que compré a 12 cuotas con tarjeta']) {
    const s = await b.di(duda);
    assert.equal(s.some(x => (x.botones ?? []).some(y => y.id === 'si')), false, duda);
    assert.match(textoDe(s), /Toca un ejemplo|[Ee]dit|tope|cuotas/, duda);
  }
  assert.equal(b.repo.datos.movimientos.length, 0);
  assert.deepEqual(b.repo.datos.presupuestos, {});
});

test('lo dicho como siempre no es una duda de uso', () => {
  for (const frase of ['almuerzo 12000 como siempre', 'pagué 50 mil como quedamos', 'taxi 8000']) assert.equal(esDudaDeUso(frase), false, frase);
  for (const duda of ['cómo lo anoto', 'dónde veo cuánto le debo a Laura', 'puedo pegar el mensaje del banco', 'si me llegó una factura todavía no pagada la registro']) assert.equal(esDudaDeUso(duda), true, duda);
});

test('la custodia se explica como deuda con quien dejó la plata y no como ingreso', async () => {
  const t = textoDe(await nuevoBot().di('Cómo anoto una plata que me dieron pa guardársela a mi hermana'));
  assert.match(t, /custodia/);
  assert.match(t, /no la anotes como ingreso/);
});
