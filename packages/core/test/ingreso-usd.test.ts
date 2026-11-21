/**
 * Ingresos en dólares: van a la cuenta de Dólares en USD y nunca se vuelven pesos.
 * Antes se guardaban como COP en una clave huérfana 'arq|COP' que ninguna pantalla mostraba.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, totalIngresos, MemoriaRepo, procesar } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function saldos(bot: ReturnType<typeof nuevoBot>) {
  const d = await bot.repo.cargar();
  return { d, s: calcularSaldos(d.movimientos, d.config.fecha_apertura) };
}

async function conDolares() {
  const bot = nuevoBot();
  await bot.di('saldo inicial dolares 50 usd'); await bot.pulsa('ok');
  return bot;
}

test('ingreso en usd a la cuenta de dólares sube el saldo en USD y no en pesos', async () => {
  const bot = await conDolares();
  const t = textoDe(await bot.di('ingreso 20 usd en dolares sueldo'));
  assert.match(t, /US\$20,00/);
  await bot.pulsa('ok');
  const { d, s } = await saldos(bot);
  assert.equal(s.get('arq|USD'), 7000);
  assert.equal(s.get('arq|COP') ?? 0, 0);
  const ultimo = d.movimientos.at(-1)!;
  assert.ok(ultimo.asientos.every(a => a.moneda === 'USD'));
  assert.equal(ultimo.asientos.reduce((x, a) => x + a.monto, 0), 0);
  assert.equal(totalIngresos(d.movimientos, d.cuentas, '2000-01-01', '2100-01-01'), 0);
});

test('ingreso sin moneda pero a la cuenta de dólares se anota en USD', async () => {
  const bot = await conDolares();
  await bot.di('ingreso 30 sueldo dolares'); await bot.pulsa('ok');
  const { s } = await saldos(bot);
  assert.equal(s.get('arq|USD'), 8000);
  assert.equal(s.get('arq|COP') ?? 0, 0);
});

test('ingreso en usd sin cuenta va a la cuenta de dólares, no al efectivo', async () => {
  const bot = await conDolares();
  await bot.di('ingreso 20 usd sueldo'); await bot.pulsa('ok');
  const { s } = await saldos(bot);
  assert.equal(s.get('arq|USD'), 7000);
  assert.equal(s.get('efectivo|COP') ?? 0, 0);
});

test('ingreso en usd a una cuenta de pesos no guarda nada y explica', async () => {
  const bot = await conDolares();
  const t = textoDe(await bot.di('ingreso 20 usd en nequi sueldo'));
  assert.match(t, /Para anotar dólares usa la cuenta de Dólares/);
  const { d } = await saldos(bot);
  assert.equal(d.movimientos.length, 1);
});

test('anular el ingreso en dólares devuelve el saldo', async () => {
  const bot = await conDolares();
  await bot.di('ingreso 20 usd en dolares sueldo'); await bot.pulsa('ok');
  await bot.di('anular'); await bot.pulsa('ok');
  const { s } = await saldos(bot);
  assert.equal(s.get('arq|USD'), 5000);
});

test('instalación sin cuenta de dólares: usd da el aviso y los pesos siguen igual', async () => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('familia', {});
  const di = (texto: string) => procesar(repo, { texto }, AHORA);
  const t = textoDe(await di('ingreso 20 usd sueldo'));
  assert.match(t, /Para anotar dólares usa la cuenta de Dólares/);
  const s = textoDe(await di('ingreso 50000 sueldo'));
  assert.match(s, /\$50\.000/);
});
