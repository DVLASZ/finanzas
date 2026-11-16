// Pasa la revisión de letra grande y desbordes por las tres variantes (personal, mamá y asociación), con texto normal y
// al 130 %. Cada una se compila con su propia plantilla y se recorre entera: chat, saldos, movimientos, resumen y todo
// lo que tenga el menú «Más» (en la de empresa, Productos y precios; en la familiar, Pagos a trabajadores).
//   npm run e2e:variantes
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallas = 0;
for (const instalacion of (process.env.INSTALACIONES ?? 'personal,mama,asociacion').split(',')) {
  const r = spawnSync('node', ['scripts/letra-grande.mjs'], { cwd: raiz, stdio: 'inherit', env: { ...process.env, INSTALACION: instalacion, ESCALAS: process.env.ESCALAS ?? '1,1.3' } });
  if (r.status !== 0) fallas++;
}
console.log(fallas ? `\n${fallas} variante(s) con problemas.` : '\nLas tres variantes se ven bien.');
process.exitCode = fallas ? 1 : 0;
