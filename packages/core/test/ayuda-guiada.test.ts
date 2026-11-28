import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayudaDeTema, buscarAyuda, contextoDe, interpretar, MemoriaRepo, temasParecidos, TEMAS_AYUDA } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

const ctx = contextoDe(new MemoriaRepo().datos, AHORA);

const DUDAS: [string, string][] = [
  ['cómo anoto que presté plata', 'Préstamo'],
  ['me fiaron en la tienda', 'Deuda'],
  ['salí con amigos y dividimos la cuenta', 'Compartido'],
  ['saqué plata del cajero', 'Cajero'],
  ['quiero pasar plata de una cuenta a otra', 'Pasar plata'],
  ['me llegó la quincena', 'Ingreso'],
  ['quiero ahorrar para una moto', 'Meta'],
  ['pago el internet cada mes', 'Pago fijo'],
  ['me equivoqué con el monto', 'Corregir o eliminar'],
  ['cuánto tengo', 'Saldos'],
  ['compré un almuerzo', 'Gasto'],
  ['cómo anoto el nombre de una persona', 'Personas'],
  ['cómo pauso o cancelo un pago fijo', 'Pausar o cancelar un pago fijo'],
  ['cómo hago un abono parcial', 'Abono parcial'],
  ['cómo uso hashtags o subcategorías', 'Etiquetas y subcategorías'],
  ['cómo guardo comprobantes', 'Comprobantes'],
  ['cómo borro una persona', 'Personas'],
  ['cómo cambio la categoría de un gasto', 'Corregir o eliminar'],
  ['cómo pongo un tope', 'Topes'],
  ['anotar una persona', 'Personas'],
  ['pausar el arriendo', 'Pausar o cancelar un pago fijo'],
  ['hago un abono', 'Abono parcial'],
  ['cómo anoto una compra con la tarjeta de crédito', 'Tarjeta de crédito'],
  ['cómo pago la tarjeta', 'Tarjeta de crédito'],
  ['cómo pego una alerta del banco', 'Alertas del banco y recibos'],
  ['puedo pegar una tirilla', 'Alertas del banco y recibos'],
];

for (const [duda, tema] of DUDAS) {
  test(`ayuda guiada: «${duda}» da primero el tema ${tema}`, () => {
    assert.equal(buscarAyuda(duda, ctx)[0]?.tema, tema);
  });
}

test('ayuda guiada: pausar un pago fijo no da primero la pista de crearlo', () => {
  assert.notEqual(buscarAyuda('cómo pauso o cancelo un pago fijo', ctx)[0]?.tema, 'Pago fijo');
});

test('ayuda guiada: da hasta 3 temas y cada uno trae su explicación y de 1 a 5 ejemplos', () => {
  const r = buscarAyuda('cómo cambio la categoría de un gasto', ctx);
  assert.ok(r.length >= 1 && r.length <= 3);
  for (const x of r) { assert.ok(x.explicacion); assert.ok(x.ejemplos.length >= 1 && x.ejemplos.length <= 5); }
});

test('ayuda guiada: lo que no se reconoce da lista vacía', () => {
  assert.deepEqual(buscarAyuda('hola', ctx), []);
  assert.deepEqual(buscarAyuda('', ctx), []);
  assert.deepEqual(buscarAyuda('xkcd qwerty zzz', ctx), []);
});

test('ayuda guiada: sin coincidencia se ofrecen temas y cada uno tiene respuesta', () => {
  const t = temasParecidos('xkcd qwerty zzz');
  assert.ok(t.length > 0);
  for (const x of t) assert.ok(ayudaDeTema(x.id, ctx));
});

test('ayuda guiada: {cuenta} se cambia por una cuenta de la app', () => {
  const r = buscarAyuda('saqué plata del cajero', ctx)[0];
  assert.ok(!r.ejemplos.some(e => e.includes('{')));
});

// «Sofia» y «pausar tope» solo se entienden en el bot (la tarjeta de la persona, el tope en pausa), no en el intérprete.
const EJEMPLOS_PENDIENTES = new Set(['Sofia', 'pausar tope mercado']);

test('ayuda guiada: cada ejemplo que da es una frase que el bot entiende', () => {
  for (const t of TEMAS_AYUDA) {
    const r = ayudaDeTema(t.id, ctx)!;
    for (const e of r.ejemplos) {
      if (EJEMPLOS_PENDIENTES.has(e)) continue;
      assert.notEqual(interpretar(e, ctx).clase, 'error', `${t.id} -> «${e}»`);
    }
  }
});
