import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deLocal, diasTranscurridos, gastosHormiga, pagosProximos, patrimonio, proyeccionLiquidez, rangoPeriodo, resumenSaldos, seguroParaGastar } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

const ANTES = deLocal('2026-10-01 08:00:00');
const DIA10 = deLocal('2026-10-10 10:00:00');

async function di(bot: ReturnType<typeof nuevoBot>, texto: string, reloj: Date = AHORA) {
  await bot.di(texto, reloj);
  await bot.pulsa('ok', reloj);
}

test('un pago fijo ya pagado este mes no se resta de la liquidez ni del seguro (con tilde)', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 100000 nequi 200000', ANTES);
  await di(bot, 'cada mes el 28 cuota de peña 60000 nequi');
  await di(bot, 'cuota de peña 60000 nequi salidas', DIA10);
  const d = await bot.repo.cargar();
  assert.equal(seguroParaGastar(d, AHORA).fijos, 0);
  assert.equal(pagosProximos(d, AHORA, 30).some(p => p.fecha === '2026-10-28'), false);
  const nequi = proyeccionLiquidez(d, AHORA, 30).find(c => c.cuentaId === 'nequi');
  assert.ok(!nequi || nequi.minimo >= 140000, 'el pago ya hecho no baja el mínimo');
  // con otro pago fijo sin pagar, el mínimo solo descuenta ese
  await di(bot, 'cada mes el 27 internet 10000 nequi');
  const n2 = proyeccionLiquidez(await bot.repo.cargar(), AHORA, 30).find(c => c.cuentaId === 'nequi')!;
  assert.equal(n2.saldo, 140000);
  assert.equal(n2.minimo, 130000);
});

test('un pago fijo vencido sin registrar de este mes entra en la proyección', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 100000', ANTES);
  await di(bot, 'cada mes el 5 arriendo 40000');
  const d = await bot.repo.cargar();
  assert.equal(seguroParaGastar(d, AHORA).fijos, 40000);
  const p = pagosProximos(d, AHORA, 30);
  assert.equal(p.filter(x => x.concepto.toLowerCase().includes('arriendo') && x.fecha <= '2026-10-31').length, 1, 'el de octubre sigue pendiente');
  assert.equal(proyeccionLiquidez(d, AHORA, 30).find(c => c.cuentaId === 'efectivo')!.pagos[0].fecha, '2026-10-19', 'vencido: se cuenta desde hoy');
});

test('te queda hoy no descuenta dos veces lo gastado hoy', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 300000', ANTES);
  const antes = seguroParaGastar(await bot.repo.cargar(), deLocal('2026-10-19 08:00:00'));
  await di(bot, 'mecato 20000', deLocal('2026-10-19 15:42:00'));
  const s = seguroParaGastar(await bot.repo.cargar(), AHORA);
  assert.equal(s.dias, 13);
  assert.equal(antes.porDia, 23076);
  assert.equal(s.porDia, 23076, 'el tope de la mañana no cambia al gastar');
  assert.equal(s.gastadoHoy, 20000);
  assert.equal(s.quedaHoy, 3076);
});

test('gastadoHoy no cuenta compras a crédito ni el descuadre', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 300000', ANTES);
  await di(bot, 'mecato 5000');
  await di(bot, 'debo 30000 a juan por mercado');
  assert.equal(seguroParaGastar(await bot.repo.cargar(), AHORA).gastadoHoy, 5000);
  await di(bot, 'arqueo efectivo 250000');
  assert.equal(seguroParaGastar(await bot.repo.cargar(), AHORA).gastadoHoy, 5000, 'el ajuste no es gasto');
});

test('la plata de otros no cuenta como libre ni como neto', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 100000', ANTES);
  await di(bot, 'plata de hugo para juego 31000');
  const d = await bot.repo.cargar();
  const s = seguroParaGastar(d, AHORA);
  assert.equal(s.disponible, 131000, 'el Disponible no cambia');
  assert.equal(s.deOtros, 31000);
  assert.equal(s.libre, 100000);
  const r = resumenSaldos(d.movimientos, d.cuentas, d.config.fecha_apertura ?? '2000-01-01 00:00:00');
  assert.equal(patrimonio(r).neto, 100000);
});

test('el neto no recorta el disponible negativo e incluye monedas y alcancía', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 100000', ANTES);
  const d = await bot.repo.cargar();
  const base = resumenSaldos(d.movimientos, d.cuentas, d.config.fecha_apertura ?? '2000-01-01 00:00:00');
  const negativo = { ...base, disponibleCop: -50000 };
  assert.equal(patrimonio({ ...negativo, cuentas: [] }).neto, -50000);
  const conMonedas = { ...base, cuentas: [{ cuenta: { ...base.cuentas[0].cuenta, id: 'monedas', enDisponible: false }, saldo: 8000 }] };
  assert.equal(patrimonio(conMonedas).neto, base.disponibleCop + 8000);
});

test('gastos hormiga: la proyección usa los días que ya pasaron del periodo', async () => {
  const bot = nuevoBot();
  await di(bot, 'saldo inicial efectivo 500000', ANTES);
  for (const dia of ['02', '05', '09']) await di(bot, 'mecato 2000', deLocal(`2026-10-${dia} 10:00:00`));
  const { desde, hasta } = rangoPeriodo('mes', AHORA);
  assert.equal(diasTranscurridos(desde, hasta, AHORA), 19);
  assert.equal(diasTranscurridos(desde, hasta, deLocal('2026-12-05 10:00:00')), 31, 'periodo ya cerrado: todos sus días');
  assert.equal(diasTranscurridos(desde, hasta, deLocal('2026-09-20 10:00:00')), 1, 'nunca menos de uno');
  const d = await bot.repo.cargar();
  const h = gastosHormiga(d.movimientos, d.cuentas, desde, hasta, diasTranscurridos(desde, hasta, AHORA));
  assert.equal(h.total, 6000);
  assert.equal(h.proyeccionAnual, 115263);
});
