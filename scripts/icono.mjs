// El ícono de la app: tres barras que suben y un destello, sobre un fondo de degradado profundo.
//
// Se dibuja a mano, sin imágenes externas. Todo el dibujo cae dentro del 60 % central: así Android puede
// recortarlo en círculo, cuadrado o gota (ícono «maskable») sin cortar nada. El acento cambia por plantilla
// para distinguir las apps en la pantalla de inicio.

import { deflateSync } from 'node:zlib';

const ACENTOS = {
  personal: { a: '#10B981', b: '#38BDF8', fondo: ['#0B0F19', '#131C31'] },
  familia: { a: '#8B5CF6', b: '#6366F1', fondo: ['#0D0B1A', '#1A1533'] },
  empresa: { a: '#F59E0B', b: '#FCD34D', fondo: ['#110E09', '#241A0E'] },
};

const rgb = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
const mezcla = (c1, c2, t) => c1.map((v, k) => v + (c2[k] - v) * Math.min(1, Math.max(0, t)));

// barras en unidades de 0 a 1
const BARRAS = [0, 1, 2].map(k => ({ x: 0.30 + k * 0.15, w: 0.10, alto: [0.20, 0.32, 0.46][k] }));
const BASE = 0.72;
const NODO = { x: 0.745, y: 0.235, r: 0.042 };

function sdfCaja(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r), dy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

const tablaCrc = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = tablaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const trozo = (tipo, datos) => {
  const t = Buffer.from(tipo);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([largo, t, datos, crc]);
};

export function crearIconos(plantilla, colorPorDefecto = '#1f7a5a') {
  const acento = ACENTOS[plantilla] ?? { a: colorPorDefecto, b: colorPorDefecto, fondo: ['#0B0F19', '#131C31'] };
  const [A, B, F1, F2] = [rgb(acento.a), rgb(acento.b), rgb(acento.fondo[0]), rgb(acento.fondo[1])];

  function pixel(x, y) {
    // fondo: degradado diagonal y dos resplandores suaves
    let c = mezcla(F1, F2, (x + y) / 2);
    c = mezcla(c, A, Math.max(0, 1 - Math.hypot(x - 0.18, y - 0.95) / 0.75) * 0.2);
    c = mezcla(c, B, Math.max(0, 1 - Math.hypot(x - 0.85, y - 0.12) / 0.6) * 0.16);
    // barras con degradado vertical: A abajo, B arriba
    for (const br of BARRAS) {
      if (sdfCaja(x, y, br.x + br.w / 2, BASE - br.alto / 2, br.w / 2, br.alto / 2, 0.03) < 0) c = mezcla(A, B, (BASE - y) / 0.5);
    }
    // el destello: un nodo con anillo
    const dn = Math.hypot(x - NODO.x, y - NODO.y);
    if (dn < NODO.r * 2.3) c = mezcla(c, B, Math.max(0, 1 - dn / (NODO.r * 2.3)) * 0.35);
    if (dn < NODO.r) c = [255, 255, 255];
    else if (Math.abs(dn - NODO.r * 1.8) < 0.006) c = mezcla(c, B, 0.9);
    return c;
  }

  function png(tam) {
    const N = 3; // 3x3 muestras por píxel: bordes suaves
    const filas = [];
    for (let y = 0; y < tam; y++) {
      const fila = Buffer.alloc(1 + tam * 4); // filtro 0 + RGBA
      for (let x = 0; x < tam; x++) {
        const s = [0, 0, 0];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const c = pixel((x + (i + 0.5) / N) / tam, (y + (j + 0.5) / N) / tam);
          s[0] += c[0]; s[1] += c[1]; s[2] += c[2];
        }
        fila.set([Math.round(s[0] / (N * N)), Math.round(s[1] / (N * N)), Math.round(s[2] / (N * N)), 255], 1 + x * 4);
      }
      filas.push(fila);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(tam, 0);
    ihdr.writeUInt32BE(tam, 4);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      trozo('IHDR', ihdr),
      trozo('IDAT', deflateSync(Buffer.concat(filas))),
      trozo('IEND', Buffer.alloc(0)),
    ]);
  }

  const barras = BARRAS.map(br => `<rect x="${br.x * 512}" y="${(BASE - br.alto) * 512}" width="${br.w * 512}" height="${br.alto * 512}" rx="15" fill="url(#b)"/>`).join('\n  ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${acento.fondo[0]}"/><stop offset="1" stop-color="${acento.fondo[1]}"/></linearGradient>
    <linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${acento.a}"/><stop offset="1" stop-color="${acento.b}"/></linearGradient>
    <radialGradient id="r1" cx="0.18" cy="0.95" r="0.75"><stop offset="0" stop-color="${acento.a}" stop-opacity=".2"/><stop offset="1" stop-color="${acento.a}" stop-opacity="0"/></radialGradient>
    <radialGradient id="r2" cx="0.85" cy="0.12" r="0.6"><stop offset="0" stop-color="${acento.b}" stop-opacity=".16"/><stop offset="1" stop-color="${acento.b}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#f)"/><rect width="512" height="512" fill="url(#r1)"/><rect width="512" height="512" fill="url(#r2)"/>
  ${barras}
  <circle cx="${NODO.x * 512}" cy="${NODO.y * 512}" r="${NODO.r * 512 * 1.8}" fill="none" stroke="${acento.b}" stroke-width="3" opacity=".9"/>
  <circle cx="${NODO.x * 512}" cy="${NODO.y * 512}" r="${NODO.r * 512}" fill="#fff"/>
</svg>
`;
  return { svg, png192: png(192), png512: png(512) };
}
