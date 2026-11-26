/** Preprocesamiento: corrección de errores de ortografía (fuzzy.ts) y cantidades por precio (cantidades.ts). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, MemoriaRepo } from '../src/index.ts';
import { aclararIlegible, corregirTypos, distanciaDL } from '../src/fuzzy.ts';
import { expandirCantidades } from '../src/cantidades.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const AHORA = new Date('2026-11-22T15:00:00Z');
async function ctx() {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('personal', { personas: [{ nombre: 'Daniel', grupo: 'amigos' }] });
  return contextoDe(await repo.cargar(), AHORA);
}

test('distancia de Damerau-Levenshtein: voltear dos letras vecinas cuesta 1', () => {
  assert.equal(distanciaDL('gsate', 'gaste'), 1);
  assert.equal(distanciaDL('almueso', 'almuerzo'), 2);
  assert.equal(distanciaDL('taxy', 'taxi'), 1);
  assert.equal(distanciaDL('nequi', 'nequi'), 0);
});

const CORRIGE: [string, string][] = [
  ['gsate 12 mil en almurzo', 'gaste 12 mil en almuerzo'],
  ['prstamo a faber 40 lucas', 'prestamo a faber 40 lucas'],
  ['arqeo efetivo 80k', 'arqueo efectivo 80k'],
  ['almueso 8500 neqi', 'almuerzo 8500 nequi'],
  ['taxy 9k', 'taxi 9k'],
  ['me pagarn 120k de la quinsena', 'me pagaron 120k de la quincena'],
  ['me devlvieron 15k de neqi', 'me devolvieron 15k de nequi'],
  ['kompre pan 4500', 'compre pan 4500'],
  // la mayúscula del primer mensaje la pone el teclado del celular: no es un nombre
  ['Almurzo 8000', 'almuerzo 8000'],
];

for (const [entra, sale] of CORRIGE) {
  test(`corrige «${entra}»`, async () => assert.equal(corregirTypos(entra, await ctx()), sale));
}

const NO_TOCA: string[] = [
  'preste 25k a danyel', // nombre después de «a»: lo resuelve la búsqueda de personas
  'le pague 20k a Luis',
  'Faber me pago 20k',
  'mi amigo Danyel me debe 5k', // mayúscula en medio de la frase
  'nekui 5000', // las cuentas mal escritas ya las tolera entidades.ts y no cambian de cuenta
  'mecato 10mil', // pegada a una cifra
  'bus 2000', // menos de 4 letras
  '#viaje taxi 8000',
  'paso 20k a nequi', // palabra común
  'trident 3000',
];

for (const frase of NO_TOCA) {
  test(`no toca «${frase}»`, async () => {
    const r = corregirTypos(frase, await ctx());
    assert.ok(r === frase || r === frase.replace('nekui', 'nequi'), r);
  });
}

test('si dos palabras quedan a la misma distancia no corrige', async () => {
  // «gasti» está a un cambio de «gaste» y de «gasto»
  assert.equal(corregirTypos('gasti 5000', await ctx()), 'gasti 5000');
});

test('una palabra ilegible con plata pregunta en vez de inventar un gasto', async () => {
  const r = aclararIlegible('Ibgrwsi 50k', await ctx());
  assert.equal(r?.clase, 'pregunta');
  assert.equal(aclararIlegible('instrumento 50k', await ctx()), null);
  assert.equal(aclararIlegible('almuerzo 5000', await ctx()), null);
});

const CANTIDADES: [string, string][] = [
  ['me tome 3 polas a 4500 cada una', 'me tome 3 polas 13500'],
  ['3 empanadas a 2500', '3 empanadas 7500'],
  ['compre dos paquetes de papas de a dos mil', 'compre dos paquetes de papas 4000'],
  ['compre 3 kilos de papa a 2500 el kilo', 'compre 3 kilos de papa 7500'],
  ['3 pasajes a 2800 c/u', '3 pasajes 8400'],
  ['4 horas de parqueadero a 3000 la hora', '4 horas de parqueadero 12000'],
  ['compre 3 cosas a 2.500 cada una pero una me la regalaron', 'compre 3 cosas 5000'],
  ['compre 2 cositas 5 mil y otras 3 por 2 lucas cada una', 'compre 2 cositas 11000'],
  ['mi abuelito me dio cinco monedas de mil', 'mi abuelito me dio 5000 en monedas'],
  ['se me perdio un billete de 20 en la calle', 'se me perdio un billete de 20000 en la calle'],
  ['me pagaron 2 millones y medio', 'me pagaron 2500000'],
  ['25/11 compre 3 empanadas a 2500', '25/11 compre 3 empanadas 7500'],
  ['recarga de 500 megas por 6000', 'recarga de megas por 6000'],
];

for (const [entra, sale] of CANTIDADES) {
  test(`cantidades: «${entra}»`, () => assert.equal(expandirCantidades(entra), sale));
}

const SIN_CAMBIO = [
  'botella 600ml 3000',
  'pague cuota 2 de 12 por 85000',
  '3 cosas por 6000', // «por» sin «cada una» es el total
  'cambie 20 dolares a 4100',
  'un millón doscientos cincuenta mil',
  'compra: arroz 5000, sal 2000, 3 gaseosas a 2000 nequi',
  'vendí 2 paquetes de 10 a 7 mil',
  'metí 5 monedas de 500 y 3 de mil a la alcancía',
];

for (const frase of SIN_CAMBIO) {
  test(`cantidades no toca «${frase}»`, () => assert.equal(expandirCantidades(frase), frase));
}

const EN_EL_BOT: [string, RegExp][] = [
  ['gsate 12 mil en almurzo', /Gasto · Comida · \$12\.000/],
  ['taxy 9k', /Gasto · Transporte · .*\$9\.000/],
  ['arqeo efetivo 80k', /Contar la plata/],
  ['25/11 compre 3 empanadas a 2500', /\$7\.500 .*25 nov/],
  ['4 horas de parqueadero a 3000 la hora', /\$12\.000/],
  ['un millón doscientos cincuenta mil de matricula', /\$1\.250\.000/],
  ['nekui 5000 mecato', /Nequi/],
];

for (const [frase, esperado] of EN_EL_BOT) {
  test(`en el bot: «${frase}»`, async () => assert.match(textoDe(await nuevoBot().di(frase)), esperado));
}

test('en el bot: «Ibgrwsi 50k» no sale como gasto', async () => {
  const t = textoDe(await nuevoBot().di('Ibgrwsi 50k'));
  assert.doesNotMatch(t, /Gasto ·/);
  assert.match(t, /No entendí «Ibgrwsi»/);
});
