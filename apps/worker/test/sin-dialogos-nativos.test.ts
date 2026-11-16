/**
 * La app no usa los cuadros del navegador («...workers.dev dice»): rompen el diseño, no siguen el tema ni la letra grande.
 * Todo diálogo sale de `components/ui/Dialogo.tsx` (confirmar, avisar, pedir). Esta prueba falla si alguien vuelve a
 * escribir `alert(`, `confirm(` o `prompt(` en el código de la app.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../web/src', import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(n) ? [ruta] : [];
  });
}

test('la app no usa alert, confirm ni prompt del navegador', () => {
  const malos: string[] = [];
  for (const f of archivos(raiz)) {
    if (f.endsWith('Dialogo.tsx')) continue; // ahí se explican en un comentario
    readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      // `(?<![\w.])` deja pasar métodos con el mismo nombre, como `instalador.prompt()` (la instalación de la app)
      if (/(?<![\w.])(alert|confirm|prompt)\((?!\)\s*:)/.test(linea.replace(/\/\/.*$/, ''))) malos.push(`${f.slice(raiz.length + 1)}:${i + 1}: ${linea.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(malos, [], 'usa confirmar(), avisar() o pedir() de components/ui/Dialogo.tsx');
});
