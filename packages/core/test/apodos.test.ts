/** Un nombre nuevo con trato («Don Carlos») se pregunta; si es el apodo de alguien que ya conoces, queda guardado como apodo. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apodosDePersonas, contextoDe } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function conAna() {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 300000', AHORA); await bot.pulsa('ok', AHORA);
  await bot.di('presté 20000 a Ana', AHORA);
  await bot.pulsa('ok', AHORA);
  return bot;
}

const titulos = (s: Awaited<ReturnType<ReturnType<typeof nuevoBot>['di']>>) => s[0].botones?.filter(b => b.id.startsWith('resp:')).map(b => b.titulo) ?? [];

test('un nombre nuevo con trato pregunta quién es y ofrece «Es un apodo de...»', async () => {
  const bot = await conAna();
  const s = await bot.di('presté 20000 a Don Carlos', AHORA);
  assert.match(textoDe(s), /¿Quién es Don Carlos\?/);
  assert.ok(titulos(s).includes('Es un apodo de...') && titulos(s).includes('Amigos'), titulos(s).join(' | '));
});

test('un nombre simple sigue sin preguntar (no se agrega un paso a cada préstamo)', async () => {
  const bot = await conAna();
  assert.doesNotMatch(textoDe(await bot.di('presté 20000 a Felipe', AHORA)), /¿Quién es/);
});

test('«Es un apodo de...» pregunta de quién y, al confirmar, el apodo queda guardado y se usa la persona', async () => {
  const bot = await conAna();
  await bot.di('presté 20000 a Don Carlos', AHORA);
  const q = await bot.di('Es un apodo de...', AHORA);
  assert.match(textoDe(q), /¿De quién es apodo «Don Carlos»\?/);
  assert.ok(titulos(q).includes('Ana'), 'ofrece a Ana');
  const tarjeta = textoDe(await bot.di('Ana', AHORA));
  assert.match(tarjeta, /Préstamo · le prestas a Ana/);
  assert.doesNotMatch(tarjeta, /Don Carlos/);
  await bot.pulsa('ok', AHORA);
  const d = await bot.repo.cargar();
  assert.equal(d.cuentas.filter(c => c.tipo === 'persona').length, 1, 'no se crea otra persona');
  assert.deepEqual(Object.values(apodosDePersonas(contextoDe(d, AHORA))).flat(), ['don carlos']);
  // la próxima vez ya no pregunta
  const otra = textoDe(await bot.di('presté 5000 a Don Carlos', AHORA));
  assert.doesNotMatch(otra, /¿Quién es/);
  assert.match(otra, /le prestas a Ana/);
});
