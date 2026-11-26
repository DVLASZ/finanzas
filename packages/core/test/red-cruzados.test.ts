import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cruzado, vencimientoDePrestamo } from '../src/cruzados.ts';

// lunes 19 de octubre de 2026, 3:42 pm en Colombia
const AHORA = new Date('2026-10-19T20:42:00Z');

test('el vencimiento de un préstamo sale de la frase y deja el nombre limpio', () => {
  assert.deepEqual(vencimientoDePrestamo('le presté 90k a Pipe hasta el viernes', AHORA), { fecha: '2026-10-23', resto: 'le presté 90k a Pipe' });
  assert.equal(vencimientoDePrestamo('le preste a juan 80000 me los paga el quince', AHORA)?.fecha, '2026-11-15');
  assert.equal(vencimientoDePrestamo('le presté 50k a Ana me lo devuelve el 10 de diciembre', AHORA)?.fecha, '2026-12-10');
  assert.equal(vencimientoDePrestamo('le presté 50k a Ana hasta el lunes', AHORA)?.fecha, '2026-10-26');
});

test('sin préstamo o sin fecha no hay vencimiento', () => {
  assert.equal(vencimientoDePrestamo('Luis me prestó 50k hasta el viernes', AHORA), null);
  assert.equal(vencimientoDePrestamo('le presté 50k a Ana', AHORA), null);
});

test('perdonar, intereses y pesos contra dólares se preguntan', () => {
  assert.ok(cruzado('perdónale los 15k que me debía Pedro')?.pregunta);
  assert.ok(cruzado('de los 80 mil que me debe Felipe le perdono 20')?.pregunta);
  assert.ok(cruzado('me debía 100k y me pagó 110k porque acordamos 10 de interés')?.pregunta?.mensaje.includes('$10.000'));
  assert.ok(cruzado('le presté 100 dólares a Andrés y me devolvió 200 mil pesos')?.pregunta);
});

test('un abono dicho junto con la deuda es un pago a esa persona', () => {
  assert.equal(cruzado('le debía 200 mil a Diana y le pasé 75 hoy')?.texto, 'pagué 75000 a diana hoy');
  assert.equal(cruzado('entre mi hermana y yo debíamos 120k de la luz yo pagué 90')?.texto, 'luz 90000');
  assert.equal(cruzado('almuerzo 12000'), null);
});
