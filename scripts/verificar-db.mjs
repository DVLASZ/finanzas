// Arma la base en memoria (esquema + semilla + importación) y comprueba que todo cuadre.
// Uso: node scripts/verificar-db.mjs

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(raiz, 'db', f), 'utf8');

const db = new DatabaseSync(':memory:');
db.exec(leer('schema.sql'));
db.exec(leer('seed.sql'));
if (existsSync(join(raiz, 'db', 'importacion.sql'))) db.exec(leer('importacion.sql'));

// las migraciones, aplicadas en orden, tienen que dejar las mismas tablas y vistas que schema.sql
const viaMigraciones = new DatabaseSync(':memory:');
for (const f of readdirSync(join(raiz, 'db', 'migrations')).sort()) viaMigraciones.exec(readFileSync(join(raiz, 'db', 'migrations', f), 'utf8'));
const objetos = d => d.prepare("SELECT type || ':' || name n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY 1").all().map(r => r.n).join(',');

const uno = (sql, ...args) => db.prepare(sql).get(...args);
const todos = sql => db.prepare(sql).all();
let fallos = 0;
const chequeo = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK ' : 'FALLA'}  ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) fallos++;
};

chequeo('Las migraciones dejan el mismo esquema que schema.sql', objetos(viaMigraciones) === objetos(db));

const esenciales = ['efectivo', 'monedas', 'sys:apertura', 'cat:otros', 'cat:descuadre'];
chequeo('Cuentas sembradas', esenciales.every(id => uno('SELECT COUNT(*) n FROM cuentas WHERE id = ?', id).n === 1));
chequeo('Movimientos desbalanceados = 0', todos('SELECT * FROM v_movimientos_desbalanceados').length === 0);

const n = uno("SELECT COUNT(*) n FROM movimientos WHERE origen = 'excel'").n;
console.log(`      Movimientos importados: ${n}`);

// Un gasto importado debe tener exactamente dos asientos
chequeo('Cada gasto importado tiene 2 asientos',
  uno("SELECT COUNT(*) n FROM (SELECT movimiento_id FROM asientos GROUP BY movimiento_id HAVING COUNT(*) <> 2)").n === 0);

console.log('\nGasto por mes (COP):');
for (const r of todos("SELECT mes, SUM(total) t FROM v_gasto_mensual GROUP BY mes ORDER BY mes")) {
  console.log(`  ${r.mes}  ${r.t.toLocaleString('es-CO')}`);
}

// Los saldos no deben tomar en cuenta el historial importado (fecha_apertura = 2000 por defecto: aquí sí lo hace).
// Al fijar la apertura hoy, el historial queda fuera de los saldos:
db.prepare("UPDATE config SET valor = '2026-10-20 00:00:00' WHERE clave = 'fecha_apertura'").run();
chequeo('Con apertura hoy, el historial no afecta saldos', todos('SELECT * FROM v_saldos').length === 0);

process.exit(fallos ? 1 : 0);
