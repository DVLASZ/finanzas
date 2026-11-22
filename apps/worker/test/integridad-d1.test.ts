/** Deshacer un pago que saldó una deuda la reabre también en D1 (la misma regla que en memoria). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLANTILLAS, procesar, sqlDePlantilla } from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const AHORA = new Date('2026-10-27T15:00:00Z');

test('D1: deshacer el pago que saldó la deuda la deja activa, y restaurarlo la salda otra vez', async () => {
  const id = Object.keys(PLANTILLAS)[0];
  const repo = new D1Repo(crearD1(sqlDePlantilla(id, {})));
  const di = async (texto: string) => procesar(repo, { texto }, AHORA);
  await di('le debo 8000 a marta por almuerzo');
  await procesar(repo, { boton: 'ok' }, AHORA);
  await di('pagué 9000 a marta');
  await procesar(repo, { boton: 'ok' }, AHORA);
  assert.equal((await repo.cargar()).compromisos[0].estado, 'saldada');
  await di('deshacer');
  assert.equal((await repo.cargar()).compromisos[0].estado, 'activa');
  const pago = (await repo.cargar()).movimientos.find(m => m.tipo === 'pago')!;
  await repo.restaurarMovimiento(pago.id, '2026-10-27 10:00:00');
  assert.equal((await repo.cargar()).compromisos[0].estado, 'saldada');
});
