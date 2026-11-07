/** Dictado por voz: números en palabras, cuentas mal oídas y que el bot entienda lo dictado. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizarDictado } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const casos: [string, string][] = [
  ['mecato cinco mil', 'mecato 5000'],
  ['mecato cinco mil quinientos', 'mecato 5500'],
  ['almuerzo doce mil', 'almuerzo 12000'],
  ['almuerzo doce mil quinientos', 'almuerzo 12500'],
  ['taxi ocho mil', 'taxi 8000'],
  ['mil quinientos', '1500'],
  ['mil', '1000'],
  ['un millón', '1000000'],
  ['dos millones quinientos mil', '2500000'],
  ['ciento veinte mil trescientos', '120300'],
  ['cien mil', '100000'],
  ['ciento cincuenta mil', '150000'],
  ['veinte mil', '20000'],
  ['veintidós mil', '22000'],
  ['treinta y cinco mil', '35000'],
  ['cuarenta y uno', '41'],
  ['novecientos noventa y nueve mil novecientos noventa y nueve', '999999'],
  ['quinientos', '500'],
  ['setecientos cincuenta', '750'],
  ['dos lucas', '2 lucas'],
  ['cinco mil pesos', '5000'],
  ['mecato 5000', 'mecato 5000'],
  ['Mecato, cinco mil.', 'Mecato 5000'],
  ['¿mecato cinco mil?', 'mecato 5000'],
  ['presté a sergio diez mil', 'presté a sergio 10000'],
  ['tres gaseosas a dos mil', '3 gaseosas a 2000'],
  ['metí dos monedas de quinientos y tres de mil a la alcancía', 'metí 2 monedas de 500 y 3 de 1000 a la alcancía'],
  ['pasé veinte mil de efectivo a banco colombia', 'pasé 20000 de efectivo a bancolombia'],
  ['pagué diez mil por davi plata', 'pagué 10000 por daviplata'],
  ['mecato diez mil con neki', 'mecato 10000 con nequi'],
  ['un taxi cinco mil', 'un taxi 5000'],
  ['dos mil y taxi tres mil', '2000 y taxi 3000'],
  ['cinco cinco', '5 5'],
];
for (const [dicho, esperado] of casos) {
  test(`dictado: «${dicho}» pasa a «${esperado}»`, () => assert.equal(normalizarDictado(dicho), esperado));
}

test('dictado: lo vacío o con solo signos queda vacío', () => {
  assert.equal(normalizarDictado(''), '');
  assert.equal(normalizarDictado(' ¿? '), '');
});

test('dictado: lo dictado llega al bot como un movimiento normal', async () => {
  const frases: [string, RegExp][] = [
    ['mecato cinco mil quinientos', /Gasto · Mecato · \$5\.500/],
    ['almuerzo doce mil quinientos con neki', /\$12\.500 · Nequi/],
    ['taxi de terminal a casa ocho mil', /\$8\.000/],
    ['presté a sergio ciento veinte mil', /le prestas a Sergio · \$120\.000/],
    ['ingreso cincuenta mil trabajo', /Ingreso · Trabajo · \$50\.000/],
  ];
  for (const [dicho, esperado] of frases) {
    const t = textoDe(await nuevoBot().di(normalizarDictado(dicho)));
    assert.match(t, esperado, `dictado «${dicho}» pasó a «${normalizarDictado(dicho)}»\n${t}`);
  }
});
