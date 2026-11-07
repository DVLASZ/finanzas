// Servidor estático mínimo para probar la app en tu PC (sin cuentas ni nube).
// Uso: npm run web:dev   ->  http://localhost:5173
// Compila primero (npm run web:build); si cambias el código, vuelve a compilar y recarga.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist');
const puerto = Number(process.env.PORT ?? 5173);
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://x').pathname;
  const archivo = normalize(join(dist, ruta === '/' ? 'index.html' : ruta));
  if (!archivo.startsWith(dist)) { res.writeHead(403).end(); return; }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': tipos[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(datos);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(puerto, () => console.log(`App en http://localhost:${puerto}`));
