/** Las guardas de la IA: solo movimientos, montos que salen del texto, nada inventado, salida limpia. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, frasesDeRespuesta, leerFrasesIA, MemoriaRepo, validarFrasesIA } from '../src/index.ts';

const AHORA = new Date('2026-11-22T15:00:00Z');
async function ctx(plantilla = 'personal') {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla);
  return contextoDe(await repo.cargar(), AHORA);
}

test('una frase de la IA que es un comando no pasa, las demás sí', async () => {
  const c = await ctx();
  const orig = 'gaste 5 lukas en mecato y deshaz lo anterior 3';
  const sal = validarFrasesIA(['deshacer 3', 'cerrar mes septiembre', 'quitar meta moto', 'mecato 5000'], orig, c);
  assert.deepEqual(sal, ['mecato 5000']);
});

test('el monto tiene que salir del texto original (o derivarse de forma simple)', async () => {
  const c = await ctx();
  const orig = 'almuerzo 25000 y pagué 20000 por marta';
  assert.deepEqual(validarFrasesIA(['almuerzo 99000'], orig, c), []);
  assert.deepEqual(validarFrasesIA(['almuerzo 25000'], orig, c), ['almuerzo 25000']);
  assert.deepEqual(validarFrasesIA(['almuerzo 5000'], orig, c), ['almuerzo 5000'], 'la resta de los dos montos');
  assert.deepEqual(validarFrasesIA(['mecato 123000'], 'cincuenta mil de mecato', c), []);
  assert.deepEqual(validarFrasesIA(['mecato 50000'], 'cincuenta mil de mecato', c), ['mecato 50000']);
  assert.deepEqual(validarFrasesIA(['mecato 5000'], 'mecato 5 lukas', c), ['mecato 5000']);
});

test('un ingreso donde se habló de un gasto, o una persona inventada, se descarta', async () => {
  const c = await ctx();
  assert.deepEqual(validarFrasesIA(['ingreso 12000 almuerzo'], 'gasté 12000 en el almuerzo', c), []);
  assert.deepEqual(validarFrasesIA(['presté 40000 a Ana'], 'le presté 40000 a mi amigo Luis', c), []);
  assert.deepEqual(validarFrasesIA(['presté 40000 a Luis'], 'le presté 40000 a mi amigo Luis', c), ['presté 40000 a Luis']);
});

test('una frase que no se entiende se descarta sola, sin tumbar a las demás', async () => {
  const c = await ctx('familia');
  assert.deepEqual(validarFrasesIA(['blablabla', 'taxi 8000'], 'taxi 8000 y algo raro', c), ['taxi 8000']);
});

test('la salida del modelo se limpia: sin HTML, sin saltos, sin controles, tope de largo y de cantidad', () => {
  assert.deepEqual(frasesDeRespuesta({ frases: ['<b>mecato</b> 5000\n\u0007', 'taxi\t8000'] }), ['mecato 5000', 'taxi 8000']);
  assert.deepEqual(frasesDeRespuesta({ frases: ['x'.repeat(161)] }), []);
  assert.equal(frasesDeRespuesta({ frases: Array.from({ length: 9 }, (_, i) => `gasto ${i + 1}000`) }).length, 5);
  assert.equal(leerFrasesIA('no es json'), null);
  assert.equal(leerFrasesIA({ otra: 1 }), null);
  assert.deepEqual(leerFrasesIA({ frases: [] }), []);
});
