// Cómo va cada instalación, de un vistazo: npm run salud
// Lee la dirección y el token de instalaciones/<nombre>/acceso.txt (ignorado por git) y pregunta a /api/salud.
// No imprime el token.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'instalaciones');
const filas = [];
for (const nombre of readdirSync(raiz, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
  const archivo = join(raiz, nombre, 'acceso.txt');
  if (!existsSync(archivo)) continue;
  const txt = readFileSync(archivo, 'utf8');
  const url = txt.match(/Direcci[oó]n:\s*(\S+)/)?.[1];
  const token = txt.match(/Token de acceso:\s*(\S+)/)?.[1];
  if (!url || !token) { filas.push({ nombre, estado: 'falta la dirección o el token en acceso.txt' }); continue; }
  try {
    const t0 = Date.now();
    const r = await fetch(`${url}/api/salud`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { filas.push({ nombre, estado: `el servidor respondió ${r.status}` }); continue; }
    const s = await r.json();
    filas.push({ nombre, estado: 'bien', ms: Date.now() - t0, ...s });
  } catch (e) {
    filas.push({ nombre, estado: `no responde (${e.message})` });
  }
}

for (const f of filas) {
  console.log(`${f.nombre.padEnd(12)} ${f.estado}`);
  if (f.estado !== 'bien') continue;
  const ult = f.ultimoMovimiento ? f.ultimoMovimiento.slice(0, 16) : 'ninguno';
  console.log(`  movimientos ${f.movimientos}, el último ${ult}, saldos desde ${f.desdeCuando?.slice(0, 10) ?? 'sin saldo inicial'}`);
  console.log(`  fotos ${f.fotos?.cantidad ?? 0} (${f.fotos ? (f.fotos.kb / 1024).toFixed(1) : 0} MB)`);
  console.log(`  celulares con avisos ${f.celularesConAvisos}, IA ${f.ia.encendida ? 'encendida' : 'apagada'}${f.ia.uso ? ` (uso ${f.ia.uso})` : ''}, respondió en ${f.ms} ms`);
}
if (!filas.length) console.log('No hay instalaciones con acceso.txt.');
