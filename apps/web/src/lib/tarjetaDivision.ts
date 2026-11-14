/**
 * La tarjeta para compartir por WhatsApp cuando un gasto se divide entre varias personas: una imagen limpia con
 * el total y cuánto debe cada uno. Se dibuja en un canvas (sin librerías) y se comparte con `navigator.share`.
 */
import { formatear } from '../../../../packages/core/src/index.ts';

export interface FilaDivision { nombre: string; monto: number }
export interface DatosDivision { concepto: string; fecha: string; total: number; filas: FilaDivision[]; tuParte: number }

const COLORES = ['#38bdf8', '#818cf8', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa'];

function redondeado(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function dibujarTarjetaDivision(d: DatosDivision): Promise<Blob> {
  const W = 900, fila = 110, alto = 640 + d.filas.length * fila;
  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = alto;
  const c = lienzo.getContext('2d')!;
  const fuente = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // fondo y resplandores
  const fondo = c.createLinearGradient(0, 0, W, alto);
  fondo.addColorStop(0, '#0b0f19'); fondo.addColorStop(1, '#131c31');
  c.fillStyle = fondo; c.fillRect(0, 0, W, alto);
  for (const [x, y, col] of [[120, alto - 80, '16,185,129'], [W - 60, 80, '56,189,248']] as const) {
    const g = c.createRadialGradient(x, y, 0, x, y, 420);
    g.addColorStop(0, `rgba(${col},.22)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(0, 0, W, alto);
  }

  // tarjeta
  redondeado(c, 50, 50, W - 100, alto - 100, 44);
  c.fillStyle = 'rgba(17,24,39,.92)'; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 2; c.stroke();

  c.textBaseline = 'alphabetic';
  c.fillStyle = '#9ca9bf'; c.font = `600 30px ${fuente}`;
  c.fillText('GASTO COMPARTIDO', 100, 135);
  c.fillStyle = '#f1f5fb'; c.font = `700 52px ${fuente}`;
  c.fillText(d.concepto.length > 24 ? d.concepto.slice(0, 23) + '...' : d.concepto, 100, 210);
  c.fillStyle = '#9ca9bf'; c.font = `500 30px ${fuente}`;
  c.fillText(d.fecha, 100, 255);

  const g = c.createLinearGradient(100, 0, 560, 0);
  g.addColorStop(0, '#10b981'); g.addColorStop(1, '#38bdf8');
  c.fillStyle = g; c.font = `800 96px ${fuente}`;
  c.fillText(formatear(d.total), 100, 375);

  // una línea por persona
  let y = 430;
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(100, y, W - 200, 2);
  y += 20;
  d.filas.forEach((f, i) => {
    const cy = y + fila / 2;
    c.fillStyle = COLORES[i % COLORES.length];
    c.beginPath(); c.arc(140, cy, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#04141f'; c.font = `700 30px ${fuente}`; c.textAlign = 'center';
    c.fillText((f.nombre[0] ?? '?').toUpperCase(), 140, cy + 11);
    c.textAlign = 'left'; c.fillStyle = '#f1f5fb'; c.font = `600 38px ${fuente}`;
    c.fillText(f.nombre.length > 16 ? f.nombre.slice(0, 15) + '...' : f.nombre, 200, cy + 13);
    c.textAlign = 'right'; c.font = `700 40px ${fuente}`; c.fillStyle = '#fbbf24';
    c.fillText(formatear(f.monto), W - 100, cy + 13); c.textAlign = 'left';
    y += fila;
  });
  c.fillStyle = '#9ca9bf'; c.font = `500 28px ${fuente}`;
  c.fillText(`Tu parte: ${formatear(d.tuParte)}`, 100, y + 50);
  c.fillStyle = '#6b7a92'; c.font = `500 24px ${fuente}`;
  c.fillText('Cuentas claras', 100, alto - 85);

  return new Promise((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo dibujar'))), 'image/png'));
}

/** Comparte la imagen (WhatsApp, etc.). Si el aparato no puede compartir archivos, la descarga. */
export async function compartirTarjeta(blob: Blob, nombre: string): Promise<'compartida' | 'descargada'> {
  const archivo = new File([blob], `${nombre}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Gasto compartido' }); return 'compartida'; } catch (e) { if ((e as Error).name === 'AbortError') return 'compartida'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.png` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'descargada';
}
