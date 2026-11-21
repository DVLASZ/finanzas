/**
 * Gasto por día de la semana: siete barras, de lunes a domingo, con el día que más pesa resaltado. Cada barra se toca y abre una
 * ventana con los movimientos de ese día de la semana en el periodo, su total y lo que se gasta en promedio un día de esos.
 */
import { aLocal, formatear as formatearReal, type Datos } from '../../../../../packages/core/src/index.ts';
import { DIAS_PLURAL, diaDespues, diaMasCaro, gastoPorDiaSemana, type GastoDia } from '../../lib/comparador.ts';
import { menosMovimiento } from '../../lib/efectos.ts';
import { formatear } from '../../lib/formatear.ts';
import { tocable } from '../../lib/tocable.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

const veces = (n: number) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;

function abrirDia(datos: Fuente, d: GastoDia): void {
  abrirInfo({
    id: 'info-dia-semana', titulo: `Los ${DIAS_PLURAL[d.indice]}`,
    sub: `${veces(d.movimientos.length)} en este periodo`,
    cuerpo: (
      <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]" id="info-dia-semana-cifras" data-dia-semana={d.indice}>
        <div><div class="etiqueta">Total</div><b class="text-neg tabular-nums">{formatearReal(d.total)}</b></div>
        <div><div class="etiqueta">Por {d.nombre.toLowerCase()}</div><b class="tabular-nums">{formatearReal(d.promedio)}</b></div>
        <div><div class="etiqueta">Días</div><b class="tabular-nums">{d.veces}</b></div>
      </div>
    ),
    movimientos: d.movimientos,
  });
}

/** `desde` y `hasta` son el periodo que se ve en el Resumen; los días que aún no llegan no cuentan para el promedio. */
export function GastoDiaSemana({ datos, desde, hasta, ahora }: { datos: Fuente; desde: string; hasta: string; ahora: Date }) {
  const hoy = aLocal(ahora).slice(0, 10);
  const tope = diaDespues(hoy);
  const dias = gastoPorDiaSemana(datos, desde, hasta < `${tope} 00:00:00` ? hasta : `${tope} 00:00:00`);
  const caro = diaMasCaro(dias);
  const max = Math.max(1, ...dias.map(d => d.promedio));
  const quieto = menosMovimiento();
  return (
    <div id="dia-semana-grafica">
      <p class="sub !mt-0 mb-2">{caro ? <>Los {DIAS_PLURAL[caro.indice]} son los que más pesan: <b class="tabular-nums">{verMonto(formatear(caro.promedio))}</b> cada uno.</> : 'Aún no hay gastos en este periodo.'} Toca un día para ver sus movimientos.</p>
      <div class="ds-fila" role="group" aria-label="Gasto promedio por día de la semana">
        {dias.map(d => (
          <div key={d.indice} class={`ds-col ${caro?.indice === d.indice ? 'top' : ''}`} data-dia-semana={d.indice}
            aria-label={`${d.nombre}: ${verMonto(formatearReal(d.promedio))} por día, ${verMonto(formatearReal(d.total))} en total`} {...tocable(() => abrirDia(datos, d))}>
            <span class="ds-barra-caja">
              <span class="ds-barra" style={{ height: `${Math.max(d.promedio > 0 ? 6 : 2, (d.promedio / max) * 100)}%`, animationDelay: quieto ? undefined : `${d.indice * 60}ms` }} />
            </span>
            <span class="ds-nombre">{d.corto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
