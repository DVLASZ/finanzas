// Instalaciones: una app separada por persona o negocio (su propio Worker, su propia base de datos
// y su propio token), todas del mismo código. Ver docs/INSTALACIONES.md.
//
//   npm run instalar -- preparar <nombre>   Genera todo lo que va a la nube, SIN tocar la nube:
//                                           instalaciones/<nombre>/{seed.sql, wrangler.toml, dist/}
//   npm run instalar -- crear <nombre>      Crea la base en Cloudflare, la llena, guarda el token y
//                                           publica. Pide confirmación antes de cada paso.
//   npm run instalar -- publicar <nombre>   Vuelve a compilar y publicar (después de cambiar el código).
//   npm run instalar -- actualizar <nombre> Pone en la base ya publicada lo nuevo de la plantilla (categorías, palabras)
//                                           y lo de instalaciones/<nombre>.json. No borra ni pisa lo que ya hay.
//
// Lo propio de cada persona vive en instalaciones/<nombre>.json (no se sube a git). Ejemplo:
// scripts/instalacion-ejemplo.json.

import { spawnSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const [orden, nombre] = process.argv.slice(2);
if (!['preparar', 'crear', 'publicar', 'actualizar'].includes(orden ?? '') || !nombre) {
  console.log('Uso: npm run instalar -- <preparar|crear|publicar|actualizar> <nombre>');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(nombre)) throw new Error('El nombre solo puede tener letras minúsculas, números y guiones.');

const archivo = join(raiz, 'instalaciones', `${nombre}.json`);
if (!existsSync(archivo)) throw new Error(`Falta ${archivo}. Copia scripts/instalacion-ejemplo.json y complétalo.`);
const cfg = JSON.parse(readFileSync(archivo, 'utf8'));
// si el archivo no dice qué plantilla usa, se toma la de la variante de esta rama (variante.json)
if (!cfg.plantilla && existsSync(join(raiz, 'variante.json'))) cfg.plantilla = JSON.parse(readFileSync(join(raiz, 'variante.json'), 'utf8')).plantilla;
const carpeta = join(raiz, 'instalaciones', nombre);
mkdirSync(carpeta, { recursive: true });

const { PLANTILLAS, sqlDePlantilla } = await import(pathToFileURL(join(raiz, 'packages', 'core', 'src', 'plantillas.ts')).href);
const pl = PLANTILLAS[cfg.plantilla];
if (!pl) throw new Error(`La plantilla «${cfg.plantilla}» no existe. Hay: ${Object.keys(PLANTILLAS).join(', ')}.`);

// ------------------------------------------------------------------ SQL con los datos de partida

function sqlDeSemilla() {
  return `-- GENERADO por scripts/instalar.mjs para «${nombre}» (plantilla ${pl.id}). No editar a mano.
${readFileSync(join(raiz, 'db', 'schema.sql'), 'utf8')}
${sqlDePlantilla(cfg.plantilla, cfg)}`;
}

function tomlDeWrangler(idBase) {
  return `# GENERADO por scripts/instalar.mjs para «${nombre}». No editar a mano.
name = "${cfg.worker}"
main = "../../apps/worker/src/index.ts"
compatibility_date = "2026-10-01"

[assets]
directory = "./dist"
binding = "ASSETS"
run_worker_first = ["/api/*"]

[triggers]
crons = ["0,30 * * * *"]

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "${cfg.base}"
database_id = "${idBase ?? 'PENDIENTE-crear'}"

`;
}

function preparar() {
  for (const k of ['worker', 'base', 'plantilla']) if (!cfg[k]) throw new Error(`Falta «${k}» en ${archivo}.`);
  writeFileSync(join(carpeta, 'seed.sql'), sqlDeSemilla(), 'utf8');
  writeFileSync(join(carpeta, 'wrangler.toml'), tomlDeWrangler(cfg.d1Id), 'utf8');
  const r = spawnSync(process.execPath, [
    join(raiz, 'scripts', 'build-web.mjs'), '--out', join(carpeta, 'dist'),
    '--nombre', cfg.nombreApp ?? 'Mis finanzas', '--corto', cfg.nombreCorto ?? 'Finanzas', '--color', cfg.color ?? '#1f7a5a',
    '--piel', cfg.piel ?? 'midnight', '--tema', cfg.tema ?? 'oscuro', '--letra', cfg.letra ?? 'normal', '--matiz', cfg.matiz ?? '', '--plantilla', cfg.plantilla,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Falló la compilación de la web.');
  console.log(`\nListo, sin tocar la nube: ${carpeta}\n  seed.sql  wrangler.toml  dist/`);
}

// ------------------------------------------------------------------ nube (siempre con confirmación)

const wrangler = (args, opciones = {}) =>
  spawnSync('npx', ['wrangler', ...args.map(a => (/\s/.test(a) ? '"' + a + '"' : a))], { cwd: raiz, encoding: 'utf8', shell: true, ...opciones });

async function confirmar(texto) {
  if (process.argv.includes('--si')) { console.log(`[autorizado] ${texto}`); return; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = (await rl.question(`${texto} (s/n) `)).trim().toLowerCase();
  rl.close();
  if (r !== 's') { console.log('Cancelado. No se hizo nada más.'); process.exit(0); }
}

function secreto(clave, valor, toml) {
  // El valor entra por la entrada estándar: no queda en el historial ni se imprime.
  const r = wrangler(['secret', 'put', clave, '--config', toml], { input: valor });
  if (r.status !== 0) throw new Error(`No se pudo guardar el secreto ${clave}: ${r.stderr}`);
}

async function crear() {
  const toml = join(carpeta, 'wrangler.toml');
  await confirmar(`Voy a crear en tu cuenta de Cloudflare la base «${cfg.base}» y el Worker «${cfg.worker}». ¿Sigo?`);
  if (!cfg.d1Id) {
    const r = wrangler(['d1', 'create', cfg.base]);
    const id = (r.stdout + r.stderr).match(/database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/)?.[1];
    if (!id) throw new Error(`No pude leer el id de la base:\n${r.stdout}\n${r.stderr}`);
    cfg.d1Id = id;
    writeFileSync(archivo, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log(`Base creada (${id}).`);
  }
  preparar();
  await confirmar('Ahora lleno la base con las cuentas y categorías de la plantilla. ¿Sigo?');
  const e = wrangler(['d1', 'execute', cfg.base, '--remote', '--yes', '--file', join(carpeta, 'seed.sql'), '--config', toml], { stdio: 'inherit' });
  if (e.status !== 0) throw new Error('Falló al llenar la base.');

  await confirmar('Genero el token y el PIN (los guardo en un archivo tuyo, no se muestran) y publico. ¿Sigo?');
  const token = randomBytes(24).toString('base64url');
  const pin = String(randomInt(1000, 10000));
  secreto('API_TOKEN', token, toml);
  secreto('PIN_BORRADO', pin, toml);
  const d = wrangler(['deploy', '--config', toml]);
  if (d.status !== 0) throw new Error(`Falló la publicación:\n${d.stdout}\n${d.stderr}`);
  const url = (d.stdout + d.stderr).match(/https:\/\/[^\s]+\.workers\.dev/)?.[0] ?? '(mira la dirección en el panel de Cloudflare)';
  writeFileSync(join(carpeta, 'acceso.txt'), `Dirección: ${url}\nToken de acceso: ${token}\nPIN de borrado: ${pin}\n`, 'utf8');
  console.log(`\nPublicado: ${url}\nEl token y el PIN están en ${join(carpeta, 'acceso.txt')} (no se subió a git). Guárdalos en un lugar seguro.`);
}

async function publicar() {
  const toml = join(carpeta, 'wrangler.toml');
  if (!cfg.d1Id) throw new Error('Esta instalación todavía no se creó: usa «crear».');
  preparar();
  await confirmar(`Publico de nuevo «${cfg.worker}». ¿Sigo?`);
  const d = wrangler(['deploy', '--config', toml], { stdio: 'inherit' });
  if (d.status !== 0) throw new Error('Falló la publicación.');
}

/**
 * Lo nuevo de la plantilla llega a una base ya publicada con INSERT OR IGNORE (lo que existe no se toca).
 * La config que está en el .json de la instalación sí se pone tal cual: ahí manda el archivo.
 */
async function actualizar() {
  const toml = join(carpeta, 'wrangler.toml');
  if (!cfg.d1Id) throw new Error('Esta instalación todavía no se creó: usa «crear».');
  preparar();
  const lineas = sqlDePlantilla(cfg.plantilla, cfg).split('\n').filter(Boolean).map(l => l.replace(/^INSERT INTO /, 'INSERT OR IGNORE INTO '));
  const q = v => `'${String(v).replaceAll("'", "''")}'`;
  for (const [clave, valor] of Object.entries(cfg.config ?? {})) lineas.push(`INSERT OR REPLACE INTO config (clave, valor) VALUES (${q(clave)}, ${q(valor)});`);
  const sql = join(carpeta, 'actualizar.sql');
  writeFileSync(sql, lineas.join('\n') + '\n', 'utf8');
  await confirmar(`Agrego lo nuevo de la plantilla a la base «${cfg.base}» (${lineas.length} sentencias, sin borrar nada). ¿Sigo?`);
  const r = wrangler(['d1', 'execute', cfg.base, '--remote', '--file', sql, '--config', toml], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Falló la actualización.');
}

if (orden === 'preparar') preparar();
else if (orden === 'actualizar') await actualizar();
else if (orden === 'crear') await crear();
else await publicar();
