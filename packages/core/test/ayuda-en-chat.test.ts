/**
 * Las preguntas de uso escritas en el chat («como anoto un gasto») se responden con la guía y no se cobran
 * como un gasto sin monto ni se ofrecen para la lista de compras.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esPreguntaDeAyuda } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

const PREGUNTAS = [
  'Como anoto un gasto', 'cómo registro una persona', 'como agrego una persona', 'para qué sirve esto', 'cómo pauso un pago fijo',
  'como borro un movimiento', 'como edito un gasto', 'como uso etiquetas', 'que puedo escribir', 'ayudame con los pagos fijos',
  'cómo hago un abono parcial', 'como funciona esto', 'no entiendo como se guarda una foto', 'cómo anoto lo que me prestaron?',
];

test('las preguntas de uso se reconocen y un gasto sin monto no', () => {
  for (const p of PREGUNTAS) assert.ok(esPreguntaDeAyuda(p), p);
  for (const g of ['mecato', 'Jabón baño', 'comida', 'almuerzo 12000', 'como 5000', 'Sofia']) assert.ok(!esPreguntaDeAyuda(g), g);
});

test('en el chat, una pregunta de ayuda responde con la guía y botones con ejemplos, sin pedir monto', async () => {
  for (const p of PREGUNTAS) {
    const bot = nuevoBot();
    const s = await bot.di(p);
    const t = textoDe(s);
    assert.doesNotMatch(t, /Me falta|lista de compras|¡Casi!/, p);
    assert.ok(s.some(x => x.botones && x.botones.length > 0), `${p}: trae botones`);
  }
});

test('«como anoto un gasto» ofrece un ejemplo que deja la frase escrita', async () => {
  const bot = nuevoBot();
  const s = await bot.di('Como anoto un gasto');
  const botones = s.flatMap(x => x.botones ?? []);
  assert.ok(botones.some(b => b.id.startsWith('poner:') && /almuerzo|mecato/.test(b.id)), JSON.stringify(botones));
  assert.deepEqual(await bot.pulsa(botones.find(b => b.id.startsWith('poner:'))!.id), []);
});

test('«como pauso un pago fijo» explica pausar y no crear', async () => {
  const bot = nuevoBot();
  const s = await bot.di('como pauso un pago fijo');
  const botones = s.flatMap(x => x.botones ?? []).map(b => b.id).join(' ');
  assert.match(botones, /pausar recurrente/);
});

test('un tema sugerido se puede abrir desde su botón', async () => {
  const bot = nuevoBot();
  const s = await bot.di('como anoto un gasto');
  const otro = s.flatMap(x => x.botones ?? []).find(b => b.id.startsWith('ayuda:'));
  if (otro) assert.ok(textoDe(await bot.pulsa(otro.id)).length > 10);
});

test('una duda sin tema claro responde con calidez y ofrece temas', async () => {
  const bot = nuevoBot();
  const s = await bot.di('como hago el zxqw');
  const t = textoDe(s);
  assert.doesNotMatch(t, /Me falta/);
  assert.match(t, /ayud/i);
});

test('un gasto sin monto sigue pidiendo el monto, con calidez', async () => {
  const bot = nuevoBot();
  const t = textoDe(await bot.di('mecato'));
  assert.match(t, /¡Casi!/);
  assert.match(t, /Me falta el monto/);
});

test('las preguntas de editar y borrar llevan al tema de corregir, no al de gastos ni al de personas', async () => {
  for (const [p, quiere] of [['como edito un gasto', /editar último|deshacer/], ['como borro un movimiento', /deshacer/], ['como cambio la categoria de un gasto', /editar último|deshacer/], ['como borro una persona', /agregar persona/]] as const) {
    const botones = (await nuevoBot().di(p)).flatMap(x => x.botones ?? []).map(b => b.id).join(' ');
    assert.match(botones, quiere, p);
  }
});

test('preguntas cotidianas sobre plata que entra llevan al tema de ingresos', async () => {
  for (const p of [
    'como registro una plata que me ingresa como pago de una actividad', 'como anoto plata que me entra por un trabajo',
    'cuando me paguen la quincena como lo anoto', 'como registro un pago que me hicieron', 'como anoto una plata que me llega por un trabajo',
    'como registro lo que me pagaron por una actividad', 'como pongo que me consignaron la nomina',
  ]) {
    const s = await nuevoBot().di(p);
    const botones = s.flatMap(x => x.botones ?? []).map(b => b.id).join(' ');
    assert.match(botones, /poner:ingreso 50000/, p);
    assert.doesNotMatch(textoDe(s), /Me falta|No estoy seguro/, p);
  }
});

test('«como saco el total del mes» lleva a saldos y no al cajero', async () => {
  const botones = (await nuevoBot().di('como saco el total del mes')).flatMap(x => x.botones ?? []).map(b => b.id).join(' ');
  assert.match(botones, /poner:saldo/);
});

test('«como meto plata que me entro» y «donde anoto un pago que me hicieron por un trabajo» dan ejemplos de ingreso tocables', async () => {
  for (const p of ['como meto plata que me entro', 'donde anoto un pago que me hicieron por un trabajo', 'como registro una plata que me ingresa como pago de una actividad']) {
    const botones = (await nuevoBot().di(p)).flatMap(x => x.botones ?? []).map(b => b.id);
    assert.ok(botones.includes('poner:ingreso 50000 actividad'), p);
    assert.ok(botones.some(b => /^poner:me pagaron 80k congreso/.test(b)), p);
  }
});
