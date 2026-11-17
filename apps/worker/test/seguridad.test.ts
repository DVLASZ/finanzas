/** Cabeceras de seguridad, comparación de tokens y límite de peticiones del Worker. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import worker, { type Env } from '../src/index.ts';
import { igualesSeguro } from '../src/comun.ts';
import { CABECERAS_SEGURAS, Limitador, reiniciarLimites } from '../src/seguridad.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const entorno = (): Env => ({ DB: crearD1(), API_TOKEN: 'token-api-largo-y-secreto', ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } });
const pedir = (env: Env, ruta: string, token: string, ip?: string) => worker.fetch(new Request(`https://x.workers.dev${ruta}`, {
  headers: { Authorization: `Bearer ${token}`, ...(ip ? { 'CF-Connecting-IP': ip } : {}) },
}), env);

test('todas las respuestas llevan las cabeceras de seguridad, también la página y los errores', async () => {
  const env = entorno();
  for (const r of [await worker.fetch(new Request('https://x.workers.dev/'), env), await pedir(env, '/api/salud', 'mal'), await pedir(env, '/api/salud', 'token-api-largo-y-secreto')]) {
    for (const [k, v] of Object.entries(CABECERAS_SEGURAS)) assert.equal(r.headers.get(k), v, k);
  }
});

test('la política de contenido no permite scripts en línea ni marcos de otras páginas', () => {
  const csp = CABECERAS_SEGURAS['Content-Security-Policy'];
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp.split(';').find(x => x.includes('script-src')) ?? '', /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.equal(CABECERAS_SEGURAS['X-Frame-Options'], 'DENY');
  assert.equal(CABECERAS_SEGURAS['X-Content-Type-Options'], 'nosniff');
  assert.equal(CABECERAS_SEGURAS['Referrer-Policy'], 'no-referrer');
  assert.match(CABECERAS_SEGURAS['Strict-Transport-Security'], /max-age=\d+/);
});

test('la página de la app no trae scripts en línea (la política los bloquearía)', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc=/, `script en línea: <script${m[1]}>`);
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'manejadores en línea (onclick...)');
});

test('comparación de tokens: igual solo si son idénticos, sin importar el largo', () => {
  assert.equal(igualesSeguro('abc', 'abc'), true);
  assert.equal(igualesSeguro('abc', 'abd'), false);
  assert.equal(igualesSeguro('abc', 'abcd'), false);
  assert.equal(igualesSeguro('abcd', 'abc'), false);
  assert.equal(igualesSeguro('', 'a'), false);
});

test('el limitador cuenta por ventana y libera con el tiempo', () => {
  const l = new Limitador(3, 1000);
  assert.deepEqual([1, 2, 3, 4].map(i => l.anotar('a', i * 10)), [true, true, true, false]);
  assert.equal(l.anotar('b', 50), true, 'otra conexión no se afecta');
  assert.equal(l.lleno('a', 60), true);
  assert.equal(l.esperaS('a', 60), 1);
  assert.equal(l.lleno('a', 2000), false, 'pasó la ventana');
});

test('8 tokens equivocados bloquean esa conexión, y aunque después acierte espera', async () => {
  reiniciarLimites();
  const env = entorno();
  for (let i = 0; i < 8; i++) assert.equal((await pedir(env, '/api/salud', `mal${i}`, '1.2.3.4')).status, 401);
  const r = await pedir(env, '/api/salud', 'token-api-largo-y-secreto', '1.2.3.4');
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('Retry-After')) >= 1);
  assert.equal((await pedir(env, '/api/salud', 'token-api-largo-y-secreto', '5.6.7.8')).status, 200, 'otra conexión sigue entrando');
  reiniciarLimites();
});

test('la IA y los comprobantes tienen su propio tope por minuto', async () => {
  reiniciarLimites();
  const env = entorno();
  let ultimo = 0;
  for (let i = 0; i < 14; i++) {
    const r = await worker.fetch(new Request('https://x.workers.dev/api/interpretar', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer token-api-largo-y-secreto', 'CF-Connecting-IP': '9.9.9.9' } }), env);
    ultimo = r.status;
  }
  assert.equal(ultimo, 429);
  reiniciarLimites();
});
