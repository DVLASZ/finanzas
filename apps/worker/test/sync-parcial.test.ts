/**
 * Sincronización parcial: una app que ya tiene todo pide solo lo que cambió. Lo importante es que el
 * resultado sea idéntico a traer todo, en cualquier orden de cambios, anulaciones y borrados.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  construirMovimiento, contextoDe, fusionarRespuesta, interpretar, type Datos, type Op, type RespuestaSync,
} from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import worker, { type Env } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1, type D1Prueba } from '../../../tests/d1-shim.ts';

const entorno = (): Env & { DB: D1Prueba } => ({ DB: crearD1(), API_TOKEN: 't', PIN_BORRADO: '4321' }) as Env & { DB: D1Prueba };
const llamar = (env: Env, ruta: string, cuerpo: unknown) =>
  worker.fetch(new Request(`https://x.workers.dev${ruta}`, { method: 'POST', body: JSON.stringify(cuerpo), headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' } }), env);
const sync = async (env: Env, cuerpo: { ops?: Op[]; desde?: string; generacion?: string }) =>
  (await (await llamar(env, '/api/sync', { ops: [], ...cuerpo })).json()) as RespuestaSync;
/** Hace como si hubiera pasado el tiempo: todo lo que ya estaba queda «viejo» para el servidor. */
const envejecer = (env: { DB: D1Prueba }) => env.DB.db.exec("UPDATE movimientos SET cambio_en = '2000-01-01 00:00:00'");

async function gasto(env: Env, texto: string): Promise<{ op: Op; id: string }> {
  const ctx = contextoDe(await new D1Repo(env.DB).cargar(), AHORA);
  const r = interpretar(texto, ctx);
  if (r.clase !== 'movimiento') throw new Error('no es movimiento');
  const id = crypto.randomUUID();
  const h = construirMovimiento(r.propuesta, ctx, new Map(), id, 'app');
  return { op: { op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos }, id };
}

const igualAlCompleto = async (env: Env, local: Datos) => {
  const completo = await new D1Repo(env.DB).cargar();
  const ordenar = (d: Datos) => d.movimientos.map(m => `${m.id}|${m.estado}|${m.asientos.map(a => `${a.cuentaId}:${a.monto}`).join(',')}`).sort();
  assert.deepEqual(ordenar(local), ordenar(completo));
  assert.deepEqual(local.config, completo.config);
};

test('parcial: la primera vez trae todo; la siguiente, solo lo que cambió', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000'), b = await gasto(env, 'mecato 2000'), c = await gasto(env, 'mecato 3000');
  const primera = await sync(env, { ops: [a.op, b.op, c.op] });
  assert.equal(primera.parcial, undefined);
  assert.equal(primera.datos.movimientos.length, 3);
  envejecer(env);
  const d = await gasto(env, 'mecato 4000');
  const segunda = await sync(env, { ops: [d.op], desde: primera.servidorEn, generacion: primera.datos.config.generacion ?? '0' });
  assert.equal(segunda.parcial, true);
  assert.deepEqual(segunda.datos.movimientos.map(m => m.id), [d.id]);
  assert.equal(segunda.datos.movimientos[0].asientos.length, 2, 'trae también sus asientos');
  assert.ok(segunda.datos.cuentas.length > 5, 'las demás tablas vienen completas');
  await igualAlCompleto(env, fusionarRespuesta(primera.datos, segunda));
});

test('parcial: lo anulado desde otro aparato llega como cambio', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000'), b = await gasto(env, 'mecato 2000');
  const primera = await sync(env, { ops: [a.op, b.op] });
  envejecer(env);
  const otro = await sync(env, { ops: [{ op: 'anular', id: a.id, cuando: '2026-10-19 16:00:00' }] }); // el otro aparato
  assert.equal(otro.datos.movimientos.find(m => m.id === a.id)?.estado, 'anulado');
  const mia = await sync(env, { desde: primera.servidorEn, generacion: '0' });
  assert.equal(mia.parcial, true);
  assert.deepEqual(mia.datos.movimientos.map(m => [m.id, m.estado]), [[a.id, 'anulado']]);
  await igualAlCompleto(env, fusionarRespuesta(primera.datos, mia));
});

test('parcial: si se purgó o borró algo (otra generación) se trae todo', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000'), b = await gasto(env, 'mecato 2000');
  const primera = await sync(env, { ops: [a.op, b.op] });
  await sync(env, { ops: [{ op: 'anular', id: a.id, cuando: '2026-10-19 16:00:00' }] });
  const purga = await llamar(env, '/api/purgar', { pin: '4321', confirmacion: 'PURGAR ANULADOS' });
  assert.equal(purga.status, 200);
  const segunda = await sync(env, { desde: primera.servidorEn, generacion: primera.datos.config.generacion ?? '0' });
  assert.equal(segunda.parcial, undefined, 'otra generación: respuesta completa');
  assert.deepEqual(segunda.datos.movimientos.map(m => m.id), [b.id], 'lo purgado ya no está');
  // con la generación nueva, otra vez parcial
  envejecer(env);
  const tercera = await sync(env, { desde: segunda.servidorEn, generacion: segunda.datos.config.generacion });
  assert.equal(tercera.parcial, true);
});

test('parcial: un «desde» raro o muy viejo se ignora y se manda todo', async () => {
  const env = entorno();
  const a = await gasto(env, 'mecato 1000');
  await sync(env, { ops: [a.op] });
  for (const desde of ['ayer', "2026-01-01'; DROP TABLE movimientos; --", '2000-01-01 00:00:00']) {
    const r = await sync(env, { desde, generacion: '0' });
    assert.equal(r.parcial, undefined, desde);
    assert.equal(r.datos.movimientos.length, 1);
  }
});

test('parcial: lo que el servidor rechaza se saca de la copia local', () => {
  const local = { movimientos: [{ id: 'a', ocurridoEn: '2026-10-19 10:00:00' }, { id: 'mala', ocurridoEn: '2026-10-19 11:00:00' }] } as unknown as Datos;
  const resp = { parcial: true, servidorEn: 'x', datos: { movimientos: [{ id: 'b', ocurridoEn: '2026-10-19 09:00:00' }], cuentas: [], config: {} } } as unknown as RespuestaSync;
  assert.deepEqual(fusionarRespuesta(local, resp, ['mala']).movimientos.map(m => m.id), ['b', 'a']);
  // una respuesta completa reemplaza todo
  assert.equal(fusionarRespuesta(local, { ...resp, parcial: undefined }).movimientos.length, 1);
});

test('parcial: dos aparatos con cambios mezclados al azar siempre terminan igual a traer todo', async () => {
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2 ** 32; };
  for (let ronda = 0; ronda < 6; ronda++) {
    const env = entorno();
    const aparatos = [0, 1].map(() => ({ datos: null as Datos | null, desde: '', generacion: '0' }));
    const ids: string[] = [];
    for (let paso = 0; paso < 25; paso++) {
      const quien = aparatos[Math.floor(azar() * 2)];
      const ops: Op[] = [];
      const x = azar();
      if (x < 0.55 || !ids.length) { const g = await gasto(env, `mecato ${1000 + Math.floor(azar() * 9) * 500}`); ops.push(g.op); ids.push(g.id); }
      else if (x < 0.8) ops.push({ op: 'anular', id: ids[Math.floor(azar() * ids.length)], cuando: '2026-10-19 16:00:00' });
      else if (x < 0.87) await llamar(env, '/api/purgar', { pin: '4321', confirmacion: 'PURGAR ANULADOS' });
      const pideParcial = quien.datos !== null;
      const resp = await sync(env, { ops, ...(pideParcial ? { desde: quien.desde, generacion: quien.generacion } : {}) });
      quien.datos = quien.datos && resp.parcial ? fusionarRespuesta(quien.datos, resp) : resp.datos;
      quien.desde = resp.servidorEn;
      quien.generacion = resp.datos.config.generacion ?? '0';
      // los dos, al ponerse al día, tienen que ver lo mismo que el servidor
      if (azar() < 0.4) {
        const otro = aparatos.find(a => a !== quien)!;
        if (otro.datos) {
          const r2 = await sync(env, { desde: otro.desde, generacion: otro.generacion });
          otro.datos = r2.parcial ? fusionarRespuesta(otro.datos, r2) : r2.datos;
          otro.desde = r2.servidorEn; otro.generacion = r2.datos.config.generacion ?? '0';
          await igualAlCompleto(env, otro.datos);
          await igualAlCompleto(env, quien.datos);
          // los dos están al día: lo de antes ya es «viejo» para el servidor (como si hubiera pasado el tiempo)
          envejecer(env);
        }
      }
    }
  }
});
