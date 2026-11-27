import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

test('topes: «súbeme el presupuesto a 150k» fija el tope, no lo suma', async () => {
  const b = nuevoBot();
  await b.di('tope transporte 100000');
  const t = textoDe(await b.di('Súbeme el presupuesto de Transporte a 150k'));
  assert.match(t, /Tope de Transporte: \$150\.000/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('topes: una simulación no guarda nada', async () => {
  const b = nuevoBot();
  await b.di('tope personal 100000');
  const t = textoDe(await b.di('Si gasto 40k hoy en ropa, ¿me paso del presupuesto?'));
  assert.match(t, /No te pasas/);
  assert.match(t, /No anoté nada/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('topes: ya pasado del tope muestra el exceso y no cambia el tope', async () => {
  const b = nuevoBot();
  await b.di('tope comida 150000');
  const t = textoDe(await b.di('Ya me gasté 180k en comida y el tope era 150k'));
  assert.match(t, /te pasaste por \$30\.000/);
  assert.equal((await b.repo.cargar()).presupuestos['cat:comida'], 150000);
});

test('topes: dos topes en una frase, y los que no existen se explican', async () => {
  const b = nuevoBot();
  const t = textoDe(await b.di('Déjame 100k para transporte y 200k para comida este mes'));
  assert.match(t, /Transporte: \$100\.000/);
  assert.match(t, /Comida: \$200\.000/);
  assert.match(textoDe(await b.di('Pon el presupuesto de comida en 250k cada quincena')), /\$500\.000 al mes/);
  assert.match(textoDe(await b.di('Quiero gastar máximo 2 millones en viajes durante todo el año')), /son unos \$166\.667 al mes/);
});

test('topes: «125 mil quinientos» es un solo monto', async () => {
  const t = textoDe(await nuevoBot().di('Ponme un tope de 125 mil quinientos para comida'));
  assert.match(t, /\$125\.500/);
});

test('metas: crear, aportar, sacar y ver cuánto falta con palabras', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('Crea una meta de 1.500.000 para cambiar de celular')), /Meta Celular: \$1\.500\.000/);
  assert.match(textoDe(await b.di('Hoy le metí 100k a la meta del celular')), /100\.000/);
  assert.match(textoDe(await b.di('¿Cuánto me falta para completar la meta del celular?')), /faltan \$1\.400\.000/);
  assert.match(textoDe(await b.di('Le saqué 20k al ahorro del celular, pero el resto sigue ahí')), /80\.000/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('metas: lo compartido y los aportes automáticos se explican, no se inventan', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('Armemos una meta entre Laura y yo de 800k para el viaje')), /no hay metas compartidas/);
  await b.di('meta viaje 2000000');
  assert.match(textoDe(await b.di('Aparta 50k cada quincena para el viaje')), /no hay aporte automático/);
});

test('metas: un aporte futuro no mueve nada', async () => {
  const b = nuevoBot();
  await b.di('meta moto 3000000');
  const t = textoDe(await b.di('El viernes voy a meterle 100k al ahorro de la moto'));
  assert.match(t, /todavía no pasó/);
});
