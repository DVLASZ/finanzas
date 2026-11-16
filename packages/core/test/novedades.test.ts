/** Botones rápidos del chat, comparativa y proyección del mes, y duplicar un movimiento. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarDuplicado, atajosRapidos, calcularAlertas, calcularSaldos, comparativaMensual, deLocal, previsualizarDuplicado, saldoDe, textoProyeccion,
} from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string, ahora: Date = AHORA) {
  await bot.di(texto, ahora);
  await bot.pulsa('ok', ahora);
}
const saldoDeCuenta = async (bot: ReturnType<typeof nuevoBot>, cuenta: string) => {
  const d = await bot.repo.cargar();
  return saldoDe(calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00'), cuenta, 'COP');
};

// ---------------------------------------------------------------- botones rápidos del chat

test('botones rápidos: lo que se repite, sin duplicados, y el pago fijo que ya toca va primero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  for (const d of ['02', '05', '09']) await guardar(bot, 'mecato 2000', deLocal(`2026-10-${d} 10:00:00`));
  await guardar(bot, 'almuerzo 12000', deLocal('2026-10-10 13:00:00'));
  await bot.di('cada mes el 20 internet 60000', AHORA); await bot.pulsa('ok', AHORA);
  const datos = await bot.repo.cargar();
  const r = atajosRapidos(datos, AHORA);
  assert.equal(r[0].tipo, 'fijo', 'el pago fijo que ya toca primero');
  assert.equal(r[0].frase, 'internet 60000');
  assert.ok(r.some(x => x.tipo === 'frecuente' && x.frase === 'mecato 2000'));
  assert.equal(new Set(r.map(x => x.frase)).size, r.length, 'sin repetidos');
  assert.ok(r.length <= 8);
});

test('botones rápidos: con poco historial muestra lo último que anotaste y los atajos de la app', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  const r = atajosRapidos(await bot.repo.cargar(), AHORA);
  assert.ok(r.some(x => x.tipo === 'reciente' && x.frase === 'almuerzo 12000'));
  assert.ok(r.some(x => x.tipo === 'atajo' && x.frase === 'pasaje'), 'el atajo «pasaje» de la plantilla trae su monto');
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
