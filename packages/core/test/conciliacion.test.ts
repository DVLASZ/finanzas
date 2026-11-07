/** Conciliar el extracto del banco (CSV) con lo anotado en la app. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conciliar, leerExtracto } from '../src/index.ts';
import { deLocal } from '../src/index.ts';
import { nuevoBot } from '../../../tests/ayudas.ts';

const CSV_PUNTO_Y_COMA = `Fecha;Descripción;Valor;Saldo
01/11/2026;COMPRA EN PANADERIA;-12.500,00;1.000.000,00
02/11/2026;RETIRO CAJERO;-360.000,00;640.000,00
02/11/2026;GRAVAMEN MOVIMIENTO FINANCIERO;-375,99;400.000,01
03/11/2026;ABONO TRANSFERENCIA NEQUI;150.000,00;550.000,01
`;

test('leerExtracto: separa columnas, entiende fechas y montos de Colombia', () => {
  const filas = leerExtracto(CSV_PUNTO_Y_COMA);
  assert.equal(filas.length, 4);
  assert.deepEqual(filas[0], { fecha: '2026-11-01', descripcion: 'COMPRA EN PANADERIA', monto: -12500 });
  assert.equal(filas[2].monto, -376); // los centavos se redondean al peso
  assert.equal(filas[3].monto, 150000);
});

test('leerExtracto: también CSV con comas, fechas ISO y columnas de débito y crédito', () => {
  const csv = `date,detalle,debito,credito\n2026-11-04,"Pago luz, casa",45000,\n2026-11-05,Consignación,,200000\n`;
  const filas = leerExtracto(csv);
  assert.deepEqual(filas.map(f => f.monto), [-45000, 200000]);
  assert.equal(filas[0].descripcion, 'Pago luz, casa');
});

test('leerExtracto: sin encabezados reconocibles devuelve una lista vacía', () => {
  assert.deepEqual(leerExtracto('hola\nmundo'), []);
});

test('conciliar: marca lo que ya está, y propone lo que falta', async () => {
  const bot = nuevoBot();
  const t = deLocal('2026-11-01 10:00:00');
  await bot.di('saldo inicial nequi 1000000', t); await bot.pulsa('ok', t);
  await bot.di('mecato 12500 nequi', t); await bot.pulsa('ok', t);
  await bot.di('cambio 360000 nequi a efectivo', deLocal('2026-11-02 10:00:00')); await bot.pulsa('ok', deLocal('2026-11-02 10:00:00'));
  const d = await bot.repo.cargar();
  const r = conciliar(d, leerExtracto(CSV_PUNTO_Y_COMA), 'nequi');
  assert.equal(r.encontrados.length, 2);
  assert.equal(r.faltan.length, 2);
  const grav = r.faltan.find(f => /GRAVAMEN/.test(f.fila.descripcion))!;
  assert.equal(grav.sugerencia, '4x1000 376 nequi');
  const abono = r.faltan.find(f => f.fila.monto === 150000)!;
  assert.match(abono.sugerencia, /^ingreso 150000 .* nequi/);
  // movimientos de la app que el extracto no trae (el saldo inicial no cuenta)
  assert.equal(r.soloEnLaApp.length, 0);
});
