import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, MemoriaRepo, normalizarMovil } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

function ctxCon(...personas: string[]) {
  const r = new MemoriaRepo();
  for (const n of personas) r.datos.cuentas.push({ id: 'per:' + n.toLowerCase(), nombre: n, clave: n.toLowerCase(), tipo: 'persona', moneda: 'COP', grupo: 'amigos' });
  return contextoDe(r.datos, AHORA);
}
const ctx = ctxCon('Jorge', 'Laura', 'Alejandro');
const lee = (t: string) => normalizarMovil(t, ctx).texto;

test('palabras pegadas: verbo, número y unidad se separan', () => {
  assert.equal(lee('gaste15mil en almuerzo'), 'gaste 15 mil en almuerzo');
  assert.equal(lee('nequi50mil a Jorge'), 'nequi 50 mil a Jorge');
  assert.equal(lee('compre2cafesde3mil'), 'compre 2 cafes de 3 mil');
  assert.equal(lee('Jorgemedebe60mil'), 'Jorge me debe 60 mil');
  assert.equal(lee('almuerzo18k taxi9k'), 'almuerzo 18k taxi 9k');
  assert.equal(lee('20kcomida'), '20k comida');
});

test('no toca lo que no es un mensaje corto de plata: referencias, códigos y alertas de varias líneas', () => {
  assert.equal(lee('ref12345abc'), 'ref12345abc');
  assert.equal(lee('iphone15 usado'), 'iphone15 usado');
  const alerta = 'Bancolombia: compra por $35.000\nRef123456kabc';
  assert.equal(lee(alerta), alerta);
});

test('correcciones seguras de palabras que no existen', () => {
  assert.equal(lee('pague el resivo de la lus por 85 mil'), 'pague el recibo de la luz por 85 mil');
  assert.equal(lee('compre droga en la farmasia'), 'compre droga en la farmacia');
  assert.equal(lee('me yego una tranferencia'), 'me llego una transferencia');
  assert.equal(lee('gaste 65 mil en marcado'), 'gaste 65 mil en mercado');
});

test('«playa» nunca se cambia por «plata»', () => {
  for (const f of ['gasté 80 mil en la playa', 'pague 35 mil por un almuerzo en la playa']) {
    const r = normalizarMovil(f, ctx);
    assert.equal(r.texto, f);
    assert.equal(r.pregunta, undefined);
  }
});

test('lo dudoso se pregunta y no se adivina', () => {
  for (const f of ['gaste 25 mkl en comida', 'gaste 32 mil en mecsto', 'compre un televisor a 6 quitas de 150 mil', 'me giraron una playa de 50k', 'me gaste 50 mil en una playa de comida']) {
    assert.ok(normalizarMovil(f, ctx).pregunta, f);
  }
  const q = normalizarMovil('compre un televisor a 6 quitas de 150 mil', ctx).pregunta!;
  assert.match(q.mensaje, /900\.000/);
  assert.match(q.opciones[0].frase, /900000/);
});

test('plata que llegó para guardar se anota como lo que se le debe a quien la dejó', () => {
  assert.equal(lee('Mamá me mando 200 mil pa que se los guarde').toLowerCase(), 'me presto mamá 200 mil');
  assert.match(lee('Mamá me giro 100 mil pa guardar, despues gaste 20 mil en la playa'), /^me presto Mamá 100 mil, despues gaste 20 mil en la playa$/);
});

test('«2 millones 300» son 2.300.000', () => {
  assert.equal(lee('me consignaron la nomina de 2 millones 300'), 'me consignaron la nomina de 2300000');
  assert.equal(lee('compre algo de 2 millones 300 mil'), 'compre algo de 2300000');
});
