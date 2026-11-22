/** Fechas y horas: relativas, sin año, con año, horas con minutos y fecha límite de deudas. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, hallarFecha, hallarFechaLimite, interpretar, MemoriaRepo } from '../src/index.ts';

// Lunes 19 de octubre de 2026, 3:42 pm en Colombia
const LUNES = new Date('2026-10-19T20:42:00Z');
// Sábado 2 de enero de 2027, 12:00 m
const ENERO = new Date('2027-01-02T17:00:00Z');

const dia = (t: string, ahora = LUNES) => hallarFecha(t, ahora).fecha.slice(0, 10);
const hora = (t: string, ahora = LUNES) => hallarFecha(t, ahora).fecha.slice(11, 16);

test('lo que ya funcionaba sigue igual', () => {
  assert.equal(dia('ayer'), '2026-10-18');
  assert.equal(dia('anteayer'), '2026-10-17');
  assert.equal(dia('hace 3 dias'), '2026-10-16');
  assert.equal(dia('el lunes pasado'), '2026-10-12');
  assert.equal(dia('el viernes'), '2026-10-16');
  assert.equal(dia('15/10'), '2026-10-15');
  assert.equal(dia('15/10/2025'), '2025-10-15');
  assert.equal(dia('el 15 de octubre'), '2026-10-15');
  assert.equal(hora('3pm'), '15:00');
  assert.equal(hora('3:30 pm'), '15:30');
  assert.equal(hora('ayer a las 8pm'), '20:00');
  assert.equal(dia('ayer a las 8pm'), '2026-10-18');
});

test('el N, dia N y el primero: ese día del mes, o del anterior si aún no llega', () => {
  assert.equal(dia('el 15'), '2026-10-15');
  assert.equal(dia('el 5'), '2026-10-05');
  assert.equal(dia('el 25'), '2026-09-25');
  assert.equal(dia('dia 15'), '2026-10-15');
  assert.equal(dia('el primero'), '2026-10-01');
  assert.equal(hallarFecha('taxi 8000 el 15', LUNES).resto, 'taxi 8000');
  assert.equal(dia('el 31', new Date('2026-03-05T17:00:00Z')), '2026-01-31', 'febrero no tiene 31: el más reciente es enero');
});

test('«el 15 mil» y «el 5%» no son fechas', () => {
  assert.equal(hallarFecha('mecato el 15 mil', LUNES).explicita, false);
  assert.equal(hallarFecha('descuento el 5%', LUNES).explicita, false);
});

test('día de la semana con número y «el pasado lunes»', () => {
  assert.equal(dia('el lunes 12'), '2026-10-12');
  assert.equal(dia('el pasado lunes'), '2026-10-12');
  assert.equal(hallarFecha('el pasado lunes mecato 5000', LUNES).resto, 'mecato 5000');
  assert.equal(dia('el martes 13'), '2026-10-13');
});

test('hace N días, semanas y la semana pasada, con números escritos', () => {
  assert.equal(dia('hace una semana'), '2026-10-12');
  assert.equal(dia('hace dos dias'), '2026-10-17');
  assert.equal(dia('hace 2 semanas'), '2026-10-05');
  assert.equal(dia('la semana pasada'), '2026-10-12');
});

test('anoche, esta mañana, esta tarde y ayer por la noche', () => {
  const noche = hallarFecha('anoche', LUNES);
  assert.equal(noche.fecha, '2026-10-18 20:00:00');
  assert.equal(noche.resto, '');
  assert.equal(hora('esta manana'), '09:00');
  assert.equal(hora('esta tarde'), '15:00');
  assert.equal(hallarFecha('ayer por la noche', LUNES).fecha, '2026-10-18 20:00:00');
  assert.equal(hora('esta noche'), '15:42', 'la noche de hoy todavía no llega: se queda en este instante');
});

test('mañana y pasado mañana avisan que están en el futuro; «por la mañana» no', () => {
  for (const t of ['manana', 'pasado manana', 'mecato 5000 manana']) {
    const f = hallarFecha(t, LUNES);
    assert.equal(f.invalida, true, t);
    assert.match(f.motivo ?? '', /futuro/);
  }
  assert.equal(hallarFecha('cafe por la manana', LUNES).invalida, false);
  assert.equal(hallarFecha('cada manana cafe', LUNES).invalida, false);
});

test('mes escrito en cualquier orden y abreviado', () => {
  assert.equal(dia('15 octubre'), '2026-10-15');
  assert.equal(dia('el 15 oct'), '2026-10-15');
  assert.equal(dia('oct 15'), '2026-10-15');
  assert.equal(dia('15 nov'), '2025-11-15', 'noviembre todavía no llega: es el del año pasado');
  assert.equal(dia('nov 15'), '2025-11-15');
  assert.equal(dia('el primero de septiembre'), '2026-09-01');
  assert.equal(dia('el lunes 12 de octubre'), '2026-10-12');
});

test('quincena y fin de mes', () => {
  assert.equal(dia('en la quincena'), '2026-10-15');
  assert.equal(dia('a fin de mes'), '2026-09-30');
  assert.equal(dia('en la quincena', new Date('2026-10-05T17:00:00Z')), '2026-09-30');
});

test('una fecha sin año a más de 10 días en el futuro es del año pasado', () => {
  assert.equal(dia('el 28 de diciembre', ENERO), '2026-12-28');
  assert.equal(dia('28/12', ENERO), '2026-12-28');
  assert.equal(dia('mecato 5000 28/12', ENERO), '2026-12-28');
  assert.equal(dia('5/1', ENERO), '2027-01-05', 'tres días más adelante se respeta');
  assert.equal(dia('el 20 de enero', ENERO), '2026-01-20', 'dieciocho días más adelante no');
});

test('con año explícito en el futuro se rechaza con un mensaje claro', () => {
  for (const t of ['28/12/2027', '28/12/27', '2 de marzo de 2030', '2030-03-02']) {
    const f = hallarFecha(t, ENERO);
    assert.equal(f.invalida, true, t);
    assert.match(f.motivo ?? '', /futuro/, t);
  }
  assert.equal(hallarFecha('28/12/2026', ENERO).invalida, false);
});

test('fecha ISO, día-mes-año escrito y 15-10', () => {
  assert.equal(dia('2026-10-15'), '2026-10-15');
  assert.equal(hallarFecha('mecato 5000 2026-10-15', LUNES).resto, 'mecato 5000');
  assert.equal(dia('2 de marzo de 2025'), '2025-03-02');
  assert.equal(dia('2 marzo 2025'), '2025-03-02');
  assert.equal(dia('15-10'), '2026-10-15');
  assert.equal(dia('15-10-2025'), '2025-10-15');
  assert.equal(hallarFecha('empanadas 2-3', LUNES).explicita, false, 'un rango pequeño no es fecha');
});

test('el año ya no cuenta como monto: «mecato 5000 2 de marzo de 2025»', () => {
  const r = interpretar('mecato 5000 2 de marzo de 2025', contextoDe(new MemoriaRepo().datos, LUNES));
  assert.equal(r.clase, 'movimiento');
  if (r.clase === 'movimiento') {
    assert.equal(r.propuesta.monto, 5000);
    assert.equal(r.propuesta.ocurridoEn.slice(0, 10), '2025-03-02');
  }
  const r2 = interpretar('mecato 5000 15-10', contextoDe(new MemoriaRepo().datos, LUNES));
  assert.equal(r2.clase, 'movimiento');
  if (r2.clase === 'movimiento') assert.equal(r2.propuesta.ocurridoEn.slice(0, 10), '2026-10-15');
});

test('horas: con minutos sin «a las», validadas, «y media», cena y minutos que son plata', () => {
  assert.equal(hora('almuerzo 12:30 15k'), '12:30');
  assert.equal(hallarFecha('almuerzo 12:30 15k', LUNES).resto, 'almuerzo 15k');
  assert.equal(hora('mecato 5000 15:30'), '15:30');
  assert.equal(hora('a las 3 y media'), '15:30');
  assert.equal(hora('a las 8 de la noche'), '20:00');
  assert.equal(hora('cena 20 mil a las 8'), '20:00');
  assert.equal(hora('almuerzo a las 12 15 mil'), '12:00');
  assert.equal(hallarFecha('almuerzo a las 12 15 mil', LUNES).resto, 'almuerzo 15 mil');
  assert.equal(hora('a las 8 30 15k'), '08:30');
});

test('horas imposibles se rechazan', () => {
  for (const t of ['a las 25', 'a las 13:99 pm', 'mecato 5000 30 pm']) {
    const f = hallarFecha(t, LUNES);
    assert.equal(f.invalida, true, t);
    assert.match(f.motivo ?? '', /hora/, t);
  }
});

test('fecha límite de una deuda: valida y toma el año que viene si ya pasó', () => {
  const DIC = new Date('2026-12-10T17:00:00Z');
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 31 de febrero', LUNES).fecha, null);
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 31 de febrero', LUNES).resto, 'le debo 50000 a ana antes del 31 de febrero', 'no se quita: hallarFecha avisará');
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 40/13', LUNES).fecha, null);
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 15 de enero', DIC).fecha, '2027-01-15');
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 15 de noviembre', LUNES).fecha, '2026-11-15');
  assert.equal(hallarFechaLimite('le debo 50000 a ana antes del 15 de noviembre', LUNES).resto, 'le debo 50000 a ana');
  assert.equal(hallarFechaLimite('le debo 50000 a ana para el 20', LUNES).fecha, '2026-10-20');
  assert.equal(hallarFechaLimite('le debo 50000 a ana para el 5', LUNES).fecha, '2026-11-05');
  assert.equal(hallarFechaLimite('le debo 50000 a ana para el 31/10', LUNES).fecha, '2026-10-31');
});

test('una deuda con fecha límite imposible avisa que la fecha no existe', () => {
  const r = interpretar('le debo 50000 a ana antes del 31 de febrero', contextoDe(new MemoriaRepo().datos, LUNES));
  assert.equal(r.clase, 'error');
});
