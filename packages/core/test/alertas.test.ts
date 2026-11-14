import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularAlertas, deLocal } from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string, reloj = AHORA) {
  await bot.di(texto, reloj);
  await bot.pulsa('ok', reloj);
}

test('alerta: falta el saldo inicial', async () => {
  const bot = nuevoBot();
  const a = calcularAlertas(await bot.repo.cargar(), AHORA);
  assert.ok(a.some(x => /saldo inicial/.test(x.texto)));
});

test('alerta: deuda que vence pronto o ya venció', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000 le debo sergio 54k antes del 31 de octubre');
  // faltan 12 días: aún no avisa
  assert.ok(!calcularAlertas(await bot.repo.cargar(), AHORA).some(x => /Sergio/.test(x.texto)));
  // faltan 2 días: urgente
  const dosDias = deLocal('2026-10-29 10:00:00');
  const a = calcularAlertas(await bot.repo.cargar(), dosDias);
  assert.ok(a.some(x => x.nivel === 'urgente' && /Sergio.*vence en 2 días/.test(x.texto)), JSON.stringify(a));
  // vencida
  const tarde = deLocal('2026-11-02 10:00:00');
  assert.ok(calcularAlertas(await bot.repo.cargar(), tarde).some(x => /venció el 31 oct/.test(x.texto)));
});

test('alerta: pagar la deuda quita la alerta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000 nequi 100000 le debo sergio 54k antes del 31 de octubre');
  await guardar(bot, 'pagué 54k a sergio nequi');
  const dosDias = deLocal('2026-10-29 10:00:00');
  assert.ok(!calcularAlertas(await bot.repo.cargar(), dosDias).some(x => /Sergio/.test(x.texto)));
});

test('alerta: tope de categoría al 80 % y al 100 %', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000');
  await bot.di('tope mecato 20000');
  await guardar(bot, 'mecato 16000');
  assert.ok(calcularAlertas(await bot.repo.cargar(), AHORA).some(x => x.nivel === 'aviso' && /Mecato va al 80%/.test(x.texto)));
  await guardar(bot, 'mecato 5000');
  assert.ok(calcularAlertas(await bot.repo.cargar(), AHORA).some(x => x.nivel === 'urgente' && /Superaste el tope de Mecato/.test(x.texto)));
});

test('alerta: días sin registrar movimientos', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 85000');
  const seisDias = deLocal('2026-10-25 10:00:00');
  assert.ok(calcularAlertas(await bot.repo.cargar(), seisDias).some(x => /6 días sin registrar/.test(x.texto)));
  assert.ok(!calcularAlertas(await bot.repo.cargar(), AHORA).some(x => /sin registrar/.test(x.texto)));
});

test('alerta: los primeros días del mes resume el mes pasado', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  await guardar(bot, 'mecato 20000', deLocal('2026-10-10 10:00:00'));
  await guardar(bot, 'ingreso 100000 chamba', deLocal('2026-10-12 10:00:00'));
  const d = await bot.repo.cargar();
  const a = calcularAlertas(d, deLocal('2026-11-02 09:00:00')).find(x => x.id === 'resumen-mes');
  assert.ok(a, 'debía haber resumen');
  assert.equal(a.nivel, 'info');
  assert.match(a.texto, /Octubre: gastaste \$20\.000 e ingresaron \$100\.000\. Lo que más pesó: Mecato \$20\.000/);
  // a mitad de mes ya no sale
  assert.ok(!calcularAlertas(d, deLocal('2026-11-15 09:00:00')).some(x => x.id === 'resumen-mes'));
});

test('recurrentes: «cada mes el 5 recarga 9000» avisa desde dos días antes hasta que se registra', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  const r = textoDe(await bot.di('cada mes el 5 recarga 9000', deLocal('2026-11-01 08:00:00')));
  assert.match(r, /Cada mes, el 5: Recarga \$9.000/);
  assert.match(textoDe(await bot.di('recurrentes')), /Recarga \$9.000 \(cada mes, el 5\)/);
  const d = () => bot.repo.cargar();
  // faltan 4 días: todavía no
  assert.ok(!calcularAlertas(await d(), deLocal('2026-11-01 09:00:00')).some(x => /toca Recarga/.test(x.texto)));
  // faltan 2 días: aviso
  const a = calcularAlertas(await d(), deLocal('2026-11-03 09:00:00')).find(x => /toca Recarga/.test(x.texto));
  assert.ok(a, 'debía avisar');
  assert.equal(a.nivel, 'aviso');
  assert.match(a.texto, /recarga 9000/);
  // ya vencido sigue avisando
  assert.ok(calcularAlertas(await d(), deLocal('2026-11-09 09:00:00')).some(x => /toca Recarga/.test(x.texto)));
  // registrado este mes: deja de avisar
  await guardar(bot, 'recarga 9000', deLocal('2026-11-04 10:00:00'));
  assert.ok(!calcularAlertas(await d(), deLocal('2026-11-09 09:00:00')).some(x => /toca Recarga/.test(x.texto)));
  // el mes siguiente vuelve a tocar
  assert.ok(calcularAlertas(await d(), deLocal('2026-12-04 09:00:00')).some(x => /toca Recarga/.test(x.texto)));
  // quitarlo
  assert.match(textoDe(await bot.di('quitar recurrente recarga')), /Quité/);
  assert.ok(!calcularAlertas(await d(), deLocal('2026-12-04 09:00:00')).some(x => /toca Recarga/.test(x.texto)));
});

test('recurrentes: sin día o sin monto no se guarda', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('cada mes recarga')), /Ejemplo: «cada mes el 5 internet 60000»/);
  assert.match(textoDe(await bot.di('cada mes el 40 recarga 9000')), /día/);
});

test('resumen: el mes se compara con el anterior', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-09-01 08:00:00'));
  await guardar(bot, 'mecato 10000', deLocal('2026-10-10 10:00:00'));
  await guardar(bot, 'mecato 15000', deLocal('2026-11-03 10:00:00'));
  const t = textoDe(await bot.di('mes', deLocal('2026-11-05 10:00:00')));
  assert.match(t, /Frente a octubre: gastaste 50 % más \(antes \$10\.000\)/);
  // sin gastos el mes anterior no se compara
  assert.doesNotMatch(textoDe(await bot.di('año', deLocal('2026-11-05 10:00:00'))), /Frente a/);
});

test('un gasto muy por encima de lo normal en su categoría avisa en la tarjeta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-01 08:00:00'));
  for (let i = 1; i <= 5; i++) await guardar(bot, 'mecato 3000', deLocal(`2026-10-0${i + 1} 10:00:00`));
  const t = textoDe(await bot.di('mecato 40000', deLocal('2026-10-10 10:00:00')));
  assert.match(t, /bastante más de lo normal en Mecato: lo usual son \$3\.000/);
  // un monto normal no avisa
  assert.doesNotMatch(textoDe(await bot.di('mecato 4000', deLocal('2026-10-10 10:00:00'))), /bastante más/);
});

test('alerta: el lunes resume la semana pasada', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-10-20 08:00:00'));
  await guardar(bot, 'mecato 8000', deLocal('2026-10-28 10:00:00'));
  await guardar(bot, 'ingreso 50000 chamba', deLocal('2026-10-29 10:00:00'));
  const d = await bot.repo.cargar();
  const a = calcularAlertas(d, deLocal('2026-11-02 09:00:00')).find(x => x.id === 'resumen-semana'); // lunes
  assert.ok(a, 'debía haber resumen semanal');
  assert.match(a.texto, /Semana pasada: gastaste \$8\.000 e ingresaron \$50\.000\. Lo que más pesó: Mecato \$8\.000/);
  assert.ok(!calcularAlertas(d, deLocal('2026-11-04 09:00:00')).some(x => x.id === 'resumen-semana')); // miércoles
});

test('topes: con «tope_arrastra» lo que sobró del mes pasado se suma', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 500000', deLocal('2026-09-20 08:00:00'));
  await bot.di('tope mecato 20000', deLocal('2026-09-20 09:00:00'));
  await guardar(bot, 'mecato 5000', deLocal('2026-10-05 10:00:00')); // gastó 5.000 de 20.000: sobran 15.000
  await guardar(bot, 'mecato 30000', deLocal('2026-11-02 10:00:00'));
  const base = await bot.repo.cargar();
  const sin = calcularAlertas(base, deLocal('2026-11-03 09:00:00'));
  assert.ok(sin.some(x => /Superaste el tope de Mecato: \$30\.000 de \$20\.000/.test(x.texto)));
  const con = calcularAlertas({ ...base, config: { ...base.config, tope_arrastra: '1' } }, deLocal('2026-11-03 09:00:00'));
  assert.ok(con.some(x => /Mecato va al 86% del tope \(\$30\.000 de \$35\.000\)/.test(x.texto)), JSON.stringify(con.map(x => x.texto)));
});
