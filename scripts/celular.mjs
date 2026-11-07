// Corre las pruebas de pantalla en el Chrome de tu celular, conectado por USB (ver docs/CELULAR.md).
//   npm run e2e:celular
// Usa datos de prueba que viven solo en el navegador del celular: no toca tu app real ni ninguna base.
// Necesita adb (Android platform-tools), la depuración por USB activada y el celular desbloqueado.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUERTO = '5399';
// winget instala adb en su carpeta y a veces la terminal todavía no lo ve: se busca ahí también
function rutaAdb() {
  if (spawnSync('adb', ['version'], { shell: process.platform === 'win32' }).status === 0) return 'adb';
  const base = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(base)) return 'adb';
  const carpeta = readdirSync(base).find(d => d.startsWith('Google.PlatformTools'));
  const exe = carpeta && join(base, carpeta, 'platform-tools', 'adb.exe');
  return exe && existsSync(exe) ? `"${exe}"` : 'adb';
}
const ADB = rutaAdb();
const adb = (...args) => spawnSync(ADB, args, { encoding: 'utf8', shell: process.platform === 'win32' });

const v = adb('version');
if (v.status !== 0) {
  console.error('No encuentro adb. Instálalo con: winget install Google.PlatformTools  (y abre una terminal nueva).');
  process.exit(1);
}
const lista = adb('devices').stdout.split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(x => x[0]);
const listos = lista.filter(x => x[1] === 'device');
if (!listos.length) {
  const raro = lista.find(x => x[1] === 'unauthorized');
  console.error(raro
    ? 'El celular pide permiso: míralo y toca «Permitir» en el aviso de depuración USB.'
    : 'No veo ningún celular. Revisa el cable (que sea de datos), que la depuración por USB esté activada y que el celular esté desbloqueado.');
  process.exit(1);
}
if (listos.length > 1) { console.error('Hay más de un celular conectado. Deja solo uno.'); process.exit(1); }
console.log(`Celular: ${listos[0][0]}`);

// el celular ve el «localhost» de este computador, y este computador ve el Chrome del celular
const rev = adb('reverse', `tcp:${PUERTO}`, `tcp:${PUERTO}`);
if (rev.status !== 0) { console.error(`adb reverse falló: ${rev.stderr}`); process.exit(1); }
// abre Chrome en el celular para que el puerto de control exista
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main');
await new Promise(r => setTimeout(r, 2500));
// Chrome puede dejar varios sockets de control (uno por proceso): se prueba cada uno hasta que uno conteste
const sockets = [...new Set((adb('shell', 'cat /proc/net/unix').stdout.match(/@chrome_devtools_remote(?:_\d+)?/g) ?? []).map(x => x.slice(1)))].sort((a, b) => b.length - a.length); // primero los que traen número de proceso: son los de Chrome en uso
let conectado = false;
for (const socket of sockets) {
  if (adb('forward', 'tcp:9222', `localabstract:${socket}`).status !== 0) continue;
  try {
    const r = await fetch('http://localhost:9222/json/list', { signal: AbortSignal.timeout(4000) });
    if (r.ok) { conectado = true; console.log(`Chrome del celular: ${socket}`); break; }
  } catch { /* ese socket no contesta: se prueba el siguiente */ }
}
if (!conectado) { console.error('No pude hablar con el Chrome del celular. Ábrelo, desbloquea la pantalla y reintenta.'); process.exit(1); }

const e2e = spawnSync('node', ['scripts/e2e.mjs'], { stdio: 'inherit', env: { ...process.env, E2E_CELULAR: '1', E2E_PUERTO: PUERTO } });
adb('reverse', '--remove', `tcp:${PUERTO}`);
process.exit(e2e.status ?? 1);
