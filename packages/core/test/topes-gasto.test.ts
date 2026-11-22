import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparativaMensual, deLocal, estadoPresupuesto, gastoPorCategoria } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';
import { compararRangos } from '../../../apps/web/src/lib/comparador.ts';
import { ritmoDelMes } from '../../../apps/web/src/lib/graficasResumen.ts';
import { gastoPorDiaSemana } from '../../../apps/web/src/lib/comparador.ts';
import { movimientosDelDia } from '../../../apps/web/src/lib/graficasResumen.ts';

type Bot = ReturnType<typeof nuevoBot>;
const guardar = async (bot: Bot, texto: string, reloj: Date = AHORA) => { await bot.di(texto, reloj); await bot.pulsa('ok', reloj); };

const MES = { desde: '2026-10-01 00:00:00', hasta: '2026-11-01 00:00:00' };

async function conComidaYRestaurante() {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000');
  await bot.di('subcategoria restaurante de comida');
  return bot;
}

test('tope de Comida suma lo anotado en su subcategoría Restaurante', async () => {
  const bot = await conComidaYRestaurante();
  await bot.di('tope comida 100000');
  await guardar(bot, 'almuerzo 40000 restaurante');
  const d = await bot.repo.cargar();
  const e = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:comida', MES.desde, MES.hasta, false, d.config);
  assert.equal(e?.gastado, 40000);
  assert.equal(e?.porcentaje, 40);
});

test('tope en vista Año se escala por los meses y no arrastra; en Semana se prorratea', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000');
  await bot.di('tope mecato 100000');
  await guardar(bot, 'mecato 50000');
  await guardar(bot, 'mecato 50000 hace 40 días');
  await guardar(bot, 'mecato 50000 hace 70 días');
  const d = await bot.repo.cargar();
  const anio = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', '2026-01-01 00:00:00', '2027-01-01 00:00:00', true, d.config);
  assert.equal(anio?.tope, 1200000);
  assert.equal(anio?.gastado, 150000);
  assert.equal(anio?.porcentaje, 13);
  // lunes 19 al lunes 26 de octubre: 7 de 31 días del tope mensual
  const sem = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', '2026-10-19 00:00:00', '2026-10-26 00:00:00', true, d.config);
  assert.equal(sem?.tope, Math.round((100000 * 7) / 31));
  const mes = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', MES.desde, MES.hasta, false, d.config);
  assert.equal(mes?.tope, 100000);
});

test('con arrastre, solo el mes completo suma lo que sobró', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-09-01 08:00:00'));
  await bot.di('tope mecato 100000', deLocal('2026-09-01 08:00:00'));
  await guardar(bot, 'mecato 30000', deLocal('2026-09-10 08:00:00'));
  const d = await bot.repo.cargar();
  const mes = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', MES.desde, MES.hasta, true, d.config);
  assert.equal(mes?.tope, 170000);
  const anio = estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, 'cat:mecato', '2026-01-01 00:00:00', '2027-01-01 00:00:00', true, d.config);
  assert.equal(anio?.tope, 1200000);
});

test('gasto cuenta gasto, compartido y la compra a crédito al anotarla; el Descuadre no cuenta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'mecato 20000');
  await bot.di('debo 30000 a juan por mercado'); await bot.di('mecato'); await bot.pulsa('ok');
  await guardar(bot, 'arqueo efectivo 120000');
  const d = await bot.repo.cargar();
  const filas = gastoPorCategoria(d.movimientos, d.cuentas, MES.desde, MES.hasta);
  // 20.000 de mecato más 30.000 del mercado que quedaste debiendo
  assert.equal(filas.reduce((s, x) => s + x.total, 0), 50000);
  assert.ok(filas.every(x => x.total > 0 && x.cuenta.id !== 'cat:descuadre'));
  const dias = gastoPorDiaSemana(d, MES.desde, MES.hasta);
  assert.equal(dias.reduce((s, x) => s + x.total, 0), 50000);
  assert.equal(movimientosDelDia(d, '2026-10-19').length, 2);
});

test('la comparativa agrupa con subcategorías: mismo gasto en dos meses da igual', async () => {
  const bot = await conComidaYRestaurante();
  const sep = deLocal('2026-09-15 12:00:00');
  await guardar(bot, 'mercado 10000 comida', sep);
  await guardar(bot, 'almuerzo 40000 restaurante', sep);
  await guardar(bot, 'mercado 10000 comida');
  await guardar(bot, 'almuerzo 40000 restaurante');
  const d = await bot.repo.cargar();
  const c = comparativaMensual(d, AHORA);
  const comida = c.filas.find(f => f.cuentaId === 'cat:comida');
  assert.equal(comida?.actual, 50000);
  assert.equal(comida?.anterior, 50000);
  assert.equal(comida?.variacion, 0);
  assert.equal(c.filas.some(f => f.cuentaId === 'cat:restaurante'), false);
  const r = compararRangos(d, { inicio: '2026-09-01', fin: '2026-09-30' }, { inicio: '2026-10-01', fin: '2026-10-31' });
  const fila = r.categorias.find(f => f.id === 'cat:comida');
  assert.equal(fila?.a, 50000);
  assert.equal(fila?.b, 50000);
  assert.equal(fila?.variacion, 0);
});

test('el ritmo no cuenta dos veces el tope de una categoría y el de su subcategoría', async () => {
  const bot = await conComidaYRestaurante();
  await bot.di('tope comida 100000');
  await bot.di('tope restaurante 40000');
  await guardar(bot, 'almuerzo 40000 restaurante');
  const d = await bot.repo.cargar();
  const r = ritmoDelMes(d, AHORA);
  assert.equal(r.presupuesto, 100000);
});
