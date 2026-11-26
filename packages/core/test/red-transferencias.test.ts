/**
 * Transferencias, cambio de moneda, cuentas y alcancía (casos RED-028, 033, 043, 087 a 094).
 * Un gasto que nombra dos cuentas no es transferencia; lo que no se puede adivinar se pregunta.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, interpretar, MemoriaRepo } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const tarjeta = (t: string): string | null => /Entendí:\n([^\n]+)/.exec(t)?.[1] ?? null;
const botones = (s: { botones?: { id: string }[] }[]): string[] => s.flatMap(x => x.botones ?? []).map(b => b.id);

async function di(frase: string, plantilla?: string) {
  const bot = nuevoBot();
  if (plantilla) bot.repo.aplicarPlantilla(plantilla, {});
  const s = await bot.di(frase);
  return { bot, s, texto: textoDe(s), carta: tarjeta(textoDe(s)), ids: botones(s) };
}

// ---- lo que ya funcionaba y no se puede romper

test('pase 30k de nequi a efectivo: transferencia de Nequi a Efectivo', async () => {
  const { carta } = await di('pase 30k de nequi a efectivo');
  assert.match(carta ?? '', /^Transferencia · \$30\.000 · Nequi → Efectivo/);
});

test('meti 50 lucas a nequi desde efectivo: transferencia de Efectivo a Nequi', async () => {
  const { carta } = await di('meti 50 lucas a nequi desde efectivo');
  assert.match(carta ?? '', /^Transferencia · \$50\.000 · Efectivo → Nequi/);
});

test('pase treinta mil de nequi para efectivo', async () => {
  const { carta } = await di('pase treinta mil de nequi para efectivo');
  assert.match(carta ?? '', /^Transferencia · \$30\.000 · Nequi → Efectivo/);
});

test('cambie 32000 nequi a dolares 8 usd: cambio de moneda', async () => {
  const { carta } = await di('cambie 32000 nequi a dolares 8 usd');
  assert.match(carta ?? '', /^Cambio de moneda · \$32\.000 \(Nequi\) → US\$8,00/);
});

test('saque 100k del cajero y saque cien mil del cajero y los meti a mi billetera: transferencia o pregunta', async () => {
  for (const f of ['saque 100k del cajero', 'saque cien mil del cajero y los meti a mi billetera']) {
    const { carta, texto } = await di(f);
    assert.ok(carta ? /^Transferencia · \$100\.000/.test(carta) : /[¿?]/.test(texto), `${f}: ${texto}`);
  }
});

// ---- dólares

test('pase 100 dolares a nequi: pregunta cuántos pesos llegaron, sin tarjeta', async () => {
  const { carta, texto } = await di('pase 100 dolares a nequi');
  assert.equal(carta, null);
  assert.match(texto, /¿Cuántos pesos/);
  assert.match(texto, /US\$100/);
});

test('mande 20 dolares a nequi y llegaron 78 mil: cambio de US$20 a $78.000', async () => {
  const { carta } = await di('mande 20 dolares a nequi y llegaron 78 mil');
  assert.match(carta ?? '', /^Cambio de moneda · US\$20,00 \(Dólares\) → \$78\.000 \(Nequi\)/);
});

test('mande 20 dolares a mi cuenta de pesos y llegaron 78 mil: pregunta a qué cuenta y el botón arma el cambio', async () => {
  const { bot, carta, texto, ids } = await di('mande 20 dolares a mi cuenta de pesos y llegaron 78 mil');
  assert.equal(carta, null);
  assert.match(texto, /¿A qué cuenta/);
  const nequi = ids.find(i => /nequi/.test(i));
  assert.ok(nequi, ids.join(' ; '));
  const t = textoDe(await bot.pulsa(nequi!));
  assert.match(tarjeta(t) ?? '', /^Cambio de moneda · US\$20,00 \(Dólares\) → \$78\.000 \(Nequi\)/);
});

// ---- cajero

test('retire 40k de nequi pero los deje en el cajero: pregunta, no transferencia', async () => {
  const { carta, texto, ids } = await di('retire 40k de nequi pero los deje en el cajero');
  assert.equal(carta, null, texto);
  assert.match(texto, /¿/);
  assert.ok(ids.length >= 2, ids.join(' ; '));
});

// ---- alcancía

test('rompi la alcancia y salieron 35 mil con cuenta Alcancía: transferencia que sale de la alcancía', async () => {
  const { carta } = await di('rompi la alcancia y salieron 35 mil', 'familia');
  assert.match(carta ?? '', /^Transferencia · \$35\.000 · Alcancía → Monedas/);
});

test('rompi la alcancia y salieron 35 mil sin cuenta Alcancía: pregunta, nunca gasto ni ingreso solo', async () => {
  const { carta, texto, ids } = await di('rompi la alcancia y salieron 35 mil');
  assert.equal(carta, null, texto);
  assert.match(texto, /¿/);
  assert.ok(ids.length >= 2, ids.join(' ; '));
});

// ---- plata que otro guarda

test('le pase mi plata a mi hermana para que me la guarde son 30 mil: pregunta y el botón arma el préstamo', async () => {
  const { bot, carta, texto, ids } = await di('le pase mi plata a mi hermana para que me la guarde son 30 mil');
  assert.equal(carta, null, texto);
  assert.match(texto, /¿/);
  const presto = ids.find(i => /prest/.test(i));
  assert.ok(presto, ids.join(' ; '));
  const t = textoDe(await bot.pulsa(presto!));
  assert.match(tarjeta(t) ?? '', /^Préstamo · .*\$30\.000/);
});

// ---- dos cuentas en un gasto

test('pague 20k con nequi: un gasto con Nequi, Nequi no es un acompañante', async () => {
  const { carta } = await di('pague 20k con nequi');
  assert.match(carta ?? '', /^Gasto · .*\$20\.000 · Nequi/);
});

test('pague 10k en efectivo: gasto en Efectivo', async () => {
  const { carta } = await di('pague 10k en efectivo');
  assert.match(carta ?? '', /^Gasto · .*\$10\.000 · Efectivo/);
});

test('dos montos y dos cuentas sin dividir: el intérprete pregunta, no arma transferencia', () => {
  const ctx = contextoDe(new MemoriaRepo().datos, AHORA);
  for (const f of ['pague 20k con nequi y 10k en efectivo', 'gaste 15000 en nequi y 5000 en daviplata']) {
    const r = interpretar(f, ctx);
    assert.notEqual(r.clase, 'movimiento', `${f}: ${JSON.stringify(r)}`);
    const msg = r.clase === 'pregunta' || r.clase === 'error' ? r.mensaje : '';
    assert.match(msg, /¿/, f);
  }
});

test('pase 50000 de daviplata a nequi: el trozo de transferencia se entiende solo', async () => {
  const { carta } = await di('pase 50000 de daviplata a nequi');
  assert.match(carta ?? '', /^Transferencia · \$50\.000 · Daviplata → Nequi/);
});
