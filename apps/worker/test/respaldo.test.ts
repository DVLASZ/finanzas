/** La copia de seguridad semanal: cifrada y a un repositorio privado de GitHub. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cifrar, descifrar, respaldarEnGitHub } from '../src/respaldo.ts';

const datos = { cuentas: [{ id: 'efectivo' }], movimientos: [{ id: 'm1', descripcion: 'Almuerzo secreto' }] };
const repo = { cargar: async () => datos };

test('cifrar y descifrar devuelven lo mismo, y con otra clave no abre', async () => {
  const c = await cifrar('hola mundo', 'clave-larga-de-prueba');
  assert.doesNotMatch(c, /hola mundo/);
  assert.equal(await descifrar(c, 'clave-larga-de-prueba'), 'hola mundo');
  await assert.rejects(() => descifrar(c, 'otra-clave'));
  // dos cifrados del mismo texto no son iguales (IV al azar)
  assert.notEqual(await cifrar('hola mundo', 'clave-larga-de-prueba'), c);
});

test('un respaldo grande (cientos de KB) también se cifra y se abre', async () => {
  const grande = JSON.stringify({ movs: Array.from({ length: 6000 }, (_, i) => ({ id: `m${i}`, d: 'almuerzo con la familia' })) });
  assert.ok(grande.length > 250_000);
  assert.equal(await descifrar(await cifrar(grande, 'clave-larga-de-prueba'), 'clave-larga-de-prueba'), grande);
});

test('respaldo: sin las tres variables no hace nada', async () => {
  for (const env of [{}, { RESPALDO_TOKEN: 't', RESPALDO_REPO: 'a/b' }, { RESPALDO_TOKEN: 't', RESPALDO_CLAVE: 'una-clave-larga-123' }]) {
    const r = await respaldarEnGitHub(env, repo, new Date('2026-11-08T13:00:00Z'), async () => { throw new Error('no debía llamar a nadie'); });
    assert.equal(r.hecho, false);
  }
});

test('respaldo: sube un archivo cifrado con la fecha y no deja los datos a la vista', async () => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const falso = async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ content: { path: 'x' } }), { status: 201 });
  };
  const env = { RESPALDO_TOKEN: 'ghp_falso', RESPALDO_REPO: 'julio/respaldos-privados', RESPALDO_CLAVE: 'una-clave-larga-123', RESPALDO_NOMBRE: 'familia' };
  const r = await respaldarEnGitHub(env, repo, new Date('2026-11-08T13:00:00Z'), falso as typeof fetch);
  assert.equal(r.hecho, true);
  assert.equal(r.ruta, 'familia/2026-11-08.json.cifrado');
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, 'https://api.github.com/repos/julio/respaldos-privados/contents/familia/2026-11-08.json.cifrado');
  assert.equal(llamadas[0].init.method, 'PUT');
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, 'Bearer ghp_falso');
  const cuerpo = JSON.parse(String(llamadas[0].init.body)) as { content: string; message: string };
  assert.doesNotMatch(cuerpo.message, /secreto/);
  const cifrado = Buffer.from(cuerpo.content, 'base64').toString('utf8');
  assert.doesNotMatch(cifrado, /Almuerzo secreto/);
  assert.match(await descifrar(cifrado, 'una-clave-larga-123'), /Almuerzo secreto/);
});

test('respaldo: si GitHub responde error, lo dice sin imprimir el token', async () => {
  const env = { RESPALDO_TOKEN: 'ghp_falso', RESPALDO_REPO: 'a/b', RESPALDO_CLAVE: 'una-clave-larga-123' };
  const r = await respaldarEnGitHub(env, repo, new Date('2026-11-08T13:00:00Z'), (async () => new Response('{"message":"Bad credentials"}', { status: 401 })) as typeof fetch);
  assert.equal(r.hecho, false);
  assert.match(r.motivo ?? '', /401/);
  assert.doesNotMatch(JSON.stringify(r), /ghp_falso/);
});
