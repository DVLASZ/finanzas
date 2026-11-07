// Prepara la restauración de un respaldo: lee el .json (ya abierto con abrir-respaldo) y escribe un .sql
// para correr en una base D1 NUEVA (con db/schema.sql aplicado y sin semilla).
//
//   npm run restaurar -- familia/2026-11-08.json importacion/restaurar-familia.sql
//
// Después, con wrangler (ver docs/RESPALDO.md):
//   npx wrangler d1 create finanzas-familia-nueva
//   npx wrangler d1 execute finanzas-familia-nueva --remote --file db/schema.sql
//   npx wrangler d1 execute finanzas-familia-nueva --remote --file importacion/restaurar-familia.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: npm run restaurar -- <respaldo.json> <salida.sql>');
  process.exit(1);
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { sqlDeRespaldo } = await import(pathToFileURL(join(raiz, 'packages', 'core', 'src', 'index.ts')).href);
const datos = JSON.parse(readFileSync(entrada, 'utf8'));
if (!Array.isArray(datos.cuentas) || !Array.isArray(datos.movimientos)) {
  console.error('Ese archivo no parece un respaldo: faltan las cuentas o los movimientos.');
  process.exit(1);
}
writeFileSync(salida, sqlDeRespaldo(datos), 'utf8');
console.log(`Listo: ${salida} (${datos.cuentas.length} cuentas, ${datos.movimientos.length} movimientos). Corre ese archivo en una base nueva con schema.sql.`);
