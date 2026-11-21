/** Montos dichos en palabras o con jerga: femenino de las centenas, «y» entre decenas, «y medio», «mil millones» y el apóstrofo. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aMinor, hallarMontos, limpiar, normalizarDictado } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

/** Primer monto de la tarjeta que arma el bot, como texto («$200.000»), y el resto de la tarjeta. */
async function tarjeta(mensaje: string): Promise<{ monto: string | null; texto: string }> {
  const texto = textoDe(await nuevoBot().di(mensaje));
  return { monto: /· (\$[\d.]+) ·/.exec(texto)?.[1] ?? null, texto };
}

test('centenas en femenino: doscientas mil, quinientas mil', async () => {
  assert.equal((await tarjeta('mecato doscientas mil')).monto, '$200.000');
  assert.equal((await tarjeta('mecato trescientas mil')).monto, '$300.000');
  assert.equal((await tarjeta('mecato quinientas mil')).monto, '$500.000');
  assert.equal((await tarjeta('mecato setecientas cincuenta mil')).monto, '$750.000');
  assert.equal((await tarjeta('mecato novecientas mil')).monto, '$900.000');
  const ing = await tarjeta('ingreso doscientas mil chamba');
  assert.equal(ing.monto, '$200.000');
  assert.match(ing.texto, /Chamba/);
  assert.doesNotMatch(ing.texto, /Doscientas/);
  const pre = await tarjeta('presté doscientas mil a ana');
  assert.equal(pre.monto, '$200.000');
  assert.doesNotMatch(pre.texto, /Doscientas/);
});

test('decenas unidas con «y»: veinte y cinco, diez y seis, treinta y un', () => {
  assert.equal(normalizarDictado('veinte y cinco mil'), '25000');
  assert.equal(normalizarDictado('diez y seis mil'), '16000');
  assert.equal(normalizarDictado('treinta y un mil'), '31000');
  assert.equal(normalizarDictado('treinta y una mil'), '31000');
  assert.equal(normalizarDictado('veintiún mil'), '21000');
  assert.equal(normalizarDictado('veintiuna mil'), '21000');
  assert.equal(normalizarDictado('veintiuno'), '21');
  assert.equal(normalizarDictado('treinta y cinco mil'), '35000');
});

test('decenas con «y» en el bot, también con lucas', async () => {
  assert.equal((await tarjeta('mecato veinte y cinco mil')).monto, '$25.000');
  assert.equal(normalizarDictado('treinta y una lucas'), '31 lucas');
  assert.equal((await tarjeta('mecato diez y seis mil')).monto, '$16.000');
});

test('medio y media: millón y medio, medio millón, luca y media', async () => {
  assert.equal(normalizarDictado('dos millones y medio'), '2500000');
  assert.equal(normalizarDictado('medio millón'), '500000');
  assert.equal(normalizarDictado('un millón y medio'), '1500000');
  const m = await tarjeta('mecato dos millones y medio');
  assert.equal(m.monto, '$2.500.000');
  assert.doesNotMatch(m.texto, /medio/i);
  assert.equal((await tarjeta('arriendo 1 millón y medio')).monto, '$1.500.000');
  assert.equal((await tarjeta('arriendo millón y medio')).monto, '$1.500.000');
  assert.equal((await tarjeta('mecato una luca y media')).monto, '$1.500');
  assert.equal((await tarjeta('mecato 3 lucas y media')).monto, '$3.500');
  assert.equal((await tarjeta('mecato media luca')).monto, '$500');
  assert.equal((await tarjeta('mecato 4 mil y medio')).monto, '$4.500');
  assert.equal((await tarjeta('mecato medio millón')).monto, '$500.000');
  assert.equal((await tarjeta('mecato un cuarto de millón')).monto, '$250.000');
  const ing = await tarjeta('ingreso dos millones y medio chamba');
  assert.equal(ing.monto, '$2.500.000');
  assert.doesNotMatch(ing.texto, /Medio/);
  const pre = await tarjeta('presté medio millón a ana');
  assert.equal(pre.monto, '$500.000');
  assert.doesNotMatch(pre.texto, /Medio/);
});

test('mil millones: vale mil millones y el tope lo rechaza si pasa de dos mil', async () => {
  assert.equal(normalizarDictado('mil millones'), '1000000000');
  assert.equal(normalizarDictado('dos mil millones'), '2000000000');
  assert.equal((await tarjeta('mecato mil millones')).monto, '$1.000.000.000');
  // con cifras el tope responde con su mensaje; en palabras el intérprete cae al texto original y pide el monto, sin guardar nada
  const grande = await tarjeta('mecato 3.000.000.000');
  assert.equal(grande.monto, null);
  assert.match(grande.texto, /demasiado grande/);
  const enPalabras = await tarjeta('mecato tres mil millones');
  assert.equal(enPalabras.monto, null);
  assert.doesNotMatch(enPalabras.texto, /1.00[0-9].000|3.001.000/);
});

test("apóstrofo de millones: 1'200.000", async () => {
  assert.deepEqual(hallarMontos(limpiar("1'200.000")).map(m => m.valor), [1200000]);
  assert.equal((await tarjeta("ingreso 1'200.000 nómina")).monto, '$1.200.000');
  assert.equal((await tarjeta("cambio 1'000.000 nequi a efectivo")).monto, '$1.000.000');
  assert.equal(limpiar("d'Artagnan"), 'd artagnan');
});

test('lo que ya funcionaba sigue igual', async () => {
  const casos: [string, string][] = [
    ['mecato 15k', '$15.000'], ['mecato quince mil', '$15.000'], ['mecato 2,5 millones', '$2.500.000'],
    ['mecato ciento veinte mil quinientos', '$120.500'], ['mecato 120.500', '$120.500'], ['mecato mil quinientos', '$1.500'],
    ['mecato una luca', '$1.000'], ['mecato cien lucas', '$100.000'], ['mecato 2mil', '$2.000'], ['mecato 1 palo', '$1.000.000'],
    ['mecato treinta y cinco mil', '$35.000'], ['mecato un millón doscientos mil', '$1.200.000'], ['mecato quince quinientos', '$15.500'],
  ];
  for (const [msg, esperado] of casos) assert.equal((await tarjeta(msg)).monto, esperado, msg);
});

test('dólares: coma con tres cifras es decimal y el redondeo es a centavos', () => {
  const v = (t: string) => hallarMontos(limpiar(t)).map(m => m.valor);
  assert.deepEqual(v('1,005 usd'), [1.005]);
  assert.deepEqual(v('12,5 dólares'), [12.5]);
  assert.deepEqual(v('12.50 usd'), [12.5]);
  assert.deepEqual(v('1.200.000'), [1200000]);
  assert.equal(aMinor(1.005, 'USD'), 101);
  assert.equal(aMinor(0.29, 'USD'), 29);
  assert.equal(aMinor(8.285, 'USD'), 829);
  assert.equal(aMinor(8, 'USD'), 800);
  assert.equal(aMinor(5000, 'COP'), 5000);
});

test('treinta y una lucas en un mensaje completo da 31.000', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('mecato treinta y una lucas'));
  assert.match(t, /\$31\.000/);
});
