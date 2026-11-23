/**
 * Personas y pagos fijos desde el chat: agregar y renombrar personas sin monto, la tarjeta de estado
 * al escribir solo un nombre, y pausar, reanudar o terminar un pago fijo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leerRecurrentes } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';

type Bot = ReturnType<typeof nuevoBot>;

function conPersonas(...nombres: string[]): Bot {
  const bot = nuevoBot();
  bot.repo.aplicarPlantilla('personal', { personas: nombres.map(nombre => ({ nombre, grupo: 'amigos' })) });
  return bot;
}

async function personas(bot: Bot) {
  return (await bot.repo.cargar()).cuentas.filter(c => c.tipo === 'persona');
}

async function fijos(bot: Bot) {
  return leerRecurrentes((await bot.repo.cargar()).config);
}

async function conClaude(): Promise<Bot> {
  const bot = nuevoBot();
  await bot.di('cada mes el 5 claude 100000');
  await bot.di('cada mes el 10 internet 60000');
  return bot;
}

const deClaude = async (bot: Bot) => (await fijos(bot)).find(r => /claude/i.test(r.concepto))!;

// ---------------------------------------------------------------- agregar y renombrar personas

for (const frase of ['agregar persona Sofia', 'nueva persona Sofia', 'registrar a Sofia', 'guardar contacto Sofia', 'crear persona Sofia', 'añadir contacto Sofia']) {
  test(`persona: «${frase}» la crea sin pedir monto`, async () => {
    const bot = nuevoBot();
    const t = textoDe(await bot.di(frase));
    assert.match(t, /^Listo: Sofia quedó en tu directorio \(grupo [^)]+\)\.$/);
    const ps = await personas(bot);
    assert.equal(ps.length, 1);
    assert.deepEqual([ps[0].id, ps[0].clave, ps[0].nombre, ps[0].moneda], ['per:sofia', 'sofia', 'Sofia', 'COP']);
  });
}

test('persona: si ya existe dice que ya la tiene y no duplica', async () => {
  const bot = conPersonas('Sofia');
  assert.equal(textoDe(await bot.di('agregar persona sofia')), 'Ya tengo a Sofia.');
  assert.equal((await personas(bot)).length, 1);
});

test('persona: el nombre de dos palabras se guarda completo', async () => {
  const bot = nuevoBot();
  await bot.di('nueva persona Juan Manuel');
  assert.equal((await personas(bot))[0].clave, 'juan manuel');
});

test('persona: «agregar arroz» a secas sigue siendo la lista de compras', async () => {
  const bot = nuevoBot();
  assert.match(textoDe(await bot.di('agregar arroz')), /lista/i);
  assert.equal((await personas(bot)).length, 0);
});

test('persona: «renombrar persona Sofia a Sofi» cambia nombre y clave', async () => {
  const bot = conPersonas('Sofia');
  assert.match(textoDe(await bot.di('renombrar persona Sofia a Sofi')), /Sofia ahora es Sofi/);
  const ps = await personas(bot);
  assert.deepEqual(ps.map(p => [p.nombre, p.clave]), [['Sofi', 'sofi']]);
});

test('persona: renombrar a un nombre que ya existe avisa y no cambia nada', async () => {
  const bot = conPersonas('Sofia', 'Laura');
  assert.match(textoDe(await bot.di('renombrar persona Sofia a Laura')), /Ya tengo a Laura/);
  assert.deepEqual((await personas(bot)).map(p => p.clave).sort(), ['laura', 'sofia']);
});

test('persona: renombrar una que no existe avisa', async () => {
  const bot = conPersonas('Sofia');
  assert.match(textoDe(await bot.di('renombrar persona Pedro a Pepe')), /No tengo a Pedro/);
});

// ---------------------------------------------------------------- solo el nombre

test('nombre solo: sin pendientes muestra la tarjeta con botones de cuánto', async () => {
  const bot = conPersonas('Sofia');
  const [s] = await bot.di('sofia');
  assert.match(s.texto, /^Sofia: sin pendientes\./);
  assert.ok(s.botones && s.botones.length >= 3);
  const r = textoDe(await bot.pulsa(s.botones![0].id));
  assert.match(r, /¿Cuánto/);
});

test('nombre solo: «Sofia» no sugiere la lista de compras ni pide monto', async () => {
  const bot = conPersonas('Sofia');
  const t = textoDe(await bot.di('Sofia'));
  assert.doesNotMatch(t, /Me falta el monto|lista de compras/);
});

test('nombre solo: si te debe, lo dice con el monto', async () => {
  const bot = conPersonas('Sofia');
  await bot.di('le presté 50000 a Sofia');
  await bot.pulsa('ok');
  assert.match(textoDe(await bot.di('Sofia')), /^Sofia: te debe \$50\.000\./);
});

test('nombre solo: si le debes, lo dice con el monto', async () => {
  const bot = conPersonas('Sofia');
  await bot.di('me prestó Sofia 30000');
  await bot.pulsa('ok');
  assert.match(textoDe(await bot.di('sofia')), /^Sofia: le debes \$30\.000\./);
});

test('nombre solo: con varias personas del mismo nombre pregunta cuál', async () => {
  const bot = conPersonas('Juan Manuel', 'Juan Jose');
  const [s] = await bot.di('juan');
  assert.match(s.texto, /¿Cuál Juan/);
  assert.ok(s.botones?.some(b => /Juan Manuel/.test(b.titulo)));
  assert.match(textoDe(await bot.pulsa(s.botones![0].id)), /^Juan (Manuel|Jose): /);
});

test('nombre solo: una palabra que no es persona sigue como antes', async () => {
  const bot = conPersonas('Sofia');
  assert.match(textoDe(await bot.di('mecato')), /Me falta el monto/);
});

// ---------------------------------------------------------------- pagos fijos

test('fijo: «pausar recurrente claude» lo pausa y el listado lo dice', async () => {
  const bot = await conClaude();
  assert.match(textoDe(await bot.di('pausar recurrente claude')), /Pausé: Claude/);
  const c = await deClaude(bot);
  const i = (await fijos(bot)).find(r => /internet/i.test(r.concepto))!;
  assert.equal(c.pausado, true);
  assert.equal(c.monto, 100000);
  assert.ok(!i.pausado);
  assert.match(textoDe(await bot.di('recurrentes')), /Claude.*\(en pausa\)/);
});

for (const frase of ['pausar pago fijo claude', 'pausar pago claude']) {
  test(`fijo: «${frase}»`, async () => {
    const bot = await conClaude();
    await bot.di(frase);
    assert.equal((await deClaude(bot)).pausado, true);
  });
}

test('fijo: «reanudar recurrente claude» quita la pausa', async () => {
  const bot = await conClaude();
  await bot.di('pausar recurrente claude');
  assert.match(textoDe(await bot.di('reanudar recurrente claude')), /Reanudé: Claude/);
  assert.ok(!(await deClaude(bot)).pausado);
});

for (const frase of [
  'fin recurrente claude 21/12/2026', 'terminar pago fijo claude 21/12/2026', 'cancelar pago claude el 21/12/2026',
  'fin recurrente claude 21 de diciembre de 2026',
]) {
  test(`fijo: «${frase}» deja la fecha de fin`, async () => {
    const bot = await conClaude();
    assert.match(textoDe(await bot.di(frase)), /Claude.*21\/12\/2026/);
    assert.equal((await deClaude(bot)).fin, '2026-12-21');
    assert.match(textoDe(await bot.di('recurrentes')), /Claude.*\(hasta 21\/12\/2026\)/);
  });
}

test('fijo: sin fecha termina hoy', async () => {
  const bot = await conClaude();
  await bot.di('fin recurrente claude');
  assert.equal((await deClaude(bot)).fin, '2026-10-19');
});

test('fijo: si no existe, avisa y no cambia nada', async () => {
  const bot = await conClaude();
  assert.match(textoDe(await bot.di('pausar recurrente netflix')), /No tengo/);
  assert.ok((await fijos(bot)).every(r => !r.pausado));
});

test('fijo: si coinciden varios pide precisar', async () => {
  const bot = nuevoBot();
  await bot.di('cada mes el 5 claude pro 100000');
  await bot.di('cada mes el 6 claude max 200000');
  assert.match(textoDe(await bot.di('pausar recurrente claude')), /Precisa cuál/);
  assert.ok((await fijos(bot)).every(r => !r.pausado));
});

test('fijo: «quitar recurrente claude» sigue funcionando', async () => {
  const bot = await conClaude();
  assert.match(textoDe(await bot.di('quitar recurrente claude')), /Quité/);
  assert.equal((await fijos(bot)).length, 1);
});
