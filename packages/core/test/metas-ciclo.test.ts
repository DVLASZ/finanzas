import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leerMetas, quitarAporte, renombrarMeta, totalApartado, type Meta } from '../src/index.ts';

const cfg = (l: unknown[]) => ({ metas: JSON.stringify(l) });

test('leerMetas da id a las metas viejas y conserva pausada', () => {
  const l = leerMetas(cfg([{ nombre: 'Moto Nueva', meta: 1000, apartado: 100 }, { id: 'x1', nombre: 'Viaje', meta: 500, apartado: 0, pausada: true }]));
  assert.equal(l[0].id, 'moto-nueva');
  assert.equal(l[0].pausada, undefined);
  assert.equal(l[1].id, 'x1');
  assert.equal(l[1].pausada, true);
});

test('una meta pausada no cuenta en lo apartado', () => {
  const l = leerMetas(cfg([{ nombre: 'A', meta: 1000, apartado: 300 }, { nombre: 'B', meta: 1000, apartado: 200, pausada: true }]));
  assert.equal(totalApartado(l), 300);
});

test('renombrarMeta cambia el nombre y migra el ultimo, sin duplicar', () => {
  const l: Meta[] = leerMetas(cfg([
    { nombre: 'Moto', meta: 1000, apartado: 100, ultimo: { id: 'm1', m: 100, n: 3 } },
    { nombre: 'Viaje', meta: 500, apartado: 0 },
  ]));
  const r = renombrarMeta(l, l[0].id!, 'Casa');
  assert.equal(r.ok, true);
  assert.equal(l[0].nombre, 'Casa');
  assert.equal(l[0].id, 'moto');
  assert.deepEqual(l[0].ultimo, { id: 'm1', m: 100, n: 3 });
  assert.equal(renombrarMeta(l, 'moto', ' VIAJE ').ok, false);
  assert.equal(l[0].nombre, 'Casa');
  assert.equal(renombrarMeta(l, 'moto', '  ').ok, false);
});

test('quitarAporte resta lo apartado y saca el aporte del historial', () => {
  const l = leerMetas(cfg([{ nombre: 'Moto', meta: 1000, apartado: 150, aportes: [{ f: '2026-11-01', m: 100 }, { f: '2026-11-02', m: 100 }, { f: '2026-11-03', m: -50 }] }]));
  assert.equal(quitarAporte(l, 'moto', 0).ok, true);
  assert.equal(l[0].apartado, 50);
  assert.equal(l[0].aportes?.length, 2);
  // deshacer un retiro devuelve la plata
  assert.equal(quitarAporte(l, 'moto', 1).ok, true);
  assert.equal(l[0].apartado, 100);
  assert.equal(quitarAporte(l, 'moto', 9).ok, false);
});

test('quitarAporte no deja el apartado en negativo', () => {
  const l = leerMetas(cfg([{ nombre: 'Moto', meta: 1000, apartado: 20, aportes: [{ f: '2026-11-01', m: 100 }, { f: '2026-11-02', m: -80 }] }]));
  const r = quitarAporte(l, 'moto', 0);
  assert.equal(r.ok, false);
  assert.equal(l[0].apartado, 20);
});
