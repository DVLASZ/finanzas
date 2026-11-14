/**
 * Pruebas del Worker: API de sincronización y borrados, con una D1 simulada sobre SQLite.
 * Sin red y sin cuentas.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  construirMovimiento, calcularSaldos, contextoDe, CUENTAS_INICIALES, interpretar, procesar, type Datos, type Movimiento, type Op,
} from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import { enviarAlBuzon } from '../src/buzon.ts';
import worker, { type Env } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

function entorno(extra: Partial<Env> = {}): Env {
  return { DB: crearD1(), API_TOKEN: 'token-api', PIN_BORRADO: '4321', ...extra };
}

// ---------------------------------------------------------------- API de sincronización

function peticion(env: Env, ruta: string, cuerpo?: unknown, token = 'token-api', metodo?: string): Promise<Response> {
  return worker.fetch(new Request(`https://x.workers.dev${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? 'GET' : 'POST'),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }), env);
}

/** Un movimiento real, armado con el mismo código que usa la app. */
function movimientoDePrueba(texto: string) {
  const ctx = contextoDe({
    cuentas: structuredClone(CUENTAS_INICIALES), movimientos: [], compromisos: [], atajos: [], aprendido: {}, presupuestos: {}, config: {},
  }, AHORA);
  const r = interpretar(texto, ctx);
  assert.equal(r.clase, 'movimiento');
  if (r.clase !== 'movimiento') throw new Error('no es movimiento');
  return construirMovimiento(r.propuesta, ctx, new Map(), crypto.randomUUID(), 'app');
}

test('api: exige el token', async () => {
  const env = entorno();
  assert.equal((await peticion(env, '/api/datos', undefined, 'malo')).status, 401);
  assert.equal((await peticion(env, '/api/datos')).status, 200);
});

test('api: sync aplica los cambios de la app y devuelve todo; repetirlos no duplica', async () => {
  const env = entorno();
  const h = movimientoDePrueba('presté 40k a ivan nequi');
  const ops: Op[] = [{ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos }];
  const r1 = (await (await peticion(env, '/api/sync', { ops })).json()) as { datos: { movimientos: unknown[]; cuentas: { id: string }[]; compromisos: unknown[] } };
  assert.equal(r1.datos.movimientos.length, 1);
  assert.ok(r1.datos.cuentas.some(c => c.id === 'per:ivan'));
  assert.equal(r1.datos.compromisos.length, 1);
  const r2 = (await (await peticion(env, '/api/sync', { ops })).json()) as typeof r1;
  assert.equal(r2.datos.movimientos.length, 1, 'idempotente');
  assert.equal(r2.datos.compromisos.length, 1);
});

test('api: sync responde 400 si la petición en sí está mal (JSON roto, no es lista, demasiadas operaciones)', async () => {
  const env = entorno();
  const cruda = (cuerpo: string) => worker.fetch(new Request('https://x.workers.dev/api/sync', {
    method: 'POST', body: cuerpo, headers: { Authorization: 'Bearer token-api' },
  }), env);
  assert.equal((await cruda('{no es json')).status, 400, 'JSON roto');
  assert.equal((await cruda('null')).status, 400, 'cuerpo null');
  assert.equal((await peticion(env, '/api/sync', { ops: 'x' })).status, 400, 'ops no es lista');
  const muchas = Array.from({ length: 1001 }, () => ({ op: 'anular', id: 'no-existe', cuando: '2026-10-19 16:00:00' }));
  assert.equal((await peticion(env, '/api/sync', { ops: muchas })).status, 400, 'más ops que el tope');
});

test('api: una operación mala se rechaza SOLA y las demás se aplican (una no traba la cola)', async () => {
  const env = entorno();
  const buena = movimientoDePrueba('mecato 5000');
  const r = await peticion(env, '/api/sync', { ops: [
    { op: 'config', clave: 'cualquier_cosa', valor: '1' },
    { op: 'desconocida' },
    { op: 'guardar', movimiento: buena.movimiento, cuentasNuevas: buena.cuentasNuevas, compromisos: buena.compromisos },
    { op: 'config', clave: 'fecha_apertura', valor: '2026-10-19 08:00:00' },
  ] });
  assert.equal(r.status, 200);
  const j = (await r.json()) as { datos: Datos; rechazadas?: { indice: number; motivo: string }[] };
  assert.deepEqual(j.rechazadas?.map(x => x.indice), [0, 1]);
  assert.equal(j.datos.movimientos.length, 1, 'la buena sí se guardó');
  assert.equal(j.datos.config.fecha_apertura, '2026-10-19 08:00:00');
});

test('api: movimientos mal formados o que la base no acepta se rechazan sin tocar nada', async () => {
  const env = entorno();
  const h = movimientoDePrueba('mecato 5000');
  const guardar = (movimiento: unknown) => peticion(env, '/api/sync', { ops: [{ op: 'guardar', movimiento, cuentasNuevas: [], compromisos: [] }] });
  const sinAsientos: Record<string, unknown> = { ...h.movimiento };
  delete sinAsientos.asientos;
  const casos: [string, unknown][] = [
    ['sin asientos', sinAsientos],
    ['asientos que no suman 0', { ...h.movimiento, asientos: h.movimiento.asientos.map((a, i) => (i === 0 ? { ...a, monto: a.monto + 1 } : a)) }],
    ['monto que no es un número', { ...h.movimiento, asientos: h.movimiento.asientos.map((a, i) => (i === 0 ? { ...a, monto: null } : a)) }],
    ['sin id', { ...h.movimiento, id: undefined }],
    ['sin tipo', { ...h.movimiento, tipo: undefined }],
    ['una cuenta que no existe', { ...h.movimiento, asientos: [{ cuentaId: 'cuenta-fantasma', monto: 5000, moneda: 'COP' }, { cuentaId: 'efectivo', monto: -5000, moneda: 'COP' }] }],
  ];
  for (const [que, mov] of casos) {
    const j = (await (await guardar(mov)).json()) as { rechazadas?: unknown[] };
    assert.equal(j.rechazadas?.length, 1, que);
  }
  assert.equal((await new D1Repo(env.DB).cargar()).movimientos.length, 0, 'no se guardó nada');
  const ok = (await (await guardar(h.movimiento)).json()) as { rechazadas?: unknown[] };
  assert.equal(ok.rechazadas, undefined, 'el válido sí entra');
});

test('api: lo que anota el bot en D1 y lo que llega de la app conviven, y anular desde la app funciona', async () => {
  const env = entorno();
  const repo = new D1Repo(env.DB);
  await procesar(repo, { texto: 'mecato 5000' }, AHORA, 'app');
  await procesar(repo, { boton: 'ok' }, AHORA, 'app');
  const h = movimientoDePrueba('pizza 12000');
  const r = (await (await peticion(env, '/api/sync', {
    ops: [
      { op: 'guardar', movimiento: h.movimiento, cuentasNuevas: [], compromisos: [] },
      { op: 'anular', id: h.movimiento.id, cuando: '2026-10-19 16:00:00' },
    ],
  })).json()) as { datos: { movimientos: { origen: string; estado: string }[] } };
  assert.equal(r.datos.movimientos.length, 2);
  assert.deepEqual(r.datos.movimientos.map(m => m.estado).sort(), ['anulado', 'ok']);
});

test('api: anular un préstamo desde la app anula también su deuda en D1', async () => {
  const env = entorno();
  const h = movimientoDePrueba('presté 40k a ivan nequi');
  await peticion(env, '/api/sync', { ops: [
    { op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos },
    { op: 'anular', id: h.movimiento.id, cuando: '2026-10-19 16:00:00' },
  ] });
  const cs = (await new D1Repo(env.DB).cargar()).compromisos;
  assert.deepEqual(cs.map(c => c.estado), ['anulada']);
});

test('api: el borrado definitivo exige PIN y frase de confirmación', async () => {
  const env = entorno();
  const h = movimientoDePrueba('pizza 12000');
  await peticion(env, '/api/sync', { ops: [{ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: [], compromisos: [] }, { op: 'anular', id: h.movimiento.id, cuando: '2026-10-19 16:00:00' }] });
  assert.equal((await peticion(env, '/api/purgar', { confirmacion: 'PURGAR ANULADOS' })).status, 403, 'sin PIN');
  assert.equal((await peticion(env, '/api/purgar', { pin: '4321' })).status, 400, 'sin frase');
  const ok = (await (await peticion(env, '/api/purgar', { pin: '4321', confirmacion: 'PURGAR ANULADOS' })).json()) as { borrados: number };
  assert.equal(ok.borrados, 1);
  assert.equal((await peticion(env, '/api/borrar-todo', { pin: '4321', confirmacion: 'BORRAR' })).status, 400);
  assert.equal((await peticion(env, '/api/borrar-todo', { pin: '4321', confirmacion: 'BORRAR TODO MIS DATOS' })).status, 200);
  assert.equal((await new D1Repo(env.DB).cargar()).movimientos.length, 0);
});

test('api: sin PIN_BORRADO configurado el borrado definitivo se rechaza siempre', async () => {
  const env = entorno({ PIN_BORRADO: undefined });
  assert.equal((await peticion(env, '/api/purgar', { confirmacion: 'PURGAR ANULADOS' })).status, 403);
  assert.equal((await peticion(env, '/api/purgar', { pin: '', confirmacion: 'PURGAR ANULADOS' })).status, 403);
  assert.equal((await peticion(env, '/api/borrar-todo', { pin: undefined, confirmacion: 'BORRAR TODO MIS DATOS' })).status, 403);
});

test('api: las rutas de WhatsApp ya no existen', async () => {
  const env = entorno();
  assert.equal((await peticion(env, '/api/whatsapp/suscripcion')).status, 404);
  assert.equal((await peticion(env, '/api/whatsapp/salud')).status, 404);
  const w = await worker.fetch(new Request('https://x.workers.dev/webhook/whatsapp', { method: 'POST', body: '{}' }), env);
  assert.equal(w.status, 404, 'sin el sitio web publicado, el webhook no responde nada útil');
});

test('api: el historial del Excel (si existe) se sube completo y cuadra', { skip: !existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'importacion', 'historial.json')) }, async () => {
  const archivo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'importacion', 'historial.json');
  const historial = JSON.parse(readFileSync(archivo, 'utf8')) as Movimiento[];
  const env = entorno();
  const ops: Op[] = historial.map(m => ({ op: 'guardar', movimiento: m, cuentasNuevas: [], compromisos: [] }));
  const r = (await (await peticion(env, '/api/sync', { ops })).json()) as { datos: Datos };
  assert.equal(r.datos.movimientos.length, historial.length);
  // las vistas SQL y el cálculo en memoria deben dar el mismo gasto total
  const enSql = (env.DB as unknown as { db: { prepare(s: string): { get(): { t: number } } } }).db
    .prepare("SELECT SUM(total) t FROM v_gasto_mensual").get().t;
  const enMemoria = historial.reduce((s, m) => s + m.asientos.filter(a => a.cuentaId.startsWith('cat:')).reduce((x, a) => x + a.monto, 0), 0);
  assert.equal(enSql, enMemoria);
  assert.equal(((await (await peticion(env, '/api/sync', { ops })).json()) as { datos: Datos }).datos.movimientos.length, historial.length, 'idempotente');
});

test('d1: un movimiento con asientos descuadrados se rechaza antes de llegar a la base (construirMovimiento)', () => {
  const h = movimientoDePrueba('mecato 5000');
  const suma = h.movimiento.asientos.reduce((s, a) => s + a.monto, 0);
  assert.equal(suma, 0);
});

// ---------------------------------------------------------------- ayuda de la IA

const iaFalsa = (respuesta: unknown, llamadas: unknown[] = []) => ({
  run: async (_modelo: string, entrada: unknown) => { llamadas.push(entrada); return { response: respuesta }; },
});

test('ia: sin el binding de Workers AI responde 501', async () => {
  const r = await peticion(entorno(), '/api/interpretar', { texto: 'me llegaron cincuenta mil' });
  assert.equal(r.status, 501);
});

test('ia: devuelve las frases limpias y manda las cuentas de esa instalación al modelo', async () => {
  const llamadas: unknown[] = [];
  const env = entorno({ AI: iaFalsa({ frases: ['ingreso 50000 tía', '  mecato   5000 '] }, llamadas) });
  const r = await peticion(env, '/api/interpretar', { texto: 'me llegaron cincuenta mil de mi tía y gasté 5 lukas en mecato' });
  assert.equal(r.status, 200);
  assert.deepEqual(((await r.json()) as { frases: string[] }).frases, ['ingreso 50000 tía', 'mecato 5000']);
  const msg = (llamadas[0] as { messages: { content: string }[] }).messages;
  assert.match(msg[0].content, /Nequi/);
  assert.match(msg[1].content, /cincuenta mil/);
});

test('ia: exige el token y una frase de tamaño razonable', async () => {
  const env = entorno({ AI: iaFalsa({ frases: [] }) });
  assert.equal((await peticion(env, '/api/interpretar', { texto: 'hola' }, 'malo')).status, 401);
  assert.equal((await peticion(env, '/api/interpretar', { texto: '' })).status, 400);
  assert.equal((await peticion(env, '/api/interpretar', { texto: 'x'.repeat(401) })).status, 400);
  assert.equal((await peticion(env, '/api/interpretar', {})).status, 400);
});

test('ia: tope diario y interruptor de apagado', async () => {
  const env = entorno({ AI: iaFalsa({ frases: ['mecato 5000'] }), IA_TOPE: '2' });
  assert.equal((await peticion(env, '/api/interpretar', { texto: 'uno' })).status, 200);
  assert.equal((await peticion(env, '/api/interpretar', { texto: 'dos' })).status, 200);
  const tercera = await peticion(env, '/api/interpretar', { texto: 'tres' });
  assert.equal(tercera.status, 429);
  assert.match(((await tercera.json()) as { error: string }).error, /todas las ayudas/);

  const apagada = entorno({ AI: iaFalsa({ frases: [] }) });
  await new D1Repo(apagada.DB).setConfig('ia', '0');
  assert.equal((await peticion(apagada, '/api/interpretar', { texto: 'hola' })).status, 403);
});

test('ia: si el modelo falla responde 502 y no rompe el servidor', async () => {
  const env = entorno({ AI: { run: async () => { throw new Error('caído'); } } });
  assert.equal((await peticion(env, '/api/interpretar', { texto: 'hola' })).status, 502);
});

test('ia: lo que devuelva el modelo no se guarda en ninguna parte (la frase no queda en la base)', async () => {
  const env = entorno({ AI: iaFalsa({ frases: ['mecato 5000'] }) });
  await peticion(env, '/api/interpretar', { texto: 'frase privada muy particular' });
  const datos = await new D1Repo(env.DB).cargar();
  assert.equal(JSON.stringify(datos).includes('privada muy particular'), false);
  assert.equal(datos.movimientos.length, 0);
});

test('api: /api/salud resume la instalación sin datos personales y exige el token', async () => {
  const env = entorno();
  assert.equal((await peticion(env, '/api/salud', undefined, 'malo')).status, 401);
  const h = movimientoDePrueba('mecato 5000');
  await peticion(env, '/api/sync', { ops: [{ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos }] });
  const s = (await (await peticion(env, '/api/salud')).json()) as { movimientos: number; ultimoMovimiento: string | null; celularesConAvisos: number };
  assert.equal(s.movimientos, 1);
  assert.ok(s.ultimoMovimiento);
  assert.equal(s.celularesConAvisos, 0);
  assert.doesNotMatch(JSON.stringify(s), /mecato/i);
});

test('api: sync crea y renombra categorías y personas, y rechaza lo que no es suyo', async () => {
  const env = entorno();
  const cat = { id: 'cat:viajes', nombre: 'Viajes', clave: 'viajes', tipo: 'categoria', moneda: 'COP' };
  const r = (await (await peticion(env, '/api/sync', { ops: [
    { op: 'cuenta', cuenta: cat },
    { op: 'cuenta', cuenta: { ...cat, nombre: 'Viajes largos', clave: 'viajes largos' } },
    { op: 'cuenta', cuenta: { id: 'per:ana', nombre: 'Ana', clave: 'ana', tipo: 'persona', moneda: 'COP', grupo: 'amigos' } },
    { op: 'cuenta', cuenta: { id: 'efectivo', nombre: 'Mía', clave: 'mia', tipo: 'dinero', moneda: 'COP' } },
  ] })).json()) as { datos: { cuentas: { id: string; nombre: string; grupo?: string }[] }; rechazadas?: { indice: number; motivo: string }[] };
  assert.equal(r.datos.cuentas.find(c => c.id === 'cat:viajes')?.nombre, 'Viajes largos');
  assert.equal(r.datos.cuentas.find(c => c.id === 'per:ana')?.grupo, 'amigos');
  assert.notEqual(r.datos.cuentas.find(c => c.id === 'efectivo')?.nombre, 'Mía');
  assert.equal(r.rechazadas?.length, 1);
  assert.equal(r.rechazadas?.[0].indice, 3);
});

test('api: un token de solo lectura ve los datos pero no puede escribir', async () => {
  const env = { ...entorno(), API_TOKEN_LECTURA: 'token-lectura' };
  assert.equal((await peticion(env, '/api/datos', undefined, 'token-lectura')).status, 200);
  assert.equal((await peticion(env, '/api/salud', undefined, 'token-lectura')).status, 200);
  const escribir = await peticion(env, '/api/sync', { ops: [] }, 'token-lectura');
  assert.equal(escribir.status, 403);
  assert.match(((await escribir.json()) as { error: string }).error, /solo lectura/);
  assert.equal((await peticion(env, '/api/borrar-todo', { pin: '1', confirmacion: 'x' }, 'token-lectura')).status, 403);
  // sin esa variable, ese token no existe
  assert.equal((await peticion(entorno(), '/api/datos', undefined, 'token-lectura')).status, 401);
});

test('buzón: otra app deja un aviso con su clave, y la app lo ve en la config', async () => {
  const env = { ...entorno(), BUZON_CLAVE: 'clave-del-buzon' };
  const aviso = { de: 'Mamá', monto: 150000, concepto: 'Giro', cuando: '2026-11-04T01:00:00Z' };
  const llamada = (cuerpo: unknown, clave: string) => worker.fetch(new Request('https://x.workers.dev/api/buzon', {
    method: 'POST', body: JSON.stringify(cuerpo), headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
  }), env);
  assert.equal((await llamada(aviso, 'mala')).status, 401);
  assert.equal((await llamada({ ...aviso, monto: -5 }, 'clave-del-buzon')).status, 400);
  assert.equal((await llamada({ ...aviso, de: 'x'.repeat(100) }, 'clave-del-buzon')).status, 400);
  assert.equal((await llamada(aviso, 'clave-del-buzon')).status, 200);
  const datos = (await (await peticion(env, '/api/datos')).json()) as { datos: { config: Record<string, string> } };
  const buzon = JSON.parse(datos.datos.config.buzon) as { de: string; monto: number; estado: string }[];
  assert.equal(buzon.length, 1);
  assert.deepEqual([buzon[0].de, buzon[0].monto, buzon[0].estado], ['Mamá', 150000, 'nuevo']);
  // sin BUZON_CLAVE el buzón no existe
  assert.equal((await worker.fetch(new Request('https://x.workers.dev/api/buzon', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer clave-del-buzon' } }), entorno())).status, 404);
});

test('buzón: enviar un aviso a otra app usa su dirección y su clave, sin mostrarlas', async () => {
  const llamadas: { url: string; auth: string | null; cuerpo: string }[] = [];
  const destino = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization ?? null, cuerpo: String(init?.body) });
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  const env = { ...entorno(), BUZON_DESTINOS: JSON.stringify({ julio: { url: 'https://finanzas.ejemplo.workers.dev', clave: 'clave-de-julio' } }) };
  const lista = (await (await peticion(env, '/api/buzon/destinos')).json()) as { destinos: string[] };
  assert.deepEqual(lista.destinos, ['julio']);
  assert.doesNotMatch(JSON.stringify(lista), /clave-de-julio/);
  const r = await enviarAlBuzon(env, { destino: 'julio', de: 'Mamá', monto: 150000, concepto: 'Giro' }, destino);
  assert.equal(r.ok, true);
  assert.equal(llamadas[0].url, 'https://finanzas.ejemplo.workers.dev/api/buzon');
  assert.equal(llamadas[0].auth, 'Bearer clave-de-julio');
  assert.match(llamadas[0].cuerpo, /150000/);
  assert.equal((await enviarAlBuzon(env, { destino: 'nadie', de: 'M', monto: 1000, concepto: '' }, destino)).ok, false);
});

// ---------------------------------------------------------------- lectura de comprobantes (/api/ocr)

const FOTO = 'data:image/jpeg;base64,' + btoa('no es una foto de verdad');

test('ocr: sin el binding de Workers AI responde 501, y exige token e imagen', async () => {
  assert.equal((await peticion(entorno(), '/api/ocr', { imagen: FOTO })).status, 501);
  const env = entorno({ AI: iaFalsa('{}') });
  assert.equal((await peticion(env, '/api/ocr', { imagen: FOTO }, 'malo')).status, 401);
  assert.equal((await peticion(env, '/api/ocr', {})).status, 400);
  assert.equal((await peticion(env, '/api/ocr', { imagen: 'data:image/jpeg;base64,' + 'A'.repeat(900_001) })).status, 400);
});

test('ocr: usa Llama 3.2 Vision por defecto, le manda la foto y las reglas, y devuelve la lectura sin la fecha de la DIAN', async () => {
  const llamadas: { modelo: string; entrada: unknown }[] = [];
  const respuesta = '{"monto": 50060, "fecha": "2016-12-26", "comercio": "D1 SAS", "categoria": "mercado"}';
  const env = entorno({ AI: { run: async (modelo: string, entrada: unknown) => { llamadas.push({ modelo, entrada }); return { response: respuesta }; } } });
  const r = await peticion(env, '/api/ocr', { imagen: FOTO });
  assert.equal(r.status, 200);
  assert.deepEqual(((await r.json()) as { lectura: unknown }).lectura, { monto: 50060, fecha: null, comercio: 'D1 SAS', categoria: 'mercado' });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].modelo, '@cf/meta/llama-3.2-11b-vision-instruct');
  const contenido = (llamadas[0].entrada as { messages: { content: { type: string; text?: string; image_url?: { url: string } }[] }[] }).messages[0].content;
  assert.match(contenido[0].text!, /DIAN/);
  assert.equal(contenido[1].image_url!.url, FOTO);
});

test('ocr: IA_OCR_MODELO cambia el modelo sin tocar el código', async () => {
  let modelo = '';
  const env = entorno({ IA_OCR_MODELO: '@cf/otro/modelo', AI: { run: async (m: string) => { modelo = m; return { response: '{"monto": 1000}' }; } } });
  assert.equal((await peticion(env, '/api/ocr', { imagen: FOTO })).status, 200);
  assert.equal(modelo, '@cf/otro/modelo');
});

test('ocr: si el modelo no acepta el formato de mensajes, se reintenta con prompt e imagen', async () => {
  const formas: string[] = [];
  const env = entorno({ AI: { run: async (_m: string, entrada: Record<string, unknown>) => {
    formas.push('messages' in entrada ? 'mensajes' : 'prompt');
    if ('messages' in entrada) throw new Error('entrada no valida');
    return { description: '{"monto": 9000, "comercio": "Tienda"}' };
  } } });
  const r = await peticion(env, '/api/ocr', { imagen: FOTO });
  assert.equal(r.status, 200);
  assert.deepEqual(formas, ['mensajes', 'prompt']);
});

test('ocr: la licencia de Meta pendiente da un 503 con el motivo claro, y un fallo cualquiera un 502', async () => {
  const licencia = entorno({ AI: { run: async () => { throw new Error('5016: Model Agreement: please agree to the license'); } } });
  const r = await peticion(licencia, '/api/ocr', { imagen: FOTO });
  assert.equal(r.status, 503);
  assert.match(((await r.json()) as { error: string }).error, /licencia/);
  const caido = entorno({ AI: { run: async () => { throw new Error('caído'); } } });
  assert.equal((await peticion(caido, '/api/ocr', { imagen: FOTO })).status, 502);
});

test('ocr: si no se lee un monto responde 422, cuenta contra el tope diario y respeta el interruptor', async () => {
  const env = entorno({ AI: iaFalsa('no veo nada'), IA_TOPE: '2' });
  assert.equal((await peticion(env, '/api/ocr', { imagen: FOTO })).status, 422);
  assert.equal((await peticion(env, '/api/ocr', { imagen: FOTO })).status, 422);
  assert.equal((await peticion(env, '/api/ocr', { imagen: FOTO })).status, 429);
  const apagada = entorno({ AI: iaFalsa('{}') });
  await new D1Repo(apagada.DB).setConfig('ia', '0');
  assert.equal((await peticion(apagada, '/api/ocr', { imagen: FOTO })).status, 403);
});
