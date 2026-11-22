/** Lenguaje de la segunda ronda: cobros, negaciones por cláusula, jerga, medidas, repartos, líneas, prioridades y edición hablada. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLocal, serializarReglas } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import { dividirLinea } from '../src/lineas.ts';

const ANTES = deLocal('2026-10-01 08:00:00');

/** Un bot con saldos y, si se pide, movimientos ya confirmados (préstamos, gastos...). */
async function bot(previos: string[] = [], conDolares = false) {
  const b = nuevoBot();
  await b.di('saldo inicial efectivo 500000 nequi 300000 daviplata 100000', ANTES);
  await b.pulsa('ok', ANTES);
  if (conDolares) { await b.di('saldo inicial dolares 50 usd', ANTES); await b.pulsa('ok', ANTES); }
  for (const p of previos) { await b.di(p, ANTES); await b.pulsa('ok', ANTES); }
  return b;
}

const dice = async (frase: string, previos: string[] = [], conDolares = false) => textoDe(await (await bot(previos, conDolares)).di(frase, AHORA));

// ------------------------------------------------------------------ 1. cobros

const COBROS: [string, string[], RegExp][] = [
  // con deuda abierta: abono recibido
  ['Faber me pago los 23k qué me debía', ['presté 50k a Faber'], /Pago · Faber te paga · \$23\.000/],
  ['Faber me pagó los 23k que me debía', ['presté 50k a Faber'], /Pago · Faber te paga · \$23\.000/],
  ['me abonó 10k Ana', ['presté 40k a Ana'], /Pago · Ana te paga · \$10\.000/],
  ['me devolvió 20k Pedro', ['presté 40k a Pedro'], /Pago · Pedro te paga · \$20\.000/],
  ['me consignó 50k Luis', ['presté 80k a Luis'], /Pago · Luis te paga · \$50\.000/],
  ['cobré 30k a Ana', ['presté 40k a Ana'], /Pago · Ana te paga · \$30\.000/],
  ['le cobré 30k a Ana', ['presté 40k a Ana'], /Pago · Ana te paga · \$30\.000/],
  ['Ana me debía 23k y ya me pagó', ['presté 40k a Ana'], /Pago · Ana te paga · \$23\.000/],
  ['José Ángel me abonó 5k', ['presté 30k a José Ángel'], /Pago · José Ángel te paga · \$5\.000/],
  ['me abonó 5k José Ángel', ['presté 30k a José Ángel'], /Pago · José Ángel te paga · \$5\.000/],
  // sin deuda: plata que entra, nunca gasto ni deuda tuya
  ['Faber me pagó los 23k que me debía', [], /Ingreso · Faber · \$23\.000/],
  ['me abonó 10k Ana', [], /Ingreso · Ana · \$10\.000/],
  ['me devolvió 20k Pedro', [], /Ingreso · Pedro · \$20\.000/],
  ['me consignó 50k Luis', [], /Ingreso · Luis · \$50\.000/],
  ['cobré 30k a Ana', [], /Ingreso · Ana · \$30\.000/],
  ['le cobré 30k a Ana', [], /Ingreso · Ana · \$30\.000/],
  ['Ana me debía 23k y ya me pagó', [], /Ingreso · Ana · \$23\.000/],
];

for (const [frase, previos, esperado] of COBROS) {
  test(`cobro: «${frase}» ${previos.length ? 'con deuda' : 'sin deuda'}`, async () => {
    const t = await dice(frase, previos);
    assert.match(t, esperado);
    assert.doesNotMatch(t, /Gasto|Le debes|Deuda/);
  });
}

test('cobro sin monto: «ya me pagó Ana» pregunta cuánto y no ofrece la lista', async () => {
  const t = await dice('ya me pagó Ana', ['presté 40k a Ana']);
  assert.match(t, /¿Cuánto te pagó Ana\?/);
  assert.doesNotMatch(t, /lista de compras/);
});

test('cobro sin monto: «cobré a Ana» pregunta cuánto', async () => {
  assert.match(await dice('cobré a Ana'), /¿Cuánto le cobraste a Ana\?/);
});

// ------------------------------------------------------------------ 2. negaciones por cláusula

test('negación: lo negado se ignora y lo demás se guarda', async () => {
  const t = await dice('gasté 5000, no pagué propina');
  assert.match(t, /Gasto · .* \$5\.000/);
  assert.match(t, /Ignoré «no pagué propina», porque dice que no pasó/);
});

test('negación: «cena 20000, no compré postre» guarda la cena', async () => {
  const t = await dice('cena 20000, no compré postre');
  assert.match(t, /\$20\.000/);
  assert.match(t, /Ignoré «no compré postre»/);
});

test('negación: «compré pan 3000 y no pagué la luz» guarda el pan', async () => {
  const t = await dice('compré pan 3000 y no pagué la luz');
  assert.match(t, /Gasto · .* \$3\.000/);
  assert.match(t, /Ignoré «no pagué la luz»/);
});

for (const frase of ['no pagué 5000', 'Ana no me pagó 50000', 'Ana no me pagó, 50000', 'Ana y Luis no me pagaron 50000']) {
  test(`negación total: «${frase}» no anota nada`, async () => {
    const b = await bot();
    const t = textoDe(await b.di(frase, AHORA));
    assert.match(t, /Eso suena a que no pasó/);
    assert.doesNotMatch(t, /Entendí/);
  });
}

// ------------------------------------------------------------------ 3. vocabulario

const MEDIDAS: [string, RegExp][] = [
  ['botella 500 ml 2500', /\$2\.500/],
  ['compré 500 gramos de queso 5000', /\$5\.000/],
  ['compré 2 kg de arroz 9000', /\$9\.000/],
  ['aceite 1 l 12000', /\$12\.000/],
  ['cinta 50 cm 3000', /\$3\.000/],
  ['queso 250 gr 4000', /\$4\.000/],
];
for (const [frase, esperado] of MEDIDAS) {
  test(`medida: «${frase}» no confunde el tamaño con el monto`, async () => {
    const t = await dice(frase);
    assert.match(t, esperado);
    assert.doesNotMatch(t, /Veo varios montos/);
  });
}

test('«c/u» y «cada una» multiplican por la cantidad', async () => {
  assert.match(await dice('2 empanadas 4500 c/u'), /\$9\.000/);
  assert.match(await dice('compré 3 gaseosas 2000 cada una'), /\$6\.000/);
  const t = await dice('compré 3 gaseosas 2000 cada una');
  assert.match(t, /3 × \$2\.000/);
});

test('«cada una» sin cantidad pregunta cuántas', async () => {
  assert.match(await dice('gaseosas 2000 cada una'), /¿Cuántas fueron\?/);
});

test('«60k entre 3» anota tu parte, sin personas', async () => {
  const t = await dice('almuerzo 60k entre 3');
  assert.match(t, /Gasto · .* \$20\.000/);
  assert.match(t, /60\.000 entre 3/);
  assert.doesNotMatch(t, /Gasto compartido/);
});

test('«60k entre 3» sin concepto anota tu parte', async () => {
  assert.match(await dice('60k entre 3'), /\$20\.000/);
});

test('«pizza 60k entre 3 con ana y luis» es un gasto compartido en tres', async () => {
  assert.match(await dice('pizza 60k entre 3 con ana y luis'), /Gasto compartido[\s\S]*Tu parte: \$20\.000/);
});

test('«dividimos el almuerzo 30000 con ana y luis» reparte en tres', async () => {
  assert.match(await dice('dividimos el almuerzo 30000 con ana y luis'), /Gasto compartido[\s\S]*Tu parte: \$10\.000/);
});

test('«entre 4 con ana y luis» pregunta quién falta', async () => {
  assert.match(await dice('pizza 60k entre 4 con ana y luis'), /¿Cómo lo anoto\?|Faltan nombres|quién más/i);
});

test('«pasé 50000 a nequi» pregunta de dónde sale', async () => {
  const b = await bot();
  const s = await b.di('pasé 50000 a nequi', AHORA);
  assert.match(textoDe(s), /¿De dónde sale/);
  assert.doesNotMatch(textoDe(s), /Gasto/);
  assert.ok((s[0].botones ?? []).some(x => /Efectivo/.test(x.titulo)));
});

test('«pasé 50k de Nequi a efectivo» sigue siendo transferencia', async () => {
  assert.match(await dice('pasé 50k de Nequi a efectivo'), /Transferencia · \$50\.000 · Nequi → Efectivo/);
});

for (const frase of ['retiré 100000', 'saqué 100000']) {
  test(`«${frase}» sin cuenta pregunta de qué cuenta`, async () => {
    const b = await bot();
    const s = await b.di(frase, AHORA);
    assert.match(textoDe(s), /¿De qué cuenta/);
    assert.doesNotMatch(textoDe(s), /Gasto/);
    assert.ok((s[0].botones ?? []).some(x => /Nequi/.test(x.titulo)));
  });
}

test('«retiré 100000 de nequi» es una transferencia a efectivo', async () => {
  assert.match(await dice('retiré 100000 de nequi'), /Transferencia · \$100\.000 · Nequi → Efectivo/);
});

test('«saqué plata del cajero» sin monto pregunta cuánto', async () => {
  assert.match(await dice('saqué plata del cajero'), /¿Cuánto sacaste/);
});

for (const frase of ['me fié 20000', 'me fiaron 20000']) {
  test(`«${frase}» pregunta a quién le debes`, async () => {
    const t = await dice(frase);
    assert.match(t, /¿A quién le debes\?/);
    assert.doesNotMatch(t, /Gasto/);
  });
}

test('«me fiaron 20000 donde Pedro» es deuda con Pedro', async () => {
  assert.match(await dice('me fiaron 20000 donde Pedro'), /Deuda · le debes a Pedro · \$20\.000/);
});

test('«me quedó debiendo Pedro 15000» es un préstamo: Pedro te debe', async () => {
  assert.match(await dice('me quedó debiendo Pedro 15000'), /Préstamo · le prestas a Pedro · \$15\.000/);
});

test('«quedé debiendo 15000» pregunta a quién', async () => {
  assert.match(await dice('quedé debiendo 15000'), /¿A quién le debes\?/);
});

test('«me debe ivan 20k» es igual que «ivan me debe 20k»', async () => {
  assert.match(await dice('me debe ivan 20k'), /Préstamo · le prestas a Ivan · \$20\.000/);
  assert.match(await dice('ivan me debe 20k'), /Préstamo · le prestas a Ivan · \$20\.000/);
});

test('«me deben 20k» pregunta quién', async () => {
  assert.match(await dice('me deben 20k'), /¿Quién te debe\?/);
});

test('«me tocó pagar 20000 a Pedro» no se queda en un gasto sin pregunta', async () => {
  const t = await dice('me tocó pagar 20000 a Pedro', ['Pedro me prestó 50k']);
  assert.match(t, /Pago · le pagas a Pedro · \$20\.000/);
});

test('«le puse 5000 a la moto» es un gasto de moto', async () => {
  const t = await dice('le puse 5000 a la moto');
  assert.match(t, /Gasto · .* \$5\.000/);
  assert.doesNotMatch(t, /Le Puse/);
  assert.match(t, /Moto/);
});

test('«puse yo 20000» pregunta en qué fue', async () => {
  assert.match(await dice('puse yo 20000'), /¿En qué fue\?/);
});

test('«cancelé la deuda con Pedro 20000» es pago de deuda', async () => {
  const t = await dice('cancelé la deuda con Pedro 20000', ['Pedro me prestó 50k']);
  assert.match(t, /Pago · le pagas a Pedro · \$20\.000/);
});

test('«cancelar el pago» pregunta qué se quiere', async () => {
  const b = await bot(['mecato 5000']);
  const s = await b.di('cancelar el pago', AHORA);
  assert.match(textoDe(s), /¿Quieres deshacer el último movimiento\?/);
  assert.ok((s[0].botones ?? []).some(x => /deshacer/i.test(x.titulo)));
});

test('«me rebajó Pedro 5000» pregunta qué fue', async () => {
  const t = await dice('me rebajó Pedro 5000');
  assert.match(t, /Pedro/);
  assert.match(t, /¿Qué fue/);
  assert.doesNotMatch(t, /Gasto/);
});

test('dólares: «presté 12.50 usd a ana» va a la cuenta de dólares', async () => {
  const t = await dice('presté 12.50 usd a ana', [], true);
  assert.match(t, /Préstamo · le prestas a Ana · US\$12,50/);
  assert.doesNotMatch(t, /Falta plata/);
});

test('el parser no rompe «un tinto 2000» ni «una cerveza 6000»', async () => {
  assert.match(await dice('un tinto 2000'), /Gasto · .* \$2\.000/);
  assert.match(await dice('una cerveza 6000'), /Gasto · .* \$6\.000/);
});

// ------------------------------------------------------------------ 4. líneas

test('una línea sin monto ni verbo se pega a la anterior', () => {
  assert.deepEqual(dividirLinea('mecato 5000\nnequi'), ['mecato 5000 nequi']);
  assert.deepEqual(dividirLinea('mecato 5000\nayer'), ['mecato 5000 ayer']);
});

test('«mecato» y «5000» en dos líneas son un solo movimiento', () => {
  assert.deepEqual(dividirLinea('mecato\n5000'), ['mecato 5000']);
});

test('dos movimientos en dos líneas se siguen partiendo', () => {
  assert.deepEqual(dividirLinea('mecato 5000\npasaje 3000'), ['mecato 5000', 'pasaje 3000']);
});

test('«mecato 5000\\nnequi» sale de Nequi', async () => {
  const b = await bot();
  assert.match(textoDe(await b.di('mecato 5000\nnequi', AHORA)), /Mecato · \$5\.000 · Nequi/);
});

// ------------------------------------------------------------------ 5. prioridad de reglas

test('la categoría dicha con palabras gana a la regla aprendida', async () => {
  const b = await bot();
  await b.repo.setConfig('reglas_aprendidas', serializarReglas([{ id: 'r-ana', clave: 'ana', categoriaId: 'cat:transporte', creada: '2026-10-19 15:00:00' }]));
  assert.match(textoDe(await b.di('mecato ana 3000', AHORA)), /Mecato · \$3\.000/);
});

test('la regla aprendida solo rellena cuando la frase no dijo categoría', async () => {
  const b = await bot();
  await b.repo.setConfig('reglas_aprendidas', serializarReglas([{ id: 'r-ana', clave: 'ana', categoriaId: 'cat:transporte', creada: '2026-10-19 15:00:00' }]));
  assert.match(textoDe(await b.di('ana 3000', AHORA)), /Transporte/);
});

test('«pasaje taxi 8000» y «pasaje almuerzo 8000» ganan por la palabra más específica', async () => {
  assert.doesNotMatch(await dice('pasaje taxi 8000'), /Viaje semanal/);
  const t = await dice('pasaje almuerzo 8000');
  assert.doesNotMatch(t, /Viaje semanal/);
  assert.match(t, /Comida/);
});

test('el atajo «pasaje» solo sigue yendo a su categoría', async () => {
  assert.match(await dice('pasaje 8000'), /Viaje semanal/);
});

// ------------------------------------------------------------------ 6. edición hablada

for (const frase of ['anula el último', 'borra', 'borrar el último', 'elimina el ultimo', 'quita el último']) {
  test(`«${frase}» deshace el último movimiento`, async () => {
    const b = await bot(['mecato 5000']);
    const t = textoDe(await b.di(frase, AHORA));
    assert.doesNotMatch(t, /lista de compras/);
    assert.match(t, /↩️ Anulado: /);
  });
}

test('«borra» sin movimientos propios responde claro', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('borra', AHORA)), /No hay nada que deshacer/);
});

for (const frase of ['cambia el monto a 7000', 'cambiar monto a 7000', 'era 7000', 'mejor 7000', 'corrige a 7000']) {
  test(`«${frase}» edita el último movimiento`, async () => {
    const b = await bot(['mecato 5000']);
    const t = textoDe(await b.di(frase, AHORA));
    assert.match(t, /\$7\.000/);
    assert.match(t, /Mecato/);
    assert.doesNotMatch(t, /Cambia|Cambiar|Mejor|Era |Corrige/);
    await b.pulsa('ok', AHORA);
    const d = await b.repo.cargar();
    const vivos = d.movimientos.filter(m => m.estado === 'ok' && m.tipo === 'gasto');
    assert.equal(vivos.length, 1);
    assert.match(vivos[0].descripcion, /Mecato/);
  });
}

test('«era 7000» sin movimientos responde claro', async () => {
  const b = nuevoBot();
  assert.match(textoDe(await b.di('era 7000', AHORA)), /No hay nada que editar/);
});
