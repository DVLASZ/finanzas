/** Las claves de las cuentas van sin tildes: semilla, plantillas, migración y consultas por nombre. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUENTAS_INICIALES, MemoriaRepo, PLANTILLAS, procesar, sqlDePlantilla } from '../src/index.ts';
import { AHORA } from '../../../tests/ayudas.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const leer = (...r: string[]) => readFileSync(join(raiz, ...r), 'utf8');
const conTilde = /[^\x00-\x7f]/;

function base(...scripts: string[]): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(leer('db', 'schema.sql'));
  for (const s of scripts) db.exec(s);
  return db;
}
const filas = (db: DatabaseSync, sql: string) => db.prepare(sql).all() as Record<string, unknown>[];

test('db/seed.sql y la plantilla personal dan las mismas cuentas, atajos y ajustes (claves incluidas)', () => {
  const a = base(leer('db', 'seed.sql'));
  const b = base(sqlDePlantilla('personal'));
  const cuentas = 'SELECT id, nombre, clave, tipo, moneda, en_disponible, fijo FROM cuentas ORDER BY id';
  assert.deepEqual(filas(a, cuentas), filas(b, cuentas));
  const atajos = 'SELECT palabra, concepto, monto, moneda, categoria_id, cuenta_id FROM atajos ORDER BY palabra';
  assert.deepEqual(filas(a, atajos), filas(b, atajos));
  const config = 'SELECT clave, valor FROM config ORDER BY clave';
  assert.deepEqual(filas(a, config), filas(b, config));
});

test('las tres plantillas se cargan en SQLite sin error y ninguna clave lleva tilde', () => {
  for (const id of Object.keys(PLANTILLAS)) {
    const db = base(sqlDePlantilla(id));
    const claves = filas(db, 'SELECT clave FROM cuentas').map(f => String(f.clave));
    assert.ok(claves.length > 5, id);
    for (const c of claves) assert.doesNotMatch(c, conTilde, `${id}: «${c}»`);
  }
  for (const c of CUENTAS_INICIALES) assert.doesNotMatch(c.clave, conTilde);
});

test('la migración 0007 quita las tildes y, si dos claves chocan, deja la más antigua y sufija la otra', () => {
  const db = base();
  const ins = db.prepare("INSERT INTO cuentas (id, nombre, clave, tipo, creada_en) VALUES (?, ?, ?, ?, ?)");
  ins.run('arq', 'Dólares', 'dólares', 'dinero', '2026-01-01 00:00:00');
  ins.run('alcancia', 'Alcancía', 'alcancía', 'dinero', '2026-01-01 00:00:00');
  ins.run('cat:tramites', 'Impuestos y trámites', 'impuestos y trámites', 'categoria', '2026-01-01 00:00:00');
  ins.run('per:nino', 'Niño', 'niño', 'persona', '2026-01-02 00:00:00');
  ins.run('per:nino-2', 'Nino', 'nino', 'persona', '2026-01-03 00:00:00'); // ya sin tilde y más nueva: choca con «niño»
  ins.run('cat:viejo', 'Cámara', 'cámara', 'categoria', '2026-01-01 00:00:00');
  ins.run('cat:nuevo', 'Camára', 'camára', 'categoria', '2026-02-01 00:00:00'); // dos con tilde: gana la antigua
  db.exec(leer('db', 'migrations', '0007_claves_sin_tilde.sql'));
  const clave = (id: string) => (db.prepare('SELECT clave FROM cuentas WHERE id = ?').get(id) as { clave: string }).clave;
  assert.equal(clave('arq'), 'dolares');
  assert.equal(clave('alcancia'), 'alcancia');
  assert.equal(clave('cat:tramites'), 'impuestos y tramites');
  // la persona con tilde es la más antigua, pero la otra ya estaba limpia: la de tilde se hace a un lado con -2
  assert.equal(clave('per:nino-2'), 'nino');
  assert.equal(clave('per:nino'), 'nino-2');
  assert.equal(clave('cat:viejo'), 'camara');
  assert.equal(clave('cat:nuevo'), 'camara-2');
  db.exec(leer('db', 'migrations', '0007_claves_sin_tilde.sql')); // repetirla no cambia nada
  assert.equal(clave('cat:nuevo'), 'camara-2');
  for (const f of filas(db, 'SELECT clave FROM cuentas')) assert.doesNotMatch(String(f.clave), conTilde);
});

async function responder(plantilla: string, texto: string): Promise<string> {
  const repo = new MemoriaRepo();
  repo.aplicarPlantilla(plantilla);
  const salidas = await procesar(repo, { texto }, AHORA);
  return salidas.map(s => s.texto).join('\n');
}

test('consultas por nombre en familia y empresa con cuentas que llevaban tilde', async () => {
  assert.match(await responder('familia', 'cuanto tengo en alcancia'), /Alcancía: \$/);
  assert.match(await responder('familia', 'cuanto tengo en la alcancía'), /Alcancía: \$/);
  assert.match(await responder('familia', 'cuanto tengo en bogota'), /Banco de Bogotá: \$/);
  assert.match(await responder('personal', 'cuanto tengo en dolares'), /Dólares: /);
  assert.match(await responder('empresa', 'gasto en impuestos y tramites'), /Impuestos y trámites: \$0/);
});
