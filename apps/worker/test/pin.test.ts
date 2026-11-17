/** El PIN de la app: resumen PBKDF2, compatibilidad con el de antes y espera creciente tras equivocarse. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../../web/src/services/estado.ts';
import { crearHashPin, esperaTrasFallos, intentarPin, pinCorrecto } from '../../web/src/services/seguridad.ts';

const sha = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finanzas:' + t)))].map(b => b.toString(16).padStart(2, '0')).join('');

test('la espera crece: dos errores gratis, luego 5 s, 15 s, 45 s... con tope de 15 minutos', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(esperaTrasFallos), [0, 0, 0, 5, 15, 45, 135, 900]);
});

test('el PIN nuevo se guarda con PBKDF2, sal propia, y solo el PIN correcto lo abre', async () => {
  const a = await crearHashPin('4321');
  const b = await crearHashPin('4321');
  assert.match(a, /^pbkdf2\$210000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'cada resumen lleva su propia sal');
  assert.ok(!a.includes('4321'));
  app.ajustes.pinHash = a;
  assert.equal(await pinCorrecto('4321'), true);
  assert.equal(await pinCorrecto('4322'), false);
});

test('un PIN guardado con el resumen de antes sigue sirviendo y se pasa al formato nuevo', async () => {
  app.ajustes.pinHash = await sha('9876');
  assert.equal(await pinCorrecto('1111'), false);
  assert.ok(!app.ajustes.pinHash.startsWith('pbkdf2$'));
  assert.equal(await pinCorrecto('9876'), true);
  assert.ok(app.ajustes.pinHash.startsWith('pbkdf2$'), 'quedó en el formato nuevo');
  assert.equal(await pinCorrecto('9876'), true);
});

test('equivocarse hace esperar, y durante la espera ni el PIN correcto entra', async () => {
  app.ajustes.pinHash = await crearHashPin('2468');
  const t0 = 1_000_000;
  assert.deepEqual(await intentarPin('0000', t0), { ok: false, esperaS: 0, intentosFallidos: 1 });
  assert.deepEqual(await intentarPin('0000', t0), { ok: false, esperaS: 0, intentosFallidos: 2 });
  const tercero = await intentarPin('0000', t0);
  assert.deepEqual(tercero, { ok: false, esperaS: 5, intentosFallidos: 3 });
  const durante = await intentarPin('2468', t0 + 1000);
  assert.equal(durante.ok, false, 'en plena espera ni el correcto entra');
  assert.equal(durante.ok === false && durante.esperaS, 4);
  assert.deepEqual(await intentarPin('2468', t0 + 6000), { ok: true });
  assert.deepEqual(await intentarPin('0000', t0 + 7000), { ok: false, esperaS: 0, intentosFallidos: 1 }, 'acertar reinicia la cuenta');
});
