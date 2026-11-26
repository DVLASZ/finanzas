/**
 * Modismos colombianos y categoría por finalidad (RED-178 a RED-223). Cada frase pasa por el bot real:
 * se mira lo que dice la tarjeta o la pregunta que sale. La finalidad de la compra manda sobre el lugar donde se hizo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const di = async (frase: string): Promise<string> => textoDe(await nuevoBot().di(frase));
const tarjeta = (t: string): string => /Entendí:\n([^\n]+)/.exec(t)?.[1] ?? '';

test('descuadre dicho con jerga es un gasto', async () => {
  const t = await di('me descuadré con 15 lucas en la tienda');
  assert.match(tarjeta(t), /^Gasto · .* · \$15\.000 /);
});

test('un cruce, un abono a la quincena y pasar la mano preguntan y no crean tarjeta', async () => {
  for (const frase of ['me hicieron un cruce de 40k por nequi', 'abono a la quincena 300k', 'le pasé la mano a mi hermana con 25 lucas', 'mijito, guárdeme 50 mil para el recibo']) {
    const s = await nuevoBot().di(frase);
    assert.equal(tarjeta(textoDe(s)), '', frase);
    assert.ok(/¿/.test(textoDe(s)), frase);
    assert.ok(s.some(x => (x.botones ?? []).length > 0), `${frase}: sin botones`);
  }
});

test('fiado: deuda con la tienda sin descontar de ninguna cuenta', async () => {
  for (const frase of ['me fían 20k en la tienda de la esquina', 'apúnteme 32 mil de la tienda, se los pago el sábado']) {
    const t = tarjeta(await di(frase));
    assert.match(t, /^Deuda · le debes a /, frase);
  }
});

test('«apúnteme» con fecha de pago deja la fecha límite de la deuda', async () => {
  const t = await di('apúnteme 32 mil de la tienda, se los pago el sábado');
  assert.match(t, /antes del|sáb/i);
});

test('me quedaron debiendo es un préstamo y pregunta quién si no lo dice', async () => {
  const t = await di('me quedaron debiendo cinco mil del mandado');
  assert.equal(tarjeta(t), '');
  assert.match(t, /¿Quién te debe/);
  assert.match(tarjeta(await di('me quedaron debiendo Pedro 5000')), /^Préstamo · le prestas a Pedro/);
});

test('hicimos vaca sin nombres pregunta cuánto puso cada uno', async () => {
  const s = await nuevoBot().di('hicimos vaca de 80k para el regalo del profe');
  assert.equal(tarjeta(textoDe(s)), '');
  assert.match(textoDe(s), /¿Cuánto puso cada uno/);
});

test('puse para el parche y yo invité las polas son Salidas', async () => {
  assert.match(tarjeta(await di('puse 35k para el parche de esta noche')), /^Gasto · Salidas · \$35\.000/);
  const t = tarjeta(await di('yo invité las polas, fueron 28 barras'));
  assert.match(t, /^Gasto · Salidas · \$28\.000/);
});

test('un rebusque con «me gané» es un ingreso', async () => {
  assert.match(tarjeta(await di('hoy hice un rebusque y me gané 65k')), /^Ingreso · .*\$65\.000/);
});

test('solté plata a alguien es un préstamo a esa persona', async () => {
  const t = tarjeta(await di('le solté 90 barras a Pipe hasta el viernes'));
  assert.match(t, /^Préstamo · le prestas a Pipe\b/);
  assert.ok(!/Hasta/.test(t));
});

test('con un cliente sin nombre no se pregunta un reparto: es un gasto', async () => {
  assert.match(tarjeta(await di('almorcé con un cliente y pagué 48k')), /^Gasto · .* · \$48\.000/);
});

test('la crema por internet pregunta antes de asignar categoría', async () => {
  const s = await nuevoBot().di('compré una crema por internet 28k');
  assert.equal(tarjeta(textoDe(s)), '');
  assert.match(textoDe(s), /¿/);
  // la crema de leche o dental no se confunde
  assert.notEqual(tarjeta(await di('crema de leche 4500')), '');
});

const CATEGORIA: [string, string][] = [
  ['compré un regalo de 40k en el supermercado', 'Regalos'],
  ['pagué el uber para ir a la universidad 9k', 'Transporte'],
  ['recarga de saldo de juego 20k', 'Juegos'],
  ['suscripción de salud prepagada 90k', 'Salud'],
  ['tanqueé 100k para ir de paseo', 'Transporte'],
  ['compré concentrado para el perro 75k en el supermercado', 'Personal'],
  ['compré libros para el colegio 110k', 'Universidad'],
  ['compré una torta de cumpleaños para mi mamá 55k', 'Regalos'],
  ['parqueadero en el hospital 12k', 'Transporte'],
  ['pagué la mensualidad del gym 85k', 'Salud'],
  ['gasolina para ir al trabajo 45k', 'Transporte'],
  ['pagué una suscripción de cursos de inglés 60k', 'Universidad'],
  ['pagué el impuesto del carro 420k', 'Otros'],
  ['renové el seguro médico 160k', 'Salud'],
];
for (const [frase, cat] of CATEGORIA) {
  test(`finalidad: «${frase}» es ${cat}`, async () => {
    assert.match(tarjeta(await di(frase)), new RegExp(`^Gasto · ${cat} · `));
  });
}

test('los pañales no son Salud aunque se compren en la droguería', async () => {
  const t = tarjeta(await di('pañales para el bebé 62k en la droguería'));
  assert.ok(!/Salud/.test(t), t);
});

test('el lugar sigue valiendo cuando no hay finalidad: «internet para las clases virtuales» no es Universidad', async () => {
  assert.ok(!/Universidad/.test(tarjeta(await di('internet para las clases virtuales 95k'))));
});
