/** Las operaciones de sincronización que cambian las cuentas (categorías y personas). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarOps, MemoriaRepo, validarOp } from '../src/index.ts';
test('editar categorías y personas: crear, renombrar, y la sincronización lo valida', async () => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('familia');
  const nueva = { id: 'cat:viajes', nombre: 'Viajes', clave: 'viajes', tipo: 'categoria' as const, moneda: 'COP' as const };
  const rechazos = await aplicarOps(repo, [
    { op: 'cuenta', cuenta: nueva },
    { op: 'cuenta', cuenta: { ...nueva, id: 'cat:comida', nombre: 'Almuerzos', clave: 'almuerzos' } }, // renombrar una que ya existe
  ]);
  assert.deepEqual(rechazos, []);
  const d = await repo.cargar();
  assert.equal(d.cuentas.find(c => c.id === 'cat:viajes')?.nombre, 'Viajes');
  assert.equal(d.cuentas.find(c => c.id === 'cat:comida')?.nombre, 'Almuerzos');
  assert.equal(d.cuentas.filter(c => c.id === 'cat:comida').length, 1);
  // las cuentas de dinero y las del sistema no se tocan desde aquí
  assert.match(validarOp({ op: 'cuenta', cuenta: { ...nueva, id: 'efectivo', tipo: 'dinero' } }) ?? '', /categorías y personas/);
  assert.match(validarOp({ op: 'cuenta', cuenta: { ...nueva, id: 'cat:' + 'x'.repeat(80) } }) ?? '', /mal formada/);
  assert.match(validarOp({ op: 'cuenta', cuenta: { ...nueva, nombre: '' } }) ?? '', /mal formada/);
  assert.match(validarOp({ op: 'cuenta', cuenta: { ...nueva, id: 'per:ana', tipo: 'persona' } }) ?? '', /mal formada|^$/);
});

test('una palabra aprendida se puede olvidar (categoría y cuenta vacías la borran)', async () => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('familia');
  await aplicarOps(repo, [{ op: 'aprendido', palabra: 'rifa', valor: { categoriaId: 'cat:regalos' } }]);
  assert.equal((await repo.cargar()).aprendido.rifa?.categoriaId, 'cat:regalos');
  assert.deepEqual(await aplicarOps(repo, [{ op: 'aprendido', palabra: 'rifa', valor: {} }]), []);
  assert.equal((await repo.cargar()).aprendido.rifa, undefined);
});
