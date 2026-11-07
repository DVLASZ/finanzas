// Abre un respaldo de la nube (el archivo .json.cifrado) y lo deja como .json.
// La frase va en la variable RESPALDO_CLAVE, nunca en la línea de comandos:
//   $env:RESPALDO_CLAVE = "la frase"; npm run abrir-respaldo -- familia/2026-11-08.json.cifrado
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const archivo = process.argv[2];
const frase = process.env.RESPALDO_CLAVE;
if (!archivo || !frase) {
  console.error('Uso: define RESPALDO_CLAVE y corre: npm run abrir-respaldo -- <archivo.json.cifrado>');
  process.exit(1);
}
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { descifrar } = await import(pathToFileURL(join(raiz, 'apps', 'worker', 'src', 'respaldo.ts')).href);
try {
  const claro = await descifrar(readFileSync(archivo, 'utf8'), frase);
  const salida = archivo.replace(/\.cifrado$/, '');
  writeFileSync(salida, claro, 'utf8');
  console.log(`Listo: ${salida}`);
} catch {
  console.error('No se pudo abrir: la frase no es la que se usó para cifrar, o el archivo está dañado.');
  process.exit(1);
}
