/** Exportar a Excel: el archivo se arma sin librerías y se abre con una librería de verdad. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { crearXlsx, excelDeDatos } from '../src/index.ts';
import { nuevoBot } from '../../../tests/ayudas.ts';

const leer = async (bytes: Uint8Array) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(bytes) as never);
  return libro;
};

test('crearXlsx: un libro mínimo se abre, con tildes, números y símbolos raros', async () => {
  const libro = await leer(crearXlsx([{ nombre: 'Prueba', filas: [['Nombre', 'Monto'], ['José & "Ñandú" <b>', 1234.5], [null, 7]] }]));
  const h = libro.getWorksheet('Prueba')!;
  assert.equal(h.getCell('A1').value, 'Nombre');
  assert.equal(h.getCell('A2').value, 'José & "Ñandú" <b>');
  assert.equal(h.getCell('B2').value, 1234.5);
  assert.equal(h.getCell('B3').value, 7);
});

test('excelDeDatos: movimientos, saldos, deudas y meses, con los montos bien puestos', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000 nequi 50000'); await bot.pulsa('ok');
  await bot.di('mecato 5000'); await bot.pulsa('ok');
  await bot.di('ingreso 30000 chamba'); await bot.pulsa('ok');
  await bot.di('presté 20k a ivan'); await bot.pulsa('ok');
  await bot.di('almuerzo 12000'); await bot.pulsa('ok');
  await bot.di('taxi de terminal a casa 8000');
  const guardado = await bot.pulsa('ok');
  await bot.pulsa(guardado[0].botones!.find(b => b.id.startsWith('undo:'))!.id);

  const libro = await leer(excelDeDatos(await bot.repo.cargar()));
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Movimientos', 'Saldos', 'Deudas', 'Por mes']);

  const movs = libro.getWorksheet('Movimientos')!;
  const filas = movs.getSheetValues().slice(2) as unknown[][];
  assert.equal(filas.length, 6);
  const mecato = filas.find(f => String(f[3]).toLowerCase().includes('mecato'))!;
  assert.equal(mecato[2], 'Gasto');
  assert.equal(mecato[7], 5000);
  const ingreso = filas.find(f => f[2] === 'Ingreso')!;
  assert.equal(ingreso[8], 30000);
  const prestamo = filas.find(f => f[2] === 'Préstamo')!;
  assert.equal(prestamo[9], 20000);
  assert.equal(filas.filter(f => f[11] === 'Anulado').length, 1);

  const saldos = libro.getWorksheet('Saldos')!.getSheetValues().slice(2) as unknown[][];
  const efectivo = saldos.find(f => f[1] === 'Efectivo')!;
  assert.equal(efectivo[3], 100000 - 5000 + 30000 - 20000 - 12000);

  const deudas = libro.getWorksheet('Deudas')!.getSheetValues().slice(2) as unknown[][];
  assert.equal(deudas.length, 1);
  assert.equal(deudas[0][1], 'Ivan');
  assert.equal(deudas[0][2], 'Te debe');
  assert.equal(deudas[0][3], 20000);

  const meses = libro.getWorksheet('Por mes')!.getSheetValues().slice(2) as unknown[][];
  assert.equal(meses[0][1], '2026-10');
  assert.equal(meses[0][2], 17000); // mecato + almuerzo (el taxi está anulado)
  assert.equal(meses[0][3], 30000);
});

test('excelDeDatos: una app sin movimientos igual da un libro con sus hojas', async () => {
  const bot = nuevoBot();
  const libro = await leer(excelDeDatos(await bot.repo.cargar()));
  assert.equal(libro.worksheets.length, 4);
});
