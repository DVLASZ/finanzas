/** Hallazgos de la auditoría del intérprete: hashtags con s, negaciones, ingresos mal leídos y pagos sin deuda. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function botConSaldos() {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000 nequi 300000', antes);
  await bot.pulsa('ok', antes);
  return bot;
}

/** Escribe una frase (con un paso previo opcional que se confirma) y devuelve lo que contestó el bot. */
async function decir(frase: string, antes: string[] = []) {
  const bot = await botConSaldos();
  for (const a of antes) { await bot.di(a); await bot.pulsa('ok'); }
  const texto = textoDe(await bot.di(frase));
  return { bot, texto };
}

test('los hashtags con la letra s se consultan completos', async () => {
  const bot = await botConSaldos();
  await bot.di('almuerzo 5000 #casa #gastos #sesion');
  await bot.pulsa('ok');
  for (const q of ['#casa', '#gastos', '#sesion', '#casa #gastos']) {
    const t = textoDe(await bot.di(q));
    assert.doesNotMatch(t, /No hay movimientos/, q);
    assert.match(t, /Almuerzo/, q);
  }
});

const NEGADAS = [
  'no me pagaron 50000', 'nunca me pagó 5000 Pedro', 'no pagué 5000', 'no compré 5000', 'no gasté 5000',
  'no le pagué 5000 a Pedro', 'Pedro no me ha pagado 20000', 'todavía no me paga Pedro 20000', 'aún no pagué 5000',
];
for (const frase of NEGADAS) {
  test(`negación sin movimiento: «${frase}»`, async () => {
    const { bot, texto } = await decir(frase);
    assert.match(texto, /no pasó/);
    assert.equal(bot.repo.pendiente, null);
    assert.ok(!bot.repo.datos.cuentas.some(c => c.tipo === 'persona' && /^(no|nunca)$/i.test(c.nombre)));
  });
}

test('«Ana no me pagó» no registra un pago, con o sin préstamo previo', async () => {
  for (const antes of [[], ['presté 80000 a Ana']]) {
    const { bot, texto } = await decir('Ana no me pagó 50000', antes);
    assert.match(texto, /no pasó/);
    assert.equal(bot.repo.pendiente, null);
  }
});

test('el «no» que no es negación de plata se deja como estaba', async () => {
  const { texto } = await decir('Nora me pagó 5000');
  assert.doesNotMatch(texto, /no pasó/);
  assert.match(texto, /Ingreso · Nora/);
});

for (const [frase, esperado] of [
  ['me pagaron 50k de la chamba', /Ingreso · Chamba · \$50\.000/],
  ['me pagaron la quincena 800k', /Ingreso · Quincena · \$800\.000/],
  ['me pagaron 1.5 millones de la nómina', /Ingreso · N[oó]mina · \$1\.500\.000/],
  ['Ana me pagó 50k', /Ingreso · Ana · \$50\.000/],
] as [string, RegExp][]) {
  test(`pagaron sin deuda es ingreso: «${frase}»`, async () => {
    const { bot, texto } = await decir(frase);
    assert.match(texto, esperado);
    assert.equal(bot.repo.pendiente?.propuesta.tipo, 'ingreso');
  });
}

test('«Ana me pagó» con deuda abierta sigue siendo cobro', async () => {
  const { bot, texto } = await decir('Ana me pagó 50k', ['presté 80000 a Ana']);
  assert.match(texto, /Pago · Ana te paga/);
  assert.equal(bot.repo.pendiente?.propuesta.tipo, 'pago');
});

test('pagar a un comercio sin deuda es un gasto', async () => {
  let r = await decir('pagué 20k a netflix');
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'gasto');
  assert.match(r.texto, /Suscripciones/);
  r = await decir('pagué 30k a la universidad');
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'gasto');
  assert.match(r.texto, /Universidad/);
  r = await decir('pagué 30k a ana');
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'gasto');
  assert.doesNotMatch(r.texto, /Te deben/);
});

test('pagar a quien le debes sigue siendo abono, también si te pasas', async () => {
  const { bot, texto } = await decir('pagué 60k a ivan', ['ivan me prestó 54k']);
  assert.equal(bot.repo.pendiente?.propuesta.tipo, 'pago');
  assert.match(texto, /Pago · le pagas a Ivan/);
});

for (const [frase, fuente] of [
  ['salario 2 millones', 'Salario'], ['nómina 2.500.000', 'Nómina'], ['sueldo 2500000 nequi', 'Sueldo'],
  ['devolución 20k', 'Devoluci[oó]n'], ['reembolso 15k', 'Reembolso'], ['me reembolsaron 15k', 'Reembolso'],
  ['me regalaron 30k', 'Regalo'], ['cobro 50k', 'Cobro'], ['me pagan 50k', 'Otros'], ['me van a pagar 50k', 'Otros'],
  ['me cayó 50000', 'Otros'], ['me cayó 50000 de mamá', 'Mam[aá]'],
] as [string, string][]) {
  test(`palabra de ingreso: «${frase}»`, async () => {
    const { bot, texto } = await decir(frase);
    assert.equal(bot.repo.pendiente?.propuesta.tipo, 'ingreso', texto);
    assert.match(texto, new RegExp(`Ingreso · ${fuente} · `));
  });
}

test('«le pagaron» y «pago de ana» no se adivinan', async () => {
  let r = await decir('le pagaron 50k');
  assert.equal(r.bot.repo.pendiente, null);
  assert.match(r.texto, /¿A quién/);
  r = await decir('pago de ana 50k', ['presté 10000 a Ana']);
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'ingreso');
});

test('«pago de luz» sigue siendo gasto y «regalo» suelto también', async () => {
  let r = await decir('pago de luz 50k');
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'gasto');
  r = await decir('regalo 30k');
  assert.equal(r.bot.repo.pendiente?.propuesta.tipo, 'gasto');
});
