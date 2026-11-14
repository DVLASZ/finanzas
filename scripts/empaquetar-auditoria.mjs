// Empaqueta el código para revisarlo fuera (por ejemplo, subiéndolo a un chat de IA): varios archivos Markdown
// numerados, ninguno de más de 3.500 líneas ni de unos 120 KB, agrupados por capas. Solo entran archivos que git
// sigue, así que nada privado (instalaciones, claves, respaldos) puede colarse.
//
// Uso: node scripts/empaquetar-auditoria.mjs [carpeta-de-salida]     (por defecto, Descargas)

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = process.argv[2] ?? join(homedir(), 'Downloads');
const MAX_LINEAS = 3500;
const MAX_BYTES = 118_000;

const BINARIOS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.zip', '.bundle', '.pdf', '.xlsx', '.log']);
const git = c => execSync(c, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

const rutas = git('git ls-files').split('\n').filter(r =>
  r && !BINARIOS.has(extname(r).toLowerCase()) && r !== 'package-lock.json' && !/(^|\/)(dist|\.wrangler|node_modules)\//.test(r) && !r.endsWith('.gitkeep'));

const capa = r => (r.startsWith('packages/') ? 2 : r.startsWith('apps/web/') ? 3 : r.startsWith('docs/') ? 4 : 1);
const CAPAS = {
  1: 'Configuración raíz, base de datos, scripts, pruebas compartidas y Worker (backend)',
  2: 'packages/core: el motor (tipos, partida doble, parser, bot, consultas, seguro, hormiga, comprobantes)',
  3: 'apps/web: la PWA (componentes, funciones, estado, servicios, estilos, service worker)',
  4: 'docs: documentación',
};

// ---- árbol de directorios
function arbol(lista) {
  const raizArbol = {};
  for (const r of lista) r.split('/').reduce((n, p) => (n[p] ??= {}), raizArbol);
  const lineas = [];
  (function pintar(n, prefijo) {
    const claves = Object.keys(n).sort((a, b) => (Object.keys(n[b]).length > 0) - (Object.keys(n[a]).length > 0) || a.localeCompare(b));
    claves.forEach((k, i) => {
      const ultimo = i === claves.length - 1;
      lineas.push(`${prefijo}${ultimo ? '└── ' : '├── '}${k}${Object.keys(n[k]).length ? '/' : ''}`);
      pintar(n[k], prefijo + (ultimo ? '    ' : '│   '));
    });
  })(raizArbol, '');
  return lineas.join('\n');
}

// ---- cada archivo como bloque de Markdown (o varios, si es enorme)
function bloquesDe(ruta) {
  const texto = readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const lineas = texto.split('\n');
  const trozos = [];
  let actual = [], bytes = 0;
  for (const l of lineas) {
    if (actual.length >= 2500 || bytes + l.length > 90_000) { trozos.push(actual); actual = []; bytes = 0; }
    actual.push(l); bytes += l.length + 1;
  }
  trozos.push(actual);
  return trozos.map((t, i) => {
    const cuerpo = t.join('\n');
    const valla = '`'.repeat(Math.max(3, ...[...cuerpo.matchAll(/`+/g)].map(m => m[0].length + 1)));
    const lang = extname(ruta).slice(1);
    const nota = trozos.length > 1 ? ` (fragmento ${i + 1} de ${trozos.length})` : '';
    const texto = `\n## ${ruta}${nota}\n\n${valla}${lang}\n${cuerpo}\n${valla}\n`;
    return { ruta, texto, lineas: texto.split('\n').length - 1, bytes: Buffer.byteLength(texto) };
  });
}

// ---- reparto en partes: cada capa empieza una parte nueva, y dentro de la capa se llena hasta el tope
const cabecera = 700;  // reserva para el encabezado de cada parte (y el resumen de la parte 1)
const partes = [];
for (const c of [1, 2, 3, 4]) {
  let actual = null;
  for (const ruta of rutas.filter(r => capa(r) === c).sort()) {
    for (const b of bloquesDe(ruta)) {
      const reserva = partes.length === 0 && !actual ? 2200 : cabecera;
      if (!actual || actual.lineas + b.lineas + reserva > MAX_LINEAS || actual.bytes + b.bytes > MAX_BYTES) {
        actual = { capa: c, bloques: [], lineas: 0, bytes: 0 };
        partes.push(actual);
      }
      actual.bloques.push(b); actual.lineas += b.lineas; actual.bytes += b.bytes;
    }
  }
}

// ---- texto de la parte 1: árbol, commits, deuda técnica
const commits = git('git log -15 --format=%h%x20%s');
const indice = partes.map((p, i) => `- **auditoria-parte-${i + 1}.md**: capa ${p.capa}. ${[...new Set(p.bloques.map(b => b.ruta))].length} archivos, desde \`${p.bloques[0].ruta}\` hasta \`${p.bloques.at(-1).ruta}\``).join('\n');
const DEUDA = `
### Lo que falta o tiene deuda técnica

- Pantallas que siguen armando HTML con plantillas de texto y se montan dentro de \`VistaLegada\`: Ajustes, Categorías y personas, Catálogo y Lista de compras, Buzón, Conciliar, Primeros pasos, Deudas y Trabajadores. Solo Revisión del mes y las cinco pantallas principales son componentes.
- \`apps/web/src/services/app.ts\` es un solo archivo grande (copia local, cola, sincronización, avisos, IA, fotos). No está partido por servicio.
- La lectura de comprobantes (\`/api/ocr\`, modelo \`@cf/llava-hf/llava-1.5-7b-hf\`) no se probó con comprobantes reales. Un modelo pequeño se equivoca con letra borrosa.
- El \`share_target\` y los accesos directos del manifiesto no se probaron en un celular con la app instalada. La franja inferior del móvil tampoco se confirmó en un Android real.
- El buzón entre apps manda avisos de monto; no hay movimientos directos entre instalaciones.
- Los pagos fijos son solo mensuales y el aviso sale dos días antes del cobro.
- No hay pruebas de componentes del frontend: la interfaz se prueba con el e2e en un navegador de escritorio (\`scripts/e2e.mjs\`) y a mano en móvil.
- El seguro para gastar y los gastos hormiga solo cuentan pesos (COP); los dólares no se convierten solos a propósito.
- \`D1Repo.cargar()\` trae todo en cada sincronización. Con el volumen de una persona rinde; con mucho histórico habría que paginar.
- El ritmo de gasto del Resumen calcula día por día recorriendo los movimientos (unas 60 pasadas por vista).
- Ventas con catálogo y fiado, pero sin control de existencias.
- \`variante.json\` y \`VARIANTE.md\` siguen en la raíz de cada rama (no hay carpeta \`config/\`).
`;

mkdirSync(destino, { recursive: true });
for (const f of readdirSync(destino)) if (/^auditoria-parte-\d+\.md$/.test(f)) rmSync(join(destino, f));

const resultado = [];
partes.forEach((p, i) => {
  const n = i + 1;
  let txt = `# Auditoría del código: parte ${n} de ${partes.length}\n\n**Capa ${p.capa}:** ${CAPAS[p.capa]}\n\nGenerado ${new Date().toISOString().slice(0, 10)} desde la rama \`${git('git branch --show-current')}\`, commit \`${git('git rev-parse --short HEAD')}\`. Solo archivos que git sigue.\n`;
  if (n === 1) {
    txt += `\n## Cómo leer estos archivos\n\nEl código está repartido en ${partes.length} archivos numerados para que ninguno se trunque. Cada archivo empieza con la lista de lo que trae.\n\n${indice}\n`;
    txt += `\n## Árbol de directorios\n\n\`\`\`text\n${arbol(rutas)}\n\`\`\`\n`;
    txt += `\n## Últimos commits\n\n\`\`\`text\n${commits}\n\`\`\`\n${DEUDA}`;
  }
  txt += `\n## Archivos de esta parte\n\n${[...new Set(p.bloques.map(b => b.ruta))].map(r => `- ${r}`).join('\n')}\n\n---\n`;
  txt += p.bloques.map(b => b.texto).join('');
  const archivo = join(destino, `auditoria-parte-${n}.md`);
  writeFileSync(archivo, txt);
  resultado.push({ archivo, lineas: txt.split('\n').length - 1, kb: Math.round(Buffer.byteLength(txt) / 1024) });
});
for (const r of resultado) console.log(`${r.archivo}  ${r.lineas} líneas  ${r.kb} KB${r.lineas > MAX_LINEAS ? '  ¡PASA EL TOPE!' : ''}`);
