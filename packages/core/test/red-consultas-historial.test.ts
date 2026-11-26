/** Preguntas sobre el historial con datos sembrados: contestan con cifras y nunca crean un movimiento. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function sembrar(...frases: string[]) {
  const bot = nuevoBot();
  for (const f of frases) {
    const r = textoDe(await bot.di(f));
    if (r.includes('¿En qué categoría')) await bot.pulsa('resp:0');
    await bot.pulsa('ok');
  }
  return bot;
}
const vivos = (bot: Awaited<ReturnType<typeof sembrar>>) => bot.repo.datos.movimientos.length;

test('el último gasto y el más grande salen del historial', async () => {
  const bot = await sembrar('mercado 90000 ayer', 'almuerzo 18000');
  const n = vivos(bot);
  assert.match(textoDe(await bot.di('cuál fue el último gasto que anoté')), /18\.000/);
  assert.match(textoDe(await bot.di('cuál ha sido mi gasto más grande en todo el año')), /90\.000/);
  assert.equal(vivos(bot), n);
});

test('préstamos sin cobrar y posición con una persona', async () => {
  const bot = await sembrar('le presté 90000 a Pipe');
  assert.match(textoDe(await bot.di('qué préstamos no me han pagado todavía')), /Pipe: \$90\.000/);
  assert.match(textoDe(await bot.di('quién le debe a quién entre Pipe y yo')), /Pipe te debe \$90\.000/);
  assert.match(textoDe(await bot.di('cuánto le he pagado')), /¿A quién/);
});

test('sin datos lo dice en vez de inventar', async () => {
  const bot = await sembrar('almuerzo 18000');
  assert.match(textoDe(await bot.di('cuánto pagué de comida cuando salí con mis compañeros del trabajo')), /No tengo información/);
  assert.match(textoDe(await bot.di('cuánto tenía en efectivo al empezar el lunes')), /no puedo reconstruir/);
  assert.match(textoDe(await bot.di('cuál es mi promedio diario de gastos este mes')), /días transcurridos/);
});
