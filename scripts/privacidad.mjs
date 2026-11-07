// Revisa que lo que git sigue no lleve datos personales ni secretos.
//   npm run privacidad
// Siempre busca formas de secretos (correos, tokens, teléfonos, rutas del computador). Si existe
// docs-privado/privacidad-lista.txt (fuera de git), también busca esas palabras, una por línea.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivos = execSync('git ls-files', { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(f => !/package-lock\.json$|\.(png|jpg|ico|woff2?|xlsx)$/.test(f));

const formas = [
  [/[\w.+-]+@(?!example\.com)[\w-]+\.[a-z]{2,}/i, 'un correo'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{10,}/, 'un token de GitHub'],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/, 'una clave de pago'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'una llave privada'],
  [/(?<![\d.])3\d{9}(?![\d])/, 'un número de celular'],
  [/[A-Z]:\\Users\\/i, 'una ruta del computador'],
  [/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i, 'la dirección de un Worker (poné una de ejemplo)'],
  [/\b[0-9a-f]{40,}\b/, 'una cadena larga que parece un secreto'],
];
const permitidos = [/ejemplo\.workers\.dev/, /tu-subdominio/, /x\.workers\.dev/];

const lista = join(raiz, 'docs-privado', 'privacidad-lista.txt');
const palabras = existsSync(lista)
  ? readFileSync(lista, 'utf8').split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'))
  : [];
const L = '\\p{L}\\p{N}_';
const reglas = palabras.map(p => [new RegExp(`(?<![${L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${L}])`, 'iu'), `la palabra «${p}»`]);

let fallos = 0;
for (const f of archivos) {
  const lineas = readFileSync(join(raiz, f), 'utf8').split('\n');
  lineas.forEach((l, i) => {
    for (const [re, que] of [...formas, ...reglas]) {
      if (!re.test(l)) continue;
      if (permitidos.some(p => p.test(l)) && que.startsWith('la dirección')) continue;
      console.log(`${f}:${i + 1}: ${que}`);
      fallos++;
    }
  });
}
console.log(fallos ? `\n${fallos} hallazgo(s). Quita eso antes de subir.` : `Limpio: ${archivos.length} archivos revisados${palabras.length ? ` (con ${palabras.length} palabras privadas)` : ' (sin lista privada)'}.`);
process.exit(fallos ? 1 : 0);
