/**
 * Estrés de punta a punta: la app (sin conexión, con su cola) y el servidor (D1 de mentira con llaves
 * foráneas, como la de verdad) tienen que terminar con EXACTAMENTE los mismos datos, hagas lo que
 * hagas y te desconectes cuando te desconectes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoriaRepo, PLANTILLAS, procesar, RepoConCola, sqlDePlantilla, type Datos, type Salida } from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import worker, { type Env } from '../src/index.ts';
import { azar, botones, frase } from '../../../tests/generador.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const AHORA = new Date('2026-10-27T15:00:00Z');
const PERSONAS = [{ nombre: 'Felipe', grupo: 'trabajadores' }, { nombre: 'Rafael', grupo: 'familiares' }];

async function sincronizar(env: Env, local: RepoConCola): Promise<void> {
  const ops = [...local.cola];
  const r = await worker.fetch(new Request('https://x.workers.dev/api/sync', {
    method: 'POST', body: JSON.stringify({ ops }), headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
  }), env);
  assert.equal(r.status, 200, `el servidor rechazó la cola: ${await r.clone().text()}`);
  const j = (await r.json()) as { rechazadas?: { indice: number; motivo: string }[] };
  assert.equal(j.rechazadas, undefined, `el servidor rechazó operaciones válidas: ${JSON.stringify(j.rechazadas)}`);
  local.cola.splice(0, ops.length);
}

const resumen = (d: Datos) => ({
  movimientos: d.movimientos.map(m => `${m.id}|${m.estado}|${m.tipo}|${m.asientos.map(a => `${a.cuentaId}:${a.monto}:${a.moneda}`).sort().join(',')}`).sort(),
  compromisos: d.compromisos.map(c => `${c.id}|${c.estado}|${c.personaId}|${c.direccion}|${c.monto}`).sort(),
  cuentas: d.cuentas.map(c => `${c.id}|${c.grupo ?? ''}`).sort(),
  aprendido: Object.keys(d.aprendido).sort(),
  apertura: d.config.fecha_apertura,
});

test('estrés app + servidor: 150 sesiones con desconexiones terminan con los mismos datos en las dos puntas', async () => {
  const g = azar(424242);
  for (let s = 0; s < 150; s++) {
    const id = g.de(Object.keys(PLANTILLAS));
    const env: Env = { DB: crearD1(sqlDePlantilla(id, { personas: PERSONAS })), API_TOKEN: 'token', PIN_BORRADO: '1234' };
    const base = new MemoriaRepo();
    base.aplicarPlantilla(id, { personas: PERSONAS });
    const local = new RepoConCola(base);
    let ultima: Salida[] = [];
    const historial: string[] = [];
    try {
      for (let paso = 0; paso < 30; paso++) {
        const reloj = new Date(AHORA.getTime() + (s * 30 + paso) * 90000);
        if (g.si(0.55)) {
          const t = g.si(0.5) ? frase(g) : g.de(['mecato 2800', '30000 Felipe', 'le regalé 50000 jorge', 'presté 2800 a ana con 5k', 'almuerzo 20000 vuelto 500 monedas', 'ingreso 150500 chamba', 'le debo 54k a sergio', 'pagué 54k a sergio', 'ivan me pagó 6000', 'deshacer', 'saldo inicial efectivo 85000 monedas 12000']);
          historial.push(`texto ${JSON.stringify(t)}`);
          ultima = await procesar(local, { texto: t }, reloj, 'app');
        } else {
          const b = botones(g, ultima);
          historial.push(`botón ${b}`);
          ultima = await procesar(local, { boton: b }, reloj, 'app');
        }
        if (g.si(0.15)) await sincronizar(env, local); // a veces hay señal, a veces no
      }
      await sincronizar(env, local);
      assert.deepEqual(resumen(await new D1Repo(env.DB).cargar()), resumen(await base.cargar()), `sesión ${s} (${id}): servidor y app no coinciden`);
    } catch (e) {
      assert.fail(`${(e as Error).stack}\nHistorial:\n${historial.join('\n')}`);
    }
  }
});

test('el servidor rechaza las operaciones con basura sin tocar la base', async () => {
  const env: Env = { DB: crearD1(), API_TOKEN: 'token' };
  const mal = [
    { ops: [{ op: 'guardar', movimiento: { id: 'x', ocurridoEn: '2026-10-27 10:00:00', asientos: [{ cuentaId: 'no-existe', monto: 5000, moneda: 'COP' }, { cuentaId: 'efectivo', monto: -5000, moneda: 'COP' }] }, cuentasNuevas: [], compromisos: [] }] },
    { ops: Array.from({ length: 5 }, () => ({ op: 'presupuesto', categoriaId: 'cat:mecato', monto: 'mucho' })) },
  ];
  for (const cuerpo of mal) {
    const r = await worker.fetch(new Request('https://x.workers.dev/api/sync', { method: 'POST', body: JSON.stringify(cuerpo), headers: { Authorization: 'Bearer token' } }), env);
    assert.equal(r.status, 200, `status ${r.status}`);
    assert.equal(((await r.json()) as { rechazadas?: unknown[] }).rechazadas?.length, cuerpo.ops.length);
  }
  assert.equal((await new D1Repo(env.DB).cargar()).movimientos.length, 0);
});
