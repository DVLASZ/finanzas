/**
 * Una "D1 de mentira" sobre `node:sqlite`, para probar el código del Worker en tu PC sin nube.
 * Implementa solo lo que usa `D1Repo`: prepare/bind/all/first/run/batch.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { D1Like, D1Stmt } from '../apps/worker/src/d1repo.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface D1Prueba extends D1Like {
  db: DatabaseSync;
}

/** `semilla`: SQL de partida distinto al de siempre (por ejemplo el de otra plantilla). */
export function crearD1(semilla?: string): D1Prueba {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // D1 también las exige
  db.exec(readFileSync(join(raiz, 'db', 'schema.sql'), 'utf8'));
  db.exec(semilla ?? readFileSync(join(raiz, 'db', 'seed.sql'), 'utf8'));

  const sentencia = (sql: string, valores: unknown[] = []): D1Stmt & { ejecutar(): { changes: number } } => ({
    bind: (...v: unknown[]) => sentencia(sql, v.map(x => (x === undefined ? null : x))),
    all: async <T>() => ({ results: db.prepare(sql).all(...(valores as never[])) as unknown as T[] }),
    first: async <T>() => ((db.prepare(sql).get(...(valores as never[])) as unknown as T | undefined) ?? null),
    run: async () => {
      const r = db.prepare(sql).run(...(valores as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
    ejecutar: () => ({ changes: Number(db.prepare(sql).run(...(valores as never[])).changes) }),
  });

  return {
    db,
    prepare: sql => sentencia(sql),
    // Un batch de D1 es una transacción: o se aplican todas las sentencias o ninguna.
    batch: async stmts => {
      db.exec('BEGIN');
      try {
        const res = stmts.map(s => (s as ReturnType<typeof sentencia>).ejecutar());
        db.exec('COMMIT');
        return res;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
