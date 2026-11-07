/**
 * Pruebas de estrés: un tester muy exigente que escribe de la peor forma posible y aprieta botones
 * sin sentido. Con una semilla fija (se repite igual siempre) se generan miles de frases y sesiones.
 *
 * Lo que NUNCA debe pasar, escriba lo que escriba:
 *  - que el bot lance una excepción;
 *  - que se guarde un movimiento que no cuadre (los asientos suman 0 por moneda);
 *  - que un asiento apunte a una cuenta que no existe, o tenga un monto que no sea entero;
 *  - que un saldo salga NaN o infinito;
 *  - que Efectivo deje de ser múltiplo de 1.000 (salvo saldo inicial y arqueo, que declaran lo que hay).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularSaldos, MemoriaRepo, PLANTILLAS, procesar, type Datos, type Salida } from '../src/index.ts';
import { azar, botones, frase } from '../../../tests/generador.ts';

function revisar(d: Datos, contexto: string) {
  const ids = new Set(d.cuentas.map(c => c.id));
  assert.equal(ids.size, d.cuentas.length, `${contexto}: cuentas con id repetido`);
  const hayDeclarados = d.movimientos.some(m => m.estado === 'ok' && (m.tipo === 'apertura' || m.tipo === 'ajuste'));
  for (const m of d.movimientos) {
    const suma = new Map<string, number>();
    for (const a of m.asientos) {
      assert.ok(ids.has(a.cuentaId), `${contexto}: «${m.descripcion}» usa la cuenta inexistente ${a.cuentaId}`);
      assert.ok(Number.isSafeInteger(a.monto), `${contexto}: monto no entero ${a.monto} en «${m.descripcion}»`);
      suma.set(a.moneda, (suma.get(a.moneda) ?? 0) + a.monto);
    }
    for (const [mon, s] of suma) assert.equal(s, 0, `${contexto}: «${m.descripcion}» no cuadra en ${mon}`);
    assert.ok(m.id && m.ocurridoEn, `${contexto}: movimiento sin id o fecha`);
  }
  for (const c of d.compromisos) {
    assert.ok(ids.has(c.personaId), `${contexto}: compromiso de una persona inexistente ${c.personaId}`);
    assert.ok(Number.isSafeInteger(c.monto) && c.monto > 0, `${contexto}: compromiso con monto ${c.monto}`);
  }
  const saldos = calcularSaldos(d.movimientos, d.config.fecha_apertura ?? '2000-01-01 00:00:00');
  for (const [k, v] of saldos) {
    assert.ok(Number.isFinite(v), `${contexto}: saldo no finito en ${k}`);
    if (k === 'efectivo|COP' && !hayDeclarados) assert.equal(Math.abs(v % 1000), 0, `${contexto}: efectivo ${v} no es múltiplo de 1.000`);
  }
}

const AHORA = new Date('2026-10-27T15:00:00Z');

test('estrés: 6.000 frases rarísimas no rompen el intérprete ni dejan movimientos que no cuadren', async () => {
  const g = azar(20261027);
  for (const id of Object.keys(PLANTILLAS)) {
    const repo = new MemoriaRepo();
    repo.aplicarPlantilla(id, { personas: [{ nombre: 'Felipe', grupo: 'trabajadores' }, { nombre: 'Rafael', grupo: 'familiares' }] });
    for (let i = 0; i < 2000; i++) {
      const texto = frase(g);
      let salidas: Salida[];
      try {
        salidas = await procesar(repo, { texto }, new Date(AHORA.getTime() + i * 60000));
        assert.ok(Array.isArray(salidas) && salidas.length > 0, 'sin respuesta');
        for (const s of salidas) assert.equal(typeof s.texto, 'string');
        assert.ok(!salidas.some(s => /NaN|undefined|\[object/.test(s.texto)), `respuesta con basura: ${salidas.map(s => s.texto).join(' | ')}`);
      } catch (e) {
        assert.fail(`[${id}] «${JSON.stringify(texto)}» lanzó: ${(e as Error).stack}`);
      }
      if (g.si(0.5)) {
        try { await procesar(repo, { boton: 'ok' }, new Date(AHORA.getTime() + i * 60000 + 1)); } catch (e) { assert.fail(`[${id}] confirmar «${JSON.stringify(texto)}»: ${(e as Error).stack}`); }
      } else if (g.si(0.3)) {
        await procesar(repo, { boton: 'no' }, AHORA);
      }
    }
    revisar(await repo.cargar(), `plantilla ${id}`);
  }
});

test('estrés: 400 sesiones largas de toques de botón y mensajes mezclados', async () => {
  const g = azar(777);
  for (let s = 0; s < 400; s++) {
    const id = g.de(Object.keys(PLANTILLAS));
    const repo = new MemoriaRepo();
    repo.aplicarPlantilla(id, { personas: [{ nombre: 'Felipe', grupo: 'trabajadores' }] });
    let ultima: Salida[] = [];
    const historial: string[] = [];
    // con saldo inicial puesto se activan las guardas de plata que no alcanza
    if (g.si(0.6)) { await procesar(repo, { texto: 'saldo inicial efectivo 40000 monedas 2000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA); }
    for (let paso = 0; paso < 40; paso++) {
      const reloj = new Date(AHORA.getTime() + (s * 40 + paso) * 90000);
      try {
        if (g.si(0.55)) {
          const t = g.si(0.5) ? frase(g) : g.de(['mecato 2800', '30000 Felipe', 'le regalé 50000 jorge', 'presté 2800 a ana con 5k', 'almuerzo 20000 vuelto 500 monedas', '7500 arepas', 'ingreso 150500 chamba', 'le debo 54k a sergio', 'pagué 54k a sergio', 'ivan me pagó 6000', '14000 pasajes', 'deshacer', 'deudas', 'metí 5000 a la alcancía', 'me dieron vuelto 3000 en monedas', 'deshacer 2', 'saldo inicial efectivo 10000', 'pasé 30000 de monedas a efectivo']);
          historial.push(`texto: ${JSON.stringify(t)}`);
          ultima = await procesar(repo, { texto: t }, reloj);
        } else {
          const b = botones(g, ultima);
          historial.push(`botón: ${b}`);
          ultima = await procesar(repo, { boton: b }, reloj);
        }
      } catch (e) {
        assert.fail(`sesión ${s} (${id}) paso ${paso} lanzó: ${(e as Error).stack}\nHistorial:\n${historial.join('\n')}`);
      }
    }
    try { revisar(await repo.cargar(), `sesión ${s} (${id})`); } catch (e) { assert.fail(`${(e as Error).message}\nHistorial:\n${historial.join('\n')}`); }
  }
});

test('estrés: textos enormes y caracteres de control no se cuelgan ni tardan', async () => {
  const repo = new MemoriaRepo();
  const t0 = Date.now();
  for (const texto of ['x'.repeat(100000), '5000 '.repeat(5000), '\0'.repeat(1000), ' '.repeat(100000), '5'.repeat(5000) + ' mecato', 'ñ'.repeat(20000) + ' 5000', 'con con con con '.repeat(2000) + '5000']) {
    const s = await procesar(repo, { texto }, AHORA);
    assert.ok(s.length > 0);
  }
  assert.ok(Date.now() - t0 < 5000, `tardó demasiado: ${Date.now() - t0} ms`);
});
