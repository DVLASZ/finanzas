/** Renombrar o quitar etiquetas, reglas pausadas y atajos ocultos. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buscarRegla, editarRegla, leerReglas, limpiarAtajos, reemplazarEtiqueta, reglaParaFrase, reglaSugerida, serializarReglas,
} from '../src/index.ts';
import type { Cuenta } from '../src/index.ts';

test('reemplazarEtiqueta: renombra, fusiona sin duplicar, quita y respeta el tope', () => {
  assert.equal(reemplazarEtiqueta('viaje claude', 'viaje', 'paseo'), 'paseo claude');
  assert.equal(reemplazarEtiqueta('viaje paseo', 'viaje', 'paseo'), 'paseo');
  assert.equal(reemplazarEtiqueta('viaje', 'viaje', null), null);
  assert.equal(reemplazarEtiqueta('viaje claude', 'viaje', null), 'claude');
  assert.equal(reemplazarEtiqueta('claude', 'viaje', 'paseo'), 'claude');
  assert.equal(reemplazarEtiqueta('#Viaje', 'viaje', '#Paseo'), 'paseo');
  assert.equal(reemplazarEtiqueta(null, 'viaje', 'paseo'), null);
  // ya tiene 5 y se fusiona con una nueva: sigue en 5 porque reemplaza, no suma
  assert.equal(reemplazarEtiqueta('a b c d e', 'a', 'f'), 'f b c d e');
  assert.throws(() => reemplazarEtiqueta('a b c d e', 'a', 'mala!'));
  assert.throws(() => reemplazarEtiqueta('a', 'a', 'x'.repeat(30)));
});

const cuentas = [{ id: 'nequi', nombre: 'Nequi', tipo: 'dinero', moneda: 'COP' }] as unknown as Cuenta[];

test('reglas pausadas no se aplican ni se ofrecen de nuevo', () => {
  const base = { id: 'r-laura', clave: 'laura', cuentaId: 'nequi', creada: '2026-10-19 15:00:00' };
  const lista = editarRegla([base], 'r-laura', { pausada: true });
  assert.equal(lista[0].pausada, true);
  assert.equal(buscarRegla(lista, 'pago a laura 5000'), null);
  const config = { reglas_aprendidas: serializarReglas(lista) };
  assert.equal(leerReglas(config)[0].pausada, true);
  assert.equal(reglaParaFrase(config, cuentas, 'laura 5000'), null);
  const activa = editarRegla(lista, 'r-laura', { pausada: false });
  assert.equal(activa[0].pausada, undefined);
  assert.equal(buscarRegla(activa, 'pago a laura')?.id, 'r-laura');
  assert.equal(typeof reglaSugerida, 'function');
});

test('editarRegla cambia la clave sin tocar el id', () => {
  const l = editarRegla([{ id: 'r-laura', clave: 'laura', creada: 'x' }], 'r-laura', { clave: 'Laura Gómez' });
  assert.equal(l[0].clave, 'laura gomez');
  assert.equal(l[0].id, 'r-laura');
});

test('limpiarAtajos conserva oculto', () => {
  const r = limpiarAtajos([{ id: 'a', frase: 'pasaje 2800', oculto: true }, { id: 'b', frase: 'mecato 2000', oculto: 'si' }, { id: 'c', frase: 'jornal' }]);
  assert.equal(r[0].oculto, true);
  assert.equal(r[1].oculto, undefined);
  assert.equal(r[2].oculto, undefined);
});
