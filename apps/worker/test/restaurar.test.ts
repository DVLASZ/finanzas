/**
 * Restaurar un respaldo de punta a punta: se usa una base con movimientos de verdad, se cifra como lo hace
 * el respaldo de GitHub, se abre, se pasa a SQL y se corre en una base nueva y vacía. Lo restaurado tiene
 * que ser idéntico y los saldos tienen que dar lo mismo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, procesar, sqlDeRespaldo, sqlDePlantilla, type Datos } from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import { cifrar, descifrar } from '../src/respaldo.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const porId = <T extends { id: string }>(l: T[]): Record<string, T> => Object.fromEntries(l.map(x => [x.id, x]));

async function baseConHistoria(): Promise<D1Repo> {
  const repo = new D1Repo(crearD1(sqlDePlantilla('familia', { personas: [{ nombre: 'Felipe', grupo: 'trabajadores' }, { nombre: 'Mamá', grupo: 'familia' }] })));
  const di = async (t: string) => { await procesar(repo, { texto: t }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA); };
  await di('saldo inicial efectivo 300000 monedas 5000 bancolombia 2000000 alcancia 100000');
  await di('jornal 50000 felipe');
  await di('mercado 85000 bancolombia');
  await di('plata de mamá para cooperativa 150000 bancolombia');
  await di('cooperativa 149984 con plata de mamá bancolombia');
  await di('metí 5 monedas de 500 y 3 de mil a la alcancía');
  await di('le presté 40000 a sergio');
  await procesar(repo, { texto: 'tope mercado 300000' }, AHORA);
  await procesar(repo, { texto: 'meta moto 2000000' }, AHORA);
  await di('mecato 2500'); // este se anula
  const d = await repo.cargar();
  const ultimo = d.movimientos.find(m => m.descripcion.toLowerCase().includes('mecato'));
  if (ultimo) await repo.anularMovimiento(ultimo.id, '2026-10-19 16:00:00');
  return repo;
}

test('restaurar: el respaldo cifrado, abierto y restaurado en una base vacía es idéntico y los saldos cuadran', async () => {
  const origen = await baseConHistoria();
  const antes: Datos = await origen.cargar();
  assert.ok(antes.movimientos.length >= 8, 'la historia tiene movimientos');

  // lo que hace el servidor los domingos y lo que hace la persona después
  const cifrado = await cifrar(JSON.stringify(antes), 'una frase larga para la prueba');
  const abierto = JSON.parse(await descifrar(cifrado, 'una frase larga para la prueba')) as Datos;
  const sql = sqlDeRespaldo(abierto);

  const base = crearD1(''); // base nueva: solo el esquema, sin semilla
  base.db.exec(sql);
  const despues = await new D1Repo(base).cargar();

  assert.deepEqual(porId(despues.cuentas), porId(antes.cuentas));
  assert.deepEqual(porId(despues.movimientos), porId(antes.movimientos));
  assert.deepEqual(porId(despues.compromisos), porId(antes.compromisos));
  assert.deepEqual(despues.atajos.sort((a, b) => a.palabra.localeCompare(b.palabra)), antes.atajos.sort((a, b) => a.palabra.localeCompare(b.palabra)));
  assert.deepEqual(despues.aprendido, antes.aprendido);
  assert.deepEqual(despues.presupuestos, antes.presupuestos);
  assert.deepEqual(despues.config, antes.config);
  const ap = antes.config.fecha_apertura;
  assert.deepEqual([...calcularSaldos(despues.movimientos, ap)].sort(), [...calcularSaldos(antes.movimientos, ap)].sort());
});

test('restaurar: correrlo dos veces no duplica nada (los asientos se reemplazan con su movimiento)', async () => {
  const origen = await baseConHistoria();
  const antes = await origen.cargar();
  const base = crearD1('');
  base.db.exec(sqlDeRespaldo(antes));
  const una = (await new D1Repo(base).cargar()).movimientos.reduce((s, m) => s + m.asientos.length, 0);
  base.db.exec('DELETE FROM asientos'); // lo que haría limpiar antes de repetir
  base.db.exec(sqlDeRespaldo(antes));
  const dos = (await new D1Repo(base).cargar()).movimientos.reduce((s, m) => s + m.asientos.length, 0);
  assert.equal(dos, una);
});

test('restaurar: comillas y textos raros en descripciones y notas no rompen el SQL', async () => {
  const repo = new D1Repo(crearD1(sqlDePlantilla('personal')));
  const di = async (t: string) => { await procesar(repo, { texto: t }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA); };
  await di("saldo inicial efectivo 50000");
  await di("mecato 2000 d'Ana; DROP TABLE cuentas; --");
  const antes = await repo.cargar();
  const base = crearD1('');
  base.db.exec(sqlDeRespaldo(antes));
  const despues = await new D1Repo(base).cargar();
  assert.deepEqual(porId(despues.movimientos), porId(antes.movimientos));
  assert.ok(despues.cuentas.length > 0, 'la tabla de cuentas sigue ahí');
});
