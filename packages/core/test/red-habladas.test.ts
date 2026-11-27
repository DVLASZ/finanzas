import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hablada } from '../src/habladas.ts';

test('quien pagó es el acreedor y la cuota sale de la mitad, de las partes o de lo que se dice', () => {
  assert.equal(hablada('El queso costó 10k, lo pagó Faber y yo le debo la mitad')?.texto, 'le debo 5000 a Faber por queso');
  assert.equal(hablada('Alejandro pidió la pizza de 42k entre tres, le debo mi parte')?.texto, 'le debo 14000 a Alejandro por pizza');
  assert.equal(hablada('David puso 60k para el Airbnb, yo voy con 20')?.texto, 'le debo 20000 a David');
  assert.equal(hablada('Andree pagó el taxi de vuelta, éramos cuatro y salieron 32k')?.texto, 'le debo 8000 a Andree por taxi');
});

test('si pagaste tú, los demás quedan como compartido', () => {
  assert.equal(hablada('Pagué 40 mil de la reserva y Andree me tiene que devolver la mitad')?.texto, 'reserva 40000 entre Andree y yo');
  assert.match(hablada('Compré las boletas de los cuatro por 80k, cada uno me tiene que dar 20k')?.pregunta?.mensaje ?? '', /Quiénes son/);
});

test('perdonar, cuadrar y pagar de más no se anotan como gasto', () => {
  assert.match(hablada('Perdóname los 2k del pasaje que me debías')?.pregunta?.mensaje ?? '', /no mueve plata/);
  assert.equal(hablada('Laura me debía 18k, me dio 10 en efectivo y quedamos en que después me pasa los otros 8')?.texto, 'laura me pagó 10000 efectivo');
  assert.equal(hablada('Ya le pasé por Nequi los 5k del queso a Faber')?.texto, 'pagué 5000 a faber nequi');
});

test('una frase normal no se toca', () => {
  assert.equal(hablada('almuerzo 12000 nequi'), null);
  assert.equal(hablada('mercado 45000 con nequi'), null);
});
