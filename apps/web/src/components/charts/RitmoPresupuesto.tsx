/**
 * Ritmo de gasto contra el presupuesto del mes: la línea acumulada de lo gastado día a día, la proyección punteada hasta fin de mes
 * y la raya del presupuesto (la suma de los topes) o, si no hay topes, la del mes anterior. Arriba de la raya es zona de alerta,
 * abajo zona segura. Cada día se puede tocar: abre una ventana con sus movimientos. Las cifras salen ocultas con la privacidad.
 */
import { useState } from 'preact/hooks';
import { describirDia, formatear as formatearReal, type Datos } from '../../../../../packages/core/src/index.ts';
import { movimientosDelDia, ritmoDelMes } from '../../lib/graficasResumen.ts';
import { formatear } from '../../lib/formatear.ts';
import { verMonto } from '../../state/privacidad.ts';
import { MontoAnimado } from '../ui/piezas.tsx';
import { abrirInfo } from '../ui/HojaInfo.tsx';

const W = 320, H = 132, PAD = 6;
const COLOR = { segura: 'var(--pos)', cerca: 'var(--adv)', alerta: 'var(--neg)' } as const;

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

export function RitmoPresupuesto({ datos, ahora }: { datos: Fuente; ahora: Date }) {
  const r = ritmoDelMes(datos, ahora);
  const [sel, setSel] = useState<number | null>(null);
  const n = r.dias.length;
  const i = sel ?? r.hoy - 1;
  const actual = r.dias[i];
  const tope = Math.max(1, r.referencia, r.proyeccion, r.llevo, r.anterior[r.anterior.length - 1] ?? 0) * 1.08;
  const x = (k: number) => PAD + (k / Math.max(1, n - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / tope) * (H - PAD * 2);
  const reales = r.dias.slice(0, r.hoy).map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(d.acumulado).toFixed(1)}`).join(' ');
  const proy = `M${x(r.hoy - 1).toFixed(1)},${y(r.llevo).toFixed(1)} L${x(n - 1).toFixed(1)},${y(r.proyeccion).toFixed(1)}`;
  const previa = r.anterior.slice(0, n).map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const yRef = y(r.referencia);
  const color = COLOR[r.zona];
  const contra = r.presupuesto !== null ? 'el presupuesto' : 'el mes anterior';
  const frase = r.referencia <= 0
    ? 'Todavía no hay un tope ni un mes anterior con qué comparar.'
    : r.zona === 'alerta' ? `A este ritmo cierras el mes por encima de ${contra}.`
      : r.zona === 'cerca' ? `A este ritmo llegas muy cerca de ${contra}.` : `A este ritmo cierras el mes por debajo de ${contra}.`;

  const abrirDia = (k: number) => {
    setSel(k);
    const d = r.dias[k];
    const movs = d.futuro ? undefined : movimientosDelDia(datos, d.fecha);
    const total = d.futuro ? 0 : d.gasto;
    abrirInfo({
      id: 'info-ritmo-dia', titulo: `Día ${d.dia}: ${describirDia(d.fecha)}`,
      sub: d.futuro ? `Día que viene. Con tu ritmo, el acumulado llegaría a ${formatearReal(Math.round(d.acumulado))}.` : `${movs?.length ?? 0} ${movs?.length === 1 ? 'movimiento' : 'movimientos'} · ${formatearReal(total)} gastado ese día`,
      cuerpo: (
        <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]" id="info-ritmo-cifras">
          <div><div class="etiqueta">Gastado en el día</div><b class="tabular-nums">{formatearReal(total)}</b></div>
          <div><div class="etiqueta">{d.futuro ? 'Acumulado proyectado' : 'Acumulado del mes'}</div><b class="tabular-nums">{formatearReal(Math.round(d.acumulado))}</b></div>
          {r.referencia > 0 && <div><div class="etiqueta">{r.presupuesto !== null ? 'Presupuesto del mes' : 'Mes anterior completo'}</div><b class="tabular-nums">{formatearReal(r.referencia)}</b></div>}
        </div>
      ),
      movimientos: movs,
    });
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(n - 1, i + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDia(i); }
  };
  const ancho = (W - PAD * 2) / Math.max(1, n - 1);
  return (
    <div id="ritmo-grafica">
      <p class="sub !mt-0 mb-2">La línea muestra lo que llevas gastado en el mes y la punteada, hasta dónde llegarías a este ritmo. Toca un día para ver sus gastos.</p>
      <p class="!mt-0 mb-2 text-sm font-semibold" style={{ color }} id="ritmo-frase">{frase}</p>
      <div class="graf-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} class="ritmo-svg" role="group" aria-label={`Gasto acumulado del mes: ${verMonto(formatearReal(r.llevo))}, proyección ${verMonto(formatearReal(r.proyeccion))}`}
          tabIndex={0} onKeyDown={alTeclear}>
          {r.referencia > 0 && <>
            <rect x="0" y="0" width={W} height={Math.max(0, yRef)} fill="var(--neg)" fill-opacity=".09" class="flujo-area" />
            <rect x="0" y={yRef} width={W} height={Math.max(0, H - yRef)} fill="var(--pos)" fill-opacity=".07" class="flujo-area" />
            <line x1="0" x2={W} y1={yRef} y2={yRef} stroke={r.presupuesto !== null ? 'var(--adv)' : 'var(--tx2)'} stroke-width="1.4" stroke-dasharray="5 4" />
          </>}
          {r.presupuesto === null && previa && <path d={previa} fill="none" stroke="var(--tx2)" stroke-opacity=".5" stroke-width="1.4" class="flujo-area" />}
          {r.hoy < n && <path d={proy} fill="none" stroke={color} stroke-width="2.2" stroke-dasharray="4 4" stroke-linecap="round" class="flujo-area" />}
          <path d={reales} fill="none" stroke="var(--acc)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength={1} class="flujo-linea" />
          <line x1={x(i)} x2={x(i)} y1={PAD} y2={H - PAD} stroke="var(--tx2)" stroke-opacity=".4" />
          <circle cx={x(i)} cy={y(actual.acumulado)} r="4.4" fill={actual.futuro ? color : 'var(--acc)'} stroke="var(--sup)" stroke-width="2" />
          {r.dias.map((d, k) => (
            <rect key={d.fecha} x={x(k) - ancho / 2} y="0" width={ancho} height={H} fill="transparent" class="ritmo-dia" aria-label={`Día ${d.dia}`}
              data-dia={d.dia} onClick={() => abrirDia(k)} />
          ))}
        </svg>
      </div>
      <div class="ritmo-leyenda">
        <span><i style={{ background: 'var(--acc)' }} />Lo gastado</span>
        <span><i style={{ background: color }} />Proyección</span>
        <span><i style={{ background: r.presupuesto !== null ? 'var(--adv)' : 'var(--tx2)' }} />{r.presupuesto !== null ? 'Presupuesto' : 'Mes anterior'}</span>
      </div>
      <div class="mt-2 grid gap-2 text-xs [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]" id="ritmo-dato">
        <div><div class="etiqueta">Día {actual.dia}{actual.futuro ? ' (proyectado)' : ''}</div><b class="tabular-nums">{verMonto(formatear(Math.round(actual.acumulado)))}</b></div>
        <div><div class="etiqueta">Fin de mes a este ritmo</div><b class="tabular-nums" style={{ color }}><MontoAnimado valor={r.proyeccion} /></b></div>
        {r.referencia > 0 && <div><div class="etiqueta">{r.presupuesto !== null ? 'Presupuesto (suma de topes)' : 'Mes anterior'}</div><b class="tabular-nums">{verMonto(formatear(r.referencia))}</b></div>}
      </div>
    </div>
  );
}
