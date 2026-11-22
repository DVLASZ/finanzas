/** Categorías por raíz y palabra completa, pagos fijos que prestan su cuenta y categoría, y sugerencias de etiquetas. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ajusteDeFijo, contextoDe, fijoParaFrase, fraseConMonto, heredarDeFijo, sugerirEtiquetas, type Movimiento, type Recurrente } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function categoriaDe(frase: string): Promise<string> {
  const bot = nuevoBot();
  const t = textoDe(await bot.di(frase));
  return t;
}

const casos: [string, string][] = [
  ['suscripcion claude 60000', 'Suscripciones'],
  ['suscripción claude 60000', 'Suscripciones'],
  ['suscripciones claude 60000', 'Suscripciones'],
  ['reparación 30000', 'Reparaciones'],
  ['reparaciones 30000', 'Reparaciones'],
  ['salida 15000', 'Salidas'],
  ['compra 20000', 'Compras'],
  ['compras 20000', 'Compras'],
  ['regalo 20000', 'Regalos'],
  ['regalos 20000', 'Regalos'],
  ['recarga 10000', 'Recargas'],
  ['juego 32000', 'Juegos'],
  ['juegos 32000', 'Juegos'],
  ['comidas 12000', 'Comida'],
  ['transportes 5000', 'Transporte'],
  ['cena 15000', 'Comida'],
  ['cenas 15000', 'Comida'],
  ['coca 3000', 'Mecato'],
  ['cocas 3000', 'Mecato'],
  ['cine 20000', 'Salidas'],
  ['taxi 9000', 'Transporte'],
  ['taxis 9000', 'Transporte'],
  ['ropa 50000', 'Personal'],
  ['peluqueria 25000', 'Personal'],
  ['drogueria 8000', 'Salud'],
  ['tinto 2000', 'Mecato'],
  ['cerveza 6000', 'Salidas'],
];
for (const [frase, cat] of casos) {
  test(`categoría de «${frase}» es ${cat}`, async () => {
    const t = await categoriaDe(frase);
    assert.match(t, new RegExp(cat), t);
    assert.doesNotMatch(t, /qué categoría|en qué categoría/i, t);
  });
}

const noDebenCaer: [string, string][] = [
  ['europa 20000', 'Personal'],
  ['escena 5000', 'Comida'],
  ['busqueda 3000', 'Transporte'],
  ['motor 40000', 'Transporte'],
  ['motocicleta 40000', 'Transporte'],
];
for (const [frase, cat] of noDebenCaer) {
  test(`«${frase}» no cae en ${cat} por una subcadena`, async () => {
    const t = await categoriaDe(frase);
    assert.doesNotMatch(t, new RegExp(`Gasto · ${cat} ·`), t);
  });
}

const fijoClaude: Recurrente = { dia: 5, frase: 'suscripcion claude 65173 nequi', concepto: 'Suscripción Claude', monto: 65173 };
const fijoLuz: Recurrente = { dia: 10, frase: 'luz 80000', concepto: 'Luz', monto: 80000 };

const siguenFuncionando: [string, string][] = [
  ['buses 3000', 'Transporte'], ['bus 3000', 'Transporte'], ['motos 5000', 'Transporte'], ['moto 5000', 'Transporte'],
  ['peluquero 20000', 'Personal'], ['farmacias 9000', 'Salud'],
];
for (const [frase, cat] of siguenFuncionando) {
  test(`«${frase}» sigue en ${cat}`, async () => {
    assert.match(await categoriaDe(frase), new RegExp(`Gasto · ${cat} ·`));
  });
}

test('fijoParaFrase busca por palabras completas del concepto', () => {
  assert.equal(fijoParaFrase('claude 65000', [fijoClaude, fijoLuz])?.concepto, 'Suscripción Claude');
  assert.equal(fijoParaFrase('suscripcion claude', [fijoClaude, fijoLuz])?.concepto, 'Suscripción Claude');
  assert.equal(fijoParaFrase('claudia 65000', [fijoClaude]), null);
  assert.equal(fijoParaFrase('salida 5000', [fijoClaude, fijoLuz]), null);
});

test('heredarDeFijo da la cuenta y la categoría del pago fijo', async () => {
  const bot = nuevoBot();
  await bot.di('saldo inicial nequi 500000');
  await bot.pulsa('ok');
  const d = await bot.repo.cargar();
  const ctx = contextoDe({ ...d, config: { ...d.config, recurrentes: JSON.stringify([fijoClaude]) } }, AHORA);
  const h = heredarDeFijo('claude', ctx);
  assert.equal(h?.cuentaId, 'nequi');
  assert.equal(h?.categoriaId, 'cat:suscripciones');
  assert.equal(heredarDeFijo('claudia', ctx), null);
  // sin pagos fijos no hay nada que heredar
  assert.equal(heredarDeFijo('claude', contextoDe(d, AHORA)), null);
});

const mov = (id: string, descripcion: string, etiqueta: string | null, fecha: string, extra: Partial<Movimiento> = {}): Movimiento =>
  ({ id, ocurridoEn: `${fecha} 12:00:00`, descripcion, etiqueta, estado: 'ok', asientos: [], ...extra }) as Movimiento;

test('sugerirEtiquetas usa las del mismo concepto y no repite las puestas', () => {
  const movs = [
    mov('1', 'Claude', 'claude universidad', '2026-10-01'),
    mov('2', 'Claude', 'claude', '2026-10-05'),
    mov('3', 'Taxi', 'viaje', '2026-10-06'),
  ];
  assert.deepEqual(sugerirEtiquetas(movs, { concepto: 'Claude', etiquetas: ['claude'] }), ['universidad']);
  assert.deepEqual(sugerirEtiquetas(movs, { concepto: 'Claude', etiquetas: [] }, 2), ['claude', 'universidad']);
});

test('sugerirEtiquetas cae a las más usadas del último mes si no hay coincidencia', () => {
  const movs = [
    mov('1', 'Taxi', 'viaje', '2026-10-06'),
    mov('2', 'Bus', 'viaje', '2026-10-07'),
    mov('3', 'Cine', 'plan', '2026-10-08'),
    mov('4', 'Viejo', 'antiguo', '2025-01-01'),
  ];
  assert.deepEqual(sugerirEtiquetas(movs, { concepto: 'Otra cosa', etiquetas: [] }, 2, '2026-10-19'), ['viaje', 'plan']);
});

test('fraseConMonto cambia solo el monto y ajusteDeFijo conserva la moneda del cobro', async () => {
  const bot = nuevoBot();
  const d = await bot.repo.cargar();
  const ctx = contextoDe(d, AHORA);
  assert.equal(fraseConMonto(fijoClaude, 68000), 'suscripcion claude 68000 nequi');
  assert.deepEqual(ajusteDeFijo(fijoClaude, ctx).moneda, 'COP');
  const enDolares: Recurrente = { dia: 5, frase: 'suscripción Claude 20 arq', concepto: 'Suscripción Claude', monto: 20 };
  const a = ajusteDeFijo(enDolares, ctx);
  assert.equal(a.moneda, 'USD');
  assert.equal(a.monto, 20);
  assert.equal(fraseConMonto(enDolares, 21.5), 'suscripcion claude 21.5 arq');
  const sinMonto: Recurrente = { dia: 5, frase: 'internet', concepto: 'Internet', monto: 60000 };
  assert.equal(fraseConMonto(sinMonto, 61000), 'internet 61000');
});

test('la tarjeta acepta el conjunto de etiquetas completo y «sin etiquetas» las quita', async () => {
  const bot = nuevoBot();
  let t = textoDe(await bot.di('mecato 5000 #viaje'));
  assert.match(t, /Evento: #viaje/);
  t = textoDe(await bot.di('#viaje #claude'));
  assert.match(t, /Evento: #viaje #claude/);
  t = textoDe(await bot.di('sin etiquetas'));
  assert.doesNotMatch(t, /Evento:/);
  assert.match(t, /Entendí:/);
  await bot.pulsa('ok');
  const m = (await bot.repo.cargar()).movimientos.filter(x => x.estado === 'ok').at(-1)!;
  assert.ok(!m.etiqueta);
});
