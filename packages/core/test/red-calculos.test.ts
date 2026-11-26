import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcular } from '../src/calculos.ts';

const TOTALES: [string, number][] = [
  ['almuerzo 28000 más 10% de propina', 30800],
  ['compra de 100k con 20% de descuento', 80000],
  ['dos combos de 18500 y domicilio de 4000', 41000],
  ['producto 100k más IVA del 19%', 119000],
  ['la cuenta fue 46k y dejé 5 mil de propina', 51000],
  ['valía 75k y me rebajaron 12 mil', 63000],
  ['tres camisetas a 40k cada una, promoción 3x2', 80000],
  ['el arroz costó 4.800 el kilo y compré 3 kilos', 14400],
  ['la cuenta fue 80k, yo puse 50 y Juan puso 30', 50000],
  ['cuenta 100k entre 3, redondea a pesos', 33334],
  ['compré algo de 90k y me devolvieron el 15%', 76500],
  ['propina del 10% sobre 60k, no sobre el total con domicilio de 8k', 74000],
  ['chaqueta 200k, primero 20% y luego otros 10% sobre el precio rebajado', 144000],
  ['compré algo por 20 dólares y el banco me cobró 82 mil pesos', 82000],
  ['factura 180k, pagué 100k hoy y el resto el viernes', 100000],
  ['comida 52k, servicio 8% y propina adicional de 4k', 60160],
];

for (const [frase, total] of TOTALES) {
  test(`calcular: «${frase}» da ${total}`, () => {
    const r = calcular(frase);
    assert.equal(typeof r, 'string');
    assert.match(r as string, new RegExp(`(?<![\\d.])${total}(?![\\d.])`));
    assert.doesNotMatch(r as string, /%|propina|descuento/i);
  });
}

test('calcular: el IVA incluido no se suma', () => {
  assert.equal(calcular('el almuerzo fue 30k con IVA incluido'), 'el almuerzo fue 30k con IVA incluido');
});

test('calcular: invitar a uno y el interés preguntan', () => {
  for (const f of ['pizza 90k entre cuatro, pero yo invito a uno', 'presté 100k y me devolvieron 110k por el interés']) {
    const r = calcular(f);
    assert.equal(typeof r, 'object');
    assert.equal((r as { clase: string }).clase, 'pregunta');
  }
});

test('calcular: lo que no tiene cuenta compuesta pasa igual', () => {
  for (const f of [
    'almuerzo 12000', 'gasté 20k en mecato', 'pagué 30 y me devolvieron 10', 'pagué 50k entre 4', 'cuenta 100k entre 3',
    '3 polas a 4500 cada una', 'recibí el 10% de interés', 'mercado 80k propina', 'cuota 2 de 12 por 150k', 'compras: arroz 5000, leche 4000',
    'presté 100k a Ana', 'hoy 25/11 gasté 45k en taxi',
  ]) assert.equal(calcular(f), f, f);
});
