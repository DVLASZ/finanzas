import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diasParaMeta, fraseDeOCR, gastosHormiga, leerMetas, leerRespuestaOCR, rangoPeriodo, seguroParaGastar } from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string) {
  await bot.di(texto, AHORA);
  await bot.pulsa('ok', AHORA);
}

test('seguro para gastar: resta pagos fijos y metas, y reparte entre los días que quedan', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 300000');
  await bot.di('meta bici 500000', AHORA);
  await bot.di('ahorré 50000 para bici', AHORA);
  await bot.di('cada mes el 28 internet 60000', AHORA);
  await bot.pulsa('ok', AHORA);
  const s = seguroParaGastar(await bot.repo.cargar(), AHORA);
  assert.equal(s.disponible, 300000);
  assert.equal(s.apartado, 50000);
  assert.equal(s.fijos, 60000);
  assert.equal(s.libre, 190000);
  assert.equal(s.porDia, Math.floor(190000 / s.dias));
});

test('seguro para gastar: nunca da negativo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 10000');
  await bot.di('cada mes el 28 arriendo 500000', AHORA);
  await bot.pulsa('ok', AHORA);
  const s = seguroParaGastar(await bot.repo.cargar(), AHORA);
  assert.equal(s.libre, 0);
  assert.equal(s.porDia, 0);
  assert.equal(s.enRojo, true);
});

test('gastos hormiga: agrupa compras chicas que se repiten y proyecta al año', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000');
  for (const t of ['mecato 2000', 'mecato 2000', 'mecato 2500', 'transporte 3000', 'almuerzo 40000']) await guardar(bot, t);
  const { desde, hasta } = rangoPeriodo('mes', AHORA);
  const h = gastosHormiga((await bot.repo.cargar()).movimientos, (await bot.repo.cargar()).cuentas, desde, hasta, 31);
  assert.equal(h.top.length, 1);
  assert.equal(h.top[0].veces, 3);
  assert.equal(h.total, 6500);
  assert.equal(h.proyeccionAnual, Math.round((6500 / 31) * 365));
});

test('meta: los aportes quedan con fecha y dan una estimación de días', async () => {
  const bot = nuevoBot();
  await bot.di('meta moto 1000000', AHORA);
  await bot.di('ahorré 100000 para moto', AHORA);
  const m = leerMetas((await bot.repo.cargar()).config)[0];
  assert.equal(m.aportes?.length, 1);
  // 100000 en 60 días de ritmo: faltan 900000, o sea 9 veces más
  assert.equal(diasParaMeta(m, AHORA.toISOString().slice(0, 10)), 540);
  assert.equal(diasParaMeta({ ...m, apartado: m.meta }, '2026-10-27'), null);
});

test('ocr: lee el JSON aunque venga rodeado de texto y arma la frase', () => {
  const l = leerRespuestaOCR('Claro, aquí está: {"monto": "45.000", "fecha": "2026-10-20", "comercio": "Tienda Don Pepe", "categoria": "Mercado"}');
  assert.deepEqual(l, { monto: 45000, fecha: '2026-10-20', comercio: 'Tienda Don Pepe', categoria: 'mercado' });
  assert.equal(fraseDeOCR(l!, '2026-10-27'), 'tienda don pepe 45000 20/10');
  assert.equal(fraseDeOCR(l!, '2026-10-20'), 'tienda don pepe 45000');
  assert.equal(leerRespuestaOCR('no se ve nada'), null);
  assert.equal(leerRespuestaOCR({ monto: 0 }), null);
});
