import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const vivos = async (bot: ReturnType<typeof nuevoBot>): Promise<number> => (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;

test('borrar con palabras anula lo último, por tipo o por concepto, y deja lo demás', async () => {
  const bot = nuevoBot();
  for (const f of ['Gasté 12k en almuerzo', 'Compré 5k de agua']) { await bot.di(f); await bot.pulsa('ok'); }
  await bot.di('Borra el almuerzo, ese sí lo anoté mal');
  assert.equal(await vivos(bot), 1);
  const t = textoDe(await bot.di('Borra ese último movimiento'));
  assert.match(t, /Anulado/);
  assert.equal(await vivos(bot), 0);
});

test('una corrección larga cambia la tarjeta pendiente en vez de abrir otra', async () => {
  const bot = nuevoBot();
  await bot.di('Gasté 15k en el almuerzo, en efectivo');
  const t = textoDe(await bot.di('Perdón, eran 18k, no 15k'));
  assert.match(t, /\$18\.000/);
  assert.doesNotMatch(t, /tarjeta pendiente sin confirmar/);
});

test('«no lo guardes» cancela la tarjeta pendiente', async () => {
  const bot = nuevoBot();
  await bot.di('Anota un gasto de 30k en ropa');
  assert.match(textoDe(await bot.di('No, espera, no lo guardes')), /Cancelado/);
});
