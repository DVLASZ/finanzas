/**
 * Lo que se sumó con la lista de pendientes: pagos fijos que no son mensuales, anular un arqueo sin rastro,
 * propuestas entre apps del buzón y existencias en las ventas.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularAlertas, deLocal, describirFrecuencia, esArqueo, esArqueoAnulado, etiquetasUsadas, filtrarMovimientos, frecuenciaDe, leerRecurrentes, movimientosACsv, movimientosAJson, recurrentesPendientes, resumenEnTexto, revisarMes, seguroParaGastar } from '../src/index.ts';
import { MemoriaRepo, procesar } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string, ahora: Date = AHORA) {
  await bot.di(texto, ahora);
  await bot.pulsa('ok', ahora);
}

// AHORA es el lunes 19 de octubre de 2026.
const pendientesEn = async (bot: ReturnType<typeof nuevoBot>, dia: string) =>
  recurrentesPendientes((await bot.repo.cargar()).config, (await bot.repo.cargar()).movimientos, `${dia} 09:00:00`);

// ---------------------------------------------------------------- pagos fijos con otras frecuencias

test('pago fijo semanal: «cada lunes» se guarda como semanal y avisa hasta que lo anotas', async () => {
  const bot = nuevoBot();
  const r = await bot.di('cada lunes almuerzo 12000');
  assert.match(textoDe(r), /Cada semana, los lunes/);
  await bot.pulsa('ok');
  const [x] = leerRecurrentes((await bot.repo.cargar()).config);
  assert.equal(frecuenciaDe(x), 'semanal');
  assert.equal(x.dia, 1);
  assert.equal((await pendientesEn(bot, '2026-10-19')).length, 1);
  await guardar(bot, 'almuerzo 12000');
  assert.equal((await pendientesEn(bot, '2026-10-19')).length, 0, 'ya anotado esta semana');
  assert.equal((await pendientesEn(bot, '2026-10-22')).length, 0, 'el jueves todavía no toca el siguiente lunes');
  assert.equal((await pendientesEn(bot, '2026-10-24')).length, 1, 'dos días antes del lunes 26 vuelve a avisar');
});

test('pago fijo semanal: también se entiende «cada semana el viernes» y pide el día si falta', async () => {
  const bot = nuevoBot();
  await bot.di('cada semana el viernes almuerzo 20000');
  await bot.pulsa('ok');
  assert.equal(leerRecurrentes((await bot.repo.cargar()).config)[0].dia, 5);
  assert.match(textoDe(await bot.di('cada semana jabon 5000')), /Falta el día de la semana/);
});

test('pago fijo quincenal: cae el día y 15 días después', async () => {
  const bot = nuevoBot();
  await bot.di('cada quincena el 5 almuerzo 40000');
  await bot.pulsa('ok');
  const [x] = leerRecurrentes((await bot.repo.cargar()).config);
  assert.equal(frecuenciaDe(x), 'quincenal');
  assert.equal(describirFrecuencia(x), 'cada quincena, el 5 y el 20');
  assert.equal((await pendientesEn(bot, '2026-10-19')).length, 1, 'el 20 está a un día');
  assert.equal((await pendientesEn(bot, '2026-10-10')).length, 1, 'el 5 sigue sin anotar y el 20 está lejos');
  await guardar(bot, 'almuerzo 40000');
  assert.equal((await pendientesEn(bot, '2026-10-19')).length, 0, 'lo anotado hoy ya cuenta para el del 20');
  assert.match(textoDe(await bot.di('cada quincena el 20 almuerzo 40000')), /de 1 a 13/);
});

test('pago fijo anual: avisa cerca de la fecha y no el resto del año', async () => {
  const bot = nuevoBot();
  await bot.di('cada año el 25 de octubre seguro 300000');
  await bot.pulsa('ok');
  const [x] = leerRecurrentes((await bot.repo.cargar()).config);
  assert.equal(frecuenciaDe(x), 'anual');
  assert.equal(x.mes, 10);
  assert.equal((await pendientesEn(bot, '2026-06-01')).length, 0);
  assert.equal((await pendientesEn(bot, '2026-10-19')).length, 0, 'faltan seis días');
  assert.equal((await pendientesEn(bot, '2026-10-23')).length, 1);
  assert.equal((await pendientesEn(bot, '2026-11-30')).length, 0, 'ya pasó más de un mes');
});

test('el aviso dice de qué periodo es y el seguro para gastar cuenta todas las veces que faltan del mes', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 300000');
  await bot.di('cada lunes almuerzo 12000');
  await bot.pulsa('ok');
  const datos = await bot.repo.cargar();
  assert.ok(calcularAlertas(datos, AHORA).some(a => /Esta semana toca Almuerzo/.test(a.texto)));
  // hoy es lunes 19: falta el de hoy y el del 26
  assert.equal(seguroParaGastar(datos, AHORA).fijos, 24000);
});

test('los pagos mensuales de antes siguen igual', async () => {
  const bot = nuevoBot();
  await bot.di('cada mes el 28 internet 60000');
  await bot.pulsa('ok');
  const [x] = leerRecurrentes((await bot.repo.cargar()).config);
  assert.equal(x.frecuencia, undefined);
  assert.equal(seguroParaGastar(await bot.repo.cargar(), deLocal('2026-10-19 15:42:00')).fijos, 60000);
});

// ---------------------------------------------------------------- arqueo sin rastro

test('un arqueo anulado no deja rastro: no cuenta como anulado ni sale en listados', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'arqueo efectivo 90000');
  const antes = await bot.repo.cargar();
  const arqueo = antes.movimientos.find(m => m.tipo === 'ajuste');
  assert.ok(arqueo, 'el arqueo se guardó');
  assert.equal(esArqueo(arqueo), true);
  assert.equal(esArqueoAnulado(arqueo), false);
  await bot.repo.anularMovimiento(arqueo.id, '2026-10-19 16:00:00');
  const despues = await bot.repo.cargar();
  const anulado = despues.movimientos.find(m => m.id === arqueo.id)!;
  assert.equal(anulado.estado, 'anulado', 'no se borra, se anula');
  assert.equal(esArqueoAnulado(anulado), true);
  assert.equal(esArqueoAnulado({ ...anulado, tipo: 'gasto' }), false, 'un gasto anulado sí deja rastro');
});

test('revisión del mes: los arqueos anulados no cuentan entre «muchos anulados»', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  const datos = await bot.repo.cargar();
  const base = datos.movimientos[0];
  const falsos = Array.from({ length: 8 }, (_, i) => ({ ...base, id: `a${i}`, tipo: 'ajuste' as const, estado: 'anulado' as const, ocurridoEn: '2026-10-10 10:00:00' }));
  const conArqueos = { ...datos, movimientos: [...datos.movimientos, ...falsos] };
  assert.ok(!revisarMes(conArqueos, AHORA).some(p => p.tipo === 'anulados'));
  const gastos = falsos.map((m, i) => ({ ...m, id: `g${i}`, tipo: 'gasto' as const }));
  assert.ok(revisarMes({ ...datos, movimientos: [...datos.movimientos, ...gastos] }, AHORA).some(p => p.tipo === 'anulados'));
});

// ---------------------------------------------------------------- exportar a CSV, JSON y texto

test('CSV: una fila por movimiento, gastos en negativo, comillas y sin fórmulas', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  await guardar(bot, 'ingreso 50000 trabajo');
  const datos = await bot.repo.cargar();
  const csv = movimientosACsv(datos.movimientos, datos.cuentas);
  const lineas = csv.trim().split('\n');
  assert.equal(lineas[0], 'fecha,hora,tipo,descripcion,categoria,cuenta,monto,moneda,etiqueta,estado,nota');
  assert.equal(lineas.length, 4);
  assert.ok(lineas.some(l => /,gasto,Almuerzo,Comida,Efectivo,-12000,COP,/.test(l)), csv);
  assert.ok(lineas.some(l => /,ingreso,.*,50000,COP,/.test(l)), csv);
  const m = { ...datos.movimientos[1], descripcion: '=SUMA(A1)', nota: 'dijo "hola", y se fue' };
  const raro = movimientosACsv([m], datos.cuentas);
  assert.ok(raro.includes("'=SUMA(A1)"), 'una fórmula no se ejecuta en Excel');
  assert.ok(raro.includes('"dijo ""hola"", y se fue"'), 'las comillas se duplican');
});

test('JSON: trae los mismos campos que el CSV y los asientos con el nombre de la cuenta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  const datos = await bot.repo.cargar();
  const lista = JSON.parse(movimientosAJson(datos.movimientos, datos.cuentas)) as { descripcion: string; monto: number; asientos: { cuenta: string; monto: number }[] }[];
  const a = lista.find(x => x.descripcion === 'Almuerzo')!;
  assert.equal(a.monto, -12000);
  assert.deepEqual(a.asientos.map(x => x.cuenta).sort(), ['Comida', 'Efectivo']);
});

test('resumen en texto: ingresos, gastos, balance y en qué se fue', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'ingreso 200000 trabajo');
  await guardar(bot, 'almuerzo 30000');
  await guardar(bot, 'mecato 10000');
  const datos = await bot.repo.cargar();
  const t = resumenEnTexto(datos, 'octubre 2026', '2026-10-01 00:00:00', '2026-11-01 00:00:00');
  assert.match(t, /Resumen de octubre 2026/);
  assert.match(t, /Ingresos: \$200\.000/);
  assert.match(t, /Gastos: \$40\.000/);
  assert.match(t, /Balance: \$160\.000/);
  assert.match(t, /- Comida: \$30\.000 \(75 %\)/);
});

// ---------------------------------------------------------------- existencias en las ventas

const CATALOGO = { productos: [{ id: 'galletas', nombre: 'Galletas', alias: [], presentaciones: [
  { id: 'granel', nombre: 'granel', alias: ['a granel', 'granel'], precio: 500 },
  { id: 'paq10', nombre: 'paquete de 10', alias: ['paquete de 10', 'paquetes de 10', 'paq 10'], precio: 6000 },
] }] };

function tienda() {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('empresa', { personas: [], config: { catalogo: JSON.stringify(CATALOGO) } });
  return {
    repo,
    di: (texto: string) => procesar(repo, { texto }, AHORA),
    pulsa: (boton: string) => procesar(repo, { boton }, AHORA),
  };
}

test('existencias: el conteo se resta con cada venta y las presentaciones cuentan sus unidades', async () => {
  const t = tienda();
  assert.match(textoDe(await t.di('existencias')), /Ningún producto lleva cuenta/);
  assert.match(textoDe(await t.di('inventario galletas 100')), /100 unidades de Galletas/);
  await t.di('15 galletas a granel');
  await t.pulsa('ok');
  await t.di('2 paquetes de 10');
  await t.pulsa('ok');
  assert.match(textoDe(await t.di('existencias')), /Galletas: 65 unidades/);
  assert.match(textoDe(await t.di('llegaron 35 galletas')), /ahora hay 100 unidades/);
});

test('existencias: avisa en la tarjeta si no alcanzan y anular una venta devuelve las unidades', async () => {
  const t = tienda();
  await t.di('inventario galletas 20');
  const tarjetaGrande = textoDe(await t.di('30 galletas a granel'));
  assert.match(tarjetaGrande, /Solo te quedan 20 unidades de Galletas/);
  await t.pulsa('no');
  await t.di('18 galletas a granel');
  await t.pulsa('ok');
  const baja = textoDe(await t.di('1 galletas a granel'));
  assert.match(baja, /te quedan 1 unidad de Galletas/);
  await t.pulsa('no');
  const datos = await t.repo.cargar();
  const venta = datos.movimientos.find(m => m.estado === 'ok' && m.tipo === 'ingreso')!;
  await t.repo.anularMovimiento(venta.id, '2026-10-19 16:00:00');
  assert.match(textoDe(await t.di('existencias')), /Galletas: 20 unidades/);
});

test('existencias: un producto sin conteo no avisa nada y un nombre desconocido se dice', async () => {
  const t = tienda();
  const tarjeta = textoDe(await t.di('3 galletas a granel'));
  assert.doesNotMatch(tarjeta, /te quedan|Solo te quedan/);
  assert.match(textoDe(await t.di('inventario pasteles 5')), /No encuentro «pasteles»/);
});

// ---------------------------------------------------------------- filtros de Movimientos

async function conGastos() {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000 nequi 100000');
  await guardar(bot, 'pizza 12000 #cumple-daniel');
  await guardar(bot, 'almuerzo 30000 nequi');
  await guardar(bot, 'mecato 5000 #cumple-daniel');
  await guardar(bot, 'ingreso 80000 trabajo');
  return bot.repo.cargar();
}

test('filtros: el texto pide todas las palabras, sin importar tildes ni orden', async () => {
  const d = await conGastos();
  assert.deepEqual(filtrarMovimientos(d, { texto: 'PIZZA' }).map(m => m.descripcion), ['Pizza']);
  assert.equal(filtrarMovimientos(d, { texto: 'pizza almuerzo' }).length, 0);
  assert.equal(filtrarMovimientos(d, { texto: '' }).length, d.movimientos.length);
});

test('filtros: #etiqueta busca esa etiqueta, escrita en el texto o elegida aparte', async () => {
  const d = await conGastos();
  assert.equal(filtrarMovimientos(d, { texto: '#cumple-daniel' }).length, 2);
  assert.equal(filtrarMovimientos(d, { etiqueta: 'cumple-daniel' }).length, 2);
  assert.equal(filtrarMovimientos(d, { etiqueta: '#cumple-daniel', texto: 'pizza' }).length, 1);
  assert.equal(filtrarMovimientos(d, { texto: '#otra' }).length, 0);
  assert.deepEqual(etiquetasUsadas(d.movimientos), [{ etiqueta: 'cumple-daniel', n: 2 }]);
});

test('filtros: cuenta, categoría, tipo y rango de fechas se combinan', async () => {
  const d = await conGastos();
  assert.deepEqual(filtrarMovimientos(d, { cuenta: 'nequi', tipos: ['gasto'] }).map(m => m.descripcion), ['Almuerzo']);
  assert.equal(filtrarMovimientos(d, { categoria: 'cat:comida' }).length, 2);
  assert.equal(filtrarMovimientos(d, { tipos: ['ingreso'] }).length, 1);
  assert.equal(filtrarMovimientos(d, { desde: '2026-10-19', hasta: '2026-10-20' }).length, d.movimientos.length, 'hasta no se incluye, desde sí');
  assert.equal(filtrarMovimientos(d, { desde: '2026-10-20' }).length, 0);
  assert.equal(filtrarMovimientos(d, { hasta: '2026-10-19' }).length, 0);
});

test('filtros: los anulados salen solo si se piden, y un arqueo anulado nunca', async () => {
  const d = await conGastos();
  const [uno, dos] = d.movimientos.filter(m => m.tipo === 'gasto');
  const anulados = d.movimientos.map(m => (m.id === uno.id ? { ...m, estado: 'anulado' as const } : m.id === dos.id ? { ...m, tipo: 'ajuste' as const, estado: 'anulado' as const } : m));
  const datos = { ...d, movimientos: anulados };
  assert.ok(!filtrarMovimientos(datos, {}).some(m => m.id === uno.id));
  assert.ok(filtrarMovimientos(datos, { anulados: true }).some(m => m.id === uno.id));
  assert.ok(!filtrarMovimientos(datos, { anulados: true }).some(m => m.id === dos.id), 'el arqueo anulado no deja rastro');
});
