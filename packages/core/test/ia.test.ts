/** La ayuda de la IA: instrucciones por instalación, limpieza de lo que devuelve y tope diario. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frasesDeRespuesta, instruccionesIA, MAX_FRASES_IA, MemoriaRepo, usoDeIA } from '../src/index.ts';

const datosDe = async (plantilla: string) => {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla);
  return repo.cargar();
};

test('las instrucciones hablan de las cuentas de esa app y de nada más', async () => {
  const familia = instruccionesIA(await datosDe('familia'));
  assert.match(familia, /Bancolombia/);
  assert.doesNotMatch(familia, /nequi|daviplata/i);
  assert.doesNotMatch(familia, /vendí/);
  const empresa = instruccionesIA(await datosDe('empresa'));
  assert.match(empresa, /vendí 3 botellas/);
  assert.match(empresa, /Insumos/);
  assert.doesNotMatch(empresa, /Descuadre/);
});

test('frasesDeRespuesta: acepta el objeto o el texto JSON y limpia', () => {
  assert.deepEqual(frasesDeRespuesta({ frases: ['almuerzo 12000', ' mecato   5000 '] }), ['almuerzo 12000', 'mecato 5000']);
  assert.deepEqual(frasesDeRespuesta('{"frases":["taxi 8000"]}'), ['taxi 8000']);
});

test('frasesDeRespuesta: lo raro da lista vacía o se recorta', () => {
  for (const malo of [null, undefined, 5, 'no es json', '{"otra":1}', { frases: 'x' }, { frases: [1, null] }, { frases: [''] }]) {
    assert.deepEqual(frasesDeRespuesta(malo), [], String(malo));
  }
  assert.deepEqual(frasesDeRespuesta({ frases: ['x'.repeat(200)] }), []);
  const muchas = Array.from({ length: 12 }, (_, i) => `gasto ${i + 1}000`);
  assert.equal(frasesDeRespuesta({ frases: muchas }).length, MAX_FRASES_IA);
});

test('usoDeIA: cuenta por día, se frena en el tope y vuelve a empezar al otro día', () => {
  assert.equal(usoDeIA(undefined, '2026-11-02', 2), '2026-11-02:1');
  assert.equal(usoDeIA('2026-11-02:1', '2026-11-02', 2), '2026-11-02:2');
  assert.equal(usoDeIA('2026-11-02:2', '2026-11-02', 2), null);
  assert.equal(usoDeIA('2026-11-02:2', '2026-11-03', 2), '2026-11-03:1');
  assert.equal(usoDeIA('basura', '2026-11-03', 2), '2026-11-03:1');
});
