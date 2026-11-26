import assert from 'node:assert/strict';
import { test } from 'node:test';
import { narrar } from '../src/narrativa.ts';

test('narrativa: descarta lo que no pasó y lo devuelto', () => {
  assert.deepEqual(narrar('pensaba comprar una chaqueta de 200 mil pero al final no compré nada solo pagué el bus de 3200'), ['pagué el bus de 3200']);
  assert.deepEqual(narrar('fui a la tienda compré leche por 8 mil pan por 4 mil y unas galletas por 6 mil pero las galletas las devolví antes de salir'), ['compré leche por 8 mil', 'pan por 4 mil']);
  assert.deepEqual(narrar('compré jabón por 7 mil y crema por 18 mil y mañana quiero mirar unos zapatos de 120 mil'), ['compré jabón por 7 mil', 'crema por 18 mil']);
});

test('narrativa: la cuenta del final vale para los dos servicios', () => {
  assert.deepEqual(narrar('llegó el recibo de la casa son 180 mil de energía y 70 mil de agua y ya pagué los dos desde daviplata'),
    ['pagué 180 mil de energía con daviplata', 'pagué 70 mil de agua con daviplata']);
});

test('narrativa: pago con dos medios, parcial, descuento y aporte', () => {
  assert.deepEqual(narrar('iba a pagar 80 mil de mercado con nequi pero solo tenía 60 así que puse 20 en efectivo'),
    ['pagué 60 mil de mercado con nequi', 'pagué 20 mil de mercado en efectivo']);
  assert.deepEqual(narrar('el recibo de gas llegó por 75 mil pero hoy solo alcancé a pagar 40 y el resto lo pago después'), ['pagué 40 mil del recibo de gas']);
  assert.deepEqual(narrar('compré una camisa que valía 90 mil pero me hicieron 10 de descuento quedó en 80 y además pagué 12 de parqueadero'),
    ['compré una camisa por 80 mil', 'pagué 12 mil de parqueadero']);
  assert.deepEqual(narrar('mi mamá pagó el recibo de 100 mil yo le mandé 40 por nequi para ayudarle'), ['le mandé 40 mil a mamá por nequi para ayudarle']);
});

test('narrativa: plata de antes es contexto y una compra por otro es préstamo', () => {
  assert.equal(narrar('hoy salí tarde de clase y me tocó coger taxi por 9000 porque estaba lloviendo durísimo y después pasé a comerme una hamburguesa de 22000 que pagué con nequi pero mi mamá me había dado 10000 en efectivo para el pasaje')?.length, 2);
  assert.deepEqual(narrar('le compré los medicamentos a mi papá por 65 mil porque no tenía plata y me dijo que después me paga'), ['le presté 65 mil a papá para los medicamentos']);
});

test('narrativa: frases cortas o que ya se parten bien no se tocan', () => {
  assert.equal(narrar('almuerzo 18000 con nequi'), null);
  assert.equal(narrar('ayer compré pan por 5 mil y hoy compré leche por 8 mil'), null);
  assert.equal(narrar('pagué la factura de internet de 90 mil y también le presté 40 mil a mi primo para el bus'), null);
});
