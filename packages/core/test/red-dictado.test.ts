import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dudaDeDictado, limpiarDictado } from '../src/dictado.ts';

test('quita la muletilla del comienzo y arregla «de el»', () => {
  assert.equal(limpiarDictado('eeeh pues anota 16 mil de pan'), 'anota 16 mil de pan');
  assert.equal(limpiarDictado('pague 5000 de el recibo'), 'pague 5000 del recibo');
});

test('el monto dicho en cifra y en letras cuenta una vez', () => {
  assert.equal(limpiarDictado('pagué 25.000 veinticinco mil de agua'), 'pagué 25.000 de agua');
});

test('un teléfono dictado no queda en la frase', () => {
  assert.equal(limpiarDictado('le consigne a juan al 300' + '1234567 cincuenta mil'), 'le consigne a juan 50000');
});

test('la última corrección dictada reemplaza el monto', () => {
  assert.equal(limpiarDictado('pague 50 mil de internet no espere fueron 55 mil'), 'pague 55 mil de internet');
});

test('manda el último nombre dictado', () => {
  assert.equal(limpiarDictado('le di 40 mil a mateo digo a marta para el almuerzo'), 'le di 40 mil a marta para el almuerzo');
});

test('dos montos con «de» se parten y el segundo hereda el mil', () => {
  assert.equal(limpiarDictado('anota 18 mil de almuerzo y treinta y cinco de gasolina'), 'anota 18 mil de almuerzo; anota 35000 de gasolina');
  assert.equal(limpiarDictado('compre tres mil de pan y dos mil de queso'), 'compre 3000 de pan; compre 2000 de queso');
});

test('el día en letras antes del mes pasa a número', () => {
  assert.equal(limpiarDictado('el quince de noviembre pague 5000'), 'el 15 de noviembre pague 5000');
});

test('lo ambiguo se pregunta', () => {
  assert.equal(dudaDeDictado('siento 20000 de mercado')?.clase, 'pregunta');
  assert.equal(dudaDeDictado('dos de 20000 de arroz')?.clase, 'pregunta');
  assert.equal(dudaDeDictado('debe haber 70000 en nequi')?.clase, 'pregunta');
  assert.equal(dudaDeDictado('almuerzo 12000'), null);
});
