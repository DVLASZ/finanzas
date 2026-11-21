/**
 * Comparativa semanal: por cada una de las últimas semanas, una barra de lo que entró y otra de lo que salió. Cada semana se toca y
 * abre una ventana con sus movimientos. Si no caben en el ancho, la fila se desplaza de lado en vez de aplastar las barras.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatear as formatearReal, type Datos } from '../../../../../packages/core/src/index.ts';
import { movimientosDeSemana, semanasIngresosGastos, type SemanaIG } from '../../lib/graficasResumen.ts';
import { formatear } from '../../lib/formatear.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

export function ComparativaSemanal({ datos, ahora, semanas = 6 }: { datos: Fuente; ahora: Date; semanas?: number }) {
  const lista = semanasIngresosGastos(datos, ahora, semanas);
  const [sel, setSel] = useState<number>(lista.length - 1);
  const fila = useRef<HTMLDivElement>(null);
  // la semana actual queda a la vista cuando la fila se desplaza
  useEffect(() => { const f = fila.current; if (f) f.scrollLeft = f.scrollWidth; }, []);
  const max = Math.max(1, ...lista.flatMap(s => [s.ingresos, s.gastos]));
  const abrir = (k: number) => {
    setSel(k);
    const s: SemanaIG = lista[k];
    const movimientos = movimientosDeSemana(datos, s);
    const neto = s.ingresos - s.gastos;
    abrirInfo({
      id: 'info-semana', titulo: `Semana del ${s.etiqueta}`,
      sub: `${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'}${s.actual ? ' · semana en curso' : ''}`,
      cuerpo: (
        <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="info-semana-cifras">
          <div><div class="etiqueta">Ingresos</div><b class="text-pos tabular-nums">{formatearReal(s.ingresos)}</b></div>
          <div><div class="etiqueta">Gastos</div><b class="text-neg tabular-nums">{formatearReal(s.gastos)}</b></div>
          <div><div class="etiqueta">Quedó</div><b class={`tabular-nums ${neto < 0 ? 'text-neg' : 'text-pos'}`}>{formatearReal(neto)}</b></div>
        </div>
      ),
      movimientos,
    });
  };
  const actual = lista[sel];
  return (
    <div id="semanal-grafica">
      <p class="sub !mt-0 mb-2">Verde es lo que entró y coral lo que salió en cada semana. Toca una semana para ver sus movimientos.</p>
      <div class="graf-scroll" ref={fila}>
        <div class="sem-fila" role="group" aria-label="Ingresos y gastos por semana">
          {lista.map((s, k) => (
            <button key={s.desde} type="button" class={`sem-col ${sel === k ? 'sel' : ''}`} data-semana={k} onClick={() => abrir(k)}
              aria-label={`Semana del ${s.etiqueta}: ingresos ${verMonto(formatearReal(s.ingresos))}, gastos ${verMonto(formatearReal(s.gastos))}`}>
              <span class="sem-barras">
                <span class="sem-in" style={{ height: `${Math.max(s.ingresos > 0 ? 5 : 1.5, (s.ingresos / max) * 100)}%`, animationDelay: `${k * 70}ms` }} />
                <span class="sem-out" style={{ height: `${Math.max(s.gastos > 0 ? 5 : 1.5, (s.gastos / max) * 100)}%`, animationDelay: `${k * 70 + 40}ms` }} />
              </span>
              <span class="sem-nombre">{s.actual ? 'Esta semana' : s.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>
      <div class="mt-2 grid gap-2 text-xs [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="semanal-dato">
        <div><div class="etiqueta">Ingresos</div><b class="text-pos tabular-nums">{verMonto(formatear(actual.ingresos))}</b></div>
        <div><div class="etiqueta">Gastos</div><b class="text-neg tabular-nums">{verMonto(formatear(actual.gastos))}</b></div>
        <div><div class="etiqueta">Quedó</div><b class={`tabular-nums ${actual.ingresos - actual.gastos < 0 ? 'text-neg' : 'text-pos'}`}>{verMonto(formatear(actual.ingresos - actual.gastos))}</b></div>
      </div>
    </div>
  );
}
