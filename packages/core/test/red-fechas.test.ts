/**
 * Fechas relativas, fechas que no se adivinan y pagos que todavía no se hacen (ver fechasRelativas.ts y obligaciones.ts).
 * Reloj: jueves 26 de noviembre de 2026, 3:00 pm en Colombia.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hallarFecha } from '../src/fechas.ts';
import { obligacion } from '../src/obligaciones.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const JUEVES = new Date('2026-11-26T20:00:00Z');
const dia = (t: string, ahora = JUEVES) => hallarFecha(t, ahora).fecha.slice(0, 10);

test('anteanoche, el N del mes pasado y el último día del mes pasado', () => {
  assert.equal(hallarFecha('anteanoche comida 32000', JUEVES).fecha, '2026-11-24 20:00:00');
  assert.equal(dia('el 15 del mes pasado me pagaron 800k'), '2026-10-15');
  assert.equal(dia('el ultimo dia del mes pasado administracion 90k'), '2026-10-31');
  assert.equal(dia('el 15 del mes pasado', new Date('2026-01-10T20:00:00Z')), '2025-12-15', 'en enero el mes pasado es diciembre del año anterior');
  assert.equal(hallarFecha('el 15 del mes pasado algo', JUEVES).resto, 'algo', 'la frase de fecha sale del concepto');
  assert.equal(dia('el 31 del mes pasado'), '2026-10-31');
});

test('el 31 del mes pasado en un mes de 30 días no existe', () => {
  assert.ok(hallarFecha('el 31 del mes pasado', new Date('2026-10-05T20:00:00Z')).invalida);
});

async function di(frase: string) {
  const s = await nuevoBot(JUEVES).di(frase);
  return { texto: textoDe(s), botones: s.flatMap(x => x.botones ?? []).map(b => b.id) };
}

test('«el 04/05» lejos de hoy pregunta si es 4 de mayo o 5 de abril', async () => {
  const r = await di('el 04/05 pagué 28 mil de almuerzo');
  assert.doesNotMatch(r.texto, /Entendí/);
  assert.ok(r.botones.some(b => b.includes('4 de mayo')) && r.botones.some(b => b.includes('5 de abril')), r.botones.join());
});

test('una fecha con barra reciente no se pregunta', async () => {
  const r = await di('el 20/11 pagué 28 mil de almuerzo');
  assert.match(r.texto, /Entendí/);
});

test('el fin de semana pasado ofrece sábado o domingo', async () => {
  const r = await di('el fin de semana pasado gasté 120k saliendo');
  assert.doesNotMatch(r.texto, /Entendí/);
  assert.ok(r.botones.some(b => b.includes('21 de noviembre')) && r.botones.some(b => b.includes('22 de noviembre')), r.botones.join());
});

test('la madrugada sin día pregunta de qué noche', async () => {
  const r = await di('a las doce y media de la noche pagué 18k de taxi');
  assert.match(r.texto, /qué noche/);
  assert.match((await di('anoche a las doce y diez pagué 22k de comida')).texto, /Entendí/);
});

test('pagos que todavía no se hacen: no anota y ofrece el pago fijo si sabe el día', () => {
  const p = obligacion('el 10 de diciembre voy a pagar 65k del celular');
  assert.ok(p && p.clase === 'pregunta');
  assert.match(p.mensaje, /no anoté nada/);
  assert.deepEqual(p.opciones.map(o => o.frase), ['cada mes el 10 celular 65k']);
  const q = obligacion('el 20 tenía que pagar 300k de arriendo pero todavía no he pagado');
  assert.ok(q && q.clase === 'pregunta' && /pendiente/.test(q.mensaje));
  assert.deepEqual(q.opciones.map(o => o.frase), ['cada mes el 20 arriendo 300k']);
  const r = obligacion('el otro mes tengo que pagar 110k del seguro');
  assert.ok(r && r.clase === 'pregunta' && r.opciones.length === 0 && /cada mes el 5 seguro 110k/.test(r.mensaje));
  assert.equal(obligacion('pagué 300k de arriendo'), null);
  assert.equal(obligacion('me tocó pagar 20000 a Pedro'), null);
});

test('una obligación no saca tarjeta ni toca el saldo', async () => {
  for (const f of ['para el próximo lunes tengo que pagar 95k', 'la tarjeta vence el 28 y debo 450k', 'el próximo viernes me consignan 1 millón']) {
    const r = await di(f);
    assert.doesNotMatch(r.texto, /Entendí/, f);
  }
});
