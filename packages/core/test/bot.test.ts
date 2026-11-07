/**
 * Pruebas del bot de punta a punta: se le "escribe" como tú y se revisa lo que responde y
 * lo que queda guardado. Si algo de aquí falla, el bot no entiende como debería.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

/** Escribe, confirma y devuelve la respuesta del "Guardado". */
async function guardar(bot: Bot, texto: string): Promise<string> {
  const tarjeta = textoDe(await bot.di(texto));
  assert.match(tarjeta, /Entendí:/, `«${texto}» debía mostrar una tarjeta, pero respondió: ${tarjeta}`);
  return textoDe(await bot.pulsa('ok'));
}

async function saldo(bot: Bot, cuenta: string, moneda = 'COP'): Promise<number> {
  const d = await bot.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|${moneda}`) ?? 0;
}

// ---------------------------------------------------------------- gastos

test('gasto: «mecato 5000» y «5000 mecato» dan la misma tarjeta', async () => {
  const a = textoDe(await nuevoBot().di('mecato 5000'));
  const b = textoDe(await nuevoBot().di('5000 mecato'));
  assert.match(a, /Gasto · Mecato · \$5\.000 · Efectivo · hoy 3:42 pm/);
  assert.match(b, /Gasto · Mecato · \$5\.000 · Efectivo · hoy 3:42 pm/);
});

test('gasto: la tarjeta trae los 3 botones', async () => {
  const [s] = await nuevoBot().di('mecato 5000');
  assert.deepEqual(s.botones?.slice(0, 3).map(b => b.id), ['ok', 'edit', 'no']); // después vienen los atajos de pago
});

test('gasto: exige un mensaje completo (concepto + monto)', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('mecato')), /Me falta el monto/);
  assert.match(textoDe(await bot.di('10k')), /Me falta (decirme )?en qué/);
  assert.equal((await bot.repo.cargar()).movimientos.length, 0, 'no debe guardar nada');
});

test('gasto: nada se guarda hasta confirmar, y al confirmar baja el saldo', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  assert.equal(await saldo(bot, 'efectivo'), 0);
  const r = await guardar(bot, 'mecato 5000');
  assert.match(r, /✅ Guardado/);
  assert.equal(await saldo(bot, 'efectivo'), -5000);
});

test('gasto: Cancelar no guarda', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  assert.match(textoDe(await bot.pulsa('no')), /Cancelado/);
  assert.equal((await bot.repo.cargar()).movimientos.length, 0);
});

test('gasto: cuentas y errores de ortografía', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('pizza 36k nequi')), /Nequi/);
  assert.match(textoDe(await bot.di('pizza 36k nekui')), /Nequi/);
  assert.match(textoDe(await bot.di('pizza 36k NEQUÍ')), /Nequi/);
  assert.match(textoDe(await bot.di('pizza 36k davi')), /Daviplata/);
  assert.match(textoDe(await bot.di('pizza 36k efetivo')), /Efectivo/);
});

test('gasto: montos escritos de varias formas', async () => {
  for (const t of ['pizza 36k', 'pizza 36 mil', 'pizza $36.000', 'pizza 36000', '36.000 pizza']) {
    assert.match(textoDe(await nuevoBot().di(t)), /\$36\.000/, t);
  }
});

test('gasto: fecha relativa', async () => {
  assert.match(textoDe(await nuevoBot().di('pizza 12000 ayer')), /ayer 3:42 pm/);
  assert.match(textoDe(await nuevoBot().di('ayer pizza 12000')), /ayer 3:42 pm/);
});

test('gasto: concepto con tildes y verbos de relleno', async () => {
  const t = textoDe(await nuevoBot().di('compré un trident 4500'));
  assert.match(t, /Mecato/);
  assert.match(t, /Concepto: Trident/);
});

test('gasto: categoría desconocida -> pregunta, aprende y no vuelve a preguntar', async () => {
  const bot = nuevoBot();
  const q = textoDe(await bot.di('zzzquimico 3000'));
  assert.match(q, /¿En qué categoría va/);
  assert.equal((await bot.pulsa('ok')).length, 1, 'Confirmar sin categoría no guarda');
  assert.equal((await bot.repo.cargar()).movimientos.length, 0);
  const tarjeta = textoDe(await bot.di('mecato'));
  assert.match(tarjeta, /Mecato/);
  await bot.pulsa('ok');
  assert.equal((await bot.repo.cargar()).movimientos.length, 1);
  assert.match(textoDe(await bot.di('zzzquimico 2000')), /Gasto · Mecato/);
});

test('gasto: el atajo «pasaje» pone monto, categoría y concepto', async () => {
  const t = textoDe(await nuevoBot().di('pasaje'));
  assert.match(t, /Gasto · Viaje semanal · \$7\.000 · Efectivo/);
  assert.match(textoDe(await nuevoBot().di('pasaje 7500')), /Viaje semanal · \$7\.500/);
});

// ---------------------------------------------------------------- vuelto y monedas

test('vuelto: con billete y vuelto en billete + monedas', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('compré un trident 4500 con billete de 10k, me dieron un billete de 5k y 500 en monedas'));
  assert.match(t, /\$4\.500/);
  assert.match(t, /Pagas con \$10\.000 → vuelto: \$5\.000 en billete \+ \$500 en monedas/);
  assert.doesNotMatch(t, /⚠️/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -5000); // 10.000 - 5.000
  assert.equal(await saldo(bot, 'monedas'), 500);
});

test('vuelto: si dices el billete pero no el vuelto, lo calcula y lo dice', async () => {
  const t = textoDe(await nuevoBot().di('trident 4500 con billete de 10k'));
  assert.match(t, /vuelto estimado/);
});

test('vuelto: avisa si el vuelto no cuadra', async () => {
  const t = textoDe(await nuevoBot().di('trident 4500 con billete de 10k me dieron 5k'));
  assert.match(t, /no cuadra/);
});

test('vuelto: sin mencionarlo, dice cómo asumió que pagaste', async () => {
  const t = textoDe(await nuevoBot().di('mecato 5000'));
  assert.match(t, /Pagaste justo: \$5\.000 en billete/);
});

test('vuelto: se puede agregar después con Editar', async () => {
  const bot = nuevoBot();
  await bot.di('trident 4500 con billete de 10k');
  await bot.pulsa('edit');
  const t = textoDe(await bot.di('vuelto 5k y 500 monedas'));
  assert.match(t, /vuelto: \$5\.000 en billete \+ \$500 en monedas/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'monedas'), 500);
  assert.equal(await saldo(bot, 'efectivo'), -5000);
});

test('monedas: pagar con monedas descuenta de monedas, no de la billetera', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 500 monedas');
  assert.equal(await saldo(bot, 'monedas'), -500);
  assert.equal(await saldo(bot, 'efectivo'), 0);
});

// ---------------------------------------------------------------- transporte

test('transporte: de dónde a dónde, en varias formas', async () => {
  for (const t of ['taxi de terminal a casa 8000', 'taxi terminal a casa 8000', 'taxi terminal-casa 8000', 'taxi terminal casa 8000']) {
    const r = textoDe(await nuevoBot().di(t));
    assert.match(r, /Transporte · Taxi Terminal → Casa · \$8\.000/, t);
  }
  assert.match(textoDe(await nuevoBot().di('moto de casa al terminal 5000')), /Moto Casa → Terminal/);
});

test('transporte: si falta el origen o el destino, lo pregunta', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('taxi casa 8000')), /¿Desde dónde saliste hacia Casa\?/);
  assert.match(textoDe(await bot.di('terminal')), /Taxi Terminal → Casa/);
  const bot2 = nuevoBot();
  assert.match(textoDe(await bot2.di('taxi 8000')), /¿A dónde fue\?/);
});

test('transporte: guarda origen y destino', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'taxi de terminal a casa 8000');
  const [m] = (await bot.repo.cargar()).movimientos;
  assert.equal(m.lugarDesde, 'Terminal');
  assert.equal(m.lugarHasta, 'Casa');
});

// ---------------------------------------------------------------- ingresos y transferencias

test('ingreso: «+mamá 100k -30k» guarda el neto', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('+mamá 100k -30k'));
  assert.match(t, /Ingreso · Mamá · \$70\.000/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), 70000);
});

test('ingreso: en lenguaje natural', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('mamá me dio 100k y le devolví 30k')), /Ingreso · Mamá · \$70\.000/);
  assert.match(textoDe(await nuevoBot().di('ingreso 50k chamba nequi')), /Ingreso · Chamba · \$50\.000 · Nequi/);
});

test('ingreso: la persona familiar queda en el grupo familia al crearla', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'presté 10k a mamá');
  const mama = (await bot.repo.cargar()).cuentas.find(c => c.id === 'per:mama');
  assert.equal(mama?.grupo, 'familia');
});

test('transferencia: no es gasto ni ingreso', async () => {
  const bot = nuevoBot();
  for (const t of ['cambio 50k efectivo a nequi', 'pasé 50k de efectivo a nequi', 'pasé 50k a nequi desde efectivo', '50k efectivo > nequi']) {
    const r = textoDe(await nuevoBot().di(t));
    assert.match(r, /Transferencia · \$50\.000 · Efectivo → Nequi/, t);
  }
  await guardar(bot, 'cambio 50k efectivo a nequi');
  assert.equal(await saldo(bot, 'efectivo'), -50000);
  assert.equal(await saldo(bot, 'nequi'), 50000);
  const mes = textoDe(await bot.di('mes'));
  assert.match(mes, /Gastos: \$0/);
});

test('transferencia: retirar de Nequi llega al efectivo', async () => {
  const t = textoDe(await nuevoBot().di('saqué 50k de nequi'));
  assert.match(t, /Nequi → Efectivo/);
});

test('cambio de moneda: pesos y dólares', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('cambio 32000 nequi a arq 8 usd'));
  assert.match(t, /Cambio de moneda · \$32\.000 \(Nequi\) → US\$8,00 \(ARQ\)/);
  assert.match(t, /\$4\.000 por dólar/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'nequi'), -32000);
  assert.equal(await saldo(bot, 'arq', 'USD'), 800);
});

// ---------------------------------------------------------------- personas, deudas y préstamos

test('préstamo y cobro: presté, me pagó, la deuda queda saldada', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'presté 40k a ivan nequi');
  assert.match(textoDe(await bot.di('deudas')), /Te deben:\n• Ivan: \$40\.000/);
  const r = await guardar(bot, 'ivan me pagó 40k nequi');
  assert.match(r, /saldada/);
  assert.match(textoDe(await bot.di('deudas')), /No hay deudas/);
  assert.equal(await saldo(bot, 'nequi'), 0);
});

test('E-03: deshacer un préstamo cierra su deuda como anulada y no dispara «saldada» en el siguiente gasto', async () => {
  const bot = nuevoBot();
  await bot.di('presté 19500 a ana');
  const guardado = await bot.pulsa('ok');
  const undo = guardado[0].botones?.find(b => b.id.startsWith('undo:'));
  assert.ok(undo, 'el guardado trae Deshacer');
  await bot.pulsa(undo.id);
  const r = await guardar(bot, 'mecato 2000');
  assert.doesNotMatch(r, /saldada/);
  const cs = (await bot.repo.cargar()).compromisos;
  assert.deepEqual(cs.map(c => c.estado), ['anulada']);
  assert.match(textoDe(await bot.di('deudas')), /No hay deudas/);
});

test('E-03: editar un préstamo anula la deuda vieja y deja una sola activa', async () => {
  const bot = nuevoBot();
  await bot.di('presté 19500 a ana');
  const guardado = await bot.pulsa('ok');
  const edit = guardado[0].botones?.find(b => b.id.startsWith('edit:'));
  assert.ok(edit);
  await bot.pulsa(edit.id);
  await bot.di('presté 20000 a ana');
  await bot.pulsa('ok');
  const cs = (await bot.repo.cargar()).compromisos;
  assert.deepEqual(cs.map(c => `${c.monto}:${c.estado}`).sort(), ['19500:anulada', '20000:activa']);
});

test('deuda: «le debo 54k a sergio por la bici antes del 31 de octubre»', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('le debo 54k a sergio por la reparación de la bicicleta antes del 31 de octubre'));
  assert.match(t, /Deuda · le debes a Sergio · \$54\.000 · Transporte · antes del 31 oct/);
  await bot.pulsa('ok');
  const d = textoDe(await bot.di('deudas'));
  assert.match(d, /Debes:\n• Sergio: \$54\.000 · .*bicicleta.* · antes del 31 oct/);
});

test('deuda: pagarla la salda', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'le debo 54k a sergio por la bicicleta');
  const r = await guardar(bot, 'pagué 54k a sergio nequi');
  assert.match(r, /Deuda con Sergio saldada/);
  assert.equal(await saldo(bot, 'nequi'), -54000);
});

test('deuda en dólares: pagar con pesos de Nequi', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial nequi 100000 le debo daniel 8 usd');
  const t = textoDe(await bot.di('pagué 32000 nequi = 8 usd a daniel'));
  assert.match(t, /le pagas a Daniel · US\$8,00/);
  const r = textoDe(await bot.pulsa('ok'));
  assert.match(r, /saldada/);
  assert.equal(await saldo(bot, 'nequi'), 68000);
});

test('personas: «juan manuel» y «juan jose» son distintos, «juan» pregunta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'presté 10k a juan manuel');
  await guardar(bot, 'presté 10k a juan jose');
  const q = textoDe(await bot.di('presté 5k a juan'));
  assert.match(q, /¿A quién te refieres con «Juan»\?/);
  const r = textoDe(await bot.di('Juan Jose'));
  assert.match(r, /Juan Jose/);
  await bot.pulsa('ok');
  const d = textoDe(await bot.di('deudas'));
  assert.match(d, /Juan Jose: \$15\.000/);
  assert.match(d, /Juan Manuel: \$10\.000/);
});

test('personas: un error de tipeo en un nombre conocido se pregunta, no se asume', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'presté 10k a daniel');
  const q = textoDe(await bot.di('presté 5k a danyel'));
  assert.match(q, /¿A quién te refieres con «Danyel»\?/);
  assert.match(textoDe(await bot.di('Daniel')), /Daniel/);
});

// ---------------------------------------------------------------- compartidos y eventos

test('compartido: pagas tú y los demás te deben su parte', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('pizza 9000 pagué por ivan 3000 y daniel 2500'));
  assert.match(t, /Gasto compartido · Comida · \$9\.000/);
  assert.match(t, /Tu parte: \$3\.500/);
  assert.match(t, /Ivan te debe \$3\.000/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -9000);
  const g = textoDe(await bot.di('mes'));
  assert.match(g, /Comida: \$3\.500/); // solo tu parte es gasto tuyo
});

test('compartido: partes iguales si no dices montos', async () => {
  const t = textoDe(await nuevoBot().di('pizza 9000 pagué por ivan y daniel'));
  assert.match(t, /Tu parte: \$3\.000/);
  assert.match(t, /Ivan te debe \$3\.000/);
});

test('compartido: un amigo pagó tu almuerzo y le debes', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('ivan me pagó el almuerzo 6000'));
  assert.match(t, /Gasto pagado por Ivan · Comida · \$6\.000/);
  await bot.pulsa('ok');
  assert.match(textoDe(await bot.di('deudas')), /Debes:\n• Ivan: \$6\.000/);
  assert.equal(await saldo(bot, 'efectivo'), 0);
});

test('compartido: lo que te debía un amigo se compensa con lo que pagó por ti', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'taxi de terminal a casa 8000 pagué por ivan 3000');
  await guardar(bot, 'ivan me pagó el almuerzo 3000');
  assert.match(textoDe(await bot.di('deudas')), /No hay deudas/);
});

test('eventos: #etiqueta agrupa los gastos de una salida', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'pizza 12000 #cumple-daniel');
  await guardar(bot, 'taxi de terminal a casa 8000 #cumple-daniel');
  await guardar(bot, 'mecato 5000');
  const t = textoDe(await bot.di('#cumple-daniel'));
  assert.match(t, /#cumple-daniel · 2 movimientos · total \$20\.000/);
});

// ---------------------------------------------------------------- deshacer / editar

test('deshacer: anula (no borra) y el saldo vuelve', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  assert.match(textoDe(await bot.di('deshacer')), /Anulado/);
  assert.equal(await saldo(bot, 'efectivo'), 0);
  const [m] = (await bot.repo.cargar()).movimientos;
  assert.equal(m.estado, 'anulado');
});

test('confirmar por error: el botón Deshacer de la respuesta lo corrige', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  const [r] = await bot.pulsa('ok');
  const deshacer = r.botones?.find(b => b.id.startsWith('undo:'));
  assert.ok(deshacer, 'tras confirmar debe haber un botón Deshacer');
  assert.ok(r.botones?.some(b => b.id.startsWith('edit:')), 'y un botón Editar');
  await bot.pulsa(deshacer!.id);
  assert.equal(await saldo(bot, 'efectivo'), 0);
});

test('editar un movimiento ya guardado: reemplaza al original al confirmar', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  const [r] = await bot.pulsa('ok');
  const edit = r.botones!.find(b => b.id.startsWith('edit:'))!;
  const tarjeta = textoDe(await bot.pulsa(edit.id));
  assert.match(tarjeta, /Editando un movimiento guardado/);
  await bot.di('monto 6000');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -6000);
  const movs = (await bot.repo.cargar()).movimientos;
  assert.equal(movs.filter(m => m.estado === 'ok').length, 1);
  assert.equal(movs.filter(m => m.estado === 'anulado').length, 1);
});

test('editar y cancelar deja el original intacto', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  const [r] = await bot.pulsa('ok');
  await bot.pulsa(r.botones!.find(b => b.id.startsWith('edit:'))!.id);
  await bot.pulsa('no');
  assert.equal(await saldo(bot, 'efectivo'), -5000);
});

test('«editar último» reabre el último movimiento', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  assert.match(textoDe(await bot.di('editar último')), /Editando un movimiento guardado/);
});

test('corrección sin pulsar Editar: «nequi» cambia la cuenta de la tarjeta', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  assert.match(textoDe(await bot.di('nequi')), /Nequi/);
});

// ---------------------------------------------------------------- saldos y arqueo

test('saldo inicial: fija los saldos y NO es un ingreso', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('saldo inicial efectivo 85000 nequi 150000 arq 2 usd monedas 12000'));
  assert.match(t, /Efectivo: \$85\.000/);
  assert.match(t, /ARQ: US\$2,00/);
  assert.match(t, /NO cuenta como ingreso/);
  await bot.pulsa('ok');
  const s = textoDe(await bot.di('saldo'));
  assert.match(s, /Efectivo \(billetera\): \$85\.000/);
  assert.match(s, /Nequi: \$150\.000/);
  assert.match(s, /ARQ: US\$2,00/);
  assert.match(s, /Monedas \(aparte\): \$12\.000/);
  assert.match(textoDe(await bot.di('mes')), /Gastos: \$0/);
  assert.doesNotMatch(textoDe(await bot.di('mes')), /Ingresos/);
});

test('saldo: el ARQ (dólares) no se mezcla con el disponible en pesos', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 34000 nequi 90000 arq 2.22 usd');
  await guardar(bot, 'cambio 32000 nequi a arq 8 usd'); // aunque haya una conversión, no se usa para convertir
  const s = textoDe(await bot.di('saldo'));
  assert.match(s, /Disponible: \$92\.000/);
  assert.match(s, /ARQ: US\$10,22/);
  assert.match(s, /ARQ va aparte, en dólares/);
});

test('saldo inicial con deudas', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000 le debo sergio 54k antes del 31 de octubre por la bicicleta le debo daniel 8 usd');
  const d = textoDe(await bot.di('deudas'));
  assert.match(d, /Sergio: \$54\.000 · bicicleta · antes del 31 oct/);
  assert.match(d, /Daniel: US\$8,00/);
});

test('los movimientos anteriores a la apertura no tocan los saldos', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000 hace 3 dias');
  await guardar(bot, 'saldo inicial efectivo 85000');
  assert.equal(await saldo(bot, 'efectivo'), 85000);
});

test('arqueo: la diferencia queda como Descuadre', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000');
  const t = textoDe(await bot.di('arqueo efectivo 80000'));
  assert.match(t, /Efectivo: tenías \$85\.000, tienes \$80\.000 \(diferencia -\$5\.000\)/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), 80000);
  assert.match(textoDe(await bot.di('mes')), /Descuadre: \$5\.000/);
});

// ---------------------------------------------------------------- reportes

test('tope mensual: el bot avisa cuánto llevas', async () => {
  const bot = nuevoBot();
  await bot.di('tope mecato 20000');
  const r = await guardar(bot, 'mecato 5000');
  assert.match(r, /Mecato: llevas \$5\.000 de \$20\.000 este mes \(25%\)/);
  const r2 = await guardar(bot, 'mecato 16000');
  assert.match(r2, /superaste el tope/);
});

test('resumen del mes por categoría', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  await guardar(bot, 'pizza 15000');
  const t = textoDe(await bot.di('mes'));
  assert.match(t, /octubre 2026/);
  assert.match(t, /Gastos: \$20\.000/);
  assert.match(t, /Comida: \$15\.000 \(75%\)/);
});

test('cuánto llevo en una categoría', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'mecato 5000');
  assert.match(textoDe(await bot.di('cuanto llevo en mecato')), /Mecato: \$5\.000 esta semana · \$5\.000 este mes/);
});

test('ayuda', async () => {
  assert.match(textoDe(await nuevoBot().di('hola')), /Cuéntame lo que pasó/);
});

test('los datos no se guardan dos veces al pulsar Confirmar dos veces', async () => {
  const bot = nuevoBot();
  await bot.di('mecato 5000');
  await bot.pulsa('ok');
  assert.match(textoDe(await bot.pulsa('ok')), /No hay nada pendiente/);
  assert.equal((await bot.repo.cargar()).movimientos.length, 1);
});

test('todos los movimientos guardados cuadran (asientos suman 0)', async () => {
  const bot = nuevoBot();
  for (const t of ['mecato 5000', 'pizza 9000 pagué por ivan 3000 y daniel 2500', 'presté 40k a ivan nequi', '+mamá 100k', 'cambio 50k efectivo a nequi', 'cambio 32000 nequi a arq 8 usd', 'le debo 54k a sergio por la bicicleta', 'ivan me pagó el almuerzo 6000']) {
    await guardar(bot, t);
  }
  for (const m of (await bot.repo.cargar()).movimientos) {
    const porMoneda = new Map<string, number>();
    for (const a of m.asientos) porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? 0) + a.monto);
    for (const [mon, suma] of porMoneda) assert.equal(suma, 0, `${m.descripcion} (${mon})`);
  }
});

void AHORA;

test('pago mixto sin total: «6000 billete y 1800 monedas» cuesta 7800', async () => {
  const t = textoDe(await nuevoBot().di('taxi del terminal a la casa 6000 billete y 1800 monedas'));
  assert.match(t, /\$7\.800/);
  assert.match(t, /\$6\.000 en billete \+ \$1\.800 en monedas/);
});

test('ingreso: «+mesada 100k -30k» (la mesada es la fuente) guarda el neto', async () => {
  const t = textoDe(await nuevoBot().di('+mesada 100k -30k'));
  assert.match(t, /Ingreso · Mesada · \$70\.000/);
});

test('pagar con más monedas de las que hay avisa en la tarjeta', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 50000 monedas 500');
  await bot.pulsa('ok');
  const t = textoDe(await bot.di('taxi 7800 con 6000 en billete y 1800 en monedas de terminal a casa'));
  assert.match(t, /Falta plata en Monedas: hay \$500 y esto saca \$1\.800 \(quedaría en -\$1\.300\)/);
  // con monedas de sobra no dice nada
  const b2 = nuevoBot();
  await b2.di('saldo inicial efectivo 50000 monedas 5000');
  await b2.pulsa('ok');
  assert.doesNotMatch(textoDe(await b2.di('taxi 7800 con 6000 en billete y 1800 en monedas de terminal a casa')), /negativo/);
});

test('hora con minutos pasa por el bot completo: «ayer 10:07 pm», «4:30 pm», «a las 10:07 pm»', async () => {
  for (const [frase, esperado] of [
    ['mecato 5000 ayer 10:07 pm', /ayer 10:07 pm/],
    ['mecato 5000 ayer 4:30 pm', /ayer 4:30 pm/],
    ['mecato 5000 4:30pm', /hoy 4:30 pm/],
    ['mecato 5000 ayer a las 10:07 pm', /ayer 10:07 pm/],
    ['mamá me prestó 149984 nequi ayer 10:07 pm', /ayer 10:07 pm/],
    ['mecato 5000 ayer 9:05 am', /ayer 9:05 am/],
  ] as [string, RegExp][]) {
    assert.match(textoDe(await nuevoBot().di(frase)), esperado, frase);
  }
});

test('plata de terceros: «plata de mamá para cooperativa» y «con plata de mamá» usan la deuda, sin tocar ingresos ni gastos', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial nequi 50000'); await bot.pulsa('ok');
  const a = textoDe(await bot.di('plata de mamá para cooperativa 150000 nequi'));
  assert.match(a, /Plata de Mamá para cooperativa · \$150\.000 · Nequi/);
  assert.match(a, /Motivo: cooperativa/);
  await bot.pulsa('ok');
  for (const frase of ['cooperativa 149984 con plata de mamá nequi', 'pagué cooperativa 149984 con plata de mamá nequi']) {
    assert.match(textoDe(await bot.di(frase)), /Gasto con plata de Mamá.*\$149\.984 · Nequi/, frase);
    await bot.pulsa('no');
  }
  const p = textoDe(await bot.di('cooperativa 149984 con plata de mamá nequi'));
  assert.match(p, /Gasto con plata de Mamá/);
  await bot.pulsa('ok');
  assert.match(textoDe(await bot.di('deudas')), /Mamá: \$16 · cooperativa/);
  // no hubo ingresos ni gastos: el resumen del mes está en cero
  const mes = textoDe(await bot.di('mes'));
  assert.doesNotMatch(mes, /Ingresos|Gastos: \$[1-9]/);
});

test('metas de ahorro: fijar, apartar, sacar, ver y quitar', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('metas')), /No tienes metas/);
  assert.match(textoDe(await bot.di('meta moto 2000000')), /Meta Moto: \$2\.000\.000/);
  assert.match(textoDe(await bot.di('ahorré 50000 para moto')), /Apartaste \$50\.000 para Moto: llevas \$50\.000 de \$2\.000\.000 \(3 %\)/);
  assert.match(textoDe(await bot.di('aparté 150k para moto')), /llevas \$200\.000 de \$2\.000\.000 \(10 %\)/);
  assert.match(textoDe(await bot.di('metas')), /Moto: \$200\.000 de \$2\.000\.000 \(10 %\), faltan \$1\.800\.000/);
  assert.match(textoDe(await bot.di('saqué 80000 de la meta moto')), /llevas \$120\.000/);
  assert.match(textoDe(await bot.di('ahorré 5000 para viaje')), /No tengo una meta «viaje»/);
  assert.match(textoDe(await bot.di('saqué 900000 de la meta moto')), /Solo hay \$120\.000/);
  // el saldo muestra cuánto está apartado, y no cambia lo que tienes
  await bot.di('saldo inicial efectivo 500000'); await bot.pulsa('ok');
  const s = textoDe(await bot.di('saldo'));
  assert.match(s, /Disponible: \$500\.000/);
  assert.match(s, /Apartado para metas: \$120\.000/);
  assert.match(textoDe(await bot.di('quitar meta moto')), /Quité la meta Moto/);
});

test('compra con varias líneas: un solo gasto con el total y el detalle en la nota', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('compra: arroz 5000, sal 2000, 3 gaseosas a 2000 nequi'));
  assert.match(t, /Gasto · .* · \$13\.000 · Nequi/);
  assert.match(t, /Concepto: Compra: arroz, sal, 3 gaseosas/);
  assert.match(t, /Detalle: arroz \$5\.000 · sal \$2\.000 · gaseosas 3 × \$2\.000 = \$6\.000/);
  await bot.pulsa('ok');
  const d = await bot.repo.cargar();
  assert.equal(d.movimientos.filter(m => m.tipo === 'gasto').length, 1);
  // un gasto normal con una sola cifra no cambia
  assert.match(textoDe(await nuevoBot().di('compré arroz 8000')), /Gasto · .* · \$8\.000/);
  // sin unidades y con fecha
  assert.match(textoDe(await nuevoBot().di('compra pan 3000, leche 4500 ayer')), /\$7\.500 · Efectivo · ayer/);
});

test('un botón «ia:» anota una frase que la IA entendió con retraso, igual que si se escribiera', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.pulsa('ia:mecato 5000 ayer'));
  assert.match(t, /Gasto · Mecato · \$5\.000 · Efectivo · ayer/);
  assert.match(textoDe(await bot.pulsa('ok')), /Guardado/);
});

test('deshacer 3 anula los últimos tres movimientos, sin tocar los anteriores', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial efectivo 100000'); await bot.pulsa('ok');
  for (const f of ['mecato 1000', 'mecato 2000', 'mecato 3000', 'mecato 4000']) { await bot.di(f); await bot.pulsa('ok'); }
  const t = textoDe(await bot.di('deshacer 3'));
  assert.match(t, /Anulé 3 movimientos: Mecato, Mecato, Mecato/);
  const d = await bot.repo.cargar();
  const vivos = d.movimientos.filter(m => m.estado === 'ok' && m.tipo === 'gasto');
  assert.equal(vivos.length, 1);
  assert.equal(vivos[0].asientos.find(a => a.cuentaId === 'cat:mecato')?.monto, 1000);
  assert.match(textoDe(await bot.di('deshacer 0')), /Dime cuántos/);
});

test('ventas del año suma también por mes', async () => {
  const { MemoriaRepo, procesar } = await import('../src/index.ts');
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('empresa', { config: { catalogo: JSON.stringify({ productos: [{ id: 'galletas', nombre: 'Galletas', alias: ['galleta'], presentaciones: [{ id: 'granel', nombre: 'granel', alias: ['a granel'], precio: 500 }] }] }) } });
  for (const [mes, dia] of [['2026-09-10', 'septiembre'], ['2026-10-12', 'octubre']]) {
    const hora = new Date(`${mes}T17:00:00Z`);
    await procesar(repo, { texto: '10 galletas a granel' }, hora); await procesar(repo, { boton: 'ok' }, hora);
    void dia;
  }
  const t = textoDe(await procesar(repo, { texto: 'ventas del año' }, new Date('2026-10-20T17:00:00Z')));
  assert.match(t, /Por mes: septiembre \$5\.000 · octubre \$5\.000/);
});

test('subcategorías: se crean con una frase, suman en la categoría de arriba y se ven en el resumen', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('subcategoria restaurante de comida')), /Creé la subcategoría Restaurante dentro de Comida/);
  assert.match(textoDe(await bot.di('subcategoria restaurante de comida')), /Ya existe/);
  assert.match(textoDe(await bot.di('subcategoria otra de nada')), /No encuentro la categoría «nada»/);
  assert.match(textoDe(await bot.di('restaurante 30000')), /Gasto · Restaurante · \$30\.000/);
  await bot.pulsa('ok');
  await bot.di('almuerzo 12000'); await bot.pulsa('ok');
  const mes = textoDe(await bot.di('mes'));
  assert.match(mes, /• Comida: \$42\.000/);
  assert.match(mes, / {3}· Restaurante: \$30\.000/);
  assert.match(mes, / {3}· Comida \(directo\): \$12\.000/);
  // «cuánto llevo en comida» también cuenta lo de adentro
  assert.match(textoDe(await bot.di('cuánto llevo en comida')), /\$42\.000/);
});

test('mes cerrado: no deja anotar, editar ni anular lo de meses cerrados, hasta que se abra', async () => {
  const { deLocal } = await import('../src/index.ts');
  const bot = nuevoBot();
  const nov = deLocal('2026-11-03 10:00:00');
  await bot.di('saldo inicial efectivo 100000', deLocal('2026-09-01 08:00:00')); await bot.pulsa('ok', deLocal('2026-09-01 08:00:00'));
  await bot.di('mecato 5000 el 10 de octubre', nov); await bot.pulsa('ok', nov);
  assert.match(textoDe(await bot.di('cerrar mes octubre', nov)), /Cerré hasta el 31 oct/);
  assert.match(textoDe(await bot.di('mecato 3000 el 15 de octubre', nov)), /octubre, que está cerrado/);
  // un mes abierto sí
  assert.match(textoDe(await bot.di('mecato 3000', nov)), /Entendí/);
  await bot.pulsa('no', nov);
  // anular algo de un mes cerrado también se bloquea
  const d = await bot.repo.cargar();
  const viejo = d.movimientos.find(m => m.descripcion === 'Mecato' && m.ocurridoEn.startsWith('2026-10'))!;
  assert.match(textoDe(await bot.pulsa(`undo:${viejo.id}`, nov)), /cerrado/);
  // no se cierra un mes que no terminó
  assert.match(textoDe(await bot.di('cerrar mes noviembre', nov)), /todavía no termina/);
  assert.match(textoDe(await bot.di('meses cerrados', nov)), /Cerrado hasta el 31 oct/);
  assert.match(textoDe(await bot.di('abrir meses', nov)), /Abrí todos los meses/);
  assert.match(textoDe(await bot.di('mecato 3000 el 15 de octubre', nov)), /Entendí/);
});
