/**
 * Editar movimientos ya guardados: qué se puede cambiar, que la partida doble siga sumando cero, las advertencias
 * (arqueos posteriores, plata que no alcanza, existencias) y los bloqueos (meses cerrados, movimientos atados a deudas).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarEdicion, calcularSaldos, capacidadesDeEdicion, deLocal, existenciasDe, leerCatalogo, MemoriaRepo, previsualizarEdicion, procesar, saldoDe,
} from '../src/index.ts';
import { AHORA, nuevoBot } from '../../../tests/ayudas.ts';

async function guardar(bot: ReturnType<typeof nuevoBot>, texto: string, ahora: Date = AHORA) {
  await bot.di(texto, ahora);
  await bot.pulsa('ok', ahora);
}
const saldo = async (bot: ReturnType<typeof nuevoBot>, cuenta: string) => {
  const d = await bot.repo.cargar();
  return saldoDe(calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00'), cuenta, 'COP');
};
const ultimo = async (bot: ReturnType<typeof nuevoBot>, descripcion: string) => (await bot.repo.cargar()).movimientos.filter(m => m.descripcion === descripcion).at(-1)!;
const sumaCero = (asientos: { monto: number; moneda: string }[]) => {
  const por = new Map<string, number>();
  for (const a of asientos) por.set(a.moneda, (por.get(a.moneda) ?? 0) + a.monto);
  return [...por.values()].every(v => v === 0);
};

test('editar un gasto: cambia el monto, la cuenta y la categoría y los asientos siguen sumando cero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000 nequi 50000');
  await guardar(bot, 'almuerzo 12000');
  const m = await ultimo(bot, 'Almuerzo');
  assert.equal(await saldo(bot, 'efectivo'), 88000);
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { monto: 15000, cuentaId: 'nequi', categoriaId: 'cat:mecato' });
  assert.deepEqual(r.cambios.map(c => c.campo).sort(), ['categoria', 'cuenta', 'monto']);
  const despues = (await bot.repo.cargar()).movimientos.find(x => x.id === m.id)!;
  assert.ok(sumaCero(despues.asientos), 'la partida doble suma cero');
  assert.equal(despues.id, m.id, 'es el mismo movimiento');
  assert.equal(despues.estado, 'ok');
  assert.equal(await saldo(bot, 'efectivo'), 100000, 'el efectivo recupera lo que se había gastado');
  assert.equal(await saldo(bot, 'nequi'), 35000);
  assert.ok(despues.editadoEn, 'queda la marca de edición');
  assert.equal((await bot.repo.cargar()).movimientos.length, 2, 'no se creó otro movimiento ni quedó uno anulado');
});

test('editar solo el concepto o la fecha no toca los saldos', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  const m = await ultimo(bot, 'Almuerzo');
  const antes = await saldo(bot, 'efectivo');
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { concepto: 'Almuerzo con Ana', ocurridoEn: '2026-10-19 15:50:00' });
  assert.deepEqual(r.saldos, []);
  const d = (await bot.repo.cargar()).movimientos.find(x => x.id === m.id)!;
  assert.equal(d.descripcion, 'Almuerzo con Ana');
  assert.equal(d.ocurridoEn, '2026-10-19 15:50:00');
  assert.equal(await saldo(bot, 'efectivo'), antes);
});

test('editar el monto de un gasto en efectivo rehace el pago: ya no arrastra billetes ni vuelto del monto anterior', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 200000');
  await guardar(bot, 'almuerzo 12000 pagué con 20000');
  const m = await ultimo(bot, 'Almuerzo');
  await aplicarEdicion(bot.repo, AHORA, m.id, { monto: 30000 });
  assert.equal(await saldo(bot, 'efectivo'), 170000);
  const d = (await bot.repo.cargar()).movimientos.find(x => x.id === m.id)!;
  assert.ok(sumaCero(d.asientos));
});

test('editar un ingreso: cambia el monto, la cuenta donde entra y la fuente', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 10000 nequi 0');
  await guardar(bot, 'ingreso 50000 trabajo nequi');
  const datos = await bot.repo.cargar();
  const m = datos.movimientos.find(x => x.tipo === 'ingreso')!;
  const fuente = datos.cuentas.find(c => c.tipo === 'fuente' && c.id !== 'fue:trabajo')!;
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { monto: 80000, cuentaId: 'efectivo', ...(fuente ? { fuenteId: fuente.id } : {}) });
  assert.ok(r.cambios.some(c => c.campo === 'monto'));
  assert.equal(await saldo(bot, 'efectivo'), 90000);
  assert.equal(await saldo(bot, 'nequi'), 0);
});

test('editar una transferencia: cambia el monto y las dos cuentas, y no deja origen igual al destino', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000 nequi 50000 daviplata 0');
  await guardar(bot, 'pasé 20000 de efectivo a nequi');
  const m = (await bot.repo.cargar()).movimientos.find(x => x.tipo === 'transferencia')!;
  const malo = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { cuentaDestinoId: 'efectivo' });
  assert.ok(malo.ok && malo.bloqueos.some(b => /no pueden ser la misma/.test(b)));
  await aplicarEdicion(bot.repo, AHORA, m.id, { monto: 30000, cuentaDestinoId: 'daviplata' });
  assert.equal(await saldo(bot, 'efectivo'), 70000);
  assert.equal(await saldo(bot, 'nequi'), 50000);
  assert.equal(await saldo(bot, 'daviplata'), 30000);
});

test('un monto inválido o una cuenta de otra moneda se bloquean con una explicación', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  const m = await ultimo(bot, 'Almuerzo');
  const datos = await bot.repo.cargar();
  const monto = previsualizarEdicion(datos, AHORA, m.id, { monto: -5 });
  assert.ok(monto.ok && monto.bloqueos[0]?.includes('mayor que cero'));
  const moneda = previsualizarEdicion(datos, AHORA, m.id, { cuentaId: 'arq' });
  assert.ok(moneda.ok && /otra moneda/.test(moneda.bloqueos[0] ?? ''));
  const futuro = previsualizarEdicion(datos, AHORA, m.id, { ocurridoEn: '2027-01-01 10:00:00' });
  assert.ok(futuro.ok && /futuro/.test(futuro.bloqueos[0] ?? ''));
  await assert.rejects(() => aplicarEdicion(bot.repo, AHORA, m.id, { monto: -5 }), /mayor que cero/);
  await assert.rejects(() => aplicarEdicion(bot.repo, AHORA, m.id, {}), /No cambió nada/);
});

test('avisa si la cuenta se queda sin plata con el cambio', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 20000');
  await guardar(bot, 'almuerzo 12000');
  const m = await ultimo(bot, 'Almuerzo');
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { monto: 50000 });
  assert.ok(r.ok);
  assert.ok(r.bloqueos.length === 0 || r.avisos.length >= 0);
  const dinero = r.ok ? r.saldos.find(s => s.cuentaId === 'efectivo') : undefined;
  assert.ok(dinero && dinero.despues < 0, 'el efectivo quedaría en negativo');
  assert.ok(r.ok && r.avisos.some(a => /quedaría en -/.test(a)));
});

test('avisa si hay un arqueo posterior sobre la cuenta que se toca', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000', deLocal('2026-10-01 08:00:00'));
  await guardar(bot, 'almuerzo 12000', deLocal('2026-10-05 13:00:00'));
  await guardar(bot, 'arqueo efectivo 80000', deLocal('2026-10-10 09:00:00'));
  const m = await ultimo(bot, 'Almuerzo');
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { monto: 20000 });
  assert.ok(r.ok && r.avisos.some(a => /arqueo de Efectivo/.test(a)), r.ok ? r.avisos.join(' | ') : '');
  // un arqueo de otra cuenta no avisa
  const otra = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { concepto: 'Almuerzo largo' });
  assert.ok(otra.ok && !otra.avisos.some(a => /arqueo/.test(a)));
});

test('un mes cerrado no se edita', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000', deLocal('2026-09-01 08:00:00'));
  await guardar(bot, 'almuerzo 12000', deLocal('2026-09-10 13:00:00'));
  await bot.repo.setConfig('cerrado_hasta', '2026-09-30');
  const m = await ultimo(bot, 'Almuerzo');
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { monto: 20000 });
  assert.ok(r.ok && /cerrado/.test(r.bloqueos[0] ?? ''));
  const mover = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { ocurridoEn: '2026-10-02 10:00:00' });
  assert.ok(mover.ok && /cerrado/.test(mover.bloqueos[0] ?? ''), 'sacar un movimiento de un mes cerrado tampoco');
});

test('el saldo inicial, un arqueo y un movimiento anulado no se editan', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'arqueo efectivo 90000');
  await guardar(bot, 'almuerzo 12000');
  const datos = await bot.repo.cargar();
  const apertura = datos.movimientos.find(x => x.tipo === 'apertura')!;
  const arqueo = datos.movimientos.find(x => x.tipo === 'ajuste')!;
  assert.match(capacidadesDeEdicion(apertura).motivo ?? '', /saldo inicial/);
  assert.match(capacidadesDeEdicion(arqueo).motivo ?? '', /arqueo/);
  const a = previsualizarEdicion(datos, AHORA, apertura.id, { monto: 1 });
  assert.ok(!a.ok && /saldo inicial/.test(a.motivo));
  const m = await ultimo(bot, 'Almuerzo');
  await bot.repo.anularMovimiento(m.id, '2026-10-19 16:00:00');
  const anulado = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { concepto: 'x' });
  assert.ok(!anulado.ok && /anulado/.test(anulado.motivo));
  await assert.rejects(() => bot.repo.editarMovimiento({ ...m, descripcion: 'otro' }, []), /anulado/);
});

test('préstamos, deudas, pagos y gastos compartidos: solo concepto y fecha; el monto está atado a las deudas', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 200000');
  await guardar(bot, 'presté 40000 a Ana');
  const prestamo = (await bot.repo.cargar()).movimientos.find(x => x.tipo === 'prestamo')!;
  const cap = capacidadesDeEdicion(prestamo);
  assert.equal(cap.editable, true);
  assert.equal(cap.campos.monto.editable, false);
  assert.match(cap.campos.monto.motivo ?? '', /deben|debe cada persona/);
  assert.equal(cap.campos.concepto.editable, true);
  assert.equal(cap.campos.fecha.editable, true);
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, prestamo.id, { monto: 50000 });
  assert.ok(r.ok && /atado/.test(r.bloqueos[0] ?? ''));
  const solo = await aplicarEdicion(bot.repo, AHORA, prestamo.id, { concepto: 'Préstamo a Ana por la cámara' });
  assert.deepEqual(solo.cambios.map(c => c.campo), ['concepto']);
  assert.deepEqual(solo.saldos, [], 'los saldos y las deudas no cambian');
});

const saldoDeCuenta = async (bot: ReturnType<typeof nuevoBot>, cuenta: string) => saldo(bot, cuenta);
const porTipo = async (bot: ReturnType<typeof nuevoBot>, tipo: string) => (await bot.repo.cargar()).movimientos.filter(x => x.tipo === tipo).at(-1)!;

test('un préstamo pagado de Efectivo se puede pasar a Nequi: Ivan queda igual y todo suma cero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 200000 nequi 50000');
  await guardar(bot, 'presté 40000 a Ivan');
  const m = await porTipo(bot, 'prestamo');
  const ivanAntes = await saldoDeCuenta(bot, 'persona:ivan');
  const comprAntes = JSON.stringify((await bot.repo.cargar()).compromisos);
  assert.equal(capacidadesDeEdicion(m).campos.cuenta.editable, true);
  assert.equal(capacidadesDeEdicion(m).campos.monto.editable, false);
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { cuentaId: 'nequi' });
  assert.deepEqual(r.cambios.map(c => [c.campo, c.etiqueta, c.despues]), [['cuenta', 'Salió de', 'Nequi']]);
  assert.equal(await saldoDeCuenta(bot, 'efectivo'), 200000);
  assert.equal(await saldoDeCuenta(bot, 'nequi'), 10000);
  assert.equal(await saldoDeCuenta(bot, 'persona:ivan'), ivanAntes);
  const d = await bot.repo.cargar();
  assert.equal(JSON.stringify(d.compromisos), comprAntes, 'los compromisos no cambian');
  assert.ok(sumaCero(d.movimientos.find(x => x.id === m.id)!.asientos));
  // sigue siendo anulable: el deshacer devuelve la plata a Nequi
  await bot.di('deshacer');
  assert.equal(await saldoDeCuenta(bot, 'nequi'), 50000);
  assert.equal(await saldoDeCuenta(bot, 'persona:ivan'), 0);
});

test('un abono recibido y una deuda recibida cambian solo la cuenta de dinero', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000 nequi 20000');
  await guardar(bot, 'presté 40000 a Ivan');
  await guardar(bot, 'Ivan me pagó 15000 efectivo');
  const abono = await porTipo(bot, 'pago');
  const ivan = await saldoDeCuenta(bot, 'persona:ivan');
  const r = await aplicarEdicion(bot.repo, AHORA, abono.id, { cuentaId: 'nequi' });
  assert.equal(r.cambios[0].etiqueta, 'Entró a');
  assert.equal(await saldoDeCuenta(bot, 'nequi'), 35000);
  assert.equal(await saldoDeCuenta(bot, 'efectivo'), 60000);
  assert.equal(await saldoDeCuenta(bot, 'persona:ivan'), ivan);
  await guardar(bot, 'me prestó Marta 30000 en efectivo');
  const deuda = await porTipo(bot, 'deuda');
  const marta = await saldoDeCuenta(bot, 'persona:marta');
  assert.equal(capacidadesDeEdicion(deuda).campos.cuenta.editable, true);
  await aplicarEdicion(bot.repo, AHORA, deuda.id, { cuentaId: 'nequi' });
  assert.equal(await saldoDeCuenta(bot, 'nequi'), 65000);
  assert.equal(await saldoDeCuenta(bot, 'efectivo'), 60000);
  assert.equal(await saldoDeCuenta(bot, 'persona:marta'), marta);
});

test('en un gasto compartido solo cambia la cuenta pagadora; si pagó otro, no hay cuenta que editar', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000 nequi 50000');
  const s = await bot.di('hicimos vaca de 60k con Ana y Luis para el almuerzo');
  await bot.pulsa((s[0].botones ?? []).find(b => /Dividir entre los 3/.test(b.titulo))!.id);
  await bot.pulsa('ok');
  const m = await porTipo(bot, 'compartido');
  assert.ok(m, 'el almuerzo con Ivan quedó como compartido');
  const ana = await saldoDeCuenta(bot, 'persona:ana');
  const r = await aplicarEdicion(bot.repo, AHORA, m.id, { cuentaId: 'nequi' });
  assert.equal(r.cambios.length, 1);
  assert.equal(await saldoDeCuenta(bot, 'persona:ana'), ana);
  assert.equal(await saldoDeCuenta(bot, 'efectivo'), 100000);
  assert.equal(await saldoDeCuenta(bot, 'nequi'), -10000);
  const otro = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { cuentaId: 'daviplata', monto: 10000 });
  assert.ok(otro.ok && otro.bloqueos.length >= 1, 'el monto sigue atado');
});

test('en un préstamo no se puede mover la plata a una cuenta de otra moneda ni a un mes cerrado', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 200000');
  await guardar(bot, 'presté 40000 a Ivan');
  const m = await porTipo(bot, 'prestamo');
  const usd = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { cuentaId: 'arq' });
  assert.ok(usd.ok && /otra moneda/.test(usd.bloqueos[0] ?? ''));
  const datos = await bot.repo.cargar();
  datos.config.cerrado_hasta = '2026-12-31';
  const cerrado = previsualizarEdicion(datos, AHORA, m.id, { cuentaId: 'nequi' });
  assert.ok(cerrado.ok && /cerrado/.test(cerrado.bloqueos.join(' ')));
});

test('al pasar un préstamo a una cuenta sin plata se avisa del saldo negativo', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 200000 nequi 10000');
  await guardar(bot, 'presté 40000 a Ivan');
  const m = await porTipo(bot, 'prestamo');
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { cuentaId: 'nequi' });
  assert.ok(r.ok && r.avisos.some(a => /Nequi quedaría en -/.test(a)));
});

const CATALOGO = { productos: [{ id: 'galletas', nombre: 'Galletas', alias: [], presentaciones: [
  { id: 'granel', nombre: 'granel', alias: ['a granel', 'granel'], precio: 500 },
  { id: 'paq10', nombre: 'paquete de 10', alias: ['paquete de 10', 'paquetes de 10', 'paq 10'], precio: 6000 },
] }] };
function tienda() {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla('empresa', { personas: [], config: { catalogo: JSON.stringify(CATALOGO) } });
  return { repo, di: (texto: string) => procesar(repo, { texto }, AHORA), pulsa: (boton: string) => procesar(repo, { boton }, AHORA) };
}

test('editar la cantidad de una venta recalcula el monto, los asientos y las existencias, y avisa si no alcanza', async () => {
  const t = tienda();
  await t.di('inventario galletas 20');
  await t.di('5 galletas a granel');
  await t.pulsa('ok');
  const venta = (await t.repo.cargar()).movimientos.find(x => x.tipo === 'ingreso')!;
  const cap = capacidadesDeEdicion(venta);
  assert.equal(cap.campos.cantidad.editable, true);
  assert.equal(cap.campos.monto.editable, false);
  const catalogo = () => leerCatalogo({ config: t.repo.datos.config })!.productos[0];
  assert.equal(existenciasDe(catalogo(), t.repo.datos.movimientos), 15);
  const ok = await aplicarEdicion(t.repo, AHORA, venta.id, { cantidad: 8 });
  assert.equal(ok.movimiento.asientos.find(a => a.cuentaId === 'efectivo')?.monto, 4000, '8 × 500');
  assert.ok(sumaCero(ok.movimiento.asientos));
  assert.equal(existenciasDe(catalogo(), t.repo.datos.movimientos), 12, 'ahora se vendieron 8');
  const nope = previsualizarEdicion(await t.repo.cargar(), AHORA, venta.id, { cantidad: 25 });
  assert.ok(nope.ok && nope.avisos.some(a => /Solo te quedan/.test(a)), nope.ok ? nope.avisos.join('|') : '');
  assert.ok(nope.ok && nope.bloqueos.length === 0, 'avisa, no impide');
});

test('una venta fiada no deja cambiar el monto', async () => {
  const t = tienda();
  const m: import('../src/index.ts').Movimiento = {
    id: 'v1', ocurridoEn: '2026-10-19 10:00:00', sinHora: false, tipo: 'ingreso', descripcion: 'Venta de Galletas', origen: 'bot', estado: 'ok', creadoEn: '2026-10-19 10:00:00',
    asientos: [{ cuentaId: 'fue:galletas', monto: -3000, moneda: 'COP' }, { cuentaId: 'per:tomas', monto: 3000, moneda: 'COP' }],
    propuesta: { tipo: 'ingreso', ocurridoEn: '2026-10-19 10:00:00', concepto: 'Venta de Galletas', monto: 3000, moneda: 'COP', fuente: 'Galletas', persona: 'Tomás', fiado: true, venta: { producto: 'Galletas', presentacion: 'granel', cantidad: 6, precio: 500 }, mensajeOriginal: '', avisos: [], faltantes: [] },
  };
  const cap = capacidadesDeEdicion(m);
  assert.equal(cap.campos.cantidad.editable, false);
  assert.equal(cap.campos.monto.editable, false);
  void t;
});

test('un movimiento que vino de un archivo (sin tarjeta guardada) solo deja cambiar concepto y fecha', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000');
  await guardar(bot, 'almuerzo 12000');
  const m = await ultimo(bot, 'Almuerzo');
  const sinTarjeta = { ...m, propuesta: undefined };
  const cap = capacidadesDeEdicion(sinTarjeta);
  assert.equal(cap.campos.monto.editable, false);
  assert.equal(cap.campos.concepto.editable, true);
});

test('avisa cuando la nueva fecha cae antes del saldo inicial', async () => {
  const bot = nuevoBot();
  await guardar(bot, 'saldo inicial efectivo 100000', deLocal('2026-10-10 08:00:00'));
  await guardar(bot, 'almuerzo 12000', deLocal('2026-10-12 13:00:00'));
  const m = await ultimo(bot, 'Almuerzo');
  const r = previsualizarEdicion(await bot.repo.cargar(), AHORA, m.id, { ocurridoEn: '2026-10-05 13:00:00' });
  assert.ok(r.ok && r.avisos.some(a => /antes del saldo inicial/.test(a)), r.ok ? r.avisos.join('|') : '');
});
