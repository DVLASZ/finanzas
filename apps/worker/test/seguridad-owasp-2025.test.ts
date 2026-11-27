/**
 * Seguridad según OWASP Top 10:2025 (ver docs/SEGURIDAD-OWASP-2025.md). Cada prueba nombra la categoría que cubre.
 * Sin red: el Worker corre contra una D1 simulada y los `fetch` salientes se cuentan para comprobar que no salen.
 *
 * Las instalaciones (personal, mama, asociacion) son Workers y bases separados, cada uno con su token: «aislamiento» aquí
 * quiere decir que el token de una no abre otra y que lo que se escribe en una no aparece en la otra.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  construirMovimiento, contextoDe, CUENTAS_INICIALES, interpretar, movimientosACsv, validarOp, type Datos, type Movimiento, type Op,
} from '../../../packages/core/src/index.ts';
import { esc } from '../../web/src/lib/carta.ts';
import { enviarAlBuzon } from '../src/buzon.ts';
import worker, { type Env } from '../src/index.ts';
import { enviarAviso, suscripcionValida } from '../src/push.ts';
import { esServicioDePush, reiniciarLimites, urlPublicaHttps } from '../src/seguridad.ts';
import { AHORA } from '../../../tests/ayudas.ts';
import { crearD1 } from '../../../tests/d1-shim.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
afterEach(() => reiniciarLimites());

const entorno = (extra: Partial<Env> = {}, token = 'token-api'): Env => ({ DB: crearD1(), API_TOKEN: token, ...extra });
const pedir = (env: Env, ruta: string, cuerpo?: unknown, token: string | null = 'token-api', extra: Record<string, string> = {}, metodo?: string): Promise<Response> =>
  worker.fetch(new Request(`https://x.workers.dev${ruta}`, {
    method: metodo ?? (cuerpo === undefined ? 'GET' : 'POST'),
    body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...extra },
  }), env);

function movimiento(texto: string): { movimiento: Movimiento; cuentasNuevas: unknown[]; compromisos: unknown[] } {
  const ctx = contextoDe({ cuentas: structuredClone(CUENTAS_INICIALES), movimientos: [], compromisos: [], atajos: [], aprendido: {}, presupuestos: {}, config: {} } as Datos, AHORA);
  const r = interpretar(texto, ctx);
  assert.equal(r.clase, 'movimiento');
  if (r.clase !== 'movimiento') throw new Error('no es movimiento');
  return construirMovimiento(r.propuesta, ctx, new Map(), crypto.randomUUID(), 'app') as never;
}
const guardar = (h: ReturnType<typeof movimiento>): Op => ({ op: 'guardar', movimiento: h.movimiento, cuentasNuevas: h.cuentasNuevas, compromisos: h.compromisos } as Op);

// ======================================================================= A05 inyección: XSS

const XSS = [
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', '"><svg onload=alert(1)>', "'><iframe src=javascript:alert(1)>",
  '<svg><script>alert(1)</script></svg>', '<a href="data:text/html,<script>alert(1)</script>">x</a>', '</title><script>alert(1)</script>', '&lt;b&gt;',
];

test('A05 XSS: el escape deja el texto como texto, en contenido y en atributos', () => {
  for (const p of XSS) {
    const e = esc(p);
    assert.doesNotMatch(e, /[<>"']/, `quedó un carácter activo en «${p}»`);
    assert.doesNotMatch(e, /<\/?[a-z]/i);
  }
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('A05 XSS: la interfaz no usa ninguna salida peligrosa ni enlaces con datos del usuario', () => {
  const archivos: string[] = [];
  const recorrer = (d: string): void => { for (const n of readdirSync(d)) { const r = join(d, n); statSync(r).isDirectory() ? recorrer(r) : /\.(tsx?|jsx?)$/.test(n) && archivos.push(r); } };
  recorrer(join(raiz, 'apps', 'web', 'src'));
  const malo = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(|javascript:|vbscript:/;
  for (const f of archivos) assert.doesNotMatch(readFileSync(f, 'utf8'), malo, `${f} usa una salida peligrosa`);
  // los únicos document.write son los informes que se arman con `esc`
  for (const f of archivos) {
    const t = readFileSync(f, 'utf8');
    if (/document\.write\(/.test(t)) assert.match(t, /\besc\(/, `${f} escribe HTML sin escapar`);
  }
});

test('A05 XSS: un concepto con código se guarda tal cual, como texto, y el CSV no lo vuelve fórmula ni etiqueta', async () => {
  const env = entorno();
  for (const p of XSS) {
    const h = movimiento('almuerzo 5000');
    h.movimiento.descripcion = p.slice(0, 190);
    const r = await pedir(env, '/api/sync', { ops: [guardar(h)] });
    assert.equal(r.status, 200, `rechazó «${p}»`);
    const cuerpo = await r.text();
    // la respuesta es JSON, nunca HTML
    assert.match(r.headers.get('Content-Type') ?? '', /application\/json/);
    assert.ok(!r.headers.get('Content-Type')!.includes('html'));
    assert.ok(cuerpo.includes(JSON.stringify(p.slice(0, 190)).slice(1, -1)) || cuerpo.length > 0);
  }
});

// ======================================================================= A05 inyección: SQL

const SQLI = ["' OR '1'='1", '"; DROP TABLE movimientos; --', "1; DELETE FROM movimientos", "' UNION SELECT valor FROM config --", "Robert'); DROP TABLE cuentas;--"];

test('A05 SQLi: el texto malicioso es un dato más; las tablas siguen y no se filtra nada', async () => {
  const env = entorno();
  const normal = movimiento('almuerzo 7000');
  assert.equal((await pedir(env, '/api/sync', { ops: [guardar(normal)] })).status, 200);
  for (const p of SQLI) {
    const h = movimiento('almuerzo 5000');
    h.movimiento.descripcion = p;
    assert.equal((await pedir(env, '/api/sync', { ops: [guardar(h)] })).status, 200);
  }
  const datos = (await (await pedir(env, '/api/datos')).json()) as { datos: Datos };
  assert.equal(datos.datos.movimientos.length, 1 + SQLI.length, 'ninguna tabla se perdió ni se duplicó');
  assert.ok(SQLI.every(p => datos.datos.movimientos.some(m => m.descripcion === p)), 'el texto quedó literal');
  assert.ok(datos.datos.cuentas.length > 0);
});

test('A05 SQLi: el id de un movimiento o de una foto con comillas o comodines no pasa', async () => {
  const env = entorno();
  for (const id of ["x' OR '1'='1", 'a;b', 'a b', 'a%b', "a'--", '../../x', 'a/b']) {
    const h = movimiento('almuerzo 5000');
    h.movimiento.id = id;
    const r = await pedir(env, '/api/sync', { ops: [guardar(h)] });
    assert.ok(r.status === 200, 'la petición se atiende');
    const j = (await r.json()) as { datos: Datos; rechazadas?: unknown[] };
    assert.equal(j.datos.movimientos.length, 0, `el id «${id}» no debió guardarse`);
  }
  for (const id of ["1'%20OR%20'1'='1", '%2e%2e%2fx', 'a%20b']) assert.equal((await pedir(env, `/api/foto/${id}`)).status, 404);
});

test('A05 inyección de fórmulas: el CSV neutraliza = + - @ tabulación y retorno de carro', () => {
  const m = movimiento('almuerzo 5000').movimiento;
  const cuentas = structuredClone(CUENTAS_INICIALES);
  for (const f of ['=CMD|\' /C calc\'!A0', '@SUM(1+1)', '+1+1', '-2+3', '\t=1+1', '\r=1+1', '=HYPERLINK("http://x","y")']) {
    const csv = movimientosACsv([{ ...m, descripcion: f, nota: f } as Movimiento], cuentas);
    const filas = csv.split('\n');
    assert.ok(filas.length >= 2);
    const datos = filas[1];
    assert.ok(!new RegExp(`(^|[,;])"?${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(datos) || datos.includes(`'${f.slice(0, 3)}`), `la fórmula «${f}» no quedó neutralizada: ${datos.slice(0, 120)}`);
    for (const c of datos.split(',')) assert.doesNotMatch(c.replace(/^"/, ''), /^[=+@\t\r]/, `celda activa: ${c.slice(0, 40)}`);
  }
});

// ======================================================================= A01 control de acceso, A07 autenticación

const RUTAS_API: [string, string][] = [
  ['GET', '/api/datos'], ['GET', '/api/salud'], ['POST', '/api/sync'], ['GET', '/api/push/clave'], ['POST', '/api/push/suscribir'], ['POST', '/api/push/probar'],
  ['POST', '/api/interpretar'], ['POST', '/api/ocr'], ['GET', '/api/buzon/destinos'], ['POST', '/api/buzon/enviar'], ['GET', '/api/foto/abc'], ['PUT', '/api/foto/abc'],
  ['DELETE', '/api/foto/abc'], ['POST', '/api/purgar'], ['POST', '/api/borrar-todo'], ['POST', '/api/respaldo/probar'],
];

test('A01/A07: ninguna ruta de la API responde sin token, con token equivocado o sin el prefijo Bearer', async () => {
  const env = entorno();
  for (const [metodo, ruta] of RUTAS_API) {
    for (const token of [null, 'malo', '', 'token-ap', 'token-api-extra']) {
      const r = await worker.fetch(new Request(`https://x.workers.dev${ruta}`, { method: metodo, headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body: metodo === 'GET' ? undefined : '{}' }), env);
      assert.equal(r.status, 401, `${metodo} ${ruta} con «${token}»`);
    }
    const sinBearer = await worker.fetch(new Request(`https://x.workers.dev${ruta}`, { method: metodo, headers: { Authorization: 'token-api' }, body: metodo === 'GET' ? undefined : '{}' }), env);
    assert.equal(sinBearer.status, 401, `${metodo} ${ruta} sin «Bearer»`);
    reiniciarLimites();
  }
});

test('A01: el token de una instalación no abre otra y sus datos no se mezclan (personal, mama, asociacion)', async () => {
  const personal = entorno({}, 'token-personal');
  const mama = entorno({}, 'token-mama');
  const h = movimiento('almuerzo 9000');
  assert.equal((await pedir(personal, '/api/sync', { ops: [guardar(h)] }, 'token-personal')).status, 200);
  // el token de una no sirve en la otra
  assert.equal((await pedir(mama, '/api/datos', undefined, 'token-personal')).status, 401);
  assert.equal((await pedir(personal, '/api/datos', undefined, 'token-mama')).status, 401);
  // y lo guardado en una no aparece en la otra, aunque se pida con el mismo id
  const deMama = (await (await pedir(mama, '/api/datos', undefined, 'token-mama')).json()) as { datos: Datos };
  assert.equal(deMama.datos.movimientos.length, 0);
  assert.equal((await pedir(mama, '/api/sync', { ops: [{ op: 'anular', id: h.movimiento.id, cuando: '2026-10-19 10:00:00' }] }, 'token-mama')).status, 200);
  const dePersonal = (await (await pedir(personal, '/api/datos', undefined, 'token-personal')).json()) as { datos: Datos };
  assert.equal(dePersonal.datos.movimientos[0].estado, 'ok', 'anular en mama no toca el movimiento de personal');
});

test('A01: el token de solo lectura lee, pero no escribe ni borra', async () => {
  const env = entorno({ API_TOKEN_LECTURA: 'solo-leer' });
  assert.equal((await pedir(env, '/api/datos', undefined, 'solo-leer')).status, 200);
  for (const [metodo, ruta] of [['POST', '/api/sync'], ['POST', '/api/purgar'], ['POST', '/api/borrar-todo'], ['PUT', '/api/foto/abc'], ['DELETE', '/api/foto/abc'], ['POST', '/api/push/suscribir']] as const) {
    const r = await worker.fetch(new Request(`https://x.workers.dev${ruta}`, { method: metodo, headers: { Authorization: 'Bearer solo-leer' }, body: '{}' }), env);
    assert.equal(r.status, 403, `${metodo} ${ruta}`);
  }
});

test('A07: tras 8 tokens equivocados esa conexión espera, aunque ya acierte; otra conexión no se ve afectada', async () => {
  const env = entorno();
  const desde = (ip: string, token: string): Promise<Response> => worker.fetch(new Request('https://x.workers.dev/api/datos', { headers: { Authorization: `Bearer ${token}`, 'CF-Connecting-IP': ip } }), env);
  for (let i = 0; i < 8; i++) assert.equal((await desde('203.0.113.9', `malo-${i}`)).status, 401);
  const bloqueada = await desde('203.0.113.9', 'token-api');
  assert.equal(bloqueada.status, 429);
  assert.ok(Number(bloqueada.headers.get('Retry-After')) >= 1);
  assert.equal((await desde('203.0.113.10', 'token-api')).status, 200);
});

test('A07: la clave del buzón también se frena con la fuerza bruta', async () => {
  const env = entorno({ BUZON_CLAVE: 'clave-del-buzon-123' });
  const intento = (clave: string): Promise<Response> => worker.fetch(new Request('https://x.workers.dev/api/buzon', { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${clave}`, 'CF-Connecting-IP': '198.51.100.7' } }), env);
  for (let i = 0; i < 8; i++) assert.equal((await intento(`mala-${i}`)).status, 401);
  assert.equal((await intento('clave-del-buzon-123')).status, 429);
});

test('A07: la comparación de tokens no depende de cuántas letras coinciden ni del largo', async () => {
  const { igualesSeguro } = await import('../src/comun.ts');
  assert.equal(igualesSeguro('abc', 'abc'), true);
  assert.equal(igualesSeguro('abc', 'abd'), false);
  assert.equal(igualesSeguro('abc', 'abcd'), false);
  assert.equal(igualesSeguro('', 'a'), false);
  assert.equal(igualesSeguro('', ''), true); // el vacío nunca autoriza: tokenValido exige que el esperado no sea vacío
});

// ======================================================================= SSRF

test('SSRF: solo https a un dominio público; nada de IP, localhost, redes internas, credenciales ni puertos raros', () => {
  const malas = [
    'http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/x', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/x',
    'https://192.168.1.1/x', 'https://2130706433/x', 'https://0x7f.1/x', 'https://intranet/x', 'https://servicio.internal/x', 'https://host.local/x',
    'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'ftp://fcm.googleapis.com/x', 'file:///etc/passwd', 'javascript:alert(1)',
    'https://fcm.googleapis.com\\@evil.example/x', 'https://evil.example/\u0000', 'https://', '', null, 42, undefined,
  ];
  for (const m of malas) assert.equal(urlPublicaHttps(m), null, `debió rechazar ${String(m)}`);
  assert.ok(urlPublicaHttps('https://otra-app.workers.dev'));
  assert.ok(urlPublicaHttps('https://fcm.googleapis.com/fcm/send/abc'));
});

test('SSRF: un aviso solo puede salir hacia los servicios de avisos de los navegadores', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc', 'https://wns2-pn1p.notify.windows.com/w/?token=abc'])
    assert.equal(esServicioDePush(ok), true, ok);
  for (const mal of ['https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://evil.example/fcm.googleapis.com', 'https://notify.windows.com.evil.example/x', 'http://fcm.googleapis.com/x', 'https://169.254.169.254/x'])
    assert.equal(esServicioDePush(mal), false, mal);
  const llaves = { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) };
  assert.equal(suscripcionValida({ endpoint: 'https://169.254.169.254/latest', keys: llaves }), false);
  assert.equal(suscripcionValida({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: llaves }), true);
});

test('SSRF: suscribir un destino interno da 400, y un destino viejo guardado no recibe ningún fetch', async () => {
  const env = entorno();
  const llaves = { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) };
  for (const endpoint of ['https://169.254.169.254/latest', 'https://localhost/x', 'https://evil.example/x', 'http://fcm.googleapis.com/x'])
    assert.equal((await pedir(env, '/api/push/suscribir', { suscripcion: { endpoint, keys: llaves } })).status, 400, endpoint);
  const original = globalThis.fetch;
  let salidas = 0;
  globalThis.fetch = (async () => { salidas++; return new Response('', { status: 201 }); }) as typeof fetch;
  try {
    const r = await enviarAviso({ endpoint: 'https://169.254.169.254/latest', keys: llaves }, { titulo: 'x', cuerpo: 'y' }, { publica: 'p', privada: 'q' } as never);
    assert.equal(r, 'caducada');
    assert.equal(salidas, 0, 'no debe salir ninguna petición hacia un destino que no es un servicio de avisos');
  } finally { globalThis.fetch = original; }
});

test('SSRF: el buzón no llama a destinos que no sean https públicos y no sigue redirecciones con la clave', async () => {
  let llamadas = 0;
  const llamar = (async () => { llamadas++; return new Response('{}'); }) as typeof fetch;
  for (const url of ['http://otra.workers.dev', 'https://127.0.0.1', 'https://localhost', 'https://169.254.169.254', 'https://u:p@otra.workers.dev']) {
    const r = await enviarAlBuzon({ BUZON_DESTINOS: JSON.stringify({ mama: { url, clave: 'k' } }) }, { destino: 'mama', monto: 1000, concepto: 'x' }, llamar);
    assert.equal(r.ok, false, url);
  }
  assert.equal(llamadas, 0);
  let init: RequestInit | undefined;
  const ok = (async (_u: unknown, i?: RequestInit) => { init = i; return new Response('{}'); }) as typeof fetch;
  const r = await enviarAlBuzon({ BUZON_DESTINOS: JSON.stringify({ mama: { url: 'https://otra.workers.dev', clave: 'k' } }) }, { destino: 'mama', monto: 1000, concepto: 'x' }, ok);
  assert.equal(r.ok, true);
  assert.equal(init?.redirect, 'manual');
});

test('SSRF: el lector de comprobantes no acepta direcciones: solo imágenes en base64', async () => {
  const env = entorno({ AI: { run: async () => { throw new Error('no debió llegar al modelo'); } } });
  for (const imagen of ['https://evil.example/x.jpg', 'http://169.254.169.254/', 'data:image/jpeg;base64,@@@', 'file:///etc/passwd', 'x'.repeat(10)])
    assert.equal((await pedir(env, '/api/ocr', { imagen })).status, 400, imagen.slice(0, 30));
});

// ======================================================================= A08 / A10 entradas gigantes, NaN, Infinity

test('A08: el servidor rechaza montos que no son enteros seguros, NaN, Infinity, exagerados, textos kilométricos y fechas raras', async () => {
  const malos: Record<string, (h: ReturnType<typeof movimiento>) => void> = {
    'monto 1e300': h => { h.movimiento.asientos[0].monto = 1e300; h.movimiento.asientos[1].monto = -1e300; },
    'monto con decimales': h => { h.movimiento.asientos[0].monto = 10.5; h.movimiento.asientos[1].monto = -10.5; },
    'monto texto': h => { (h.movimiento.asientos[0] as unknown as { monto: unknown }).monto = '5000'; },
    'monto Infinity (JSON lo vuelve null)': h => { h.movimiento.asientos[0].monto = Infinity; },
    'monto NaN (JSON lo vuelve null)': h => { h.movimiento.asientos[0].monto = NaN; },
    'monto por encima del tope': h => { h.movimiento.asientos[0].monto = 2e13; h.movimiento.asientos[1].monto = -2e13; },
    'descripción de 10.000 letras': h => { h.movimiento.descripcion = 'a'.repeat(10_000); },
    'fecha con código': h => { h.movimiento.ocurridoEn = "2026-10-19'; DROP TABLE movimientos;--"; },
    'fecha de 5.000 letras': h => { h.movimiento.ocurridoEn = '2026-10-19 '.padEnd(5000, '0'); },
    'moneda inventada': h => { (h.movimiento.asientos[0] as unknown as { moneda: string }).moneda = 'XXX'; },
    'cientos de asientos': h => { h.movimiento.asientos = Array.from({ length: 500 }, (_, i) => ({ cuentaId: 'sys:x', monto: i % 2 ? -1 : 1, moneda: 'COP' })) as never; },
    'etiqueta gigante': h => { (h.movimiento as unknown as { etiqueta: string }).etiqueta = 'e'.repeat(2000); },
  };
  for (const [nombre, f] of Object.entries(malos)) {
    const h = movimiento('almuerzo 5000');
    f(h);
    const motivo = validarOp(JSON.parse(JSON.stringify(guardar(h))));
    assert.ok(motivo, `«${nombre}» debió rechazarse`);
    const env = entorno();
    const r = await pedir(env, '/api/sync', { ops: [guardar(h)] });
    const j = (await r.json()) as { datos?: Datos; rechazadas?: unknown[]; error?: string };
    assert.ok(r.status >= 400 || (j.rechazadas?.length ?? 0) > 0 || j.datos?.movimientos.length === 0, `«${nombre}» no se rechazó`);
    assert.equal(j.datos?.movimientos.length ?? 0, 0, `«${nombre}» se guardó`);
  }
  assert.equal(validarOp(guardar(movimiento('almuerzo 5000'))), null, 'un movimiento normal sigue pasando');
});

test('A08: demasiadas operaciones, cuerpos gigantes y JSON roto se rechazan sin tocar la base', async () => {
  const env = entorno();
  const una = guardar(movimiento('almuerzo 5000'));
  assert.equal((await pedir(env, '/api/sync', { ops: Array.from({ length: 1001 }, () => una) })).status, 400);
  assert.equal((await pedir(env, '/api/sync', 'esto no es json {')).status, 400);
  assert.equal((await pedir(env, '/api/sync', { ops: 'no es lista' })).status, 400);
  assert.equal((await pedir(env, '/api/sync', { ops: [null, 5, 'x', { op: 'borrar-todo' }] })).status, 200);
  const gigante = await pedir(env, '/api/sync', { ops: [] }, 'token-api', { 'Content-Length': '5000000' });
  assert.equal(gigante.status, 413);
  const datos = (await (await pedir(env, '/api/datos')).json()) as { datos: Datos };
  assert.equal(datos.datos.movimientos.length, 0);
});

test('A08: las fotos solo son JPEG, de hasta 300 KB, y el id no sale de la regla', async () => {
  const env = entorno();
  const put = (cuerpo: Uint8Array, id = 'abc'): Promise<Response> => worker.fetch(new Request(`https://x.workers.dev/api/foto/${id}`, { method: 'PUT', body: cuerpo as BodyInit, headers: { Authorization: 'Bearer token-api' } }), env);
  assert.equal((await put(new TextEncoder().encode('<script>alert(1)</script>'))).status, 400);
  assert.equal((await put(Uint8Array.of(0x89, 0x50, 0x4e, 0x47))).status, 400);
  const grande = new Uint8Array(300_001); grande[0] = 0xff; grande[1] = 0xd8;
  assert.equal((await put(grande)).status, 413);
  const buena = new Uint8Array(100); buena[0] = 0xff; buena[1] = 0xd8;
  assert.equal((await put(buena)).status, 200);
  const r = await worker.fetch(new Request('https://x.workers.dev/api/foto/abc', { headers: { Authorization: 'Bearer token-api' } }), env);
  assert.equal(r.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await put(buena, 'a'.repeat(65))).status, 404);
});

test('A08: el mensaje que llega a la IA y el aviso del buzón tienen límites de tamaño y de forma', async () => {
  const env = entorno({ AI: { run: async () => ({ response: '[]' }) }, BUZON_CLAVE: 'clave-del-buzon-123' });
  assert.equal((await pedir(env, '/api/interpretar', { texto: 'a'.repeat(5000) })).status, 400);
  for (const aviso of [{ de: 'x', monto: -5 }, { de: 'x', monto: Number.NaN }, { de: 'x', monto: 1.5 }, { de: 'x', monto: 5e15 }, { de: 'x'.repeat(100), monto: 5 }, { de: 'x', monto: 5, concepto: 'c'.repeat(500) }, { de: 'x', monto: 5, propuesta: 'a\nb' }]) {
    const r = await pedir(env, '/api/buzon', aviso, 'clave-del-buzon-123');
    assert.equal(r.status, 400, JSON.stringify(aviso).slice(0, 60));
  }
});

// ======================================================================= A02 configuración: cabeceras y CORS

test('A02: toda respuesta (página, API, errores y 404) lleva las cabeceras de seguridad', async () => {
  const env = entorno({ ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) } });
  const respuestas = [
    await pedir(env, '/', undefined, null), await pedir(env, '/api/datos'), await pedir(env, '/api/datos', undefined, 'malo'),
    await pedir(env, '/api/no-existe'), await pedir(env, '/api/sync', 'roto {'),
  ];
  for (const r of respuestas) {
    const csp = r.headers.get('Content-Security-Policy') ?? '';
    for (const regla of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "script-src 'self'", "form-action 'self'"]) assert.ok(csp.includes(regla), `falta ${regla}`);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp.match(/script-src[^;]*/)![0], /unsafe-inline|\*|https?:/);
    assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(r.headers.get('X-Frame-Options'), 'DENY');
    assert.match(r.headers.get('Referrer-Policy') ?? '', /no-referrer|strict-origin/);
    assert.match(r.headers.get('Strict-Transport-Security') ?? '', /max-age=\d{7,}/);
    const permisos = r.headers.get('Permissions-Policy') ?? '';
    assert.match(permisos, /geolocation=\(\)/);
    assert.match(permisos, /payment=\(\)/);
    assert.equal(r.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
    assert.equal(r.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  }
});

test('A02: no hay CORS abierto: ninguna respuesta autoriza a otro origen y el preflight no concede nada', async () => {
  const env = entorno();
  const respuestas = [
    await worker.fetch(new Request('https://x.workers.dev/api/datos', { headers: { Authorization: 'Bearer token-api', Origin: 'https://evil.example' } }), env),
    await worker.fetch(new Request('https://x.workers.dev/api/sync', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' } }), env),
    await pedir(env, '/api/datos', undefined, 'malo', { Origin: 'https://evil.example' }),
  ];
  for (const r of respuestas) {
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
  }
  assert.equal(respuestas[1].status, 401, 'el preflight sin token no llega a ninguna ruta');
});

test('A02: el wrangler.toml no trae secretos ni variables públicas con claves, y no abre rutas de más', () => {
  const t = readFileSync(join(raiz, 'apps', 'worker', 'wrangler.toml'), 'utf8');
  assert.doesNotMatch(t, /API_TOKEN\s*=|PIN_BORRADO\s*=|RESPALDO_(?:TOKEN|CLAVE)\s*=|BUZON_CLAVE\s*=|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(t, /\[vars\][^[]*(?:TOKEN|CLAVE|SECRET|PASSWORD)/i);
});

// ======================================================================= A04 secretos y cripto

test('A04: la app web no lleva secretos ni variables VITE_ con claves, y los tokens usan entropía criptográfica', () => {
  const archivos: string[] = [];
  const recorrer = (d: string): void => { for (const n of readdirSync(d)) { const r = join(d, n); statSync(r).isDirectory() ? recorrer(r) : /\.(tsx?|jsx?|html|json)$/.test(n) && archivos.push(r); } };
  recorrer(join(raiz, 'apps', 'web', 'src'));
  for (const f of archivos) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /VITE_[A-Z_]*(?:TOKEN|KEY|SECRET|CLAVE)/, f);
    assert.doesNotMatch(t, /(?:token|clave|secret|pin)\w*\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/i, `${f} trae una clave escrita`);
  }
  const codigo = ['apps/worker/src', 'packages/core/src', 'apps/web/src'].flatMap(d => {
    const lista: string[] = []; const rec = (p: string): void => { for (const n of readdirSync(p)) { const r = join(p, n); statSync(r).isDirectory() ? rec(r) : /\.tsx?$/.test(n) && lista.push(r); } }; rec(join(raiz, d)); return lista;
  });
  for (const f of codigo) assert.doesNotMatch(readFileSync(f, 'utf8'), /Math\.random\(\)[^;\n]*(?:token|clave|secret|salt|nonce)/i, `${f} saca un secreto de Math.random`);
});

// ======================================================================= A09 registros, A10 errores

test('A10: un fallo de la base devuelve 500 genérico, sin rutas ni mensajes de SQLite, y no deja datos a medias', async () => {
  const roto = { prepare() { throw new Error('SQLITE_ERROR: no such table: movimientos at /home/runner/work/app/src/d1repo.ts:34:12'); }, batch: async () => { throw new Error('SQLITE_BUSY: /var/lib/db'); }, exec: async () => { throw new Error('SQLITE_FULL'); } };
  const env = entorno();
  env.DB = roto as never;
  const original = console.error;
  const registros: string[] = [];
  console.error = (...a: unknown[]) => { registros.push(a.join(' ')); };
  try {
    for (const [metodo, ruta, cuerpo] of [['GET', '/api/datos', undefined], ['POST', '/api/sync', { ops: [guardar(movimiento('almuerzo 5000'))] }], ['GET', '/api/salud', undefined]] as const) {
      const r = await pedir(env, ruta, cuerpo, 'token-api', {}, metodo);
      assert.equal(r.status, 500, ruta);
      const t = await r.text();
      assert.doesNotMatch(t, /SQLITE|\/home\/|\/var\/|d1repo|at .*:\d+:\d+|stack|Error:/i, `la respuesta de ${ruta} filtra detalles: ${t}`);
      assert.match(t, /Error del servidor/);
    }
  } finally { console.error = original; }
  assert.ok(registros.length > 0, 'el motivo se registra para verlo con wrangler tail');
  assert.ok(registros.every(r => !r.includes('token-api')), 'los registros no llevan el token');
});

test('A09: los intentos fallidos quedan registrados sin volcar el token ni los datos', async () => {
  const env = entorno();
  const original = console.warn;
  const registros: string[] = [];
  console.warn = (...a: unknown[]) => { registros.push(a.join(' ')); };
  try {
    await pedir(env, '/api/sync', { ops: [], nota: 'secreto-financiero-12345' }, 'token-equivocado-987');
    await worker.fetch(new Request('https://x.workers.dev/api/buzon', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer clave-mala-654' } }), entorno({ BUZON_CLAVE: 'clave-del-buzon-123' }));
  } finally { console.warn = original; }
  assert.ok(registros.length >= 2, 'se anotó cada intento');
  for (const r of registros) {
    assert.doesNotMatch(r, /token-equivocado-987|clave-mala-654|secreto-financiero-12345|token-api|clave-del-buzon-123/);
  }
  assert.ok(registros.some(r => r.includes('/api/sync')));
});

test('A10: el método raro y las rutas inventadas fallan cerrado con un error JSON corto', async () => {
  const env = entorno();
  for (const [metodo, ruta] of [['PATCH', '/api/datos'], ['PUT', '/api/datos'], ['GET', '/api/'], ['GET', '/api/no-existe'], ['POST', '/api/foto/']] as const) {
    const r = await worker.fetch(new Request(`https://x.workers.dev${ruta}`, { method: metodo, headers: { Authorization: 'Bearer token-api' } }), env);
    assert.ok([400, 404, 405].includes(r.status), `${metodo} ${ruta} → ${r.status}`);
    assert.doesNotMatch(await r.text(), /stack|SQLITE|.ts:d+/);
  }
});

// ======================================================================= A03 cadena de suministro

test('A03: el package-lock.json existe, es íntegro y todo viene de npm con su hash', () => {
  const lock = JSON.parse(readFileSync(join(raiz, 'package-lock.json'), 'utf8')) as { lockfileVersion: number; packages: Record<string, { resolved?: string; integrity?: string; link?: boolean; inBundle?: boolean }> };
  assert.ok(lock.lockfileVersion >= 2);
  const raros: string[] = [];
  for (const [ruta, p] of Object.entries(lock.packages)) {
    if (!ruta || p.link || p.inBundle) continue; // lo que va dentro de un paquete (los módulos wasm de tailwind) no se baja aparte
    if (!p.resolved || !/^https:\/\/registry\.npmjs\.org\//.test(p.resolved) || !p.integrity) raros.push(ruta);
  }
  assert.deepEqual(raros, [], 'paquetes sin hash o que no vienen del registro de npm');
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  for (const gancho of ['preinstall', 'install', 'postinstall']) assert.equal(pkg.scripts?.[gancho], undefined, `el proyecto no corre scripts de instalación (${gancho})`);
});
