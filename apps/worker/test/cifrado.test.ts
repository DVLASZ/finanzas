/** El respaldo con contraseña: AES-GCM con clave PBKDF2, y los respaldos viejos sin cifrar siguen sirviendo. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cifrarRespaldo, descifrarRespaldo, estaCifrado, FORMATO_CIFRADO } from '../../web/src/services/cifrado.ts';

const respaldo = JSON.stringify({ version: 1, datos: { movimientos: [{ descripcion: 'Almuerzo <b>x</b>' }] } });

test('cifra y descifra con la misma contraseña, y el archivo no deja ver el contenido', async () => {
  const c = await cifrarRespaldo(respaldo, 'una contraseña larga');
  assert.equal(estaCifrado(c), true);
  assert.doesNotMatch(c, /Almuerzo|movimientos/);
  const j = JSON.parse(c);
  assert.equal(j.formato, FORMATO_CIFRADO);
  assert.equal(j.vueltas, 600000);
  assert.equal(await descifrarRespaldo(c, 'una contraseña larga'), respaldo);
});

test('cada archivo lleva su sal y su vector: el mismo texto no sale igual dos veces', async () => {
  const a = JSON.parse(await cifrarRespaldo(respaldo, 'clave-de-prueba'));
  const b = JSON.parse(await cifrarRespaldo(respaldo, 'clave-de-prueba'));
  assert.notEqual(a.sal, b.sal);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.datos, b.datos);
});

test('una contraseña equivocada o un archivo tocado no se abren', async () => {
  const c = await cifrarRespaldo(respaldo, 'clave-correcta-1');
  await assert.rejects(() => descifrarRespaldo(c, 'clave-correcta-2'), /Contraseña incorrecta/);
  const j = JSON.parse(c);
  const roto = Buffer.from(j.datos, 'base64'); roto[0] ^= 1;
  await assert.rejects(() => descifrarRespaldo(JSON.stringify({ ...j, datos: roto.toString('base64') }), 'clave-correcta-1'), /Contraseña incorrecta|dañado/);
  await assert.rejects(() => descifrarRespaldo(JSON.stringify({ ...j, vueltas: 1 }), 'clave-correcta-1'), /no es válida/);
});

test('un respaldo viejo (sin cifrar) no se confunde con uno cifrado', () => {
  assert.equal(estaCifrado(respaldo), false);
  assert.equal(estaCifrado('esto no es json'), false);
});
