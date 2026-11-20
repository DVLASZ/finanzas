/**
 * Dos gráficas de tiempo: el mapa de calor de un mes (cada día, más oscuro mientras más se gastó) y las barras de
 * ingresos contra gastos de los últimos meses. Se pueden tocar para ver la cifra; con la privacidad activa no la muestran.
 */
import { useState } from 'preact/hooks';
import { type GastoDia, type MesIngresosGastos } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { verMonto } from '../../state/privacidad.ts';

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El nivel de color de un día (0 a 4) según lo que se gastó comparado con el día más fuerte del mes. */
function nivelDe(total: number, max: number): number {
  if (total <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((total / max) * 4)));
}

export function MapaCalor({ dias, hoy }: { dias: GastoDia[]; hoy: string }) {
  const [sel, setSel] = useState<GastoDia | null>(null);
  if (!dias.length) return null;
  const max = Math.max(...dias.map(d => d.total));
  // lunes primero: el día 1 se acomoda en su columna
  const hueco = (dias[0].diaSemana + 6) % 7;
  const celdas: (GastoDia | null)[] = [...Array(hueco).fill(null), ...dias];
  return (
    <div>
      <div class="calor" role="group" aria-label="Gasto de cada día del mes">
        {SEMANA.map(s => <span key={s} class="calor-sem" aria-hidden="true">{s}</span>)}
        {celdas.map((d, i) => d ? (
          <button key={d.fecha} type="button" class={`calor-dia n${d.fecha > hoy ? 'f' : nivelDe(d.total, max)} ${d.fecha === hoy ? 'hoy' : ''} ${sel?.fecha === d.fecha ? 'sel' : ''}`}
            data-fecha={d.fecha} aria-label={`${Number(d.fecha.slice(8))} de ${MESES[Number(d.fecha.slice(5, 7)) - 1]}: ${d.total > 0 ? verMonto(formatear(d.total)) : 'sin gastos'}`}
            style={{ animationDelay: `${(Math.floor(i / 7) + (i % 7)) * 34}ms` }} onClick={() => setSel(sel?.fecha === d.fecha ? null : d)}>{Number(d.fecha.slice(8))}</button>
        ) : <span key={`h${i}`} />)}
      </div>
      <div class="mt-2 flex items-center justify-between gap-2 text-xs text-tx2">
        <span id="calor-dato">{sel ? <><b class="text-tx">{Number(sel.fecha.slice(8))} de {MESES[Number(sel.fecha.slice(5, 7)) - 1]}</b>: {sel.total > 0 ? verMonto(formatear(sel.total)) : 'sin gastos'}</> : 'Toca un día para ver cuánto se gastó.'}</span>
        <span class="calor-leyenda" aria-hidden="true">menos<i class="calor-dia n1" /><i class="calor-dia n2" /><i class="calor-dia n3" /><i class="calor-dia n4" />más</span>
      </div>
    </div>
  );
}

export function BarrasMeses({ meses }: { meses: MesIngresosGastos[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...meses.flatMap(m => [m.ingresos, m.gastos]));
  const m = sel === null ? meses[meses.length - 1] : meses[sel];
  const neto = m.ingresos - m.gastos;
  const etiqueta = (x: MesIngresosGastos) => MESES[Number(x.mes.slice(5)) - 1];
  return (
    <div>
      <div class="meses" role="group" aria-label="Ingresos y gastos de los últimos meses">
        {meses.map((x, i) => (
          <button key={x.mes} type="button" class={`mes-par ${(sel ?? meses.length - 1) === i ? 'sel' : ''}`} data-mes={x.mes} onClick={() => setSel(i)}
            aria-label={`${etiqueta(x)}: ingresos ${verMonto(formatear(x.ingresos))}, gastos ${verMonto(formatear(x.gastos))}`}>
            <span class="mes-barras">
              <span class="mes-in" style={{ height: `${Math.max(x.ingresos > 0 ? 6 : 2, (x.ingresos / max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
              <span class="mes-out" style={{ height: `${Math.max(x.gastos > 0 ? 6 : 2, (x.gastos / max) * 100)}%`, animationDelay: `${i * 60 + 30}ms` }} />
            </span>
            <span class="mes-nombre">{etiqueta(x)}</span>
          </button>
        ))}
      </div>
      <div class="mt-2 grid gap-2 text-xs [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="meses-dato">
        <div><div class="etiqueta">Ingresos</div><b class="text-pos tabular-nums">{verMonto(formatear(m.ingresos))}</b></div>
        <div><div class="etiqueta">Gastos</div><b class="text-neg tabular-nums">{verMonto(formatear(m.gastos))}</b></div>
        <div><div class="etiqueta">Ahorro neto</div><b class={`tabular-nums ${neto < 0 ? 'text-neg' : 'text-pos'}`}>{verMonto(formatear(neto))}</b></div>
      </div>
    </div>
  );
}
