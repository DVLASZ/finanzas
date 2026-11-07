import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hallarFecha, hallarMontos, limpiar, formatear, aLocal, rangoPeriodo, distancia, normalizar } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

const valores = (t: string) => hallarMontos(limpiar(t)).map(m => m.valor);

test('montos: formatos habituales', () => {
  assert.deepEqual(valores('mecato 5000'), [5000]);
  assert.deepEqual(valores('5000 mecato'), [5000]);
  assert.deepEqual(valores('pizza 36k'), [36000]);
  assert.deepEqual(valores('pizza 36 mil'), [36000]);
  assert.deepEqual(valores('$5.000'), [5000]);
  assert.deepEqual(valores('1.5k'), [1500]);
  assert.deepEqual(valores('2 lucas'), [2000]);
  assert.deepEqual(valores('1.250.000'), [1250000]);
});

test('montos: detecta moneda y devoluciones', () => {
  const [m] = hallarMontos(limpiar('8 usd'));
  assert.equal(m.moneda, 'USD');
  assert.equal(m.explicito, true);
  const ms = hallarMontos(limpiar('+mama 100k -30k'));
  assert.deepEqual(ms.map(x => [x.valor, x.negativo]), [[100000, false], [30000, true]]);
});

test('montos: un número pequeño suelto no es plata explícita', () => {
  const [m] = hallarMontos(limpiar('3 empanadas 8000'));
  assert.equal(m.explicito, false);
});

test('formato de pesos y dólares', () => {
  assert.equal(formatear(5000), '$5.000');
  assert.equal(formatear(1250000), '$1.250.000');
  assert.equal(formatear(-300), '-$300');
  assert.equal(formatear(800, 'USD'), 'US$8,00');
  assert.equal(formatear(250, 'USD'), 'US$2,50');
});

test('fechas: la hora local es la de Colombia', () => {
  assert.equal(aLocal(AHORA), '2026-10-19 15:42:00');
});

test('fechas: ayer, el lunes, hace N días, dd/mm', () => {
  assert.equal(hallarFecha('ayer pizza', AHORA).fecha.slice(0, 10), '2026-10-18');
  assert.equal(hallarFecha('anteayer pizza', AHORA).fecha.slice(0, 10), '2026-10-17');
  assert.equal(hallarFecha('pizza el viernes', AHORA).fecha.slice(0, 10), '2026-10-16');
  assert.equal(hallarFecha('pizza hace 3 dias', AHORA).fecha.slice(0, 10), '2026-10-16');
  assert.equal(hallarFecha('pizza 15/10', AHORA).fecha.slice(0, 10), '2026-10-15');
  assert.equal(hallarFecha('pizza el 2 de octubre', AHORA).fecha.slice(0, 10), '2026-10-02');
  // sin fecha: es ahora
  const r = hallarFecha('pizza', AHORA);
  assert.equal(r.fecha, '2026-10-19 15:42:00');
  assert.equal(r.explicita, false);
});

test('fechas: la hora se conserva o se indica', () => {
  assert.equal(hallarFecha('ayer', AHORA).fecha, '2026-10-18 15:42:00');
  assert.equal(hallarFecha('ayer a las 3pm', AHORA).fecha, '2026-10-18 15:00:00');
  // la hora sin "a las" y sin quedarse en el texto
  const h = hallarFecha('carro de casa a terminal 8000 ayer 4 pm', AHORA);
  assert.equal(h.fecha, '2026-10-18 16:00:00');
  assert.equal(h.resto, 'carro de casa a terminal 8000');
  assert.equal(hallarFecha('almuerzo 12000 4:30pm', AHORA).fecha.slice(11), '16:30:00');
  assert.equal(hallarFecha('pasaje 2000 a las 4', AHORA).fecha.slice(11), '16:00:00');
});

test('periodos: semana empieza el lunes, mes y año', () => {
  assert.deepEqual(rangoPeriodo('semana', AHORA), { desde: '2026-10-19 00:00:00', hasta: '2026-10-26 00:00:00' });
  assert.deepEqual(rangoPeriodo('mes', AHORA), { desde: '2026-10-01 00:00:00', hasta: '2026-11-01 00:00:00' });
  assert.deepEqual(rangoPeriodo('anio', AHORA), { desde: '2026-01-01 00:00:00', hasta: '2027-01-01 00:00:00' });
});

test('texto: normalizar y distancia', () => {
  assert.equal(normalizar('Mamá  Luz'), 'mama luz');
  assert.equal(distancia('nequi', 'nekui'), 1);
});

test('rangoPeriodo: un mes y una semana atrás caen en el periodo anterior, sin saltos', () => {
  const hoy = new Date('2026-11-01T15:00:00Z'); // domingo 1 de noviembre en Colombia
  assert.equal(rangoPeriodo('mes', hoy).desde, '2026-11-01 00:00:00');
  const mesPasado = new Date(hoy); mesPasado.setMonth(mesPasado.getMonth() - 1, 15);
  assert.equal(rangoPeriodo('mes', mesPasado).desde, '2026-10-01 00:00:00');
  assert.equal(rangoPeriodo('mes', mesPasado).hasta, '2026-11-01 00:00:00');
  const semanaPasada = new Date(hoy.getTime() - 7 * 86_400_000);
  assert.equal(rangoPeriodo('semana', semanaPasada).desde, '2026-10-19 00:00:00');
});
