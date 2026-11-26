/**
 * Hipotéticos, dudas, autocorrecciones y netos (ver incertidumbre.ts). Lo que no pasó o no se sabe no saca tarjeta;
 * lo que se corrige en la misma frase se anota ya corregido.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { incertidumbre } from '../src/incertidumbre.ts';

const tarjeta = (t: string): string | null => /Entendí:\n([^\n]+)/.exec(t)?.[1] ?? null;

async function responde(frase: string): Promise<{ texto: string; carta: string | null; botones: string[] }> {
  const s = await nuevoBot().di(frase);
  const texto = textoDe(s);
  return { texto, carta: tarjeta(texto), botones: s.flatMap(x => x.botones ?? []).map(b => b.id) };
}

for (const frase of [
  'iba a gastar 50k pero no fui',
  'pensaba comprar unos tenis de 200 mil',
  'queria pagar 30k de luz pero no alcance',
  'mañana voy a pagar 20k a juan',
  'si me pagan los 100k compro el regalo',
  'me ingresan 500 mil el viernes pero todavia no llegan',
  'no me acuerdo si le di 30k a Luis',
  'me cobraron de más 15 mil pero no me han devuelto nada',
]) {
  test(`no anota nada: «${frase}»`, async () => {
    const r = await responde(frase);
    assert.equal(r.carta, null, r.texto);
    assert.match(r.texto, /no anot[eé] nada/i);
  });
}

for (const [frase, monto, cat] of [
  ['parce gaste 20k no 2k en comida', '$20.000', 'Comida'],
  ['gaste 20k, no, 2k en comida', '$20.000', 'Comida'],
  ['pague 30 y me devolvieron 10 de vueltas', '$20.000', ''],
  ['pague 30.000 y me hicieron descuento de 5.000', '$25.000', ''],
  ['pague 50k y me hicieron un descuento de 10k', '$40.000', ''],
  ['no me acuerdo si gaste 15 o 20 pero anota 15k', '$15.000', ''],
  ['no no fueron 50 fueron 15 mil de taxi', '$15.000', 'Transporte'],
] as const) {
  test(`anota lo corregido: «${frase}»`, async () => {
    const r = await responde(frase);
    assert.ok(r.carta, r.texto);
    assert.match(r.carta, /^Gasto/);
    assert.ok(r.carta.includes(monto), r.carta);
    if (cat) assert.ok(r.carta.includes(cat), r.carta);
  });
}

test('pagar y que devuelvan lo mismo da cero: no hay tarjeta', async () => {
  const r = await responde('pague 10000 y luego me devolvieron los mismos 10000');
  assert.equal(r.carta, null, r.texto);
  assert.match(r.texto, /cero/);
});

test('un pago con lo que se debía pregunta cuál fue el pago, con botones', async () => {
  const r = await responde('le pague 80k a faber y solo le debia 50k');
  assert.equal(r.carta, null, r.texto);
  assert.match(r.texto, /80\.000 y 50\.000/);
  assert.equal(r.botones.length >= 2, true, r.botones.join());
  const res = incertidumbre('faber me pago 80k pero yo le debia 50k');
  assert.equal(res?.clase, 'pregunta');
  if (res?.clase === 'pregunta') assert.deepEqual(res.opciones.map(o => o.frase), ['faber me pago 80k', 'faber me pago 50k']);
});

test('un rango dudoso pregunta cuál de los dos fue, sin escoger', async () => {
  const r = await responde('hoy gaste como 10 o 12 en mecato no se');
  assert.equal(r.carta, null, r.texto);
  assert.match(r.texto, /¿Fueron 10\.000 o 12\.000\?/);
  const res = incertidumbre('hoy gaste como 10 o 12 en mecato no se');
  if (res?.clase === 'pregunta') assert.deepEqual(res.opciones.map(o => o.frase), ['hoy gaste 10000 en mecato', 'hoy gaste 12000 en mecato']);
  else assert.fail('no preguntó');
});

test('sin monto pregunta cuánto fue, y un monto de cero no saca tarjeta', async () => {
  const r = await responde('mi mama me dio plata pero no se cuanto');
  assert.equal(r.carta, null, r.texto);
  assert.match(r.texto, /¿Cuánto fue\?/);
  const cero = await responde('gaste 0');
  assert.equal(cero.carta, null, cero.texto);
  assert.match(cero.texto, /mayor que cero/);
});

test('lo que ya funcionaba sigue igual', async () => {
  assert.equal(incertidumbre('gaste 5000 y no gaste 7000'), null);
  assert.equal(incertidumbre('me van a pagar 50k'), null);
  assert.equal(incertidumbre('voy a medias con Ana, 40k'), null);
  assert.equal(incertidumbre('pague con 50k y me devolvieron 20k'), null);
  assert.equal(incertidumbre('me devolvieron quince mil quinientos de una compra que hice'), null);
  const r = await responde('gaste 5000 y no gaste 7000');
  assert.ok(r.carta?.includes('$5.000'), r.texto);
});
