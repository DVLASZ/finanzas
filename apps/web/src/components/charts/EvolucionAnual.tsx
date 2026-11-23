/**
 * Evolución de ingresos y gastos en barras: mes a mes de un año (enero a diciembre) o, con todo el histórico, solo los meses con
 * datos o los años si son muchos. Cada barra se toca y muestra sus cifras con el ahorro neto; con la privacidad activa no salen montos.
 * Usa las mismas clases que `BarrasMeses`, pero con más columnas, y se desplaza de lado si no caben.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear as formatearReal } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import type { BarraPeriodo } from '../../lib/graficasResumen.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';

/** `alTocar` es opcional: si lo pasa el padre, tocar una barra abre algo más (por ejemplo los movimientos de ese mes). */
export function EvolucionAnual({ barras, alTocar }: { barras: BarraPeriodo[]; alTocar?: (b: BarraPeriodo) => void }) {
  const [sel0, setSel] = useState<number | null>(null);
  const fila = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = fila.current; if (f) f.scrollLeft = f.scrollWidth; }, [barras.length]);
  if (!barras.length) return null;
  const max = Math.max(1, ...barras.flatMap(b => [b.ingresos, b.gastos]));
  const i = sel0 !== null && sel0 < barras.length ? sel0 : barras.length - 1;
  const b = barras[i];
  const neto = b.ingresos - b.gastos;
  const total = barras.reduce((s, x) => ({ ingresos: s.ingresos + x.ingresos, gastos: s.gastos + x.gastos }), { ingresos: 0, gastos: 0 });
  const abrir = (k: number) => {
    setSel(k);
    if (alTocar) { alTocar(barras[k]); return; }
    const x = barras[k];
    abrirInfo({
      id: 'info-evolucion', titulo: x.etiqueta,
      sub: 'Ingresos y gastos de ese periodo',
      cuerpo: (
        <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="info-evolucion-cifras">
          <div><div class="etiqueta">Ingresos</div><b class="text-pos tabular-nums">{formatearReal(x.ingresos)}</b></div>
          <div><div class="etiqueta">Gastos</div><b class="text-neg tabular-nums">{formatearReal(x.gastos)}</b></div>
          <div><div class="etiqueta">Ahorro neto</div><b class={`tabular-nums ${x.ingresos - x.gastos < 0 ? 'text-neg' : 'text-pos'}`}>{formatearReal(x.ingresos - x.gastos)}</b></div>
        </div>
      ),
    });
  };
  return (
    <div id="evolucion-grafica">
      <div class="graf-scroll" ref={fila}>
        <div class="evo-fila" role="group" aria-label="Ingresos y gastos por periodo" style={`--evo-n:${barras.length}`}>
          {barras.map((x, k) => (
            <button key={x.clave} type="button" class={`mes-par ${i === k ? 'sel' : ''}`} data-mes={x.clave} onClick={() => abrir(k)}
              aria-label={`${x.etiqueta}: ingresos ${verMonto(formatearReal(x.ingresos))}, gastos ${verMonto(formatearReal(x.gastos))}`}>
              <span class="mes-barras">
                <span class="mes-in" style={{ height: `${Math.max(x.ingresos > 0 ? 6 : 2, (x.ingresos / max) * 100)}%`, animationDelay: `${k * 40}ms` }} />
                <span class="mes-out" style={{ height: `${Math.max(x.gastos > 0 ? 6 : 2, (x.gastos / max) * 100)}%`, animationDelay: `${k * 40 + 30}ms` }} />
              </span>
              <span class="mes-nombre">{x.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>
      <div class="mt-2 grid gap-2 text-xs [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="evolucion-dato">
        <div><div class="etiqueta">Ingresos · {b.etiqueta}</div><b class="text-pos tabular-nums">{verMonto(formatear(b.ingresos))}</b></div>
        <div><div class="etiqueta">Gastos · {b.etiqueta}</div><b class="text-neg tabular-nums">{verMonto(formatear(b.gastos))}</b></div>
        <div><div class="etiqueta">Ahorro neto</div><b class={`tabular-nums ${neto < 0 ? 'text-neg' : 'text-pos'}`}>{verMonto(formatear(neto))}</b></div>
      </div>
      <p class="sub !mb-0 mt-2">En total: ingresos <b class="tabular-nums">{verMonto(formatear(total.ingresos))}</b>, gastos <b class="tabular-nums">{verMonto(formatear(total.gastos))}</b>.</p>
    </div>
  );
}
