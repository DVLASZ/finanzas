// Revisión de seguridad del proyecto: npm run seguridad (también corre dentro de `npm run check`).
//
//   1. npm audit (solo lo que se publica, nivel alto o crítico). Sin red avisa, pero no falla.
//   2. Secretos: formas de tokens y llaves dentro de lo que sigue git, y archivos sensibles que no deberían seguirse.
//   3. Consultas a D1: todas con parámetros (?), nunca con texto armado a mano.
//   4. La interfaz: nada de innerHTML, eval ni compañía; el informe que se escribe en otra ventana escapa todo.
//   5. El Worker en marcha (sin red): cabeceras de seguridad en la página, en la API y en los errores, política de contenido
//      sin scripts en línea, y la página de la app sin scripts ni manejadores en línea.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivos = execSync('git ls-files', { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);
const leer = f => readFileSync(join(raiz, f), 'utf8');
let mal = 0;
const ok = t => console.log(`OK    ${t}`);
const falla = t => { mal++; console.log(`FALLA ${t}`); };
const aviso = t => console.log(`AVISO ${t}`);

// ---- 1. npm audit
{
  const r = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], { cwd: raiz, encoding: 'utf8', shell: true, timeout: 60000 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* sin respuesta legible */ }
  if (!j || j.error) aviso('npm audit no pudo consultar (¿sin internet?). Corre `npm audit --omit=dev` cuando haya red.');
  else {
    const v = j.metadata?.vulnerabilities ?? {};
    const graves = (v.high ?? 0) + (v.critical ?? 0);
    if (graves) falla(`npm audit: ${v.critical ?? 0} críticas y ${v.high ?? 0} altas en lo que se publica. Corre \`npm audit --omit=dev\`.`);
    else ok(`npm audit: sin vulnerabilidades altas ni críticas (${v.moderate ?? 0} moderadas, ${v.low ?? 0} bajas)`);
  }
}

// ---- 2. secretos
{
  const formas = [
    [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, 'un token de GitHub'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'una llave privada'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'una llave de AWS'],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'un token de Slack'],
    [/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'un JWT'],
    [/\b(?:API_TOKEN|API_TOKEN_LECTURA|PIN_BORRADO|RESPALDO_TOKEN|RESPALDO_CLAVE|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/, 'un secreto escrito en el código'],
    [/Bearer\s+[A-Za-z0-9_\-]{32,}/, 'una cabecera Bearer con un token real'],
  ];
  // este mismo script lleva escritas las formas que busca
  const sinRevisar = /package-lock\.json$|scripts\/seguridad\.mjs$|\.(png|jpg|ico|woff2?|xlsx)$/;
  const hallados = [];
  for (const f of archivos.filter(x => !sinRevisar.test(x))) {
    const t = leer(f);
    // las pruebas llevan claves inventadas («una-clave-larga-123»): solo ahí se salta «un secreto escrito en el código»
    const esPrueba = /(^|\/)(test|tests)\//.test(f);
    for (const [re, que] of formas) if (re.test(t) && !(esPrueba && que.startsWith('un secreto escrito'))) hallados.push(`${f}: ${que}`);
  }
  const sensibles = archivos.filter(f => /(^|\/)\.dev\.vars$|acceso\.txt$|\.pem$|\.p12$|\.key$/.test(f));
  for (const f of sensibles) hallados.push(`${f}: un archivo que no debería seguir git`);
  const ignorados = leer('.gitignore');
  for (const q of ['.dev.vars', 'instalaciones/']) if (!ignorados.includes(q)) hallados.push(`.gitignore no incluye ${q} (ahí van los tokens de cada instalación)`);
  hallados.length ? hallados.forEach(h => falla(`secretos: ${h}`)) : ok('secretos: nada parecido a una clave dentro de git, y los archivos de acceso están ignorados');
}

// ---- 3. consultas a D1
{
  const malas = [];
  for (const f of archivos.filter(x => /^apps\/worker\/src\/.*\.ts$/.test(x))) {
    const t = leer(f);
    for (const m of t.matchAll(/\.prepare\(\s*([`'"])([\s\S]*?)\1/g)) {
      if (m[1] === '`' && m[2].includes('${')) malas.push(`${f}: una consulta con \${} adentro`);
    }
    for (const m of t.matchAll(/\.prepare\(\s*([^`'"\s][^)]*)\)/g)) {
      if (!/^sql\b|^q\b/.test(m[1].trim()) && !/^[a-z]+$/.test(m[1].trim())) malas.push(`${f}: prepare(${m[1].trim().slice(0, 40)}) no es un texto fijo`);
    }
    if (/\.(?:exec|query)\(\s*`/.test(t)) malas.push(`${f}: exec o query con una plantilla`);
  }
  malas.length ? malas.forEach(m => falla(`D1: ${m}`)) : ok('D1: todas las consultas son textos fijos con parámetros');
}

// ---- 4. interfaz
{
  const malas = [];
  const peligros = [[/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'], [/\.innerHTML\s*=/, 'innerHTML'], [/\.outerHTML\s*=/, 'outerHTML'], [/insertAdjacentHTML/, 'insertAdjacentHTML'], [/\beval\(/, 'eval'], [/new Function\(/, 'new Function'], [/setTimeout\(\s*['"`]/, 'setTimeout con texto']];
  for (const f of archivos.filter(x => /^apps\/web\/src\/.*\.tsx?$/.test(x))) {
    const t = leer(f);
    for (const [re, que] of peligros) if (re.test(t)) malas.push(`${f}: ${que}`);
    // document.write solo en las dos hojas para imprimir, y con todo escapado por esc()
    if (/document\.write\(/.test(t) && !/features\/resumen\/(Resumen|CorteTurno)\.tsx$/.test(f)) malas.push(`${f}: document.write fuera de las hojas para imprimir`);
    if (/document\.write\(/.test(t) && !/\besc\(/.test(t)) malas.push(`${f}: document.write sin esc()`);
  }
  const res = leer('apps/web/src/features/resumen/Resumen.tsx');
  const sinEscapar = [...res.matchAll(/<(?:td|h1|title)[^>]*>\$\{(?!esc\()/g)];
  if (sinEscapar.length) malas.push(`Resumen.tsx: ${sinEscapar.length} dato(s) del informe sin esc()`);
  malas.length ? malas.forEach(m => falla(`interfaz: ${m}`)) : ok('interfaz: sin innerHTML ni eval, y el informe escapa todo lo que escribe');
}

// ---- 5. el Worker en marcha
{
  const { default: worker } = await import(pathToFileURL(join(raiz, 'apps/worker/src/index.ts')).href);
  const { CABECERAS_SEGURAS } = await import(pathToFileURL(join(raiz, 'apps/worker/src/seguridad.ts')).href);
  const { crearD1 } = await import(pathToFileURL(join(raiz, 'tests/d1-shim.ts')).href);
  const env = { DB: crearD1(), API_TOKEN: 'prueba-de-seguridad-123456', ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const pedidos = {
    'la página': new Request('https://x.workers.dev/'),
    'la API sin token': new Request('https://x.workers.dev/api/salud'),
    'la API con token': new Request('https://x.workers.dev/api/salud', { headers: { Authorization: 'Bearer prueba-de-seguridad-123456' } }),
    'una ruta que no existe': new Request('https://x.workers.dev/api/nada', { headers: { Authorization: 'Bearer prueba-de-seguridad-123456' } }),
  };
  const faltan = [];
  for (const [donde, req] of Object.entries(pedidos)) {
    const r = await worker.fetch(req, env);
    for (const [k, v] of Object.entries(CABECERAS_SEGURAS)) if (r.headers.get(k) !== v) faltan.push(`${donde}: ${k}`);
  }
  const csp = CABECERAS_SEGURAS['Content-Security-Policy'];
  const scripts = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src')) ?? '';
  if (/unsafe-inline|unsafe-eval|\*/.test(scripts) || !scripts) faltan.push('la política de contenido deja scripts en línea o de cualquier lado');
  if (!/frame-ancestors 'none'/.test(csp)) faltan.push('la política de contenido no prohíbe los marcos');
  if (CABECERAS_SEGURAS['X-Frame-Options'] !== 'DENY' || CABECERAS_SEGURAS['X-Content-Type-Options'] !== 'nosniff' || CABECERAS_SEGURAS['Referrer-Policy'] !== 'no-referrer' || !/max-age=\d{7,}/.test(CABECERAS_SEGURAS['Strict-Transport-Security'])) faltan.push('faltan X-Frame-Options, nosniff, Referrer-Policy o HSTS');
  const html = leer('apps/web/index.html');
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) if (!/\bsrc=/.test(m[1])) faltan.push('index.html trae un script en línea');
  if (/\son[a-z]+=/i.test(html)) faltan.push('index.html trae manejadores en línea');
  if (!/_headers/.test(leer('scripts/build-web.mjs')) || !/CABECERAS_SEGURAS/.test(leer('scripts/build-web.mjs'))) faltan.push('la compilación no escribe el archivo _headers (la página la sirve Cloudflare sin pasar por el Worker)');
  const toml = leer('apps/worker/wrangler.toml');
  if (/(?:API_TOKEN|PIN_BORRADO)\s*=\s*["']/.test(toml)) faltan.push('wrangler.toml trae un secreto');
  faltan.length ? faltan.forEach(m => falla(`Worker: ${m}`)) : ok('Worker: cabeceras de seguridad en la página, la API y los errores; sin scripts en línea');
}

// ---- 6. la suite de OWASP Top 10:2025 (XSS, SQLi, fórmulas, acceso, SSRF, validación, cabeceras, errores, cadena de suministro)
{
  const r = spawnSync(process.execPath, ['--test', 'apps/worker/test/seguridad-owasp-2025.test.ts'], { cwd: raiz, encoding: 'utf8' });
  const total = /ℹ tests (\d+)/.exec(r.stdout)?.[1] ?? '?';
  if (r.status === 0) ok(`OWASP 2025: ${total} pruebas de seguridad pasan (ver docs/SEGURIDAD-OWASP-2025.md)`);
  else falla(`OWASP 2025: fallaron pruebas. Corre «node --test apps/worker/test/seguridad-owasp-2025.test.ts».\n${r.stdout.split('\n').filter(l => l.startsWith('✖')).join('\n')}`);
}

console.log(mal ? `\n${mal} problema(s) de seguridad.` : '\nSin hallazgos.');
process.exit(mal ? 1 : 0);
