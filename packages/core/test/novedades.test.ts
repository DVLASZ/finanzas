/** Botones rápidos del chat, comparativa y proyección del mes, y duplicar un movimiento. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarDuplicado, atajosRapidos, gastoDelMes, gastoDiario, horaDeRecordatorio, ingresosGastosPorMes, limpiarAtajos, proyeccionLiquidez, avisosDeLiquidez, cuotaSemanal, corteDeTurno, textoCorte, stockBajo, tocaRecordar, modoSugerido, moverAtajo, sugerenciasAtajos, calcularAlertas, calcularSaldos, comparativaMensual, deLocal, previsualizarDuplicado, saldoDe, textoProyeccion,
} from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string, ahora: Date = AHORA) {
  await bot.di(texto, ahora);
  await bot.pulsa('ok', ahora);
}
const saldoDeCuenta = async (bot: ReturnType<typeof nuevoBot>, cuenta: string) => {
  const d = await bot.repo.cargar();
  return saldoDe(calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00'), cuenta, 'COP');
};

// ---------------------------------------------------------------- botones rápidos del chat

test('botones rápidos: solo los pagos fijos que ya tocan; nada inventado por plantilla ni por costumbre', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  for (const d of ['02', '05', '09']) await guardar(bot, 'mecato 2000', deLocal(`2026-10-${d} 10:00:00`));
  assert.deepEqual(atajosRapidos(await bot.repo.cargar(), AHORA), [], 'sin pagos fijos no hay botones: ni «pasaje» ni lo que se repite');
  await bot.di('cada mes el 20 internet 60000', AHORA); await bot.pulsa('ok', AHORA);
  const r = atajosRapidos(await bot.repo.cargar(), AHORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'fijo');
  assert.equal(r[0].frase, 'internet 60000');
});

test('atajos del usuario: se limpian, se ordenan y se sugieren desde lo que repites', async () => {
  const lista = limpiarAtajos([
    { id: 'a', etiqueta: '', frase: 'recarga nequi 20000', modo: 'frase' },
    { id: 'b', etiqueta: 'Mecato', frase: 'mecato ', modo: 'plantilla' },
    { frase: '   ' }, 7, null,
    { frase: 'x'.repeat(200), etiqueta: 'y'.repeat(60), modo: 'raro' },
  ]);
  assert.equal(lista.length, 3, 'lo roto se descarta');
  assert.equal(lista[0].etiqueta, 'Recarga nequi', 'sin etiqueta se usa la frase sin el monto');
  assert.equal(lista[1].frase, 'mecato', 'se recorta');
  assert.equal(lista[2].frase.length, 80);
  assert.equal(lista[2].etiqueta.length, 24);
  assert.equal(lista[2].modo, 'frase', 'un modo desconocido cae en frase');
  assert.equal(modoSugerido('recarga nequi'), 'plantilla');
  assert.equal(modoSugerido('mecato 3000'), 'frase');
  assert.deepEqual(limpiarAtajos('no es lista'), []);
  assert.deepEqual(moverAtajo(lista, 0, 1).map(x => x.id), [lista[1].id, 'a', lista[2].id]);
  assert.equal(moverAtajo(lista, 0, -1), lista, 'el primero no sube más');
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  for (const d of ['02', '05']) await guardar(bot, 'mecato 2000', deLocal(`2026-10-${d} 10:00:00`));
  const datos = await bot.repo.cargar();
  assert.deepEqual(sugerenciasAtajos(datos.movimientos, AHORA, []), ['mecato 2000']);
  assert.deepEqual(sugerenciasAtajos(datos.movimientos, AHORA, [{ id: 'z', etiqueta: 'Mecato', frase: 'Mecato 2000', modo: 'frase' }]), [], 'no repite lo que ya es atajo');
});

// ---------------------------------------------------------------- comparativa y proyección

async function conDosMeses() {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 5000000', deLocal('2026-09-01 08:00:00'));
  // septiembre: comida 100.000 (el 10), mecato 40.000 (el 18) y 1.000.000 más el día 28, que no entra en el tramo del 1 al 19
  await guardar(bot, 'almuerzo 100000', deLocal('2026-09-10 13:00:00'));
  await guardar(bot, 'mecato 40000', deLocal('2026-09-18 13:00:00'));
  await guardar(bot, 'almuerzo 1000000', deLocal('2026-09-28 13:00:00'));
  // octubre hasta el 19: comida 115.000 (+15 %), mecato 20.000 (-50 %)
  await guardar(bot, 'almuerzo 115000', deLocal('2026-10-08 13:00:00'));
  await guardar(bot, 'mecato 20000', deLocal('2026-10-15 13:00:00'));
  return bot.repo.cargar();
}

test('comparativa: variación por categoría contra el mismo tramo del mes pasado', async () => {
  const d = await conDosMeses();
  const c = comparativaMensual(d, AHORA); // lunes 19 de octubre
  const comida = c.filas.find(f => f.cuentaId === 'cat:comida')!;
  const mecato = c.filas.find(f => f.cuentaId === 'cat:mecato')!;
  assert.deepEqual([comida.actual, comida.anterior, comida.variacion], [115000, 100000, 15]);
  assert.deepEqual([mecato.actual, mecato.anterior, mecato.variacion], [20000, 40000, -50]);
  assert.equal(c.totalActual, 135000);
  assert.equal(c.totalAnteriorMismosDias, 140000);
  assert.equal(c.variacionTotal, -4);
  assert.equal(c.dia, 19);
  assert.equal(c.diasDelMes, 31);
});

test('proyección: lo gastado entre los días que van, por los días del mes; y no se atreve con pocos días', async () => {
  const d = await conDosMeses();
  const c = comparativaMensual(d, AHORA);
  assert.equal(c.proyeccion, Math.round((135000 / 19) * 31));
  assert.match(textoProyeccion(c) ?? '', /A este ritmo cerrarás el mes en \$/);
  const temprano = comparativaMensual(d, deLocal('2026-10-03 10:00:00'));
  assert.equal(temprano.proyeccion, null, 'con 3 días no proyecta');
  assert.equal(textoProyeccion(temprano), null);
  // sin mes anterior no hay con qué comparar
  const primero = comparativaMensual({ movimientos: [], cuentas: d.cuentas }, AHORA);
  assert.equal(primero.variacionTotal, null);
});

test('alerta de proyección: avisa pasados diez días si el ritmo supera al mes pasado por 15 % o más', async () => {
  const d = await conDosMeses();
  assert.ok(!calcularAlertas(d, AHORA).some(a => a.id === 'proyeccion'), 'el mes pasado fue mucho más grande: no avisa');
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 5000000', deLocal('2026-09-01 08:00:00'));
  await guardar(bot, 'almuerzo 50000', deLocal('2026-09-05 13:00:00'));
  await guardar(bot, 'almuerzo 300000', deLocal('2026-10-05 13:00:00'));
  const alertas = calcularAlertas(await bot.repo.cargar(), AHORA);
  assert.ok(alertas.some(a => a.id === 'proyeccion' && /A este ritmo/.test(a.texto)));
});

// ---------------------------------------------------------------- duplicar

test('duplicar un gasto: otro movimiento con fecha de hoy, el original intacto y la partida doble en cero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000 nequi 50000', deLocal('2026-10-01 08:00:00'));
  await guardar(bot, 'almuerzo 12000 nequi', deLocal('2026-10-05 13:00:00'));
  const original = (await bot.repo.cargar()).movimientos.find(x => x.descripcion === 'Almuerzo')!;
  const previo = previsualizarDuplicado(await bot.repo.cargar(), AHORA, original.id);
  assert.ok(previo.ok && previo.movimiento.ocurridoEn.startsWith('2026-10-19') && previo.resumen.includes('$12.000'));
  const nuevoId = await aplicarDuplicado(bot.repo, AHORA, original.id);
  const d = await bot.repo.cargar();
  const copia = d.movimientos.find(x => x.id === nuevoId)!;
  assert.notEqual(nuevoId, original.id);
  assert.equal(d.movimientos.find(x => x.id === original.id)?.ocurridoEn, '2026-10-05 13:00:00', 'el original no cambia');
  assert.equal(copia.asientos.reduce((s, a) => s + a.monto, 0), 0);
  assert.equal(await saldoDeCuenta(bot, 'nequi'), 26000, 'dos almuerzos de 12.000');
  assert.equal(copia.editadoEn ?? null, null, 'una copia no nace «editada»');
});

test('duplicar: avisa si la cuenta no alcanza y no deja duplicar lo que arrastra a otras personas', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 20000', deLocal('2026-10-01 08:00:00'));
  await guardar(bot, 'almuerzo 15000', deLocal('2026-10-05 13:00:00'));
  const g = (await bot.repo.cargar()).movimientos.find(x => x.descripcion === 'Almuerzo')!;
  const r = previsualizarDuplicado(await bot.repo.cargar(), AHORA, g.id);
  assert.ok(r.ok && r.avisos.some(a => /quedaría en -/.test(a)));
  await guardar(bot, 'presté 1000 a Ana');
  const prestamo = (await bot.repo.cargar()).movimientos.find(x => x.tipo === 'prestamo')!;
  const p = previsualizarDuplicado(await bot.repo.cargar(), AHORA, prestamo.id);
  assert.ok(!p.ok && /chat/.test(p.motivo));
  const apertura = (await bot.repo.cargar()).movimientos.find(x => x.tipo === 'apertura')!;
  assert.ok(!previsualizarDuplicado(await bot.repo.cargar(), AHORA, apertura.id).ok);
});

// ---------------------------------------------------------------- pulso del chat

test('pulso: gasto de los últimos días', async () => {
  const d = await conDosMeses();
  const dias = gastoDiario(d, AHORA, 7); // lunes 19 de octubre
  assert.equal(dias.length, 7);
  assert.equal(dias[6].fecha, '2026-10-19');
  assert.equal(dias[6].diaSemana, 1, 'el 19 de octubre de 2026 es lunes');
  assert.equal(dias[4].fecha, '2026-10-17');
  assert.deepEqual(gastoDiario(d, deLocal('2026-10-15 20:00:00'), 3).map(x => x.total), [0, 0, 20000], 'el 15 sí cuenta; el 8 queda fuera de los tres días');
});

test('mapa de calor y barras de seis meses: los días y los meses salen completos', async () => {
  const d = await conDosMeses();
  const octubre = gastoDelMes(d, 2026, 10);
  assert.equal(octubre.length, 31);
  assert.equal(octubre[7].total, 115000, 'el 8');
  assert.equal(octubre[14].total, 20000, 'el 15');
  assert.equal(octubre[0].diaSemana, 4, 'el 1 de octubre de 2026 es jueves');
  assert.equal(gastoDelMes(d, 2026, 2).length, 28);
  const meses = ingresosGastosPorMes(d, AHORA, 6);
  assert.equal(meses.length, 6);
  assert.equal(meses[5].mes, '2026-10');
  assert.equal(meses[0].mes, '2026-05');
  assert.equal(meses[5].gastos, 135000);
  assert.equal(meses[4].gastos, 1140000, 'septiembre: 100.000 + 40.000 + 1.000.000');
  assert.equal(meses[5].ingresos, 0);
});

// ---------------------------------------------------------------- recordatorio de la noche

test('recordatorio: solo en la media hora elegida y si hoy no se anotó nada', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000', deLocal('2026-10-18 08:00:00'));
  const d = await bot.repo.cargar();
  assert.equal(horaDeRecordatorio('20:30'), '20:30');
  assert.equal(horaDeRecordatorio('20:15'), null, 'solo en punto o y media');
  assert.equal(horaDeRecordatorio(''), null);
  assert.equal(tocaRecordar('20:30', d.movimientos, deLocal('2026-10-19 20:31:00')), true);
  assert.equal(tocaRecordar('20:30', d.movimientos, deLocal('2026-10-19 20:10:00')), false, 'otra media hora');
  assert.equal(tocaRecordar(undefined, d.movimientos, deLocal('2026-10-19 20:31:00')), false, 'apagado');
  await guardar(bot, 'almuerzo 12000', deLocal('2026-10-19 13:00:00'));
  assert.equal(tocaRecordar('20:30', (await bot.repo.cargar()).movimientos, deLocal('2026-10-19 20:31:00')), false, 'ya anotó hoy');
});

// ---------------------------------------------------------------- liquidez, metas con fecha, stock mínimo y corte

test('liquidez a 30 días: avisa cuando una cuenta no alcanza para un pago fijo que viene, y usa la cuenta de la frase', async () => {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000 nequi 30000', antes); await bot.pulsa('ok', antes);
  await bot.di('cada mes el 25 internet 60000 nequi', AHORA); await bot.pulsa('ok', AHORA);
  await bot.di('cada mes el 28 arriendo 100000', AHORA); await bot.pulsa('ok', AHORA);
  const d = await bot.repo.cargar();
  const p = proyeccionLiquidez(d, AHORA, 30); // lunes 19 de octubre
  const nequi = p.find(c => c.cuentaId === 'nequi')!;
  assert.equal(nequi.saldo, 30000);
  assert.equal(nequi.corta?.fecha, '2026-10-25');
  assert.equal(nequi.corta?.faltan, 30000);
  const efectivo = p.find(c => c.cuentaId === 'efectivo')!;
  assert.equal(efectivo.corta, null, 'el arriendo cabe en el efectivo');
  const avisos = avisosDeLiquidez(d, AHORA, 30);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].texto, /Nequi se queda corta el 25\/10 por Internet/);
  assert.ok(calcularAlertas(d, AHORA).some(a => a.id === 'liquidez'), 'sale en las alertas');
});

test('metas con fecha: la cuota semanal reparte lo que falta entre las semanas que quedan', () => {
  assert.deepEqual(cuotaSemanal({ meta: 1000000, apartado: 200000, fecha: '2026-12-14' }, '2026-10-19'), { faltan: 800000, semanas: 8, porSemana: 100000, vencida: false });
  assert.equal(cuotaSemanal({ meta: 1000000, apartado: 200000 }, '2026-10-19'), null, 'sin fecha no hay cuota');
  assert.equal(cuotaSemanal({ meta: 1000, apartado: 1000, fecha: '2026-12-14' }, '2026-10-19'), null, 'ya lograda');
  assert.equal(cuotaSemanal({ meta: 1000000, apartado: 0, fecha: '2026-10-21' }, '2026-10-19')?.semanas, 1, 'menos de una semana cuenta como una');
  assert.equal(cuotaSemanal({ meta: 1000000, apartado: 0, fecha: '2026-10-01' }, '2026-10-19')?.vencida, true);
});

test('corte de turno: ventas, gastos y utilidad del día, y lo que se está acabando según el mínimo', async () => {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000', antes); await bot.pulsa('ok', antes);
  await bot.di('ingreso 90000 trabajo', AHORA); await bot.pulsa('ok', AHORA);
  await bot.di('almuerzo 12000', AHORA); await bot.pulsa('ok', AHORA);
  await bot.di('almuerzo 8000', deLocal('2026-10-18 13:00:00')); await bot.pulsa('ok', AHORA);
  const d = await bot.repo.cargar();
  const c = corteDeTurno(d, AHORA, 'dia');
  assert.equal(c.ventas, 90000);
  assert.equal(c.gastos, 12000, 'el de ayer no entra');
  assert.equal(c.utilidad, 78000);
  assert.deepEqual(c.porFuente, [{ nombre: 'Trabajo', total: 90000 }]);
  assert.equal(corteDeTurno(d, AHORA, 'semana').gastos, 12000, 'AHORA es lunes: la semana empieza hoy y el domingo es de la anterior');
  assert.equal(corteDeTurno(d, deLocal('2026-10-21 10:00:00'), 'semana').gastos, 12000);
  assert.match(textoCorte(c), /Utilidad neta: \$78\.000/);
  assert.match(textoDe(await bot.di('corte', AHORA)), /Utilidad neta: \$78\.000/);
  // stock mínimo: un producto que lleva cuenta y quedó en su mínimo
  const config = { catalogo: JSON.stringify({ productos: [{ id: 'g', nombre: 'Galletas', presentaciones: [{ id: 'granel', nombre: 'granel', precio: 500 }], conteo: { cantidad: 10, desde: '2026-10-01 00:00:00' }, minimo: 12 }] }) };
  assert.deepEqual(stockBajo(config, []), [{ producto: 'Galletas', quedan: 10, minimo: 12 }]);
  assert.deepEqual(stockBajo({ catalogo: JSON.stringify({ productos: [{ id: 'g', nombre: 'Galletas', presentaciones: [{ id: 'granel', nombre: 'granel', precio: 500 }], conteo: { cantidad: 10, desde: '2026-10-01 00:00:00' } }] }) }, []), [], 'sin mínimo no avisa');
});
