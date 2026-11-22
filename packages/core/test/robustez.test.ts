/**
 * Cosas que encontró el «tester exigente»: frases mal escritas, absurdas o hechas para romper.
 * Cada prueba es un caso real que antes pasaba por la tarjeta cuando debía frenarse.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoriaRepo, procesar } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const di = async (texto: string, plantilla = 'personal') => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla, { personas: [{ nombre: 'Ivan', grupo: 'amigos' }] });
  return textoDe(await procesar(repo, { texto }, AHORA));
};

test('un gasto con monto negativo se rechaza (antes se guardaba como positivo)', async () => {
  assert.match(await di('mecato -5000'), /no puede ser negativo/i);
});

test('montos absurdos se frenan para que se revisen los ceros', async () => {
  for (const f of ['mecato 5000000000', 'mecato 999999999999', 'presté 2900000000 a ivan', '+ 9999999999 chamba', 'ingreso 5000000000 chamba']) {
    assert.match(await di(f), /demasiado grande/i, f);
  }
  assert.match(await di('mecato 1500000000'), /Entendí/, 'mil quinientos millones todavía se acepta');
});

test('fechas que no existen se rechazan en vez de saltar al otro mes', async () => {
  for (const f of ['mecato 5000 el 31 de febrero', 'mecato 5000 el 99/99', 'mecato 5000 el 0/5', 'mecato 5000 32/1', 'mecato 5000 el 30/02', 'mecato 5000 el 31 de abril']) {
    assert.match(await di(f), /esa fecha no existe/i, f);
  }
  assert.match(await di('mecato 5000 el 28/02'), /Entendí/);
  assert.match(await di('mecato 5000 el 29/02/2024'), /Entendí/, 'el 2024 es bisiesto');
  assert.match(await di('mecato 5000 el 29/02/2027'), /esa fecha no existe/i);
});

test('saldo inicial y arqueo con números negativos se rechazan', async () => {
  assert.match(await di('saldo inicial efectivo -5000'), /negativ/i);
  assert.match(await di('arqueo efectivo -100'), /negativ/i);
});

test('tope en cero o negativo se rechaza y explica cómo quitarlo', async () => {
  assert.match(await di('tope mecato 0'), /mayor que cero/i);
  const t = await di('tope mecato -5000');
  assert.doesNotMatch(t, /Tope de Mecato/);
});

test('palabras escritas TODAS EN MAYÚSCULAS no se toman por nombres de personas', async () => {
  for (const f of ['mecato 5000 NEQUI', '5000 ; DROP TABLE cuentas;--', 'PIZZA GRANDE 9000', 'ALMUERZO DE JUAN 12000']) {
    assert.doesNotMatch(await di(f), /¿Quién es/, f);
  }
});

test('una cuenta que la instalación no tiene (Nequi en la empresa) es una palabra más, no una cuenta fantasma', async () => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('empresa');
  const s = await procesar(repo, { texto: 'botellas 63000 nequi' }, AHORA);
  assert.doesNotMatch(textoDe(s), /Nequi · hoy/);
  await procesar(repo, { boton: 'ok' }, AHORA);
  const d = await repo.cargar();
  const ids = new Set(d.cuentas.map(c => c.id));
  for (const m of d.movimientos) for (const a of m.asientos) assert.ok(ids.has(a.cuentaId), `cuenta inexistente ${a.cuentaId}`);
});

test('confirmar dos veces seguidas no guarda dos movimientos', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  await Promise.all([bot.pulsa('ok'), bot.pulsa('ok')]);
  assert.equal((await bot.repo.cargar()).movimientos.length, 1);
});

test('botones inventados o viejos no rompen nada', async () => {
  const bot = nuevoBot();
  for (const b of ['undo:xxx', 'edit:xxx', 'resp:99', 'resp:', 'pago:abc', 'pago:-5', 'pago:0', 'pago:99999999999', 'nada', '']) {
    const s = await bot.pulsa(b);
    assert.ok(s.length > 0 && typeof s[0].texto === 'string', b);
  }
  assert.equal((await bot.repo.cargar()).movimientos.length, 0);
});

test('el atajo de pago con un billete que no alcanza no deja guardar un movimiento torcido', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 8000');
  const t = textoDe(await bot.pulsa('pago:5000'));
  await bot.pulsa('ok');
  for (const m of (await bot.repo.cargar()).movimientos) assert.equal(m.asientos.reduce((s, a) => s + a.monto, 0), 0, t);
});
