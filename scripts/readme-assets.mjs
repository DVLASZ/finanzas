// Genera los dos SVG animados del README: docs/screenshots/banner.svg y docs/assets/typing-demo.svg.
// Son SVG con animaciones CSS, sin imágenes: GitHub los muestra animados. Las frases son ejemplos reales que
// el bot entiende (están en docs/BOT.md). Uso: node scripts/readme-assets.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'docs', 'assets');
const salidaBanner = join(raiz, 'docs', 'screenshots');
mkdirSync(salida, { recursive: true });
mkdirSync(salidaBanner, { recursive: true });

const FRASES = [
  { dice: 'mecato 5000', entiende: 'Gasto · Mecato · $5.000 · Efectivo' },
  { dice: 'presté 40000 a Ana', entiende: 'Préstamo · le prestas a Ana · $40.000' },
  { dice: 'almuerzo 60000 entre Ana, Luis y yo', entiende: 'Compartido · tu parte $20.000 · ellos te deben $40.000' },
  { dice: 'vendí 3 botellas', entiende: 'Venta · 3 botellas · con el precio de tu catálogo' },
];
const CICLO = 5.4; // segundos por frase
const TOTAL = CICLO * FRASES.length;

/** Las animaciones de cada frase: se escribe, se queda, y se borra para dar paso a la siguiente. */
function animaciones(tam) {
  const cw = tam * 0.6;
  return FRASES.map((f, i) => {
    const ini = (i * CICLO / TOTAL) * 100;
    const fin = ini + (1.7 / TOTAL) * 100;      // termina de escribir
    const resp = fin + (0.5 / TOTAL) * 100;    // aparece lo que entendió
    const borra = ini + (CICLO - 0.4) / TOTAL * 100;
    const p = n => n.toFixed(3);
    return `
    @keyframes t${i} { 0%, ${p(ini)}% { width: 0; animation-timing-function: steps(${f.dice.length}, end); } ${p(fin)}%, ${p(borra)}% { width: ${p(f.dice.length * cw + 4)}px; } ${p(borra + 0.01)}%, 100% { width: 0; } }
    @keyframes r${i} { 0%, ${p(fin)}% { opacity: 0; transform: translateY(6px); } ${p(resp)}%, ${p(borra)}% { opacity: 1; transform: none; } ${p(borra + 0.01)}%, 100% { opacity: 0; } }
    .t${i} { animation: t${i} ${TOTAL}s linear infinite; }
    .r${i} { animation: r${i} ${TOTAL}s linear infinite; }`;
  }).join('');
}

/** El bloque que escribe la frase y muestra lo que entendió, a partir de (x, y). */
function bloque(x, y, tam, colorFrase, colorResp) {
  const cw = tam * 0.6;
  return FRASES.map((f, i) => `
  <g>
    <clipPath id="c${i}-${x}"><rect class="t${i}" x="${x}" y="${y - tam - 4}" width="0" height="${tam + 12}"/></clipPath>
    <text x="${x}" y="${y}" clip-path="url(#c${i}-${x})" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${tam}" fill="${colorFrase}" textLength="${f.dice.length * cw}" lengthAdjust="spacing">${f.dice}</text>
    <text class="r${i}" x="${x}" y="${y + tam + 14}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="${Math.round(tam * 0.72)}" fill="${colorResp}">${f.entiende}</text>
  </g>`).join('');
}

const FONDO = `
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090D16"/><stop offset="1" stop-color="#111827"/></linearGradient>
    <linearGradient id="borde" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset=".5" stop-color="#10B981"/><stop offset="1" stop-color="#818CF8"/></linearGradient>
    <linearGradient id="titulo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset=".55" stop-color="#10B981"/><stop offset="1" stop-color="#818CF8"/></linearGradient>
    <radialGradient id="luz1" cx=".1" cy="1" r=".7"><stop offset="0" stop-color="#10B981" stop-opacity=".28"/><stop offset="1" stop-color="#10B981" stop-opacity="0"/></radialGradient>
    <radialGradient id="luz2" cx=".95" cy="0" r=".7"><stop offset="0" stop-color="#38BDF8" stop-opacity=".25"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>
    <radialGradient id="luz3" cx=".6" cy=".1" r=".5"><stop offset="0" stop-color="#818CF8" stop-opacity=".18"/><stop offset="1" stop-color="#818CF8" stop-opacity="0"/></radialGradient>`;

// ------------------------------------------------------------------ banner
const W = 1200, H = 330;
const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Finanzas por mensajes: cuéntale tu plata al chat">
  <title>Finanzas por mensajes</title>
  <defs>${FONDO}
  </defs>
  <style>${animaciones(30)}
    @keyframes pulso { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
    .punto { animation: pulso 2.4s ease-in-out infinite; }
  </style>
  <rect width="${W}" height="${H}" rx="26" fill="url(#fondo)"/>
  <rect width="${W}" height="${H}" rx="26" fill="url(#luz1)"/><rect width="${W}" height="${H}" rx="26" fill="url(#luz2)"/><rect width="${W}" height="${H}" rx="26" fill="url(#luz3)"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="25" fill="none" stroke="url(#borde)" stroke-opacity=".55" stroke-width="2"/>
  <g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
    <text x="64" y="104" font-size="56" font-weight="800" fill="url(#titulo)" letter-spacing="-1">Finanzas por mensajes</text>
    <text x="66" y="146" font-size="22" fill="#9CA9BF">Cuéntale tu plata al chat, como se la contarías a alguien.</text>
    <text x="${W - 64}" y="104" font-size="15" font-weight="700" fill="#818CF8" text-anchor="end" letter-spacing="1.5">PARTIDA DOBLE · SIN CONEXIÓN · GRATIS</text>
    <text x="${W - 64}" y="130" font-size="14" fill="#6B7A92" text-anchor="end">TypeScript · Preact · Cloudflare Workers y D1</text>
  </g>
  <g transform="translate(64 0)">
    <rect x="0" y="172" width="${W - 128}" height="136" rx="18" fill="#111827" stroke="#263249" stroke-width="1.5"/>
    <circle class="punto" cx="30" cy="200" r="5" fill="#10B981"/>
    <text x="48" y="205" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#10B981" letter-spacing="1.5">ESCRIBES</text>
    ${bloque(34, 252, 30, '#F1F5FB', '#38BDF8').replace(/translateY\(6px\)/g, 'translateY(6px)')}
  </g>
</svg>
`;
writeFileSync(join(salidaBanner, 'banner.svg'), banner);

// ------------------------------------------------------------------ demostración tipo chat
const W2 = 820, H2 = 250;
const demo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}" role="img" aria-label="Ejemplos de frases que entiende el chat">
  <title>Frases que entiende el chat</title>
  <defs>${FONDO}
  </defs>
  <style>${animaciones(26)}</style>
  <rect width="${W2}" height="${H2}" rx="22" fill="url(#fondo)"/>
  <rect width="${W2}" height="${H2}" rx="22" fill="url(#luz1)"/><rect width="${W2}" height="${H2}" rx="22" fill="url(#luz2)"/>
  <rect x="1.5" y="1.5" width="${W2 - 3}" height="${H2 - 3}" rx="21" fill="none" stroke="url(#borde)" stroke-opacity=".5" stroke-width="2"/>
  <g>
    <circle cx="34" cy="32" r="6" fill="#F43F5E"/><circle cx="56" cy="32" r="6" fill="#F59E0B"/><circle cx="78" cy="32" r="6" fill="#10B981"/>
    <text x="${W2 - 34}" y="37" text-anchor="end" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#6B7A92" letter-spacing="1.5">CHAT</text>
    <line x1="24" x2="${W2 - 24}" y1="56" y2="56" stroke="#263249"/>
  </g>
  <rect x="26" y="84" width="${W2 - 52}" height="74" rx="16" fill="#1B2538"/>
  <text x="46" y="78" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#38BDF8" letter-spacing="1.5">TÚ ESCRIBES</text>
  ${bloque(46, 128, 26, '#F1F5FB', '#10B981').replace(/y="(\d+)" font-family="system-ui/g, (m, y) => `y="${Number(y) + 28}" font-family="system-ui`)}
  <text x="46" y="${H2 - 26}" font-family="system-ui, sans-serif" font-size="13" fill="#6B7A92">El bot muestra lo que entendió, tú pulsas Confirmar y queda guardado.</text>
</svg>
`;
writeFileSync(join(salida, 'typing-demo.svg'), demo);
console.log('Listo: docs/screenshots/banner.svg y docs/assets/typing-demo.svg');
