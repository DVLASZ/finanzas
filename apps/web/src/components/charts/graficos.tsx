/**
 * Gráficos en SVG puro (sin librerías): la línea con área de la evolución del saldo, la barra apilada de
 * liquidez contra deudas y la curva del ritmo de gasto del mes. Se dibujan con animación y respetan
 * `prefers-reduced-motion` (el CSS las apaga).
 */
import { useState } from 'preact/hooks';
import { formatear } from '../../../../../packages/core/src/index.ts';

/** Una curva suave que pasa por los puntos (Catmull-Rom convertida a Bézier). */
function curva(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    // los controles no salen del rango entre los dos puntos: la curva no se pasa ni hace «olas» donde los datos dan saltos
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6))];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6))];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** La evolución de un valor: línea con área degradada. `claro` la pinta en blanco para ir sobre la tarjeta de color. */
export function Sparkline({ valores, claro = false, alto = 64 }: { valores: number[]; claro?: boolean; alto?: number }) {
  const W = 300, H = alto, m = 6;
  const min = Math.min(...valores), max = Math.max(...valores);
  const rango = max - min || 1;
  const pts: [number, number][] = valores.map((v, i) => [m + (i / Math.max(1, valores.length - 1)) * (W - 2 * m), H - m - ((v - min) / rango) * (H - 2 * m)]);
  const linea = curva(pts);
  const ult = pts[pts.length - 1];
  const color = claro ? '#ffffff' : 'var(--marca)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="block w-full" style={{ height: `${H}px` }} role="img" aria-label="Evolución del saldo" preserveAspectRatio="none">
      <defs>
        <linearGradient id={claro ? 'spk-c' : 'spk'} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={color} stop-opacity={claro ? 0.38 : 0.3} />
          <stop offset="1" stop-color={color} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linea} L${ult[0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${claro ? 'spk-c' : 'spk'})`} class="aparece" />
      <path d={linea} pathLength={1} fill="none" stroke={color} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="trazo" />
      <circle cx={ult[0]} cy={ult[1]} r="3.6" fill={color} class="aparece" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

export interface Tramo { nombre: string; valor: number; color: string }

/** Una barra dividida en tramos proporcionales, con la leyenda debajo. */
export function BarraApilada({ tramos }: { tramos: Tramo[] }) {
  const total = tramos.reduce((s, t) => s + Math.abs(t.valor), 0);
  if (total <= 0) return null;
  return (
    <div>
      <div class="flex h-3 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={tramos.map(t => `${t.nombre} ${formatear(t.valor)}`).join(', ')}>
        {tramos.filter(t => t.valor > 0).map(t => <span key={t.nombre} class="segmento block h-full rounded-full" style={{ flexGrow: t.valor, flexBasis: 0, background: t.color }} />)}
      </div>
      <div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx2">
        {tramos.map(t => (
          <span key={t.nombre} class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            {t.nombre} <b class="tabular-nums text-tx">{Math.round((Math.abs(t.valor) / total) * 100)} %</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Gasto acumulado día a día: este periodo (línea llena) contra el anterior (línea punteada). Se puede tocar para ver un día. */
export function Ritmo({ ahora, antes, hastaDia }: { ahora: number[]; antes: number[]; hastaDia: number }) {
  const [dia, setDia] = useState<number | null>(null);
  const W = 320, H = 130, mx = 8, mt = 10, mb = 18;
  const n = Math.max(ahora.length, antes.length);
  const max = Math.max(1, ...ahora, ...antes);
  const x = (i: number) => mx + (i / Math.max(1, n - 1)) * (W - 2 * mx);
  const y = (v: number) => mt + (1 - v / max) * (H - mt - mb);
  const pts = (a: number[], hasta: number): [number, number][] => a.slice(0, hasta).map((v, i) => [x(i), y(v)]);
  const pAhora = pts(ahora, hastaDia), pAntes = pts(antes, antes.length);
  const sel = dia ?? hastaDia - 1;
  const alTocar = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - mx) / (W - 2 * mx) * (n - 1));
    setDia(Math.min(Math.max(0, i), Math.max(0, hastaDia - 1)));
  };
  const hoy = ahora[sel] ?? 0, previo = antes[Math.min(sel, antes.length - 1)] ?? 0;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} class="block w-full touch-pan-y" role="img" aria-label="Gasto acumulado del mes contra el mes anterior" onPointerMove={alTocar} onPointerDown={alTocar} onPointerLeave={() => setDia(null)}>
        <defs>
          <linearGradient id="rit" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--marca)" stop-opacity=".28" /><stop offset="1" stop-color="var(--marca)" stop-opacity="0" /></linearGradient>
        </defs>
        {[0.5, 1].map(f => <line key={f} x1={mx} x2={W - mx} y1={y(max * f)} y2={y(max * f)} stroke="var(--anillo)" stroke-width="1" />)}
        {pAntes.length > 1 && <path d={curva(pAntes)} fill="none" stroke="var(--tx2)" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round" opacity=".75" />}
        {pAhora.length > 1 && <>
          <path d={`${curva(pAhora)} L${pAhora[pAhora.length - 1][0]},${H - mb} L${pAhora[0][0]},${H - mb} Z`} fill="url(#rit)" class="aparece" />
          <path d={curva(pAhora)} pathLength={1} fill="none" stroke="var(--marca)" stroke-width="2.6" stroke-linecap="round" class="trazo" />
        </>}
        <line x1={x(sel)} x2={x(sel)} y1={mt} y2={H - mb} stroke="var(--tx2)" stroke-width="1" stroke-dasharray="2 3" opacity=".6" />
        {ahora[sel] !== undefined && <circle cx={x(sel)} cy={y(hoy)} r="4" fill="var(--marca)" stroke="var(--sup)" stroke-width="2" />}
        <text x={mx} y={H - 4} class="fill-tx2" style={{ fontSize: '9px' }}>día 1</text>
        <text x={W - mx} y={H - 4} text-anchor="end" class="fill-tx2" style={{ fontSize: '9px' }}>día {n}</text>
      </svg>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-tx2">
        <span class="inline-flex items-center gap-1.5"><span class="h-0.5 w-4 rounded bg-marca" />Este periodo <b class="tabular-nums text-tx">{formatear(hoy)}</b></span>
        <span class="inline-flex items-center gap-1.5"><span class="w-4 border-t-2 border-dashed border-tx2" />Anterior <b class="tabular-nums text-tx">{formatear(previo)}</b></span>
        <span class="tabular-nums">al día {sel + 1}</span>
      </div>
    </div>
  );
}

export interface Barra { etiqueta: string; valor: number }

/** Barras verticales (un día o un mes cada una). La más alta se marca; tocar una barra muestra su valor. */
export function BarrasPeriodo({ barras }: { barras: Barra[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...barras.map(b => b.valor));
  const iMax = barras.findIndex(b => b.valor === max);
  const ver = sel ?? iMax;
  const hay = barras[ver];
  return (
    <div>
      <div class="mb-2 flex items-baseline justify-between text-xs text-tx2">
        <span>{sel === null ? 'Lo más alto: ' : ''}<b class="text-tx">{hay?.etiqueta}</b></span>
        <b class="tabular-nums text-neg">{formatear(hay?.valor ?? 0)}</b>
      </div>
      <div class="flex h-24 items-end gap-[3px]" role="img" aria-label="Gasto por día">
        {barras.map((b, i) => (
          <button key={b.etiqueta} type="button" aria-label={`${b.etiqueta}: ${formatear(b.valor)}`} onClick={() => setSel(sel === i ? null : i)}
            class="group relative flex h-full min-w-0 flex-1 items-end rounded-sm outline-offset-2">
            <span class="barra-sube block w-full rounded-t-md transition-[filter,opacity] group-active:brightness-125"
              style={{ height: `${Math.max(b.valor > 0 ? 6 : 2, (b.valor / max) * 100)}%`, animationDelay: `${Math.min(i, 30) * 16}ms`, background: i === ver ? 'linear-gradient(180deg, var(--neg), color-mix(in srgb, var(--neg) 55%, var(--adv)))' : 'linear-gradient(180deg, var(--marca), var(--marca-2))', opacity: i === ver ? 1 : b.valor > 0 ? 0.62 : 0.25 }} />
          </button>
        ))}
      </div>
      <div class="mt-1 flex justify-between text-[10px] text-tx2"><span>{barras[0]?.etiqueta}</span><span>{barras[barras.length - 1]?.etiqueta}</span></div>
    </div>
  );
}
