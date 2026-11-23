/**
 * Comparativa semanal: por cada una de las últimas semanas, una barra de lo que entró y otra de lo que salió. Cada semana se toca y
 * abre una ventana con sus movimientos. Si no caben en el ancho, la fila se desplaza de lado en vez de aplastar las barras.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { aLocal, describirDia, formatear as formatearReal, type Datos } from '../../../../../packages/core/src/index.ts';
import { movimientosDeSemana, movimientosDelDia, rangoAnterior, semanasDelRango, semanasIngresosGastos, serieDiaria, totalesPeriodo, type DiaFlujo, type SemanaIG } from '../../lib/graficasResumen.ts';
import { menosMovimiento } from '../../lib/efectos.ts';
import { tocable } from '../../lib/tocable.ts';
import { formatear } from '../../lib/formatear.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

/** Con `desde` y `hasta` salen las semanas de ese periodo; sin ellos, las últimas `semanas` contando desde hoy. */
export function ComparativaSemanal({ datos, ahora, semanas = 6, desde, hasta }: { datos: Fuente; ahora: Date; semanas?: number; desde?: string; hasta?: string }) {
  const lista = desde && hasta ? semanasDelRango(datos, desde, hasta, ahora) : semanasIngresosGastos(datos, ahora, semanas);
  const [sel0, setSel] = useState<number>(lista.length - 1);
  const sel = Math.min(sel0, lista.length - 1);
  const fila = useRef<HTMLDivElement>(null);
  // la semana actual queda a la vista cuando la fila se desplaza
  useEffect(() => { const f = fila.current; if (f) f.scrollLeft = desde ? 0 : f.scrollWidth; }, [desde, hasta]);
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

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Gasto de cada día del periodo (una semana, o un rango corto) en barras. Cada día se toca y abre sus movimientos. */
export function FlujoSemana({ datos, desde, hasta, ahora }: { datos: Fuente; desde: string; hasta: string; ahora: Date }) {
  const dias = serieDiaria(datos, desde, hasta);
  const hoy = aLocal(ahora).slice(0, 10);
  const max = Math.max(1, ...dias.map(d => d.gasto));
  const [sel, setSel] = useState<string | null>(null);
  const quieto = menosMovimiento();
  const abrir = (d: DiaFlujo) => {
    setSel(d.fecha);
    const movs = movimientosDelDia(datos, d.fecha);
    abrirInfo({
      id: 'info-semana-dia', titulo: describirDia(d.fecha),
      sub: `${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}`,
      cuerpo: (
        <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="info-semana-dia-cifras">
          <div><div class="etiqueta">Gastos</div><b class="text-neg tabular-nums">{formatearReal(d.gasto)}</b></div>
          {d.ingreso > 0 && <div><div class="etiqueta">Ingresos</div><b class="text-pos tabular-nums">{formatearReal(d.ingreso)}</b></div>}
        </div>
      ),
      movimientos: movs.length ? movs : undefined,
    });
  };
  const pico = dias.reduce<DiaFlujo | null>((m, d) => (d.gasto > (m?.gasto ?? 0) ? d : m), null);
  return (
    <div id="semana-dias-grafica">
      <p class="sub !mt-0 mb-2">{pico ? <>El día que más pesó fue el {describirDia(pico.fecha)}: <b class="tabular-nums">{verMonto(formatear(pico.gasto))}</b>.</> : 'No hay gastos en estos días.'} Toca un día para ver sus movimientos.</p>
      <div class="sd-fila" role="group" aria-label="Gasto de cada día">
        {dias.map((d, k) => (
          <div key={d.fecha} class={`ds-col ${pico?.fecha === d.fecha ? 'top' : ''} ${sel === d.fecha ? 'sel' : ''} ${d.fecha > hoy ? 'sd-futuro' : ''}`} data-fecha={d.fecha}
            aria-label={`${describirDia(d.fecha)}: ${d.gasto > 0 ? verMonto(formatearReal(d.gasto)) : 'sin gastos'}`} {...tocable(() => abrir(d))}>
            <span class="ds-barra-caja"><span class="ds-barra" style={{ height: `${Math.max(d.gasto > 0 ? 6 : 2, (d.gasto / max) * 100)}%`, animationDelay: quieto ? undefined : `${k * 60}ms` }} /></span>
            <span class="ds-nombre">{DIA_CORTO[new Date(`${d.fecha}T12:00:00Z`).getUTCDay()]} {Number(d.fecha.slice(8))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const variacion = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Gasto e ingreso del periodo visto contra el anterior, en dos barras cada uno. `antes` va en la frase («la semana pasada», «el año pasado»). */
export function ComparaPeriodos({ datos, desde, hasta, antes }: { datos: Fuente; desde: string; hasta: string; antes: string }) {
  const previo = rangoAnterior(desde, hasta);
  const ahoraT = totalesPeriodo(datos, desde, hasta), antesT = totalesPeriodo(datos, previo.desde, previo.hasta);
  const filas = [
    { clave: 'gastos', nombre: 'Gastos', a: ahoraT.gastos, b: antesT.gastos, malo: 'sube' as const, color: 'var(--neg)' },
    { clave: 'ingresos', nombre: 'Ingresos', a: ahoraT.ingresos, b: antesT.ingresos, malo: 'baja' as const, color: 'var(--pos)' },
  ];
  const max = Math.max(1, ...filas.flatMap(f => [f.a, f.b]));
  return (
    <div id="compara-periodos" class="grid gap-3">
      <p class="sub !mt-0">Lo de este periodo contra {antes} ({describirDia(previo.desde)} al {describirDia(new Date(Date.parse(`${previo.hasta.slice(0, 10)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10))}).</p>
      {filas.map(f => {
        const v = variacion(f.a, f.b);
        const malo = v !== null && (f.malo === 'sube' ? v > 0 : v < 0);
        return (
          <div key={f.clave} data-compara={f.clave}>
            <div class="mb-1 flex items-baseline justify-between gap-2"><span class="etiqueta">{f.nombre}</span>
              <span class={`text-xs font-bold tabular-nums ${v === null || v === 0 ? 'text-tx2' : malo ? 'text-neg' : 'text-pos'}`}>{v === null ? (f.a > 0 ? 'nuevo' : 'sin dato') : v === 0 ? 'igual' : `${v > 0 ? '+' : ''}${v} %`}</span></div>
            <div class="cp-fila"><span class="cp-rotulo">Ahora</span><span class="barra-fondo"><span class="cp-relleno" style={{ width: `${Math.max(f.a > 0 ? 3 : 0, (f.a / max) * 100)}%`, background: f.color }} /></span><b class="tabular-nums text-xs">{verMonto(formatear(f.a))}</b></div>
            <div class="cp-fila"><span class="cp-rotulo">Antes</span><span class="barra-fondo"><span class="cp-relleno" style={{ width: `${Math.max(f.b > 0 ? 3 : 0, (f.b / max) * 100)}%`, background: f.color, opacity: 0.45 }} /></span><b class="tabular-nums text-xs">{verMonto(formatear(f.b))}</b></div>
          </div>
        );
      })}
    </div>
  );
}
