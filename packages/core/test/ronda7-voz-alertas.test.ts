import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { dinero } from '../src/semilla.ts';

function conBancos() {
  const b = nuevoBot();
  b.repo.datos.cuentas.push(dinero('bancolombia', 'Bancolombia', 'COP', true), dinero('banco-bogota', 'Banco de Bogotá', 'COP', true));
  b.repo.datos.config.alias_cuentas = JSON.stringify({ bancolombia: ['bancolombia'], 'banco-bogota': ['bogota'] });
  return b;
}

test('alerta con renglones rotulados: la referencia y los dígitos de la tarjeta no son montos', async () => {
  const t = textoDe(await conBancos().di('BANCOLOMBIA\nCompra aprobada\nValor: $38.500\nComercio: SUPERMERCADO LA 14\nTarjeta débito **** 4821\nFecha: 26/11/2026 18:42\nRef: 739104'));
  assert.match(t, /Gasto · .* · \$38\.500 · Bancolombia/);
  assert.doesNotMatch(t, /Movimiento 1 de/);
});

test('alerta rechazada, declinada o fallida no se anota', async () => {
  const b = conBancos();
  for (const a of ['Nequi\nNo se pudo enviar $80.000 a Mateo.\nTransacción rechazada.\nFecha 26/11/2026', 'Bancolombia\nCompra NO aprobada\nValor solicitado: $64.900\nComercio: FARMACIA CENTRAL', 'Banco de Bogotá\nTransferencia a Laura\nValor: $90.000\nEstado: FALLIDA']) {
    assert.match(textoDe(await b.di(a)), /no anoté nada/);
  }
  assert.equal((await b.repo.cargar()).movimientos.length, 0);
});

test('alerta pendiente y su confirmación: se anota una sola vez', async () => {
  const b = conBancos();
  assert.match(textoDe(await b.di('Nequi\nEstamos procesando tu envío de $70.000 a Daniel.\nEstado: pendiente\n26/11/2026 17:45\nRef 880021')), /sigue pendiente/);
  const t = textoDe(await b.di('Nequi\nTu envío de $70.000 a Daniel fue exitoso.\n26/11/2026 17:49\nRef 880021'));
  assert.match(t, /\$70\.000/);
  await b.pulsa('ok');
  assert.match(textoDe(await b.di('Nequi\nTu envío de $70.000 a Daniel fue exitoso.\n26/11/2026 17:49\nRef 880021')), /ya la anoté/);
});

test('alerta repetida en el mismo mensaje con la misma referencia es una operación', async () => {
  const t = textoDe(await conBancos().di('Nequi: Enviaste $25.000 a Pipe. 26/11/2026 16:10. Ref 778812.\nNequi: Enviaste $25.000 a Pipe. 26/11/2026 16:10. Ref 778812.'));
  assert.doesNotMatch(t, /Movimiento 1 de 2/);
  assert.match(t, /\$25\.000/);
});

test('alerta con retiro y comisión: dos movimientos y el total debitado no cuenta', async () => {
  const t = textoDe(await conBancos().di('DaviPlata\nRetiro en cajero aprobado\nRetiro: $100.000\nComisión: $4.500\nTotal debitado: $104.500\n26/11/2026 19:30\nRef 340019'));
  assert.match(t, /Movimiento 1 de 2/);
  assert.doesNotMatch(t, /104\.500/);
});

test('compra en dólares: no se convierte', async () => {
  assert.match(textoDe(await conBancos().di('Compra aprobada USD 18,50\nComercio: APP DIGITAL\nTarjeta crédito **** 1930\nValor en pesos pendiente de conversión\n26/11/2026 23:12\nRef 191820')), /dólares/);
});

test('voz: «doce cero cero cero» y «cinco mil coma cincuenta» se confirman', async () => {
  assert.match(textoDe(await nuevoBot().di('Cinco mil coma cincuenta')), /¿Quisiste decir/);
});

test('voz: miles heredados, correcciones de destinatario y autocorrecciones', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('Me gasté diez mil en la cena y cinco en el parqueadero')), /Movimiento 1 de 2/);
  assert.match(textoDe(await nuevoBot().di('Gasté cuarenta, no, cuatro mil en pan')), /\$4\.000/);
  assert.match(textoDe(await nuevoBot().di('Jorge me debe veinte mil, no débito')), /\$20\.000/);
});

test('voz: «ponle cien mil a transporte» pregunta si es un tope o un gasto', async () => {
  assert.match(textoDe(await nuevoBot().di('Ponle cien mil a transporte')), /tope de Transporte/);
});
