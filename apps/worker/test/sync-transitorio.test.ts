/**
 * Fallos pasajeros de la base: una operación que no se pudo aplicar porque D1 no respondió no es lo mismo
 * que una operación inválida. La primera se reintenta (con todas las que vienen detrás, en orden); la
 * segunda se rechaza para siempre.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  construirMovimiento, contextoDe, enviarPorLotes, fusionarConfigRepetidas, interpretar, TAM_LOTE,
  type Movimiento, type Op, type RespuestaSync,
} from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import worker, { type Env } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1, type D1Prueba } from '../../../tests/d1-shim.ts';

const entorno = (): Env & { DB: D1Prueba } => ({ DB: crearD1(), API_TOKEN: 't', PIN_BORRADO: '4321' }) as Env & { DB: D1Prueba };
const sync = async (env: Env, ops: unknown[]) =>
  (await (await worker.fetch(new Request('https://x.workers.dev/api/sync', { method: 'POST', body: JSON.stringify({ ops }), headers: { Authorization: 'Bearer t' } }), env)).json()) as RespuestaSync;

async function gasto(env: Env, texto: string): Promise<{ op: Op; id: string; movimiento: Movimiento }> {
  const ctx = contextoDe(await new D1Repo(env.DB).cargar(), AHORA);
  const r = interpretar(texto, ctx);
  if (r.clase !== 'movimiento') throw new Error('no es movimiento');
  const id = crypto.randomUUID();
  const h = construirMovimiento(r.propuesta, ctx, new Map(), id, 'app');
  return { op: { op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos }, id, movimiento: h.movimiento };
}

/** La base «no responde» mientras se toque el movimiento con ese id. */
const caerEn = (env: { DB: D1Prueba }, id: string) => {
  env.DB.fallar = (_sql, valores) => (valores.includes(id) ? new Error('D1_ERROR: Network connection lost') : null);
};
const ids = (r: RespuestaSync) => r.datos.movimientos.map(m => m.id);

test('transitorio: si D1 falla en B, A queda aplicada y B y C vuelven en `reintentar`', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000'), b = await gasto(env, 'mecato 2000'), c = await gasto(env, 'mecato 3000');
  caerEn(env, b.id);
  const r = await sync(env, [a.op, b.op, c.op]);
  assert.equal(r.rechazadas, undefined, 'un fallo pasajero no es un rechazo');
  assert.deepEqual(r.reintentar, [1, 2]);
  assert.deepEqual(ids(r), [a.id], 'C no se aplica antes que B: se respeta el orden');
  // la base vuelve y la app reenvía lo que le quedó en la cola
  env.DB.fallar = null;
  const otra = await sync(env, [b.op, c.op]);
  assert.equal(otra.reintentar, undefined);
  assert.equal(otra.rechazadas, undefined);
  assert.deepEqual(ids(otra).sort(), [a.id, b.id, c.id].sort());
});

test('transitorio: no se aplica "anular B" si "guardar B" falló', async () => {
  const env = entorno();
  const b = await gasto(env, 'mecato 2000');
  const anular: Op = { op: 'anular', id: b.id, cuando: '2026-10-19 16:00:00' };
  caerEn(env, b.id);
  const r = await sync(env, [b.op, anular]);
  assert.deepEqual(r.reintentar, [0, 1]);
  env.DB.fallar = null;
  const otra = await sync(env, [b.op, anular]);
  assert.equal(otra.rechazadas, undefined);
  assert.equal(otra.datos.movimientos.find(m => m.id === b.id)?.estado, 'anulado');
});

test('transitorio: un error de validación o de datos sigue siendo rechazo permanente', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000');
  const sinCuenta: Op = { op: 'guardar', movimiento: { ...a.movimiento, id: 'x1', asientos: [{ cuentaId: 'no-existe', monto: 5000, moneda: 'COP' }, { cuentaId: 'efectivo', monto: -5000, moneda: 'COP' }] }, cuentasNuevas: [], compromisos: [] };
  const sinSumar: Op = { op: 'guardar', movimiento: { ...a.movimiento, id: 'x2', asientos: [{ cuentaId: 'efectivo', monto: -5000, moneda: 'COP' }] }, cuentasNuevas: [], compromisos: [] };
  const r = await sync(env, [sinCuenta, sinSumar, a.op]);
  assert.deepEqual(r.rechazadas?.map(x => x.indice), [0, 1]);
  assert.equal(r.reintentar, undefined);
  assert.deepEqual(ids(r), [a.id], 'lo bueno que venía detrás sí se aplica');
});

test('reenvío: repetir una cola ya aplicada no duplica ni da rechazos falsos (editar antes de anular)', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000');
  const editar: Op = { op: 'editar', movimiento: { ...a.movimiento, descripcion: 'Mecato con Ana', editadoEn: '2026-10-19 16:00:00' }, cuentasNuevas: [] };
  const anular: Op = { op: 'anular', id: a.id, cuando: '2026-10-19 17:00:00' };
  const cola = [a.op, editar, anular];
  const primera = await sync(env, cola);
  assert.equal(primera.rechazadas, undefined);
  // la respuesta se perdió: la app reenvía lo mismo
  const segunda = await sync(env, cola);
  assert.equal(segunda.rechazadas, undefined, 'editar sobre lo que ya se anulaba más adelante en la misma cola es "ya aplicado"');
  assert.equal(segunda.datos.movimientos.length, 1);
  assert.equal(segunda.datos.movimientos[0].estado, 'anulado');
  assert.equal(segunda.datos.movimientos[0].asientos.length, a.movimiento.asientos.length);
});

test('lotes: una cola de 250 operaciones sale en 3 peticiones, en orden', async () => {
  const env = entorno();
  const cola: Op[] = Array.from({ length: 250 }, (_, i) => ({ op: 'presupuesto', categoriaId: 'cat:mecato', monto: 1000 + i }));
  const tamanos: number[] = [];
  const vistas: Op[] = [];
  const res = await enviarPorLotes(cola, async lote => { tamanos.push(lote.length); vistas.push(...lote); return sync(env, lote); });
  assert.equal(TAM_LOTE, 100);
  assert.deepEqual(tamanos, [100, 100, 50]);
  assert.deepEqual(vistas, cola, 'mismo orden');
  assert.equal(res.procesadas.length, 250);
  assert.equal(res.pendientes.length, 0);
  assert.equal(res.transitorio, false);
  const presupuesto = res.respuesta!.datos.presupuestos['cat:mecato'];
  assert.equal(presupuesto, 1249, 'quedó el último');
});

test('lotes: si un lote trae un fallo pasajero, se detiene y conserva el resto en orden', async () => {
  const env = entorno();
  const gastos = [];
  for (let i = 0; i < 5; i++) gastos.push(await gasto(env, `mecato ${1000 + i * 500}`));
  const cola = gastos.map(g => g.op);
  caerEn(env, gastos[3].id);
  const res = await enviarPorLotes(cola, lote => sync(env, lote), 2); // lotes de 2: [0,1] [2,3] [4]
  assert.equal(res.transitorio, true);
  assert.deepEqual(res.procesadas, [cola[0], cola[1], cola[2]]);
  assert.deepEqual(res.pendientes, [cola[3], cola[4]], 'el 4 no se envió: iría antes que el 3');
  env.DB.fallar = null;
  const otra = await enviarPorLotes(res.pendientes, lote => sync(env, lote), 2);
  assert.equal(otra.transitorio, false);
  assert.equal(otra.respuesta!.datos.movimientos.length, 5);
});

test('lotes: un error de red a mitad de camino conserva lo que ya se había aplicado', async () => {
  const cola: Op[] = Array.from({ length: 5 }, (_, i) => ({ op: 'presupuesto', categoriaId: 'cat:mecato', monto: i }));
  let n = 0;
  const res = await enviarPorLotes(cola, async lote => {
    if (++n === 2) throw new Error('sin red');
    return { datos: { movimientos: [], cuentas: [], config: {} }, servidorEn: String(lote.length) } as unknown as RespuestaSync;
  }, 2);
  assert.equal(res.error, 'sin red');
  assert.deepEqual(res.procesadas, [cola[0], cola[1]]);
  assert.deepEqual(res.pendientes, cola.slice(2));
});

test('lotes: un servidor viejo (sin `reintentar`) se trata como siempre', async () => {
  const cola: Op[] = [{ op: 'presupuesto', categoriaId: 'cat:mecato', monto: 1 }, { op: 'presupuesto', categoriaId: 'cat:mecato', monto: 2 }];
  const viejo = async () => ({ datos: { movimientos: [], cuentas: [], config: {} }, servidorEn: 'x', rechazadas: [{ indice: 1, motivo: 'mal' }] }) as unknown as RespuestaSync;
  const res = await enviarPorLotes(cola, viejo);
  assert.equal(res.transitorio, false);
  assert.deepEqual(res.procesadas, cola);
  assert.deepEqual(res.rechazadas, [{ op: cola[1], motivo: 'mal' }]);
});

test('config repetida: queda solo la última de cada clave y el resto no se mueve', () => {
  const c = (clave: string, valor: string): Op => ({ op: 'config', clave, valor });
  const g = { op: 'anular', id: 'm1', cuando: 'x' } as Op;
  const p = { op: 'presupuesto', categoriaId: 'cat:mecato', monto: 5 } as Op;
  const cola: Op[] = [c('metas', '1'), g, c('catalogo', 'a'), c('metas', '2'), p, c('metas', '3'), c('catalogo', 'b')];
  const r = fusionarConfigRepetidas(cola);
  assert.deepEqual(r, [g, p, cola[5], cola[6]]);
  assert.equal(r[2], cola[5], 'mismos objetos, no copias');
  assert.deepEqual(fusionarConfigRepetidas([g, p]), [g, p]);
});
