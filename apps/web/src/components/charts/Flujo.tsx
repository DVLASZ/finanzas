/**
 * Tres gráficas del Resumen: el flujo del mes (línea suave con área degradada), el ranking de conceptos con barras
 * horizontales y el anillo de con qué se pagó (efectivo contra digital). Con la privacidad activa las cifras salen ocultas
 * (verMonto); con prefers-reduced-motion no se anima nada (la regla global lo apaga y los keyframes solo declaran el inicio).
 */
import { Banknote, Smartphone } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { describirDia, type ConceptoTop, type Datos, type MedioDePago, type PuntoDeFlujo } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { movimientosDelDia } from '../../lib/graficasResumen.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../ui/iconos.tsx';

const W = 300, H = 112, PAD = 8;

/** Una curva suave que pasa por todos los puntos (Catmull-Rom convertida a bezier). */
function curva(pts: [number, number][]): string {
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  return d;
}

export function FlujoMes({ puntos, datos }: { puntos: PuntoDeFlujo[]; datos?: Datos }) {
  const [sel, setSel] = useState<number | null>(null);
  if (puntos.length < 2) return null;
  const valores = puntos.map(p => p.acumulado);
  const min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  const rango = Math.max(1, max - min);
  const x = (i: number) => PAD + (i / (puntos.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / rango) * (H - PAD * 2);
  const pts = puntos.map((p, i) => [x(i), y(p.acumulado)] as [number, number]);
  const linea = curva(pts);
  const cero = y(0);
  const area = `${linea} L${pts[pts.length - 1][0]},${cero} L${pts[0][0]},${cero} Z`;
  const actual = puntos[sel ?? puntos.length - 1];
  const i = sel ?? puntos.length - 1;
  const alMover = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setSel(Math.max(0, Math.min(puntos.length - 1, Math.round(f * (puntos.length - 1)))));
  };
  const positivo = actual.acumulado >= 0;
  // al soltar sobre un punto se abre la hoja de ese día
  const alSoltar = (e: PointerEvent) => {
    if (!datos) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const k = Math.max(0, Math.min(puntos.length - 1, Math.round(((e.clientX - r.left) / r.width) * (puntos.length - 1))));
    const p = puntos[k];
    const movs = movimientosDelDia(datos, p.fecha);
    abrirInfo({
      id: 'info-flujo-dia', titulo: describirDia(p.fecha),
      sub: `${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'} · balance del día ${verMonto(formatear(p.neto))}`,
      movimientos: movs.length ? movs : undefined,
    });
  };
  return (
    <div id="flujo-grafica">
      <svg viewBox={`0 0 ${W} ${H}`} class="flujo-svg" role="img" aria-label={`Flujo del mes: balance acumulado ${verMonto(formatear(actual.acumulado))}`}
        onPointerMove={alMover} onPointerDown={alMover} onPointerUp={alSoltar} onPointerLeave={() => setSel(null)}>
        <defs>
          <linearGradient id="flujo-degradado" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--acc)" stop-opacity=".45" />
            <stop offset="100%" stop-color="var(--acc)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD} x2={W - PAD} y1={cero} y2={cero} stroke="var(--bor)" stroke-dasharray="3 4" />
        <path d={area} fill="url(#flujo-degradado)" class="flujo-area" />
        <path d={linea} fill="none" stroke="var(--acc)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength={1} class="flujo-linea" />
        <g class="flujo-marca" style={{ transform: `translate(${pts[i][0]}px, 0px)` }}>
          <line x1="0" x2="0" y1={PAD} y2={H - PAD} stroke="var(--tx2)" stroke-opacity=".35" />
          <circle cx="0" cy={pts[i][1]} r="4.2" fill="var(--acc)" stroke="var(--sup)" stroke-width="2" style={{ transition: "cy .18s ease-out" }} />
        </g>
      </svg>
      <div class="mt-1 grid gap-2 text-xs [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="flujo-dato">
        <div><div class="etiqueta">Día {Number(actual.fecha.slice(8))}</div><b class={`tabular-nums ${actual.neto < 0 ? 'text-neg' : 'text-pos'}`}>{verMonto(formatear(actual.neto))}</b></div>
        <div><div class="etiqueta">Balance acumulado</div><b class={`tabular-nums ${positivo ? 'text-pos' : 'text-neg'}`}>{verMonto(formatear(actual.acumulado))}</b></div>
      </div>
    </div>
  );
}

export function RankingConceptos({ top, alTocar }: { top: ConceptoTop[]; alTocar?: (concepto: string) => void }) {
  if (!top.length) return null;
  const max = Math.max(1, top[0].total);
  return (
    <ul class="m-0 grid list-none gap-2.5 p-0" id="ranking-lista">
      {top.map((x, i) => (
        <li key={x.concepto} class="barra-fila toque !my-0" role="button" tabIndex={0} data-concepto={x.concepto} onClick={() => alTocar?.(x.concepto)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocar?.(x.concepto); } }}>
          <span class="flex items-center gap-2"><Insignia v={visualDeNombre(x.concepto)} tam={28} /><span class="min-w-0"><span class="block truncate">{x.concepto}</span><span class="text-[.7rem] text-tx2">{x.veces} {x.veces === 1 ? 'vez' : 'veces'} · {x.pct} %</span></span></span>
          <span class="barra-fondo"><span class="barra-relleno" style={{ width: `${Math.max(4, (x.total / max) * 100)}%`, animationDelay: `${i * 70}ms` }} /></span>
          <span class="tabular-nums">{verMonto(formatear(x.total))}</span>
        </li>
      ))}
    </ul>
  );
}

export function AnilloMedios({ medios, alTocar }: { medios: MedioDePago[]; alTocar?: (titulo: string, nombres: string[]) => void }) {
  if (!medios.length) return null;
  const efectivo = medios.filter(m => m.efectivo).reduce((s, m) => s + m.total, 0);
  const digital = medios.filter(m => !m.efectivo).reduce((s, m) => s + m.total, 0);
  const total = efectivo + digital;
  if (total <= 0) return null;
  const R = 46, C = 2 * Math.PI * R;
  const largoEf = (efectivo / total) * C;
  const pctEf = Math.round((efectivo / total) * 100);
  return (
    <div class="flex flex-col items-center gap-4 sm:flex-row" id="anillo-medios">
      <svg viewBox="0 0 120 120" class="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`Efectivo ${pctEf} %, digital ${100 - pctEf} %`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--info)" stroke-width="14" />
        {efectivo > 0 && digital > 0 && <circle cx="60" cy="60" r={R} fill="none" stroke="var(--adv)" stroke-width="14" stroke-dasharray={`${Math.max(0, largoEf - 2)} ${C}`} class="anillo-arco" />}
        {digital === 0 && <circle cx="60" cy="60" r={R} fill="none" stroke="var(--adv)" stroke-width="14" />}
        <g class="rotate-90" style={{ transformOrigin: '60px 60px' }} pointer-events="none">
          <text x="60" y="58" text-anchor="middle" class="fill-tx2" style={{ fontSize: '8.5px' }}>Efectivo</text>
          <text x="60" y="73" text-anchor="middle" class="fill-tx tabular-nums" style={{ fontSize: '16px', fontWeight: 700 }}>{pctEf} %</text>
        </g>
      </svg>
      <ul class="m-0 grid w-full list-none gap-1.5 p-0 text-sm">
        <li class="toque flex items-center gap-2" role="button" tabIndex={0} data-medio="efectivo" onClick={() => alTocar?.('Efectivo', medios.filter(m => m.efectivo).map(m => m.nombre))}><Banknote size={16} style={{ color: 'var(--adv)' }} /><span class="flex-1">Efectivo</span><b class="tabular-nums">{verMonto(formatear(efectivo))}</b></li>
        <li class="toque flex items-center gap-2" role="button" tabIndex={0} data-medio="digital" onClick={() => alTocar?.('Digital', medios.filter(m => !m.efectivo).map(m => m.nombre))}><Smartphone size={16} style={{ color: 'var(--info)' }} /><span class="flex-1">Digital</span><b class="tabular-nums">{verMonto(formatear(digital))}</b></li>
        {medios.length > 2 && medios.map(m => (
          <li key={m.nombre} class="toque flex items-center gap-2 pl-6 text-xs text-tx2" role="button" tabIndex={0} data-medio={m.nombre} onClick={() => alTocar?.(m.nombre, [m.nombre])}><span class="flex-1">{m.nombre}</span><span class="tabular-nums">{m.pct} %</span></li>
        ))}
      </ul>
    </div>
  );
}
