/** Fotos de recibos en el servidor: subir, leer, reemplazar, borrar y los límites. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type Env } from '../src/index.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const entorno = (): Env => ({ DB: crearD1(), API_TOKEN: 't', API_TOKEN_LECTURA: 'solo-ver' });
const pedir = (env: Env, metodo: string, id: string, cuerpo?: Uint8Array, token = 't') =>
  worker.fetch(new Request(`https://x.workers.dev/api/foto/${id}`, { method: metodo, body: cuerpo as BodyInit | undefined, headers: { Authorization: `Bearer ${token}` } }), env);
const jpeg = (n: number) => { const b = new Uint8Array(n); b[0] = 0xff; b[1] = 0xd8; b.fill(7, 2); return b; };

test('foto: se sube, se lee igual, se reemplaza y se borra', async () => {
  const env = entorno();
  assert.equal((await pedir(env, 'GET', 'm1')).status, 404);
  assert.equal((await pedir(env, 'PUT', 'm1', jpeg(1000))).status, 200);
  const r = await pedir(env, 'GET', 'm1');
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), jpeg(1000));
  await pedir(env, 'PUT', 'm1', jpeg(2000));
  assert.equal((await (await pedir(env, 'GET', 'm1')).arrayBuffer()).byteLength, 2000);
  assert.equal((await pedir(env, 'DELETE', 'm1')).status, 200);
  assert.equal((await pedir(env, 'GET', 'm1')).status, 404);
});

test('foto: una de 200 KB (como las de la app) pasa; una enorme o que no es JPEG se rechaza', async () => {
  const env = entorno();
  assert.equal((await pedir(env, 'PUT', 'm1', jpeg(200_000))).status, 200);
  assert.equal((await pedir(env, 'PUT', 'm2', jpeg(400_000))).status, 413);
  assert.equal((await pedir(env, 'PUT', 'm3', new TextEncoder().encode('hola, no soy una foto'))).status, 400);
});

test('foto: sin token no entra, y el acceso de solo lectura no puede subir ni borrar', async () => {
  const env = entorno();
  assert.equal((await pedir(env, 'GET', 'm1', undefined, 'malo')).status, 401);
  assert.equal((await pedir(env, 'PUT', 'm1', jpeg(100), 'solo-ver')).status, 403);
  assert.equal((await pedir(env, 'DELETE', 'm1', undefined, 'solo-ver')).status, 403);
});

test('foto: un id raro no llega a la base', async () => {
  const env = entorno();
  assert.equal((await pedir(env, 'PUT', "a'%3Bdrop", jpeg(100))).status, 404);
});
