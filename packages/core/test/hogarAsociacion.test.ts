import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

function conGente() {
  const b = nuevoBot();
  for (const n of ['Mama', 'Mateo', 'Jorge', 'Pipe', 'Karla']) {
    b.repo.datos.cuentas.push({ id: 'p:' + n.toLowerCase(), nombre: n, clave: n.toLowerCase(), tipo: 'persona', moneda: 'COP', grupo: 'amigos' });
  }
  return b;
}

test('hogar: lo que paga otro y se divide es una deuda por tu parte', async () => {
  const t = textoDe(await conGente().di('Mamá pagó el recibo de 120k y yo le debo mi mitad'));
  assert.match(t, /Deuda · le debes a Mama · \$60\.000/);
});

test('hogar: un pago que se repite pide el día y no registra nada', async () => {
  const b = conGente();
  assert.match(textoDe(await b.di('En la casa pagamos 180k de internet todos los meses')), /¿Qué día del mes/);
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('hogar: el fondo común no existe y se dice', async () => {
  assert.match(textoDe(await conGente().di('Puse 100k en el fondo común de la casa')), /No llevo un fondo común/);
});

test('hogar: «ivan me pagó 40k nequi» sigue siendo el cobro de siempre', async () => {
  const b = conGente();
  await b.di('presté 40k a Pipe nequi');
  await b.pulsa('ok');
  assert.match(textoDe(await b.di('Pipe me pagó 40k nequi')), /Pago|Abono|saldada|le pagas|Pipe/);
});

test('asociación: la multa es plata por cobrar, la cuota y la multa juntas son dos', async () => {
  const b = conGente();
  assert.match(textoDe(await b.di('A Pipe le pusieron multa de 15k por no ir a la reunión')), /Préstamo · te debe Pipe .* · \$15\.000/);
  await b.pulsa('ok');
  const t = textoDe(await b.di('Karla debe la cuota de 50k y además una multa de 20k'));
  assert.match(t, /Movimiento 1 de 2/);
});

test('asociación: el préstamo con interés pregunta si es mensual, anual o total', async () => {
  assert.match(textoDe(await conGente().di('Le prestamos 400k a Jorge del fondo, con 5% de interés')), /mensual, anual o sobre el total/);
});

test('asociación: compensar no se hace solo', async () => {
  const t = textoDe(await conGente().di('Jorge debía 80k de cuota y la asociación le debía 30k de un reembolso'));
  assert.match(t, /\$50\.000/);
  assert.match(t, /No compenso nada solo/);
});

test('asociación: el cierre anota los pagos y deja lo que falta por cobrar', async () => {
  const t = textoDe(await conGente().di('Cierra las cuentas del fondo: Jorge pagó 60k, Mateo 50k, y todavía faltan 40k de cuotas'));
  assert.match(t, /Movimiento 1 de 2/);
});
