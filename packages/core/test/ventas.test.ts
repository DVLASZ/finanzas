/**
 * Catálogo, ventas y lista de compras (los datos del catálogo y de la lista viven en `config`, así
 * se sincronizan como todo lo demás sin cambiar la base de datos).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, MemoriaRepo, procesar, type Salida } from '../src/index.ts';
import { AHORA, textoDe } from '../../../tests/ayudas.ts';

const CATALOGO = {
  productos: [
    { id: 'galletas', nombre: 'Galletas', alias: ['galleta'], presentaciones: [
      { id: 'granel', nombre: 'granel', alias: ['a granel', 'sueltas', 'suelta'], precio: 500 },
      { id: 'paq4', nombre: 'paquete de 4', alias: ['paq por 4 unidades', 'paquete de 4', 'paq 4', 'paquete 4'], precio: 3000 },
      { id: 'paq10', nombre: 'paquete de 10', alias: ['paq por 10 unidades', 'paquete de 10', 'paq 10', 'paquete 10', 'paq'], precio: 6000 },
    ] },
    { id: 'jugo', nombre: 'Licor', alias: [], presentaciones: [
      { id: 'pequeno', nombre: 'pequeño', alias: ['pequeno', 'pequeños', 'pequenos'], precio: 5000 },
      { id: 'caneca', nombre: 'caneca', alias: ['canecas'], precio: 10000 },
      { id: 'botella', nombre: 'botella', alias: ['botellas'], precio: 20000 },
    ] },
  ],
};

const app = (extra: Record<string, string> = {}) => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('empresa', { personas: [{ nombre: 'Tomás', grupo: 'clientes' }], config: { catalogo: JSON.stringify(CATALOGO), ...extra } });
  return {
    repo,
    di: (texto: string): Promise<Salida[]> => procesar(repo, { texto }, AHORA),
    pulsa: (boton: string): Promise<Salida[]> => procesar(repo, { boton }, AHORA),
  };
};
const saldo = async (a: ReturnType<typeof app>, cuenta: string) => {
  const d = await a.repo.cargar();
  return calcularSaldos(d.movimientos, d.config.fecha_apertura).get(`${cuenta}|COP`) ?? 0;
};
const elegir = (s: Salida[], titulo: string) => {
  const b = s[0].botones?.find(x => x.titulo === titulo);
  assert.ok(b, `no hay «${titulo}»: ${s[0].botones?.map(x => x.titulo).join(' | ')}`);
  return b.id;
};

// ---------------------------------------------------------------- ventas

test('venta: «vendí 3 botellas de jugo» calcula con el precio del catálogo', async () => {
  const a = app();
  const t = textoDe(await a.di('vendí 3 botellas de jugo'));
  assert.match(t, /Venta · Licor · \$60\.000 · Efectivo/);
  assert.match(t, /3 × botella a \$20\.000/);
  await a.pulsa('ok');
  assert.equal(await saldo(a, 'efectivo'), 60000);
});

test('venta con cliente conocido: pregunta si pagó o se lo fiaron (las líneas de las notas de la mamá)', async () => {
  const a = app();
  const s = await a.di('15 galletas a granel Tomás');
  assert.match(textoDe(s), /Venta · Galletas · \$7\.500/);
  assert.match(textoDe(s), /¿Tomás pagó o se lo fiaste\?/);
  const s2 = await a.di('8 paq por 10 unidades. Tomás');
  assert.match(textoDe(s2), /Venta · Galletas · \$48\.000/);
});

test('venta fiada: queda la deuda del cliente y NO entra plata a la caja', async () => {
  const a = app();
  const s = await a.di('15 galletas a granel Tomás');
  await a.pulsa(elegir(s, 'Se lo fié'));
  await a.pulsa('ok');
  assert.equal(await saldo(a, 'efectivo'), 0);
  assert.equal(await saldo(a, 'per:tomas'), 7500);
  const d = await a.repo.cargar();
  assert.equal(d.compromisos[0].direccion, 'me_deben');
  assert.match(textoDe(await a.di('deudas')), /Tomás: \$7\.500/);
});

test('venta pagada al contado: la plata entra a efectivo', async () => {
  const a = app();
  const s = await a.di('15 galletas a granel Tomás');
  await a.pulsa(elegir(s, 'Pagó ahora'));
  await a.pulsa('ok');
  // 7.500 = $7.000 en billetes + $500 en monedas (el efectivo es solo de billetes)
  assert.equal(await saldo(a, 'efectivo'), 7000);
  assert.equal(await saldo(a, 'monedas'), 500);
  assert.equal((await a.repo.cargar()).compromisos.length, 0);
});

test('venta con precio manual: «vendí 2 paquetes de 10 a 7 mil» usa 7.000 cada uno', async () => {
  const a = app();
  const t = textoDe(await a.di('vendí 2 paquetes de 10 a 7 mil'));
  assert.match(t, /\$14\.000/);
  assert.match(t, /2 × paquete de 10 a \$7\.000/);
});

test('venta: cantidades de 100 o más no se confunden con plata («vendí 100 galletas a granel»)', async () => {
  const t = textoDe(await app().di('vendí 100 galletas a granel'));
  assert.match(t, /Venta · Galletas · \$50\.000/);
});

test('venta: varias unidades con «pagó» a un cliente nuevo pregunta primero quién es', async () => {
  const s = await app().di('vendí 2 botellas de jugo a Rosa');
  assert.match(textoDe(s), /¿Quién es Rosa\?/);
});

test('venta con nombre de producto sin cantidad no se inventa: pide la cantidad', async () => {
  const t = textoDe(await app().di('vendí galletas'));
  assert.match(t, /cuál presentación|cuántas|cantidad/i);
});

test('sin catálogo, «vendí 3 botellas» no explota: sigue su camino normal', async () => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('familia');
  const s = await procesar(repo, { texto: 'vendí 3 botellas' }, AHORA);
  assert.ok(s[0].texto.length > 0);
});

test('la venta suma cero y deja el ingreso en la fuente del producto', async () => {
  const a = app();
  await a.di('vendí 3 botellas de jugo');
  await a.pulsa('ok');
  const m = (await a.repo.cargar()).movimientos[0];
  assert.equal(m.asientos.reduce((s, x) => s + x.monto, 0), 0);
  assert.ok(m.asientos.some(x => x.cuentaId.startsWith('fue:') && x.monto === -60000));
});

// ---------------------------------------------------------------- lista de compras

test('lista: una línea sin monto («Jabón baño») ofrece agregarla a la lista de compras', async () => {
  const a = app();
  const s = await a.di('Jabón baño');
  assert.match(textoDe(s), /lista de compras: «Jabón baño»/);
  await a.pulsa(elegir(s, 'Agregar a la lista'));
  assert.match(textoDe(await a.di('lista')), /Jabón baño/);
});

test('lista: «falta arroz y sal» agrega varias cosas, «lista» las muestra y «compré arroz» la tacha', async () => {
  const a = app();
  assert.match(textoDe(await a.di('falta arroz y sal')), /Agregué a la lista: arroz, sal/);
  assert.match(textoDe(await a.di('lista')), /arroz[\s\S]*sal/);
  assert.match(textoDe(await a.di('compré arroz')), /Taché de la lista: arroz/);
  const t = textoDe(await a.di('lista'));
  assert.doesNotMatch(t, /• arroz/);
  assert.match(t, /sal/);
});

test('lista: una cosa repetida no se duplica y la lista vacía lo dice', async () => {
  const a = app();
  assert.match(textoDe(await a.di('lista')), /vacía/i);
  await a.di('falta arroz');
  await a.di('falta Arroz');
  assert.equal(JSON.parse((await a.repo.cargar()).config.lista_compras).length, 1);
});

test('lista: «compré arroz 8000» con monto sigue siendo un gasto, no un comando de lista', async () => {
  const t = textoDe(await app().di('compré arroz 8000'));
  assert.match(t, /Gasto/);
});

// ---------------------------------------------------------------- crear el catálogo desde la pantalla

import { aliasDePresentacion, presentacionDeTexto } from '../src/index.ts';

test('catálogo: «paquete de 10=6000» se vuelve una presentación con sus formas de escribirla', () => {
  const p = presentacionDeTexto('paquete de 10=6000');
  assert.equal(p?.precio, 6000);
  for (const a of ['paquete de 10', 'paq por 10 unidades', 'paq 10', '10 unidades']) assert.ok(p?.alias?.includes(a), a);
  assert.equal(presentacionDeTexto('granel 500')?.precio, 500);
  assert.equal(presentacionDeTexto('botella: 20 mil')?.precio, 20000);
  assert.equal(presentacionDeTexto('botella=1.500')?.precio, 1500);
});

test('catálogo: textos sin sentido no crean presentaciones', () => {
  for (const t of ['', 'botella', '=500', 'botella=0', 'botella=-5', 'botella=abc', 'botella=99999999999']) assert.equal(presentacionDeTexto(t), null, t);
  assert.ok(aliasDePresentacion('Granel').includes('a granel'));
});

test('catálogo: lo creado con el texto de la pantalla funciona en una venta', async () => {
  const pres = ['granel=500', 'paquete de 10=6000'].map(x => presentacionDeTexto(x)!);
  const a = app({ catalogo: JSON.stringify({ productos: [{ id: 'galletas', nombre: 'Galletas', alias: [], presentaciones: pres }] }) });
  assert.match(textoDe(await a.di('8 paq por 10 unidades. Tomás')), /\$48\.000/);
  assert.match(textoDe(await a.di('15 galletas a granel')), /\$7\.500/);
});

test('informe: «ventas» suma lo vendido por producto en el mes', async () => {
  const a = app();
  await a.di('saldo inicial efectivo 100000');
  await a.pulsa('ok');
  for (const f of ['vendí 3 botellas de jugo', 'vendí 2 canecas de jugo', '15 galletas a granel']) {
    await a.di(f);
    await a.pulsa('ok');
  }
  const t = textoDe(await a.di('ventas'));
  assert.match(t, /Ventas de octubre 2026/);
  assert.match(t, /Total: \$87\.500/);
  assert.match(t, /Licor: \$80\.000 \(91%\)/);
  assert.match(t, /Galletas: \$7\.500 \(9%\)/);
  assert.match(textoDe(await a.di('ventas del año')), /Ventas de 2026/);
  assert.match(textoDe(await app().di('ventas')), /Todavía no hay ventas/);
});
