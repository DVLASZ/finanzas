/**
 * Reglas aprendidas: «cuando escriba Laura, usa Nequi». Se guardan en la config (`reglas_aprendidas`), se aplican al armar
 * la tarjeta si la frase no dijo cuenta ni categoría, y se ofrecen al editar un movimiento recién creado.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agregarRegla, aplicarEdicion, borrarRegla, buscarRegla, claveDeRegla, editarRegla, leerReglas, reglaSugerida, serializarReglas,
} from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const regla = (clave: string, cuentaId?: string, categoriaId?: string) => ({ id: `r-${clave}`, clave, cuentaId, categoriaId, creada: '2026-10-19 15:00:00' });

test('leer, agregar, editar y borrar reglas; una sola por clave', () => {
  assert.deepEqual(leerReglas({}), []);
  assert.deepEqual(leerReglas({ reglas_aprendidas: 'no es json' }), []);
  let l = agregarRegla([], { clave: 'Laura', cuentaId: 'nequi' }, AHORA);
  assert.equal(l.length, 1);
  assert.equal(l[0].clave, 'laura');
  // la misma clave no duplica: se completa con lo nuevo
  l = agregarRegla(l, { clave: 'laura', categoriaId: 'cat:mecato' }, AHORA);
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].cuentaId, l[0].categoriaId], ['nequi', 'cat:mecato']);
  const ida = serializarReglas(l);
  assert.deepEqual(leerReglas({ reglas_aprendidas: ida }), l);
  l = editarRegla(l, l[0].id, { cuentaId: 'efectivo', categoriaId: null });
  assert.deepEqual([l[0].cuentaId, l[0].categoriaId], ['efectivo', undefined]);
  assert.deepEqual(borrarRegla(l, l[0].id), []);
  // datos basura en la config no rompen nada
  assert.deepEqual(leerReglas({ reglas_aprendidas: JSON.stringify([{ id: 1 }, { id: 'x', clave: '', creada: 'a' }, null]) }), []);
});

test('buscar por palabras completas, sin tildes ni mayúsculas, gana la clave más larga', () => {
  const l = [regla('laura', 'nequi'), regla('almuerzo laura', 'efectivo')];
  assert.equal(buscarRegla(l, 'Almuerzo con LAURA')?.clave, 'laura');
  assert.equal(buscarRegla(l, 'almuerzo laura')?.clave, 'almuerzo laura');
  assert.equal(buscarRegla(l, 'lauraa'), null);
  assert.equal(buscarRegla(l, 'pasaje'), null);
  assert.equal(claveDeRegla('  Ángela  María '), 'angela maria');
});

test('el bot usa la regla si la frase no dice cuenta, y lo cuenta en la tarjeta', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000 nequi 50000'); await bot.pulsa('ok');
  await bot.repo.setConfig('reglas_aprendidas', serializarReglas([regla('laura', 'nequi')]));
  const t = textoDe(await bot.di('almuerzo con laura 12000'));
  assert.match(t, /Usé tu regla: Laura va a Nequi/);
  await bot.pulsa('ok');
  const m = (await bot.repo.cargar()).movimientos.at(-1)!;
  assert.ok(m.asientos.some(a => a.cuentaId === 'nequi' && a.monto < 0), 'salió de Nequi');
});

test('la cuenta escrita en la frase gana a la regla', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000 nequi 50000'); await bot.pulsa('ok');
  await bot.repo.setConfig('reglas_aprendidas', serializarReglas([regla('laura', 'nequi')]));
  const t = textoDe(await bot.di('almuerzo con laura 12000 efectivo'));
  assert.doesNotMatch(t, /Usé tu regla/);
  await bot.pulsa('ok');
  const m = (await bot.repo.cargar()).movimientos.at(-1)!;
  assert.ok(m.asientos.some(a => a.cuentaId === 'efectivo' && a.monto < 0));
});

test('una regla de categoría llena la categoría que faltaba', async () => {
  const bot = nuevoBot();
  await bot.repo.setConfig('reglas_aprendidas', serializarReglas([regla('zzqx', undefined, 'cat:mecato')]));
  const t = textoDe(await bot.di('zzqx 3000'));
  assert.doesNotMatch(t, /categoría va/);
  assert.match(t, /Usé tu regla: Zzqx va a Mecato/);
});

test('una regla con una cuenta que ya no existe se ignora', async () => {
  const bot = nuevoBot();
  await bot.repo.setConfig('reglas_aprendidas', serializarReglas([regla('laura', 'cuenta-que-no-esta')]));
  const t = textoDe(await bot.di('almuerzo con laura 12000'));
  assert.doesNotMatch(t, /Usé tu regla/);
});

test('al editar la cuenta de un movimiento recién creado se sugiere la regla', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000 nequi 50000'); await bot.pulsa('ok');
  await bot.di('almuerzo con laura 12000'); await bot.pulsa('ok');
  const datos = await bot.repo.cargar();
  const m = datos.movimientos.at(-1)!;
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { cuentaId: 'nequi' });
  assert.ok(r.ok);
  const despues = await bot.repo.cargar();
  const s = reglaSugerida(despues, despues.movimientos.at(-1)!, { cuentaId: 'nequi' }, AHORA);
  assert.ok(s);
  assert.equal(s.cuentaId, 'nequi');
  assert.match(s.pregunta, /¿usar Nequi\?/);
  // si ya existe esa regla igual, no se ofrece otra vez
  await bot.repo.setConfig('reglas_aprendidas', serializarReglas([regla(s.clave, 'nequi')]));
  const con = await bot.repo.cargar();
  assert.equal(reglaSugerida(con, con.movimientos.at(-1)!, { cuentaId: 'nequi' }, AHORA), null);
});

test('no se sugiere si no cambió cuenta ni categoría, ni si el movimiento es viejo', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000 nequi 50000'); await bot.pulsa('ok');
  await bot.di('almuerzo con laura 12000'); await bot.pulsa('ok');
  const d = await bot.repo.cargar();
  const m = d.movimientos.at(-1)!;
  assert.equal(reglaSugerida(d, m, {}, AHORA), null);
  const mes = new Date(AHORA.getTime() + 40 * 86400000);
  assert.equal(reglaSugerida(d, m, { cuentaId: 'nequi' }, mes), null);
});
