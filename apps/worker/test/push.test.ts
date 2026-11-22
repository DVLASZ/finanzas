/**
 * Avisos al celular. El cifrado se comprueba con un "celular" armado con el módulo crypto de Node,
 * que es otro código distinto al que usa el Worker: si los dos se entienden, el cifrado está bien.
 */
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { test } from 'node:test';
import { construirMovimiento, contextoDe, CUENTAS_INICIALES, interpretar, procesar, type Op } from '../../../packages/core/src/index.ts';
import { D1Repo } from '../src/d1repo.ts';
import worker, { avisarAlCelular, type Env } from '../src/index.ts';
import { avisarFotos } from '../src/avisos.ts';
import { aBase64Url, cabeceraVapid, cifrarAviso, crearLlavesVapid, deBase64Url, suscripcionValida, type Suscripcion } from '../src/push.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

/** Un celular de mentira: tiene sus llaves y sabe abrir un aviso. */
function celular() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const suscripcion: Suscripcion = {
    endpoint: 'https://push.ejemplo.test/abc123',
    keys: { p256dh: aBase64Url(ecdh.getPublicKey()), auth: aBase64Url(auth) },
  };
  const abrir = (cuerpo: Uint8Array): string => {
    const salt = cuerpo.slice(0, 16);
    assert.equal(new DataView(cuerpo.buffer, cuerpo.byteOffset).getUint32(16), 4096);
    const idlen = cuerpo[20];
    assert.equal(idlen, 65);
    const asPublica = cuerpo.slice(21, 21 + idlen);
    const cifrado = cuerpo.slice(21 + idlen);
    const secreto = ecdh.computeSecret(asPublica);
    const uaPublica = ecdh.getPublicKey();
    const ikm = Buffer.from(hkdfSync('sha256', secreto, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublica, asPublica]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(Buffer.from(cifrado.slice(-16)));
    const claro = Buffer.concat([d.update(cifrado.slice(0, -16)), d.final()]);
    assert.equal(claro[claro.length - 1], 2, 'el último byte marca el último bloque');
    return claro.subarray(0, -1).toString('utf8');
  };
  return { suscripcion, abrir };
}

test('push: el aviso cifrado por el Worker lo abre el celular (con tildes y todo)', async () => {
  const c = celular();
  const texto = JSON.stringify({ titulo: 'Un aviso', cuerpo: 'Tu deuda con Ana vence mañana. ¡Ojo!' });
  assert.equal(c.abrir(await cifrarAviso(texto, c.suscripcion)), texto);
});

test('push: cada aviso se cifra distinto (sal y llave nuevas) y otro celular no lo puede abrir', async () => {
  const c = celular();
  const otro = celular();
  const a = await cifrarAviso('hola', c.suscripcion);
  const b = await cifrarAviso('hola', c.suscripcion);
  assert.notDeepEqual(a, b);
  assert.throws(() => otro.abrir(a));
});

test('push: la firma VAPID se verifica con la llave pública que se le da al navegador', async () => {
  const llaves = await crearLlavesVapid();
  const cab = await cabeceraVapid('https://push.ejemplo.test/abc123', llaves, 1_800_000_000_000);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(cab);
  assert.ok(m, cab);
  assert.equal(m[4], llaves.publica);
  const crudo = deBase64Url(llaves.publica);
  assert.equal(crudo.length, 65);
  const publica = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: aBase64Url(crudo.slice(1, 33)), y: aBase64Url(crudo.slice(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: publica, dsaEncoding: 'ieee-p1363' }, Buffer.from(deBase64Url(m[3]))));
  const datos = JSON.parse(Buffer.from(deBase64Url(m[2])).toString()) as { aud: string; exp: number };
  assert.equal(datos.aud, 'https://push.ejemplo.test');
  assert.equal(datos.exp, 1_800_000_000 + 12 * 3600);
});

test('push: suscripcionValida rechaza lo raro', () => {
  const buena = celular().suscripcion;
  assert.equal(suscripcionValida(buena), true);
  for (const mala of [null, {}, { endpoint: 'http://inseguro.test/x', keys: buena.keys }, { endpoint: buena.endpoint }, { endpoint: buena.endpoint, keys: { p256dh: 1, auth: 2 } }, { endpoint: 'https://x.test/' + 'a'.repeat(700), keys: buena.keys }]) {
    assert.equal(suscripcionValida(mala), false, JSON.stringify(mala));
  }
});

// ---------------------------------------------------------------- rutas y tarea diaria

const entorno = (): Env => ({ DB: crearD1(), API_TOKEN: 'token-api' });
const llamar = (env: Env, ruta: string, cuerpo?: unknown, metodo = cuerpo === undefined ? 'GET' : 'POST') =>
  worker.fetch(new Request(`https://x.workers.dev${ruta}`, {
    method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    headers: { Authorization: 'Bearer token-api', 'Content-Type': 'application/json' },
  }), env);

/** Cambia fetch por uno que anota las llamadas y responde con el estado pedido. */
async function conRed<T>(estado: number, fn: (llamadas: { url: string; headers: Record<string, string> }[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const llamadas: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), headers: init?.headers as Record<string, string> });
    return new Response(null, { status: estado });
  }) as typeof fetch;
  try { return await fn(llamadas); } finally { globalThis.fetch = original; }
}

test('push: la clave pública es siempre la misma y no sale ninguna llave privada en los datos', async () => {
  const env = entorno();
  const a = ((await (await llamar(env, '/api/push/clave')).json()) as { clave: string }).clave;
  const b = ((await (await llamar(env, '/api/push/clave')).json()) as { clave: string }).clave;
  assert.equal(a, b);
  assert.equal(deBase64Url(a).length, 65);
  const celu = celular().suscripcion;
  await llamar(env, '/api/push/suscribir', { suscripcion: celu });
  const datos = JSON.stringify(await (await llamar(env, '/api/datos')).json());
  assert.equal(datos.includes('secreto_'), false);
  assert.equal(datos.includes('"d":'), false, 'la llave privada no viaja a la app');
  assert.equal(datos.includes(celu.endpoint), false);
});

test('push: suscribir, repetir no duplica, rechazar basura y dar de baja', async () => {
  const env = entorno();
  const celu = celular().suscripcion;
  assert.equal((await llamar(env, '/api/push/suscribir', { suscripcion: celu })).status, 200);
  assert.equal((await llamar(env, '/api/push/suscribir', { suscripcion: celu })).status, 200);
  assert.equal((await llamar(env, '/api/push/suscribir', { suscripcion: { endpoint: 'x' } })).status, 400);
  const repo = new D1Repo(env.DB);
  assert.equal((await repo.leerSecreto<Suscripcion[]>('suscripciones'))!.length, 1);
  await llamar(env, '/api/push/baja', { endpoint: celu.endpoint });
  assert.equal((await repo.leerSecreto<Suscripcion[]>('suscripciones'))!.length, 0);
  assert.equal((await worker.fetch(new Request('https://x.workers.dev/api/push/clave'), env)).status, 401);
});

test('push: la prueba manda un aviso cifrado con la firma del servidor', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const r = await conRed(201, async llamadas => {
    const resp = (await (await llamar(env, '/api/push/probar', {})).json()) as { enviados: number; suscritos: number };
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, c.suscripcion.endpoint);
    assert.match(llamadas[0].headers.Authorization, /^vapid t=.+, k=.+$/);
    assert.equal(llamadas[0].headers['Content-Encoding'], 'aes128gcm');
    return resp;
  });
  assert.deepEqual(r, { enviados: 1, suscritos: 1 });
});

/** Una instalación con un tope superado y un gasto viejo: a los 7 días hay un aviso de días sin anotar. El tope no cuenta. */
const SIETE_DIAS = new Date(AHORA.getTime() + 7 * 86400000);
async function conAlerta(env: Env) {
  const ctx = contextoDe({ cuentas: structuredClone(CUENTAS_INICIALES), movimientos: [], compromisos: [], atajos: [], aprendido: {}, presupuestos: {}, config: {} }, AHORA);
  const r = interpretar('mecato 5000', ctx);
  if (r.clase !== 'movimiento') throw new Error('no es movimiento');
  const h = construirMovimiento(r.propuesta, ctx, new Map(), crypto.randomUUID(), 'app');
  const ops: Op[] = [{ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos }];
  await llamar(env, '/api/sync', { ops });
  await new D1Repo(env.DB).setPresupuesto('cat:mecato', 3000);
}

test('push: la tarea diaria avisa si hay algo, y no molesta si no hay nada', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  await conRed(201, async llamadas => {
    assert.deepEqual(await avisarAlCelular(env, AHORA), { enviados: 0, quitados: 0 });
    assert.equal(llamadas.length, 0, 'sin alertas no se manda nada');
    await conAlerta(env);
    assert.deepEqual(await avisarAlCelular(env, SIETE_DIAS), { enviados: 1, quitados: 0 });
    assert.equal(llamadas.length, 1);
  });
});

test('push: un celular dado de baja por el servicio de avisos (410) se quita de la lista', async () => {
  const env = entorno();
  await llamar(env, '/api/push/suscribir', { suscripcion: celular().suscripcion });
  await conAlerta(env);
  await conRed(410, async () => {
    assert.deepEqual(await avisarAlCelular(env, SIETE_DIAS), { enviados: 0, quitados: 1 });
  });
  assert.equal((await new D1Repo(env.DB).leerSecreto<Suscripcion[]>('suscripciones'))!.length, 0);
});

test('push: si el servicio de avisos falla (500) el celular se conserva para mañana', async () => {
  const env = entorno();
  await llamar(env, '/api/push/suscribir', { suscripcion: celular().suscripcion });
  await conAlerta(env);
  await conRed(500, async () => {
    assert.deepEqual(await avisarAlCelular(env, SIETE_DIAS), { enviados: 0, quitados: 0 });
  });
  assert.equal((await new D1Repo(env.DB).leerSecreto<Suscripcion[]>('suscripciones'))!.length, 1);
});

// ---------------------------------------------------------------- avisos de la tarde, topes al momento, buzón y respaldo

/** Cuerpos de los avisos que salieron, abiertos con las llaves del celular de mentira. */
async function conAvisos<T>(c: ReturnType<typeof celular>, fn: (textos: string[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const textos: string[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    textos.push(c.abrir(new Uint8Array(init?.body as ArrayBuffer)));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try { return await fn(textos); } finally { globalThis.fetch = original; }
}

test('push de la tarde: pregunta por la billetera si hubo movimientos hoy, y calla de mañana', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const repo = new D1Repo(env.DB);
  await procesar(repo, { texto: 'saldo inicial efectivo 100000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA);
  await procesar(repo, { texto: 'mecato 5000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA);
  const seisPm = new Date(AHORA.getTime() + 2.5 * 3600000); // 6:12 pm en Colombia
  await conAvisos(c, async textos => {
    assert.deepEqual(await avisarAlCelular(env, seisPm, 'manana'), { enviados: 0, quitados: 0 });
    assert.equal(textos.length, 0, 'de mañana no hay cierre del día');
    assert.deepEqual(await avisarAlCelular(env, seisPm, 'tarde'), { enviados: 1, quitados: 0 });
    const a = JSON.parse(textos[0]) as { titulo: string; cuerpo: string };
    assert.equal(a.titulo, 'Cuenta la billetera');
    assert.match(a.cuerpo, /tienes \$95\.000 en efectivo/);
  });
});

test('push de la tarde: si ya contó la billetera hoy, no insiste', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const repo = new D1Repo(env.DB);
  const t = (s: string) => procesar(repo, { texto: s }, AHORA);
  await t('saldo inicial efectivo 100000'); await procesar(repo, { boton: 'ok' }, AHORA);
  await t('mecato 5000'); await procesar(repo, { boton: 'ok' }, AHORA);
  await t('arqueo efectivo 95000 monedas 0'); await procesar(repo, { boton: 'ok' }, AHORA);
  await conAvisos(c, async textos => {
    await avisarAlCelular(env, new Date(AHORA.getTime() + 2.5 * 3600000), 'tarde');
    assert.equal(textos.length, 0);
  });
});

test('push: un tope que llega al 80 % o al 100 % ya no avisa al celular, ni al momento ni por la mañana', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  await new D1Repo(env.DB).setPresupuesto('cat:mecato', 10000);
  const gasto = async (texto: string) => {
    const ctx = contextoDe(await new D1Repo(env.DB).cargar(), new Date());
    const r = interpretar(texto, ctx);
    if (r.clase !== 'movimiento') throw new Error('no es movimiento');
    const h = construirMovimiento(r.propuesta, ctx, new Map(), crypto.randomUUID(), 'app');
    await llamar(env, '/api/sync', { ops: [{ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos } satisfies Op] });
  };
  await conAvisos(c, async textos => {
    await gasto('mecato 8500');
    await gasto('mecato 3000');
    assert.equal(textos.length, 0, 'al 85 % y al 115 % no sale ningún aviso al momento');
    assert.deepEqual(await avisarAlCelular(env, new Date(), 'manana'), { enviados: 0, quitados: 0 });
    assert.equal(textos.length, 0, 'la tarea de la mañana tampoco menciona topes');
  });
});

test('push: un giro que llega por el buzón avisa al celular', async () => {
  const env: Env = { ...entorno(), BUZON_CLAVE: 'clave-buzon' };
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  await conAvisos(c, async textos => {
    const r = await worker.fetch(new Request('https://x.workers.dev/api/buzon', {
      method: 'POST', headers: { Authorization: 'Bearer clave-buzon', 'Content-Type': 'application/json' },
      body: JSON.stringify({ de: 'Mamá', monto: 150000, concepto: 'Para el arriendo' }),
    }), env);
    assert.equal(r.status, 200);
    assert.match(textos[0], /Aviso de Mamá/);
    assert.match(textos[0], /\$150\.000 · Para el arriendo/);
  });
});

test('push: si el respaldo del domingo falla, se avisa; si está apagado, se calla', async () => {
  const c = celular();
  const domingo = new Date('2026-11-08T13:00:00Z');
  const real = globalThis.Date;
  // el cron usa la hora de ahora: se fija un domingo para esta prueba
  globalThis.Date = class extends real { constructor(...a: unknown[]) { super(...((a.length ? a : [domingo.getTime()]) as [number])); } static override now() { return domingo.getTime(); } } as DateConstructor;
  try {
    const apagado = entorno();
    await llamar(apagado, '/api/push/suscribir', { suscripcion: c.suscripcion });
    await conAvisos(c, async textos => { await worker.scheduled({}, apagado); assert.equal(textos.length, 0); });
    const roto: Env = { ...entorno(), RESPALDO_TOKEN: 't', RESPALDO_REPO: 'a/b', RESPALDO_CLAVE: 'una-clave-larga-123' };
    await llamar(roto, '/api/push/suscribir', { suscripcion: c.suscripcion });
    const original = globalThis.fetch;
    const textos: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('https://api.github.com')) return new Response(null, { status: 401 });
      textos.push(c.abrir(new Uint8Array(init?.body as ArrayBuffer)));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    try { await worker.scheduled({}, roto); } finally { globalThis.fetch = original; }
    assert.match(textos.join('\n'), /La copia de seguridad falló/);
    assert.match(textos.join('\n'), /GitHub respondió 401/);
  } finally { globalThis.Date = real; }
});

test('el cron de las 6 pm (23:00 UTC) manda el aviso de la tarde y el de las 8 am no', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const repo = new D1Repo(env.DB);
  await procesar(repo, { texto: 'saldo inicial efectivo 100000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA);
  await procesar(repo, { texto: 'mecato 5000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA);
  const conHora = async (iso: string, textos: string[]) => {
    const real = globalThis.Date;
    const fijo = new real(iso).getTime();
    globalThis.Date = class extends real { constructor(...a: unknown[]) { super(...((a.length ? a : [fijo]) as [number])); } static override now() { return fijo; } } as DateConstructor;
    try { await worker.scheduled({}, env); } finally { globalThis.Date = real; }
    return textos.length;
  };
  await conAvisos(c, async textos => {
    assert.equal(await conHora('2026-10-19T13:00:00Z', textos), 0, 'a las 8 am no hay cierre del día');
    assert.equal(await conHora('2026-10-19T23:00:00Z', textos), 1);
    assert.match(textos[0], /Cuenta la billetera/);
  });
});

test('push al momento: una meta de ahorro que llega a su valor avisa una vez', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const poner = (apartado: number) => llamar(env, '/api/sync', { ops: [{ op: 'config', clave: 'metas', valor: JSON.stringify([{ nombre: 'Moto', meta: 100000, apartado }]) } satisfies Op] });
  await conAvisos(c, async textos => {
    await poner(60000);
    assert.equal(textos.length, 0);
    await poner(100000);
    assert.equal(textos.length, 1);
    assert.match(textos[0], /Llegaste a la meta Moto: \$100\.000 de \$100\.000/);
    await poner(120000);
    assert.equal(textos.length, 1, 'ya se avisó');
    await poner(50000); await poner(100000);
    assert.equal(textos.length, 2, 'bajó y volvió a llegar');
  });
});

test('push: las fotos que se acercan al límite avisan, como mucho una vez por semana', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const repo = new D1Repo(env.DB);
  const db = (env.DB as unknown as { db: { exec(s: string): void } }).db;
  db.exec("INSERT INTO fotos (movimiento_id, datos) VALUES ('m1', '" + 'A'.repeat(5000) + "')");
  await conAvisos(c, async textos => {
    assert.equal(await avisarFotos(repo, AHORA, 1_000_000), false, 'poco peso: no avisa');
    assert.equal(textos.length, 0);
    assert.equal(await avisarFotos(repo, AHORA, 1000), true);
    assert.match(textos[0], /Las fotos de recibos ya ocupan/);
    assert.equal(await avisarFotos(repo, new Date(AHORA.getTime() + 3 * 86400000), 1000), false, 'a los 3 días no repite');
    assert.equal(await avisarFotos(repo, new Date(AHORA.getTime() + 8 * 86400000), 1000), true, 'a los 8 días sí');
    assert.equal(textos.length, 2);
  });
});

test('recordatorio de la noche: avisa en la media hora elegida si hoy no se anotó nada, y calla si ya se anotó', async () => {
  const env = entorno();
  const c = celular();
  await llamar(env, '/api/push/suscribir', { suscripcion: c.suscripcion });
  const repo = new D1Repo(env.DB);
  await procesar(repo, { texto: 'saldo inicial efectivo 100000' }, AHORA); await procesar(repo, { boton: 'ok' }, AHORA);
  await llamar(env, '/api/sync', { ops: [{ op: 'config', clave: 'recordatorio', valor: '20:30' } satisfies Op] });
  const conHora = async (iso: string, textos: string[]) => {
    const real = globalThis.Date;
    const fijo = new real(iso).getTime();
    globalThis.Date = class extends real { constructor(...a: unknown[]) { super(...((a.length ? a : [fijo]) as [number])); } static override now() { return fijo; } } as DateConstructor;
    try { await worker.scheduled({}, env); } finally { globalThis.Date = real; }
    return textos.length;
  };
  await conAvisos(c, async textos => {
    // 01:31 UTC del 21 = 8:31 pm del 20 en Colombia; lo último anotado fue el 19
    assert.equal(await conHora('2026-10-21T01:31:00Z', textos), 1);
    assert.match(textos[0], /¿Anotaste los gastos de hoy\?/);
    assert.equal(await conHora('2026-10-21T00:01:00Z', textos), 1, 'a otra hora no manda más');
    await procesar(repo, { texto: 'mecato 5000' }, new Date('2026-10-21T00:30:00Z')); await procesar(repo, { boton: 'ok' }, new Date('2026-10-21T00:30:00Z'));
    assert.equal(await conHora('2026-10-21T01:31:00Z', textos), 1, 'si ya anotó hoy, calla');
  });
});
