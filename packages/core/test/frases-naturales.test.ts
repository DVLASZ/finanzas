/** Frases como las dice la gente: modismos, dinero en palabras, gastos compartidos y casos que piden aclarar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function botConSaldos() {
  const bot = nuevoBot();
  const antes = deLocal('2026-10-01 08:00:00');
  await bot.di('saldo inicial efectivo 500000 nequi 300000 daviplata 100000', antes);
  await bot.pulsa('ok', antes);
  return bot;
}

/** Cada fila: la frase y lo que tiene que decir el bot al entenderla. */
const ENTIENDE: [string, RegExp][] = [
  // dinero dicho de mil maneras
  ['sesenta mil de almuerzo', /Comida · \$60\.000/],
  ['almuerzo quince quinientos', /\$15\.500/],
  ['cena treinta lucas', /\$30\.000/],
  ['taxi 2 lucas', /Taxi · \$2\.000/],
  ['mercado un palo', /\$1\.000\.000/],
  ['mecato dos barras', /Mecato · \$2\.000/],
  ['tinto 3 mil', /\$3\.000/],
  ['gasolina 50 lucas con tarjeta', /\$50\.000/],
  // plata que entra
  ['me giraron 80 mil a neki', /Ingreso · .* \$80\.000 · Nequi/],
  ['me soltaron 30 lucas', /Ingreso · .* \$30\.000/],
  ['me pasaron 50k', /Ingreso · .* \$50\.000/],
  ['me cayeron 150 mil en daviplata', /Ingreso · .* \$150\.000 · Daviplata/],
  ['Ana me giró 50k nequi', /Ingreso · Ana · \$50\.000 · Nequi/],
  ['recibí 1 millón de la quincena', /Ingreso · .* \$1\.000\.000/],
  // deudas y préstamos
  ['me fiaron 20k en la tienda de doña Rosa', /Deuda · le debes a Rosa · \$20\.000/],
  ['quedé debiendo 15 mil a Pedro', /Deuda · le debes a Pedro · \$15\.000/],
  ['Luis me debe 20k del taxi', /Préstamo · le prestas a Luis · \$20\.000/],
  ['le presté 40k a Ana', /Préstamo · le prestas a Ana · \$40\.000/],
  // verbos de uso diario
  ['me tocó poner 30k para el taxi', /Gasto · Transporte · Taxi · \$30\.000/],
  ['pasé 50k de nequi a efectivo', /Transferencia · \$50\.000 · Nequi → Efectivo/],
  ['pasé de efectivo a nequi 30 mil', /Transferencia · \$30\.000 · Efectivo → Nequi/],
  ['saqué 100k del cajero', /Transferencia · \$100\.000 · .* → Efectivo/],
  // gastos compartidos con reparto claro
  ['fui a comer con Ana y Luis, pagué 60k por los 3', /Gasto compartido · .* \$60\.000[\s\S]*Tu parte: \$20\.000/],
  ['comimos con Ana y Luis, pagué 60 mil entre los tres', /Gasto compartido[\s\S]*Tu parte: \$20\.000/],
  ['mitad y mitad con Ana el almuerzo de 40k', /Gasto compartido[\s\S]*Tu parte: \$20\.000/],
  ['voy a medias con Ana, 40k', /Gasto compartido[\s\S]*Tu parte: \$20\.000/],
  ['cine con Ana 30k a medias', /Gasto compartido · Salidas · \$30\.000[\s\S]*Tu parte: \$15\.000/],
  ['pizza 40k entre Ana, Luis, Marta y yo', /Gasto compartido[\s\S]*Tu parte: \$10\.000/],
  ['cada quien pone su parte, almuerzo 45k con Pedro y Marta', /Gasto compartido[\s\S]*Tu parte: \$15\.000/],
  ['pagué 50k, 30k míos y 20k de Ana en el almuerzo', /Gasto compartido · .* \$50\.000[\s\S]*Tu parte: \$30\.000/],
  ['cada uno puso 20k en el almuerzo con Ana y Luis', /Gasto · Comida · \$20\.000/],
  ['invité a Ana y Luis a comer 60k', /Gasto · Comida · \$60\.000/],
  ['Ana pagó mi parte de la cena 20k', /Deuda · le debes a Ana · \$20\.000/],
];

for (const [frase, esperado] of ENTIENDE) {
  test(`frase natural: «${frase}»`, async () => {
    const bot = await botConSaldos();
    assert.match(textoDe(await bot.di(frase, AHORA)), esperado);
  });
}

/** Frases que pueden significar dos cosas: el bot pregunta con botones en vez de adivinar. */
const PREGUNTA: [string, RegExp, RegExp][] = [
  ['hicimos vaca de 60k con Ana y Luis para el almuerzo', /Con Ana y Luis, \$60\.000 en total/, /Dividir entre los 3 \(\$20\.000 c\/u\)/],
  ['hice vaca con Ana para el regalo 100k', /Con Ana, \$100\.000 en total/, /Dividir entre los 2 \(\$50\.000 c\/u\)/],
  ['pagué lo de Ana y lo mío, 40k', /Con Ana, \$40\.000 en total/, /Yo invité todo \(\$40\.000\)/],
  ['comimos con Ana y Luis, pagué 60k', /Con Ana y Luis, \$60\.000 en total/, /Yo invité todo \(\$60\.000\)/],
  ['comimos 4 y pagué yo 80k', /Eran 4 y pagaste \$80\.000/, /Solo mi parte \(\$20\.000\)/],
  ['pagué 90 mil de la cuenta, éramos 3', /Eran 3 y pagaste \$90\.000/, /Todo lo que pagué \(\$90\.000\)/],
];

for (const [frase, pregunta, boton] of PREGUNTA) {
  test(`frase ambigua: «${frase}» pregunta antes de anotar`, async () => {
    const bot = await botConSaldos();
    const s = await bot.di(frase, AHORA);
    assert.match(textoDe(s), pregunta);
    const titulos = (s[0].botones ?? []).map(b => b.titulo).join(' / ');
    assert.match(titulos, boton);
    assert.match(titulos, /Otro reparto|Con nombres/);
  });
}

test('el botón de una aclaración anota el reparto elegido', async () => {
  const bot = await botConSaldos();
  const s = await bot.di('hicimos vaca de 60k con Ana y Luis para el almuerzo', AHORA);
  const dividir = (s[0].botones ?? []).find(b => /Dividir entre los 3/.test(b.titulo));
  assert.ok(dividir);
  assert.match(textoDe(await bot.pulsa(dividir.id, AHORA)), /Gasto compartido[\s\S]*Tu parte: \$20\.000/);
});

test('un mensaje con dos movimientos se parte y se confirma de a uno', async () => {
  const bot = await botConSaldos();
  const s = await bot.di('ayer pagué quince mil de almuerzo en efectivo y hoy me giraron 80 mil a nequi', AHORA);
  assert.match(textoDe(s), /Movimiento 1 de 2[\s\S]*Gasto · Comida · \$15\.000/);
});

test('sacar de una meta no se confunde con sacar del cajero', async () => {
  const bot = await botConSaldos();
  await bot.di('meta moto 2000000', AHORA);
  await bot.di('ahorré 150k para moto', AHORA);
  assert.match(textoDe(await bot.di('saqué 80000 de la meta moto', AHORA)), /llevas \$70\.000/);
});

test('una frase larguísima no es plata y no se queda pensando', async () => {
  const bot = await botConSaldos();
  const t0 = Date.now();
  await bot.di('hola '.repeat(300), AHORA);
  assert.ok(Date.now() - t0 < 2000);
});
