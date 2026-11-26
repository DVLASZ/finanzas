/**
 * Memoria de la conversación: aclaraciones sobre la tarjeta pendiente, la cola de varios movimientos y las
 * correcciones de lo recién guardado (casos RED-150 a RED-177).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, interpretar } from '../src/index.ts';
import { aclarar, editarFrase, leerOrdenDeCola } from '../src/aclaraciones.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

async function ctx(bot: Bot) { return contextoDe(await bot.repo.cargar(), AHORA); }
async function pendiente(bot: Bot) { return (await bot.repo.leerPendiente())?.propuesta; }
async function cola(bot: Bot) { return (await bot.repo.leerPendiente())?.siguientes ?? []; }
async function guardados(bot: Bot) { return (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok'); }

async function conversa(...turnos: string[]): Promise<{ bot: Bot; ultimo: string }> {
  const bot = nuevoBot();
  let ultimo = '';
  for (const t of turnos) ultimo = textoDe(await bot.di(t));
  return { bot, ultimo };
}

test('aclarar: la cuenta, el monto y la fecha cambian en la tarjeta', async () => {
  const bot = nuevoBot();
  const c = await ctx(bot);
  const r = interpretar('mecato 5000', c);
  assert.equal(r.clase, 'movimiento');
  if (r.clase !== 'movimiento') return;
  const cuenta = aclarar(r.propuesta, 'mentiras fue en nequi', c);
  assert.ok(cuenta && 'propuesta' in cuenta);
  if (cuenta && 'propuesta' in cuenta) assert.equal(cuenta.propuesta.cuentaId, 'nequi');
  const monto = aclarar(r.propuesta, 'eran 21 mil', c);
  assert.ok(monto && 'propuesta' in monto && monto.propuesta.monto === 21000);
  const fecha = aclarar(r.propuesta, 'no, fue antier', c);
  assert.ok(fecha && 'propuesta' in fecha && fecha.propuesta.ocurridoEn.startsWith('2026-10-17'));
  // lo que no es una aclaración no se toca
  assert.equal(aclarar(r.propuesta, 'almuerzo 12000', c), null);
  assert.equal(aclarar(r.propuesta, 'Casa', c), null);
});

test('una cuenta que no existe no cambia la tarjeta y dice cuáles hay', async () => {
  const bot = nuevoBot();
  const c = await ctx(bot);
  const r = interpretar('mecato 5000', c);
  if (r.clase !== 'movimiento') return assert.fail('no salió tarjeta');
  const x = aclarar(r.propuesta, 'con la tarjeta de crédito', c);
  assert.ok(x && 'aviso' in x && /Nequi/.test(x.aviso));
});

test('leerOrdenDeCola entiende quitar, editar, cancelar, confirmar el resto y en bloque', () => {
  assert.deepEqual(leerOrdenDeCola('quita el del taxi'), { que: 'quitar', cual: { palabra: 'taxi' } });
  assert.deepEqual(leerOrdenDeCola('quita el primero'), { que: 'quitar', cual: { pos: 0 } });
  assert.deepEqual(leerOrdenDeCola('el segundo fue 8000'), { que: 'editar', cual: { pos: 1 }, resto: 'fue 8000' });
  assert.deepEqual(leerOrdenDeCola('mejor cancela todo'), { que: 'cancelarTodo' });
  assert.deepEqual(leerOrdenDeCola('confirma los otros'), { que: 'confirmarResto' });
  assert.deepEqual(leerOrdenDeCola('los tres fueron en efectivo'), { que: 'todos', resto: 'fueron en efectivo' });
  assert.equal(leerOrdenDeCola('almuerzo 5000'), null);
  assert.equal(leerOrdenDeCola('confirmar todos aunque no he revisado los siguientes'), null);
});

test('editarFrase cambia el monto o la cuenta de un movimiento en cola', async () => {
  const bot = nuevoBot();
  const c = await ctx(bot);
  const r = interpretar('taxi 5k', c);
  if (r.clase !== 'movimiento') return assert.fail('no salió tarjeta');
  assert.equal(editarFrase('taxi 5k', r.propuesta, { ...r.propuesta, monto: 8000 }, c), 'taxi 8000');
  const f = editarFrase('taxi 5k', r.propuesta, { ...r.propuesta, cuentaId: 'nequi' }, c);
  assert.ok(f);
  const r2 = interpretar(f!, c);
  assert.ok(r2.clase === 'movimiento' && r2.propuesta.cuentaId === 'nequi' && r2.propuesta.monto === 5000);
});

test('con la pregunta del grupo abierta, «mentiras fue en nequi» cambia la cuenta y la pregunta sigue', async () => {
  const { bot, ultimo } = await conversa('almuerzo 25000 con Ana', 'mentiras fue en nequi');
  const p = await pendiente(bot);
  assert.equal(p?.cuentaId, 'nequi');
  assert.equal(p?.monto, 25000);
  assert.ok(p?.faltantes.length, 'la pregunta de Ana sigue');
  assert.match(ultimo, /Nequi/);
  assert.equal((await cola(bot)).length, 0);
});

test('«y ponle mitad y mitad» lo vuelve compartido con la persona de la tarjeta', async () => {
  const { bot } = await conversa('almuerzo 25000 con Ana', 'mentiras fue en nequi', 'y ponle mitad y mitad');
  const p = await pendiente(bot);
  assert.equal(p?.tipo, 'compartido');
  assert.equal(p?.cuentaId, 'nequi');
  assert.deepEqual(p?.personas, [{ nombre: 'Ana', monto: 12500 }]);
});

test('el taxi que pregunta a dónde fue acepta «eran 21 mil» como monto y no como lugar', async () => {
  const { bot } = await conversa('taxi 12000', 'eran 21 mil');
  const p = await pendiente(bot);
  assert.equal(p?.monto, 21000);
  assert.equal(p?.hasta, undefined);
});

test('«era con Paula, no Laura» cambia la persona en todo lado', async () => {
  const { bot } = await conversa('cena 60000 con Laura', 'era con Paula, no Laura');
  const p = await pendiente(bot);
  assert.equal(p?.persona, 'Paula');
  assert.doesNotMatch(JSON.stringify({ ...p, mensajeOriginal: '' }), /Laura/);
});

test('la naturaleza cambia: regalo, préstamo y deuda', async () => {
  let r = await conversa('le presté 50000 a Diego', 'no, fue un regalo');
  let p = await pendiente(r.bot);
  assert.equal(p?.tipo, 'gasto');
  assert.equal(p?.categoriaId, 'cat:regalos');
  r = await conversa('regalo 70000 a mi hermano', 'espera, me los devuelve el viernes');
  p = await pendiente(r.bot);
  assert.equal(p?.tipo, 'prestamo');
  assert.equal(p?.monto, 70000);
  r = await conversa('me entraron 120000', 'eso fue un préstamo de mi mamá');
  p = await pendiente(r.bot);
  assert.equal(p?.tipo, 'deuda');
  assert.equal(p?.monto, 120000);
});

test('una cola se edita por posición, se le quita uno y se confirma el resto', async () => {
  let r = await conversa('almuerzo 10k; taxi 5k; mecato 3k', 'el segundo fue 8000');
  assert.deepEqual(await cola(r.bot), ['taxi 8000', 'mecato 3k']);
  r = await conversa('almuerzo 10k; taxi 5k; mecato 3k', 'quita el del taxi');
  assert.deepEqual(await cola(r.bot), ['mecato 3k']);
  assert.equal((await pendiente(r.bot))?.monto, 10000);
  r = await conversa('almuerzo 10k; taxi 5k; mecato 3k', 'quita el primero', 'confirma los otros');
  assert.deepEqual((await guardados(r.bot)).map(m => m.descripcion), ['Taxi', 'Mecato']);
  assert.equal(await r.bot.repo.leerPendiente(), null);
  r = await conversa('almuerzo 10k; taxi 5k; mecato 3k', 'mejor cancela todo');
  assert.equal(await r.bot.repo.leerPendiente(), null);
  assert.equal((await guardados(r.bot)).length, 0);
});

test('«ese» con dos movimientos pregunta cuál y no cambia ninguno', async () => {
  const { bot, ultimo } = await conversa('almuerzo 20k; parqueadero 8k', 'ese fue con nequi');
  assert.match(ultimo, /¿Cuál/);
  assert.equal((await pendiente(bot))?.cuentaId, 'efectivo');
  assert.deepEqual(await cola(bot), ['parqueadero 8k']);
});

test('«sí, guarda» confirma y «sí» con preguntas pendientes no guarda', async () => {
  let r = await conversa('pasaje 4000', 'era 4500', 'sí, guarda');
  assert.deepEqual((await guardados(r.bot)).map(m => m.propuesta && (m.propuesta as { monto: number }).monto), [4500]);
  r = await conversa('pagué 15000 a Felipe', 'sí');
  assert.equal((await guardados(r.bot)).length, 0);
});

test('«corrige, fueron 87000» edita lo recién guardado y deja un solo gasto', async () => {
  const { bot, ultimo } = await conversa('mercado 78000', 'guarda', 'corrige, fueron 87000');
  const g = await guardados(bot);
  assert.equal(g.length, 1);
  assert.equal((g[0].propuesta as { monto: number }).monto, 87000);
  assert.equal(await bot.repo.leerPendiente(), null);
  assert.match(ultimo, /Guardado/);
  // el original queda anulado, no borrado
  assert.equal((await bot.repo.cargar()).movimientos.filter(m => m.estado === 'anulado').length, 1);
});

test('después de la pregunta, «era a Andrés Felipe, no Andrés Gómez» la repite con el nombre corregido', async () => {
  const bot = nuevoBot();
  await bot.di('mandé 35000 a Andrés');
  const s = await bot.di('era a Andrés Felipe, no Andrés Gómez');
  assert.match(textoDe(s), /Andrés Felipe/);
  assert.ok(s.flatMap(x => x.botones ?? []).some(b => b.id.startsWith('ia:') && b.id.includes('Andrés Felipe')));
});

test('«mejor registra cine 30000» no mete la muletilla en el concepto', async () => {
  const { bot } = await conversa('mejor registra cine 30000');
  assert.equal((await pendiente(bot))?.concepto, 'Cine');
});

test('«Ana me da 30 y Luis 30» reparte la cena y no repite el aviso de tu parte', async () => {
  const { bot, ultimo } = await conversa('pagué 90000 de la cena de Ana y Luis', 'Ana me da 30 y Luis 30');
  const p = await pendiente(bot);
  assert.equal(p?.tipo, 'compartido');
  assert.deepEqual(p?.personas, [{ nombre: 'Ana', monto: 30000 }, { nombre: 'Luis', monto: 30000 }]);
  assert.doesNotMatch(ultimo, /⚠️/);
  // un gasto nuevo con la tarjeta pendiente no se toma como reparto
  const r = await conversa('almuerzo 20000 con Ana', 'taxi 5000');
  assert.notEqual((await pendiente(r.bot))?.tipo, 'compartido');
});

test('después de una pregunta con botones, «de nequi para efectivo» elige la opción', async () => {
  const { bot } = await conversa('saqué 200000', 'de nequi para efectivo');
  const p = await pendiente(bot);
  assert.equal(p?.tipo, 'transferencia');
  assert.equal(p?.cuentaId, 'nequi');
  assert.equal(p?.cuentaDestinoId, 'efectivo');
});
