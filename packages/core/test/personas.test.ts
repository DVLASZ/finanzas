/**
 * Personas con rol: cuando en un mensaje aparece un nombre, el bot pregunta qué fue (le pagué, le
 * presté, le vendí, me pagó, me prestó, le regalé o gasto mío) y, si la persona es nueva, a qué
 * grupo pertenece (los de la casa, familia directa, familiares, compañeros de trabajo, empresa,
 * amigos, trabajadores).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos } from '../src/index.ts';
import { nuevoBot, textoDe } from '../../../tests/ayudas.ts';
import type { Salida } from '../src/index.ts';

type Bot = ReturnType<typeof nuevoBot>;

const saldo = async (bot: Bot, cuenta: string): Promise<number> => {
  const d = await bot.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|COP`) ?? 0;
};

/** Deja una persona ya conocida en el bot. */
function conPersona(bot: Bot, nombre: string, grupo: string) {
  const clave = nombre.toLowerCase();
  bot.repo.datos.cuentas.push({ id: `per:${clave}`, nombre, clave, tipo: 'persona', moneda: 'COP', grupo: grupo as never });
}

/** Pulsa el botón con ese título de la última tarjeta. */
async function elegir(bot: Bot, salidas: Salida[], titulo: string): Promise<Salida[]> {
  const b = salidas[0].botones?.find(x => x.titulo === titulo);
  assert.ok(b, `no hay botón «${titulo}»; hay: ${salidas[0].botones?.map(x => x.titulo).join(' | ')}`);
  return bot.pulsa(b.id);
}

const ROLES = ['Le pagué', 'Le presté', 'Le vendí', 'Me pagó', 'Me prestó', 'Le regalé', 'Fue gasto mío'];
const GRUPOS = ['Los de la casa', 'Familia directa', 'Familiares', 'Compañeros de trabajo', 'Empresa', 'Amigos', 'Trabajadores'];

// ---------------------------------------------------------------- persona conocida: pregunta el rol

test('E-01: «Pagué 3700 por Ivan empanadas nequi» con Ivan conocido pregunta qué fue, con botones', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Ivan', 'amigos');
  const s = await bot.di('Pagué 3700 por Ivan empanadas nequi');
  assert.match(textoDe(s), /Veo a Ivan en el mensaje\. ¿Qué fue\?/);
  assert.deepEqual(s[0].botones?.filter(b => b.id.startsWith('resp:')).map(b => b.titulo), ROLES);
});

test('rol «Le presté»: queda un préstamo con el motivo y la deuda abierta', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Ivan', 'amigos');
  const s = await bot.di('Pagué 3700 por Ivan empanadas nequi');
  const t = textoDe(await elegir(bot, s, 'Le presté'));
  assert.match(t, /Préstamo · le prestas a Ivan · \$3\.700 · Nequi/);
  assert.doesNotMatch(t, /categoría/i, 'un préstamo no pide categoría');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'per:ivan'), 3700);
  assert.equal(await saldo(bot, 'nequi'), -3700);
  const d = await bot.repo.cargar();
  assert.equal(d.compromisos.length, 1);
  assert.match(d.compromisos[0].motivo ?? '', /empanadas/i);
});

test('rol «Fue gasto mío»: sigue como gasto y pregunta la categoría si no la sabe', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Ivan', 'amigos');
  const s = await bot.di('Pagué 3700 por Ivan empanadas nequi');
  const t = textoDe(await elegir(bot, s, 'Fue gasto mío'));
  assert.match(t, /Gasto · .* · \$3\.700 · Nequi/);
});

test('rol «Le pagué» a un trabajador: es un gasto con su categoría y no una deuda', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Felipe', 'trabajadores');
  const s = await bot.di('30000 Felipe');
  const c = await elegir(bot, s, 'Le pagué');
  assert.match(textoDe(c), /Pago a Felipe/);
  // pregunta categoría (no hay una conocida para "Felipe")
  assert.match(textoDe(c), /¿En qué categoría va/);
  await bot.di('otros');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -30000);
  assert.equal((await bot.repo.cargar()).compromisos.length, 0);
});

test('rol «Le vendí»: es un ingreso de esa persona', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Yolanda', 'amigos');
  const s = await bot.di('300000 Yolanda carne');
  const t = textoDe(await elegir(bot, s, 'Le vendí'));
  assert.match(t, /Ingreso · Yolanda · \$300\.000/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), 300000);
});

test('rol «Me prestó»: recibes plata y le debes', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Esteban', 'casa');
  const s = await bot.di('50000 Esteban');
  await elegir(bot, s, 'Me prestó');
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), 50000);
  assert.equal(await saldo(bot, 'per:esteban'), -50000);
  assert.equal((await bot.repo.cargar()).compromisos[0].direccion, 'debo');
});

test('rol «Le regalé»: gasto en Regalos', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Jorge', 'amigos');
  const s = await bot.di('50000 Jorge');
  const t = textoDe(await elegir(bot, s, 'Le regalé'));
  assert.match(t, /Gasto · Regalos · \$50\.000/);
  assert.match(t, /Regalo a Jorge/);
});

test('el rol también se puede contestar escribiendo', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Ivan', 'amigos');
  await bot.di('Pagué 3700 por Ivan empanadas nequi');
  const t = textoDe(await bot.di('le presté'));
  assert.match(t, /Préstamo · le prestas a Ivan/);
});

test('un mensaje con persona conocida y un verbo claro no pregunta el rol (regresión)', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Ivan', 'amigos');
  const t = textoDe(await bot.di('presté 40k a ivan nequi'));
  assert.doesNotMatch(t, /¿Qué fue\?/);
  assert.match(t, /Préstamo · le prestas a Ivan/);
});

// ---------------------------------------------------------------- persona nueva: pregunta el grupo

test('nombre nuevo con mayúscula: pregunta a qué grupo pertenece y después qué fue', async () => {
  const bot = nuevoBot();
  const s = await bot.di('200000 semana Felipe lote');
  assert.match(textoDe(s), /¿Quién es Felipe\?/);
  assert.deepEqual(s[0].botones?.filter(b => b.id.startsWith('resp:')).map(b => b.titulo), [...GRUPOS, 'No es una persona']);
  const r = await elegir(bot, s, 'Trabajadores');
  assert.match(textoDe(r), /Veo a Felipe en el mensaje\. ¿Qué fue\?/);
  await elegir(bot, r, 'Le pagué');
  await bot.di('otros');
  await bot.pulsa('ok');
  const felipe = (await bot.repo.cargar()).cuentas.find(c => c.id === 'per:felipe');
  assert.equal(felipe?.grupo, 'trabajadores');
});

test('«No es una persona» sigue como gasto normal', async () => {
  const bot = nuevoBot();
  const s = await bot.di('15000 almuerzo Pedregal');
  const r = await elegir(bot, s, 'No es una persona');
  assert.match(textoDe(r), /Gasto · Comida · \$15\.000/);
  assert.doesNotMatch(textoDe(r), /¿Qué fue\?/);
});

test('un nombre en minúscula no se confunde con persona: es el concepto', async () => {
  const t = textoDe(await nuevoBot().di('30000 felipe'));
  assert.doesNotMatch(t, /¿Quién es/);
  assert.match(t, /¿En qué categoría va/);
});

test('las palabras conocidas con mayúscula no se toman por personas (Trident, Mecato)', async () => {
  const t = textoDe(await nuevoBot().di('compré un Trident 4500'));
  assert.doesNotMatch(t, /¿Quién es/);
  assert.match(t, /Mecato/);
});

test('un lugar con mayúscula después de «en» no se toma por persona', async () => {
  const t = textoDe(await nuevoBot().di('almuerzo en Medellín 12000'));
  assert.doesNotMatch(t, /¿Quién es/);
});

test('la primera palabra con mayúscula no cuenta como nombre («Mecato 2800»)', async () => {
  const t = textoDe(await nuevoBot().di('Mecato 2800'));
  assert.doesNotMatch(t, /¿Quién es/);
});

// ---------------------------------------------------------------- regalos

test('«le regalé 50000 jorge» con Jorge nuevo: pregunta el grupo y guarda un gasto en Regalos', async () => {
  const bot = nuevoBot();
  const s = await bot.di('le regalé 50000 jorge');
  assert.match(textoDe(s), /¿Quién es Jorge\?/);
  const t = textoDe(await elegir(bot, s, 'Amigos'));
  assert.match(t, /Gasto · Regalos · \$50\.000/);
  assert.match(t, /Regalo a Jorge/);
  await bot.pulsa('ok');
  assert.equal(await saldo(bot, 'efectivo'), -50000);
  assert.equal(await saldo(bot, 'cat:regalos'), 50000);
  assert.equal((await bot.repo.cargar()).cuentas.find(c => c.id === 'per:jorge')?.grupo, 'amigos');
});

test('«le regalé 20000 a felipe» con Felipe conocido no pregunta nada', async () => {
  const bot = nuevoBot();
  conPersona(bot, 'Felipe', 'trabajadores');
  const t = textoDe(await bot.di('le regalé 20000 a felipe'));
  assert.doesNotMatch(t, /¿Quién es|¿Qué fue/);
  assert.match(t, /Gasto · Regalos · \$20\.000/);
});

test('«regalo cumpleaños 30000» (sin persona) sigue siendo un gasto normal en Regalos', async () => {
  const t = textoDe(await nuevoBot().di('regalo cumpleaños 30000'));
  assert.match(t, /Gasto · Regalos/);
  assert.doesNotMatch(t, /¿Quién es/);
});

// ---------------------------------------------------------------- las líneas de las notas

test('notas: «7500 arepas», «15000 almuerzo» y «5000 pan» no preguntan por personas', async () => {
  for (const f of ['7500 arepas', '15000 almuerzo', '5000 desayuno']) {
    const t = textoDe(await nuevoBot().di(f));
    assert.doesNotMatch(t, /¿Quién es|¿Qué fue/, f);
  }
});

test('propiedad: todo lo que se confirma tras un rol suma cero', async () => {
  for (const rol of ROLES) {
    const bot = nuevoBot();
    conPersona(bot, 'Felipe', 'trabajadores');
    let s = await bot.di('30000 Felipe');
    s = await elegir(bot, s, rol);
    if (/¿En qué categoría va/.test(textoDe(s))) s = await bot.di('otros');
    await bot.pulsa('ok');
    for (const m of (await bot.repo.cargar()).movimientos) {
      const suma = m.asientos.reduce((x, a) => x + a.monto, 0);
      assert.equal(suma, 0, `${rol}: ${m.descripcion}`);
    }
  }
});
