/** Etiquetas transversales: #viaje #claude en cualquier parte de la frase, guardadas por palabra. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarEdicion, conNumeral, etiquetasDeTexto, etiquetasUsadas, extraerEtiquetas, filtrarMovimientos, movimientosACsv, porEtiqueta, tieneEtiquetas,
} from '../src/index.ts';
import { AHORA, nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;
async function guardar(bot: Bot, texto: string) {
  const t = textoDe(await bot.di(texto));
  assert.match(t, /Entendí:/, `«${texto}» debía mostrar una tarjeta: ${t}`);
  await bot.pulsa('ok');
  return (await bot.repo.cargar()).movimientos.filter(m => m.estado === 'ok').at(-1)!;
}

test('extraerEtiquetas: quita los hashtags de cualquier posición y los deja en minúscula sin tildes', () => {
  const r = extraerEtiquetas('#Viaje almuerzo 12000 #Claude_ia #Año');
  assert.deepEqual(r.etiquetas, ['viaje', 'claude_ia', 'ano']);
  assert.equal(r.texto, 'almuerzo 12000');
  assert.deepEqual(extraerEtiquetas('mecato 5000 #a #a').etiquetas, ['a']);
  assert.equal(extraerEtiquetas('mecato 5000').etiquetas.length, 0);
});

test('extraerEtiquetas: largo y cantidad máximos', () => {
  assert.match(extraerEtiquetas(`mecato 5000 #${'a'.repeat(25)}`).error ?? '', /muy larga/);
  assert.equal(extraerEtiquetas(`mecato 5000 #${'a'.repeat(24)}`).error, undefined);
  assert.match(extraerEtiquetas('mecato 5000 #a #b #c #d #e #f').error ?? '', /Máximo 5/);
});

test('tieneEtiquetas compara por palabra entera', () => {
  assert.equal(tieneEtiquetas('viaje claude', ['claude']), true);
  assert.equal(tieneEtiquetas('viaje claude', ['claude', 'viaje']), true);
  assert.equal(tieneEtiquetas('viajero', ['viaje']), false);
  assert.equal(tieneEtiquetas(null, ['viaje']), false);
  assert.equal(conNumeral('viaje claude'), '#viaje #claude');
  assert.equal(etiquetasDeTexto('#Viaje, claude').valor, 'viaje claude');
  assert.equal(etiquetasDeTexto('').valor, null);
});

test('hashtags en cualquier frase y posición no cambian concepto, categoría ni monto', async () => {
  const bot = nuevoBot();
  const base = await guardar(bot, 'almuerzo 12000');
  const gasto = await guardar(bot, '#viaje almuerzo 12000 #claude');
  assert.equal(gasto.etiqueta, 'viaje claude');
  assert.equal(gasto.descripcion, base.descripcion);
  assert.deepEqual(gasto.asientos.map(a => [a.cuentaId, a.monto]), base.asientos.map(a => [a.cuentaId, a.monto]));
  const compartido = await guardar(bot, 'pizza 30000 con ivan #universidad');
  assert.equal(compartido.etiqueta, 'universidad');
  const ingreso = await guardar(bot, 'ingreso 50000 chamba #asociacion');
  assert.equal(ingreso.etiqueta, 'asociacion');
  assert.equal((await guardar(bot, 'presté 20k a ivan #viaje')).etiqueta, 'viaje');
  assert.equal((await guardar(bot, 'cambio 10k efectivo a nequi #viaje')).etiqueta, 'viaje');
  assert.match(textoDe(await bot.di('mecato 5000 #a #b #c #d #e #f')), /Máximo 5/);
});

test('consulta por varias etiquetas y corrección de la tarjeta', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'pizza 12000 #viaje #claude');
  await guardar(bot, 'taxi de terminal a casa 8000 #viaje');
  assert.match(textoDe(await bot.di('#viaje')), /#viaje · 2 movimientos · total \$20\.000/);
  assert.match(textoDe(await bot.di('#viaje #claude')), /#viaje #claude · 1 movimientos · total \$12\.000/);
  await bot.di('mecato 5000');
  assert.match(textoDe(await bot.di('#proyecto #claude')), /Evento: #proyecto #claude/);
  await bot.pulsa('ok');
  const m = (await bot.repo.cargar()).movimientos.filter(x => x.estado === 'ok').at(-1)!;
  assert.equal(m.etiqueta, 'proyecto claude');
});

test('filtros, etiquetasUsadas, porEtiqueta y CSV con varias etiquetas', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'pizza 12000 #viaje #claude');
  await guardar(bot, 'taxi de terminal a casa 8000 #viaje');
  await guardar(bot, 'mecato 5000');
  const d = await bot.repo.cargar();
  assert.equal(filtrarMovimientos(d, { etiqueta: 'viaje' }).length, 2);
  assert.equal(filtrarMovimientos(d, { etiqueta: 'claude' }).length, 1);
  assert.equal(filtrarMovimientos(d, { etiqueta: '#viaje #claude' }).length, 1);
  assert.equal(filtrarMovimientos(d, { texto: '#viaje' }).length, 2);
  assert.equal(filtrarMovimientos(d, { etiqueta: 'via' }).length, 0);
  assert.deepEqual(etiquetasUsadas(d.movimientos), [{ etiqueta: 'viaje', n: 2 }, { etiqueta: 'claude', n: 1 }]);
  assert.equal(porEtiqueta(d.movimientos, d.cuentas, 'claude').total, 12000);
  assert.equal(porEtiqueta(d.movimientos, d.cuentas, 'viaje claude').movimientos.length, 1);
  const csv = movimientosACsv(d.movimientos, d.cuentas);
  assert.match(csv, /,viaje claude,/);
});

test('editar: se cambian y se quitan las etiquetas, y un valor viejo sigue igual', async () => {
  const bot = nuevoBot();
  const m = await guardar(bot, 'pizza 12000 #cumple-daniel');
  assert.equal(m.etiqueta, 'cumple-daniel');
  await aplicarEdicion(bot.repo, AHORA, m.id, { etiqueta: '#Viaje claude' });
  assert.equal((await bot.repo.cargar()).movimientos.find(x => x.id === m.id)!.etiqueta, 'viaje claude');
  await aplicarEdicion(bot.repo, AHORA, m.id, { etiqueta: '' });
  assert.equal((await bot.repo.cargar()).movimientos.find(x => x.id === m.id)!.etiqueta ?? null, null);
  await assert.rejects(aplicarEdicion(bot.repo, AHORA, m.id, { etiqueta: 'a'.repeat(30) }), /muy larga/);
});
