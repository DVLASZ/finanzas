/**
 * Coherencia de los datos: la semilla en TypeScript debe coincidir con db/seed.sql, y el
 * diccionario debe categorizar bien los gastos reales del Excel.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATAJOS_INICIALES, categorizar, contextoDe, CUENTAS_INICIALES, interpretar, MemoriaRepo } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('la semilla de TypeScript coincide con db/seed.sql (mismas cuentas)', () => {
  const sql = readFileSync(join(raiz, 'db', 'seed.sql'), 'utf8');
  const idsSql = [...sql.matchAll(/^\s*\('([a-z:\-]+)',\s*'/gm)].map(m => m[1]).filter(id => !id.startsWith('pasaje'));
  const idsTs = CUENTAS_INICIALES.map(c => c.id);
  for (const id of idsTs) assert.ok(idsSql.includes(id), `falta ${id} en seed.sql`);
  for (const id of idsSql.filter(i => i !== 'pasaje')) assert.ok(idsTs.includes(id) || id === 'fecha_apertura' || id === 'moneda_base' || id === 'meta_ahorro_pct', `sobra ${id} en seed.sql`);
  assert.equal(ATAJOS_INICIALES[0].palabra, 'pasaje');
});

test('el diccionario categoriza conceptos reales de tus gastos', () => {
  const ctx = contextoDe(new MemoriaRepo().datos, AHORA);
  const casos: [string, string][] = [
    ['arepas', 'cat:comida'], ['empanadas', 'cat:comida'], ['pizza', 'cat:comida'], ['almuerzo', 'cat:comida'],
    ['mecato', 'cat:mecato'], ['galletas', 'cat:mecato'], ['mango', 'cat:mecato'], ['trident', 'cat:mecato'],
    ['moto terminal', 'cat:transporte'], ['taxi casa', 'cat:transporte'], ['bus casa rosada', 'cat:transporte'],
    ['recarga', 'cat:recargas'], ['compra juego steam', 'cat:juegos'],
    ['entrada cine', 'cat:salidas'], ['gokarts', 'cat:salidas'], ['peluqueada', 'cat:personal'],
    ['juego regalo cuco', 'cat:regalos'], ['materiales unilingua', 'cat:universidad'], ['compra audifonos', 'cat:compras'],
  ];
  for (const [texto, esperado] of casos) assert.equal(categorizar(texto, ctx), esperado, texto);
});

test('los conceptos reales del Excel nunca rompen el intérprete', () => {
  const ctx = contextoDe(new MemoriaRepo().datos, AHORA);
  const conceptos = ['Mecato', 'Pasaje Terminal', 'Moto Terminal', 'Taxi Casa', 'Salsa de Tomate y Lecherita', 'Compra Far Cry 5 (Steam)',
    'Entradas Cine Triple Entente', 'Comida Salida TE', 'Mantenimiento Cicla', 'Cocas y Salero', 'Compra No Man´s Sky Steam',
    'Carro Pisoje (Ed, Ivan, Daniel)', 'Compra Certificado Ivan', 'Perro Mona', 'Gatorade Gomez'];
  for (const c of conceptos) {
    for (const monto of ['5000', '12.500', '8k']) {
      const r = interpretar(`${c} ${monto}`, ctx);
      assert.ok(['movimiento', 'error'].includes(r.clase), `${c} ${monto}`);
    }
  }
});

test('el historial del Excel (si existe) cuadra con lo importado', { skip: !existsSync(join(raiz, 'importacion', 'historial.json')) }, () => {
  const h = JSON.parse(readFileSync(join(raiz, 'importacion', 'historial.json'), 'utf8')) as { asientos: { monto: number }[]; descripcion: string }[];
  assert.ok(h.length > 300);
  for (const m of h) assert.equal(m.asientos.reduce((s, a) => s + a.monto, 0), 0, m.descripcion);
  assert.ok(h.some(m => m.descripcion.includes('Joaquin')), 'Julián debe estar como gasto');
  assert.ok(!h.some(m => /^pr[eé]stamo/i.test(m.descripcion)), 'los préstamos viejos no se importan');
});
