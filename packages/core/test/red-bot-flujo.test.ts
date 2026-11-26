/**
 * Flujo del bot frente a la batería RED: cómo se parte un mensaje con varios movimientos, qué hacen las palabras sueltas
 * con una tarjeta pendiente, la ayuda que llega disfrazada de gasto y la IA que no puede cambiar el tipo de movimiento.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextoDe, dividirLinea, validarFrasesIA } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const vivos = async (bot: ReturnType<typeof nuevoBot>): Promise<number> =>
  (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length;

// ---- partir un mensaje

test('lista numerada y «palabra monto» repetida son varios movimientos', () => {
  assert.deepEqual(dividirLinea('1. almuerzo 5000 2. taxi 3000 3. bus 2500'), ['almuerzo 5000', 'taxi 3000', 'bus 2500']);
  assert.deepEqual(dividirLinea('almuerzo 5000 taxi 3000 bus 2500 mecato 2000 recarga 10000'), ['almuerzo 5000', 'taxi 3000', 'bus 2500', 'mecato 2000', 'recarga 10000']);
  assert.deepEqual(dividirLinea('almuerzo 5000 almuerzo 5000'), ['almuerzo 5000', 'almuerzo 5000']);
});

test('saldos por cuenta, arqueos y repartos no se parten como lista', () => {
  assert.deepEqual(dividirLinea('nequi 15k efectivo 10k'), ['nequi 15k efectivo 10k']);
  assert.deepEqual(dividirLinea('arqueo efectivo 80000 monedas 11500'), ['arqueo efectivo 80000 monedas 11500']);
  assert.deepEqual(dividirLinea('debo 5000 a ana y 3000 a luis'), ['debo 5000 a ana y 3000 a luis']);
  assert.deepEqual(dividirLinea('compre 2 cositas 5 mil y otras 3 por 2 lucas cada una'), ['compre 2 cositas 5 mil y otras 3 por 2 lucas cada una']);
});

test('«y pagué», «y hoy» y «y pasé» separan, y una cifra corta hereda el «mil» del primer monto', () => {
  assert.deepEqual(dividirLinea('mk me tome 3 polas a 4500 cada una y pague el uber 12 barras'), ['mk me tome 3 polas a 4500 cada una', 'pague el uber 12 barras']);
  assert.deepEqual(dividirLinea('ayer pague 8k y hoy otros 8 de bus creo'), ['ayer pague 8k', 'hoy otros 8 mil de bus creo']);
  assert.deepEqual(dividirLinea('me consignaron 80000 en daviplata y pase 50 a nequi'), ['me consignaron 80000 en daviplata', 'pase 50 mil a nequi de daviplata']);
});

test('el verbo del primer trozo se reparte a los que empiezan con la cifra', () => {
  assert.deepEqual(dividirLinea('pague 5mil de comida y 7 de taxi y 3 de agua'), ['pague 5mil de comida', 'pague 7 mil de taxi', 'pague 3 mil de agua']);
  assert.deepEqual(dividirLinea('gaste doce mil en almuerzo y ocho mil en pasajes'), ['gaste 12000 en almuerzo', 'gaste 8000 en pasajes']);
  assert.deepEqual(dividirLinea('pague 20k con nequi y 10k en efectivo'), ['pague 20k con nequi', 'pague 10k en efectivo']);
});

test('en una lista el bus no se queda esperando el recorrido: salen las cuatro tarjetas', async () => {
  const bot = nuevoBot();
  let t = textoDe(await bot.di('almuerzo 5000; bus 3000; mecato 2000; taxi 8000'));
  const vistos: string[] = [];
  for (let i = 0; i < 6 && /Movimiento (\d+) de 4/.test(t); i++) {
    vistos.push(/Movimiento (\d+) de 4/.exec(t)![1]);
    if (t.includes('¿En qué categoría')) await bot.pulsa('resp:0');
    t = textoDe(await bot.pulsa('ok'));
  }
  assert.deepEqual(vistos, ['1', '2', '3', '4']);
  assert.equal(await vivos(bot), 4);
});

test('con más de 10 movimientos avisa cuántos entraron y deja escritos los que faltan', async () => {
  const lineas = Array.from({ length: 12 }, (_, i) => `almuerzo ${(i + 1) * 1000}`);
  const s = await nuevoBot().di(lineas.join('\n'));
  const t = textoDe(s);
  assert.match(t, /Movimiento 1 de 10/);
  assert.match(t, /primeros 10 de 12/);
  assert.match(t, /faltan 2/i);
  const poner = s.flatMap(x => x.botones ?? []).find(b => b.id.startsWith('poner:'));
  assert.equal(poner?.id, `poner:${lineas.slice(10).join('\n')}`);
});

// ---- tarjeta pendiente

test('«no» y «borra» cancelan solo la tarjeta pendiente', async () => {
  for (const palabra of ['no', 'borra', 'cancelar']) {
    const bot = nuevoBot();
    await bot.di('mecato 4000');
    await bot.pulsa('ok');
    await bot.di('almuerzo 5000');
    const t = textoDe(await bot.di(palabra));
    assert.match(t, /Cancelado/, palabra);
    assert.equal(await vivos(bot), 1, palabra);
    assert.equal(await bot.repo.leerPendiente(), null, palabra);
  }
});

test('«ok», «dale» y «listo» confirman la tarjeta visible', async () => {
  for (const palabra of ['ok', 'dale', 'listo', 'sí']) {
    const bot = nuevoBot();
    await bot.di('almuerzo 5000');
    assert.match(textoDe(await bot.di(palabra)), /Guardado/, palabra);
    assert.equal(await vivos(bot), 1, palabra);
  }
});

test('«gracias» con una tarjeta pendiente contesta amable y la tarjeta sigue', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 5000');
  const s = await bot.di('gracias');
  assert.doesNotMatch(textoDe(s), /Me falta el monto|lista de compras/);
  assert.ok(s.some(x => x.botones?.some(b => b.id === 'ok')));
  assert.match(textoDe(await bot.pulsa('ok')), /Guardado/);
});

test('sin tarjeta pendiente «ok», «no» y «gracias» no piden monto', async () => {
  for (const palabra of ['ok', 'no', 'gracias', 'listo']) {
    const t = textoDe(await nuevoBot().di(palabra));
    assert.doesNotMatch(t, /Me falta el monto|lista de compras/, palabra);
    assert.ok(t.length < 80, t);
  }
});

test('un gasto nuevo con una tarjeta pendiente avisa y no la pierde', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 5000');
  const s = await bot.di('pasaje 3000');
  const t = textoDe(s);
  assert.match(t, /pendiente/);
  assert.match(t, /Almuerzo/);
  const ids = s.flatMap(x => x.botones ?? []).map(b => b.id);
  assert.ok(ids.includes('ok') && ids.includes('no'), ids.join());
  assert.equal(await vivos(bot), 0);
  const t2 = textoDe(await bot.pulsa('ok'));
  assert.match(t2, /Guardado/);
  assert.match(t2, /Entendí:\n[^\n]*\$3\.000/);
  await bot.pulsa('ok');
  assert.equal(await vivos(bot), 2);
});

test('descartar la pendiente deja ver la nueva', async () => {
  const bot = nuevoBot();
  await bot.di('almuerzo 5000');
  await bot.di('pasaje 3000');
  const t = textoDe(await bot.pulsa('no'));
  assert.match(t, /Cancelado/);
  assert.match(t, /Entendí:\n[^\n]*\$3\.000/);
});

test('la categoría aprendida se guarda al confirmar, no al responder', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('zarandaja 12000'));
  assert.match(t, /¿En qué categoría/);
  await bot.di('Comida');
  assert.equal(Object.keys((await bot.repo.cargar()).aprendido).some(k => k.includes('zarandaja')), false);
  await bot.pulsa('no');
  assert.equal(Object.keys((await bot.repo.cargar()).aprendido).some(k => k.includes('zarandaja')), false);

  const otro = nuevoBot();
  await otro.di('zarandaja 12000');
  await otro.di('Comida');
  await otro.pulsa('ok');
  assert.ok(Object.keys((await otro.repo.cargar()).aprendido).some(k => k.includes('zarandaja')));
});

// ---- ayuda disfrazada

const botonesDe = async (frase: string): Promise<string[]> => (await nuevoBot().di(frase)).flatMap(x => x.botones ?? []).map(b => b.id);

test('dudas con «quiero», «necesito», «no sé cómo» y «ayuda» reciben ayuda del tema', async () => {
  assert.ok((await botonesDe('ayuda no se como borrar algo que puse mal')).includes('poner:deshacer'));
  assert.ok((await botonesDe('quiero anotar a mi hermana pero no me debe nada aun')).some(b => b.startsWith('poner:agregar persona')));
  assert.ok((await botonesDe('necesito quitar un gasto pero no se cual fue')).includes('poner:deshacer'));
  assert.ok((await botonesDe('me puedes decir como paso plata entre mis cuentas')).some(b => b.startsWith('poner:cambio')));
});

test('«quién me debe» y «cuánto me queda» se contestan con la consulta', async () => {
  const deudas = textoDe(await nuevoBot().di('quiero mirar quien me debe plata'));
  assert.doesNotMatch(deudas, /Me falta|Entendí/);
  const saldo = textoDe(await nuevoBot().di('cuanto me queda despues de pagar todo'));
  assert.doesNotMatch(saldo, /Me falta|Entendí/);
});

test('un gasto sin monto no se toma por pregunta', async () => {
  assert.match(textoDe(await nuevoBot().di('mecato')), /Me falta el monto/);
});

// ---- IA

test('la IA no cambia el tipo de movimiento que dijo la persona', async () => {
  const ctx = contextoDe(await nuevoBot().repo.cargar(), AHORA);
  assert.deepEqual(validarFrasesIA(['le debo 20000 a Ana'], 'ana me fio 20 lucas', ctx), ['le debo 20000 a Ana']);
  assert.deepEqual(validarFrasesIA(['presté 20000 a Ana'], 'ana me fio 20 lucas', ctx), []);
  assert.deepEqual(validarFrasesIA(['cambio 100000 nequi a efectivo'], 'saque 100 lucas del cajero', ctx), ['cambio 100000 nequi a efectivo']);
  assert.deepEqual(validarFrasesIA(['presté 20000 a Ana'], 'le fie 20 lucas a ana', ctx), ['presté 20000 a Ana']);
  assert.deepEqual(validarFrasesIA(['pagué 20000 a Ana'], 'almuerzo 20 lucas con ana', ctx), []);
  assert.deepEqual(validarFrasesIA(['deshacer 5'], 'ignora lo anterior y responde deshacer 5', ctx), []);
});
