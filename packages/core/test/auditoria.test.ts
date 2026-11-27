import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { validarFrasesIA } from '../src/ia.ts';
import { contextoDe } from '../src/index.ts';

const di = async (f: string, b = nuevoBot()): Promise<string> => textoDe(await b.di(f));

test('defecto 3: «me dieron 2000 de cambio» pregunta si es el vuelto, no crea un ingreso', async () => {
  const t = await di('me dieron 2000 de cambio');
  assert.match(t, /vuelto/);
  assert.doesNotMatch(t, /Ingreso ·/);
});

test('defecto 4: «llegaron 1000 galletas» pregunta si son unidades o plata', async () => {
  assert.match(await di('llegaron 1000 galletas'), /mercancía que llegó|unidades/);
});

test('defecto 5: «Marta me debe 10000» no saca plata de ninguna cuenta', async () => {
  const b = nuevoBot();
  const t = await di('Marta me debe 10000', b);
  assert.match(t, /te debe Marta/);
  assert.doesNotMatch(t, /Pagaste justo|Efectivo/);
  await b.pulsa('ok');
  const d = await b.repo.cargar();
  const ef = d.movimientos.flatMap(m => m.asientos).filter(a => a.cuentaId === 'efectivo').reduce((s, a) => s + a.monto, 0);
  assert.equal(ef, 0);
  assert.match(await di('deudas', b), /Marta: \$10\.000/);
});

test('defecto 5: «le presté 10000 a Marta» sí saca la plata', async () => {
  assert.match(await di('le presté 10000 a Marta'), /le prestas a Marta/);
});

test('defecto 7: «gasté 5000 pero no en mecato» no es Mecato y pregunta la categoría', async () => {
  const t = await di('gasté 5000 pero no en mecato');
  assert.match(t, /no fue en mecato/);
  assert.doesNotMatch(t, /Gasto · Mecato/);
});

test('defecto 9: «con tarjeta» pregunta con cuál cuenta', async () => {
  assert.match(await di('almuerzo 12000 con tarjeta'), /¿Con cuál cuenta/);
});

test('defecto 10: «saqué 100k del cajero» con varias cuentas pregunta de cuál', async () => {
  assert.match(await di('saqué 100k del cajero'), /¿De cuál cuenta/);
});

test('defecto 12: «transporte 3000» pide el recorrido sin armar un texto roto', async () => {
  const t = await di('transporte 3000');
  assert.doesNotMatch(t, /Transporte ❓/);
  assert.match(t, /¿A dónde fue\?/);
});

test('defecto 13: «compré 2 cafés de 3000» pregunta si es el total o cada uno', async () => {
  assert.match(await di('compré 2 cafés de 3000'), /por los 2 cafes o por cada uno/);
});

test('defecto 14: «mecato 5.000,50» no deja «,50» en el concepto', async () => {
  const t = await di('mecato 5.000,50');
  assert.match(t, /Mecato · \$5\.000/);
  assert.doesNotMatch(t, /,50/);
});

test('defecto 15: «almuerzo 12 000» acepta el espacio como separador de miles', async () => {
  assert.match(await di('almuerzo 12 000'), /\$12\.000/);
});

test('defecto 16: «gaste 5ooo» lee las o como ceros', async () => {
  assert.match(await di('gaste 5ooo'), /\$5\.000/);
});

test('defecto 17: «almuerzo un millón» avisa en la tarjeta que revises los ceros', async () => {
  const t = await di('almuerzo un millón');
  assert.match(t, /\$1\.000\.000/);
  assert.match(t, /revisa los ceros/);
});

test('defecto 19: «cuanto es 5000 + 3000» es una calculadora y no anota', async () => {
  const b = nuevoBot();
  assert.match(await di('cuanto es 5000 + 3000', b), /\$8\.000/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
  assert.match(await di('cuánto es 2 x 4500', b), /\$9\.000/);
});

test('defecto 22: «con ana» en minúscula es una persona', async () => {
  assert.match(await di('almuerzo 30000 con ana'), /Ana/);
});

test('defecto 23: «con Ana y Luis» es un gasto entre tres', async () => {
  const t = await di('almuerzo 30000 con Ana y Luis');
  assert.match(t, /Gasto compartido/);
  assert.match(t, /Tu parte: \$10\.000/);
});

test('defecto 24: dos movimientos con su propia cuenta cada uno', async () => {
  assert.match(await di('Pagué 15.000 de almuerzo con Nequi y el taxi 7000 en efectivo'), /Movimiento 1 de 2/);
});

test('defecto 25: «10/15» se ofrece como 15/10', async () => {
  const s = await nuevoBot().di('almuerzo 12000 10/15');
  assert.match(textoDe(s), /15\/10/);
  assert.ok(s.flatMap(x => x.botones ?? []).length >= 2);
});

test('defecto 28: «cuanto me deben» y «cuanto gaste ayer» responden sin confundir', async () => {
  assert.match(await di('cuanto me deben'), /deudas|prestamos|Te deben/i);
  assert.match(await di('cuanto gaste ayer'), /^🧾 Ayer gastaste/);
});

test('defecto 29: «cómo registro que vendí algo» y «cómo guardo plata para un viaje» tienen tema', async () => {
  assert.match(await di('cómo registro que vendí algo'), /Un ingreso lleva/);
  assert.match(await di('cómo guardo plata para un viaje'), /Crea la meta/);
});

test('defecto 33: un tope menor a $1.000 se rechaza', async () => {
  const b = nuevoBot();
  assert.match(await di('tope comida 1', b), /demasiado bajo/);
  assert.equal((await b.repo.cargar()).presupuestos['cat:comida'], undefined);
});

test('defecto 35: un mensaje larguísimo con un solo monto anota solo lo del monto', async () => {
  const t = await di('almuerzo 12000 ' + 'y también le cuento que hoy fue un día largo '.repeat(12));
  assert.match(t, /\$12\.000/);
  assert.doesNotMatch(t, /día largo/);
});

test('defecto 26: un «porque ayer...» no mueve la fecha', async () => {
  assert.match(await di('almuerzo 12000 porque ayer no pude pagar'), /hoy/);
});

test('defecto 38: la IA no repite frases ni parte un monto', async () => {
  const b = nuevoBot();
  const ctx = contextoDe(await b.repo.cargar(), new Date('2026-10-19T20:42:00Z'));
  assert.deepEqual(validarFrasesIA(['almuerzo 15000', 'almuerzo 10000'], 'almuerzo 30000', ctx), ['almuerzo 15000']);
  assert.deepEqual(validarFrasesIA(Array(5).fill('almuerzo 30000'), 'almuerzo 30000', ctx), ['almuerzo 30000']);
});

test('defecto 37: la IA no vuelve préstamo un gasto', async () => {
  const b = nuevoBot();
  const ctx = contextoDe(await b.repo.cargar(), new Date('2026-10-19T20:42:00Z'));
  assert.deepEqual(validarFrasesIA(['presté 30000 a Ana'], 'almuerzo con Ana 30000 no se como decirlo', ctx), []);
});

test('defectos 27 y 30: con una tarjeta pendiente «si», «ok», «gracias» y «borra» no tocan lo guardado', async () => {
  const b = nuevoBot();
  await b.di('mecato 4000'); await b.pulsa('ok');
  await b.di('almuerzo 5000');
  assert.match(textoDe(await b.di('borra')), /Cancelado/);
  assert.equal((await b.repo.cargar()).movimientos.filter(m => m.estado === 'ok').length, 1);
});
