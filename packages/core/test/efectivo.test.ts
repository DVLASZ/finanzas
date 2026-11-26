/**
 * Billetes, monedas y vuelto.
 * El efectivo es solo de billetes (siempre múltiplo de 1.000); todo lo menor a 1.000 es moneda
 * y las monedas no cuentan en el disponible. Cada pago tiene cuatro cantidades (billetes y monedas
 * entregados, billetes y monedas de vuelto) y se cumple: costo = entregado - vuelto.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, repartir, billeteQueCubre } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

async function saldo(bot: Bot, cuenta: string): Promise<number> {
  const d = await bot.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|COP`) ?? 0;
}

/** Un bot con $10.000 en monedas (así «pagar justo» tiene de dónde sacar las monedas). */
async function botConMonedas(monedas = 10000): Promise<Bot> {
  const bot = nuevoBot();
  await bot.di(`saldo inicial monedas ${monedas}`);
  await bot.pulsa('ok');
  return bot;
}

/** Escribe, muestra la tarjeta, confirma y devuelve cuánto cambiaron Efectivo y Monedas. */
async function pagar(bot: Bot, frase: string) {
  const antes = { e: await saldo(bot, 'efectivo'), m: await saldo(bot, 'monedas') };
  const tarjeta = textoDe(await bot.di(frase));
  assert.match(tarjeta, /Entendí:/, `«${frase}» debía dar una tarjeta: ${tarjeta}`);
  await bot.pulsa('ok');
  return { tarjeta, efectivo: (await saldo(bot, 'efectivo')) - antes.e, monedas: (await saldo(bot, 'monedas')) - antes.m };
}

// ---------------------------------------------------------------- repartir un monto

test('repartir: billetes de 2k o más, y lo que sobra en monedas (1.000 y 3.000 no se forman con billetes)', () => {
  const casos: [number, number, number][] = [
    [2800, 2000, 800], [3000, 2000, 1000], [1000, 0, 1000], [1500, 0, 1500], [500, 0, 500], [200, 0, 200],
    [2000, 2000, 0], [4000, 4000, 0], [5000, 5000, 0], [7000, 7000, 0], [8000, 8000, 0], [9000, 9000, 0],
    [11000, 11000, 0], [19500, 19000, 500], [100000, 100000, 0], [0, 0, 0],
  ];
  for (const [monto, billetes, monedas] of casos) {
    assert.deepEqual(repartir(monto), { billetes, monedas }, `repartir(${monto})`);
  }
});

test('billeteQueCubre: el billete más chico que alcanza', () => {
  assert.equal(billeteQueCubre(2800), 5000);
  assert.equal(billeteQueCubre(5000), 5000);
  assert.equal(billeteQueCubre(5100), 10000);
  assert.equal(billeteQueCubre(19500), 20000);
  assert.equal(billeteQueCubre(100001), 200000);
});

// ---------------------------------------------------------------- las formas de pagar un mecato de $2.800

const FORMAS: [string, number, number][] = [
  ['mecato 2800', -2000, -800],
  ['mecato 2800 justo', -2000, -800],
  ['mecato 2800 con 2k y 800 en monedas', -2000, -800],
  ['mecato 2800 con 5k', -3000, 200],
  ['mecato 2800 con 5k vuelto 2k y 200 monedas', -3000, 200],
  ['mecato 2800 con 5k vuelto 2200', -3000, 200],
  ['mecato 2800 con 5k vuelto 2200 en monedas', -5000, 2200],
  ['mecato 2800 vuelto 200 monedas', -2000, -800],
  ['mecato 2800 con 2k y el resto en monedas', -2000, -800],
];
for (const [frase, ef, mo] of FORMAS) {
  test(`pago: «${frase}» (efectivo ${ef}, monedas ${mo})`, async () => {
    const bot = await botConMonedas();
    const r = await pagar(bot, frase);
    assert.equal(r.efectivo, ef, 'efectivo');
    assert.equal(r.monedas, mo, 'monedas');
    const d = await bot.repo.cargar();
    const gasto = calcularSaldos(d.movimientos, d.config.fecha_apertura).get('cat:mecato|COP');
    assert.equal(gasto, 2800, 'el mecato costó 2.800');
  });
}

test('pago: «mecato 2500 monedas» sale entero de Monedas', async () => {
  const r = await pagar(await botConMonedas(), 'mecato 2500 monedas');
  assert.deepEqual([r.efectivo, r.monedas], [0, -2500]);
});

test('pago: el monto que es un billete con vuelto sin «con» es el billete (almuerzo 20000 vuelto 500 monedas)', async () => {
  const bot = await botConMonedas();
  const r = await pagar(bot, 'almuerzo 20000 vuelto 500 monedas');
  assert.deepEqual([r.efectivo, r.monedas], [-20000, 500]);
  assert.match(r.tarjeta, /\$19\.500/);
  const d = await bot.repo.cargar();
  assert.equal(calcularSaldos(d.movimientos, d.config.fecha_apertura).get('cat:comida|COP'), 19500);
});

test('pago: montos que solo se pueden pagar en monedas (mecato 1500) o solo con billetes (almuerzo 8000, 7000)', async () => {
  const bot = await botConMonedas();
  assert.deepEqual(Object.values(await pagar(bot, 'mecato 1500')).slice(1), [0, -1500]);
  assert.deepEqual(Object.values(await pagar(bot, 'almuerzo 8000')).slice(1), [-8000, 0]);
  assert.deepEqual(Object.values(await pagar(bot, 'almuerzo 7000')).slice(1), [-7000, 0]);
});

// ---------------------------------------------------------------- la tarjeta nunca es muda

test('tarjeta: dice qué asumió cuando no se dice cómo se pagó', async () => {
  const bot = await botConMonedas();
  const t = textoDe(await bot.di('mecato 2800'));
  assert.match(t, /Pagaste justo: \$2\.000 en billete \+ \$800 en monedas/);
  await bot.pulsa('no');
  const [s] = await bot.di('mecato 2800');
  assert.ok(s.botones?.some(b => b.id === 'pago:5000'), 'atajo para pagar con 5.000');
  assert.ok(s.botones?.some(b => b.id === 'pago:10000'), 'atajo para pagar con 10.000');
});

test('tarjeta: con billete y vuelto dicho conserva el texto de siempre', async () => {
  const t = textoDe(await nuevoBot().di('trident 4500 con billete de 10k, me dieron un billete de 5k y 500 en monedas'));
  assert.match(t, /Pagas con \$10\.000 → vuelto: \$5\.000 en billete \+ \$500 en monedas/);
});

test('tarjeta: con billete y sin vuelto, calcula el vuelto y lo dice', async () => {
  const t = textoDe(await nuevoBot().di('trident 4500 con billete de 10k'));
  assert.match(t, /vuelto estimado: \$5\.000 en billete \+ \$500 en monedas/);
  assert.doesNotMatch(t, /no dijiste el vuelto/);
});

test('tarjeta: sin monedas suficientes cambia solo a pagar con billete mayor y lo explica', async () => {
  const bot = await botConMonedas(300);
  const t = textoDe(await bot.di('mecato 2800'));
  assert.match(t, /no tenías monedas suficientes/i);
  assert.match(t, /Pagas con \$5\.000/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -3000);
  assert.equal(await saldo(bot, 'monedas'), 300 + 200);
});

test('atajo «Con $10.000» rehace el cálculo del vuelto', async () => {
  const bot = await botConMonedas();
  await bot.di('mecato 2800');
  const t = textoDe(await bot.pulsa('pago:10000'));
  assert.match(t, /Pagas con \$10\.000 → vuelto estimado: \$7\.000 en billete \+ \$200 en monedas/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -3000);
  assert.equal(await saldo(bot, 'monedas'), 10000 + 200);
});

test('atajo «Justo» vuelve a pagar justo aunque falten monedas', async () => {
  const bot = await botConMonedas(300);
  await bot.di('mecato 2800');
  const t = textoDe(await bot.pulsa('pago:justo'));
  assert.match(t, /Pagaste justo/);
});

// ---------------------------------------------------------------- avisos y errores

test('si lo dicho no cuadra avisa y no deja guardar', async () => {
  const bot = await botConMonedas();
  const t = textoDe(await bot.di('mecato 2800 con 5k vuelto 200 monedas'));
  assert.match(t, /no cuadra/);
  const r = textoDe(await bot.pulsa('ok'));
  assert.match(r, /No pude guardarlo/);
  assert.equal((await bot.repo.cargar()).movimientos.length, 1, 'solo la apertura');
});

test('pagar con menos de lo que costó avisa', async () => {
  const t = textoDe(await nuevoBot().di('mecato 2800 con 2k'));
  assert.match(t, /te faltan \$800/);
});

test('el vuelto sobre una cuenta que no es efectivo se ignora con un aviso', async () => {
  const t = textoDe(await nuevoBot().di('mecato 2800 nequi vuelto 200 monedas'));
  assert.match(t, /vuelto solo aplica al efectivo/i);
});

// ---------------------------------------------------------------- préstamos y otros tipos

test('préstamo en efectivo con billete: «presté 2800 a ana con 5k»', async () => {
  const bot = await botConMonedas();
  const r = await pagar(bot, 'presté 2800 a ana con 5k');
  assert.deepEqual([r.efectivo, r.monedas], [-3000, 200]);
  assert.equal(await saldo(bot, 'per:ana'), 2800);
});

test('préstamo: «presté 20000 a ana vuelto 500 monedas» presta 19.500', async () => {
  const bot = await botConMonedas();
  const r = await pagar(bot, 'presté 20000 a ana vuelto 500 monedas');
  assert.deepEqual([r.efectivo, r.monedas], [-20000, 500]);
  assert.equal(await saldo(bot, 'per:ana'), 19500);
});

test('un ingreso en efectivo que no es múltiplo de 1.000 deja la parte menor en Monedas', async () => {
  const bot = await botConMonedas();
  const r = await pagar(bot, 'ingreso 150500 chamba');
  assert.deepEqual([r.efectivo, r.monedas], [150000, 500]);
});

// ---------------------------------------------------------------- editar

test('editar: «con 10k» cambia con qué se pagó y recalcula el vuelto', async () => {
  const bot = await botConMonedas();
  await bot.di('mecato 2800');
  await bot.pulsa('edit');
  const t = textoDe(await bot.di('con 10k'));
  assert.match(t, /Pagas con \$10\.000 → vuelto estimado/);
});

test('editar: «justo» fija pagar justo', async () => {
  const bot = await botConMonedas(300);
  await bot.di('mecato 2800');
  await bot.pulsa('edit');
  const t = textoDe(await bot.di('justo'));
  assert.match(t, /Pagaste justo/);
});

test('editar: cambiar el monto con un «con» dicho vuelve a calcular y avisa si no cuadra', async () => {
  const bot = await botConMonedas();
  await bot.di('mecato 2800 con 5k vuelto 2k y 200 monedas');
  await bot.pulsa('edit');
  const t = textoDe(await bot.di('monto 3000'));
  assert.match(t, /no cuadra/);
});

// ---------------------------------------------------------------- propiedades

test('propiedad: el efectivo siempre es múltiplo de 1.000 y todo suma cero, con cualquier forma de pagar', async () => {
  const costos = [100, 200, 500, 1000, 1500, 2000, 2800, 3000, 3700, 4500, 5000, 7500, 9900, 12300, 19500, 20000, 36000, 54000, 99000];
  const formas = ['', ' justo', ' con 100k', ' con 50k', ' con 20k', ' con 10k', ' monedas'];
  const bot = await botConMonedas(1000000);
  for (const c of costos) {
    for (const f of formas) {
      if (f === ' con 10k' && c > 10000) continue;
      if (f === ' con 20k' && c > 20000) continue;
      if (f === ' con 50k' && c > 50000) continue;
      await pagar(bot, `mecato ${c}${f}`);
      assert.equal(Math.abs((await saldo(bot, 'efectivo')) % 1000), 0, `efectivo después de «mecato ${c}${f}»`);
    }
  }
  for (const m of (await bot.repo.cargar()).movimientos) {
    const porMoneda = new Map<string, number>();
    for (const a of m.asientos) porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? 0) + a.monto);
    for (const [mon, suma] of porMoneda) assert.equal(suma, 0, `${m.descripcion} (${mon})`);
  }
});
