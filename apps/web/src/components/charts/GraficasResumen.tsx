/**
 * Las gráficas del Resumen, cada una en su tarjeta, según el periodo que se ve (semana, mes, año, todo o fechas sueltas).
 * Nada sale del mes de hoy salvo que el periodo sea ese mes: un año pasado muestra sus 12 meses, una semana sus 7 días.
 * Si el periodo no tiene gastos ni ingresos no dibuja nada; el estado vacío lo pone el Resumen.
 */
import { aLocal, rangoPeriodo, type Datos } from '../../../../../packages/core/src/index.ts';
import { barrasHistorico, barrasPorMes, finDeMes, totalesPeriodo, vistaDe } from '../../lib/graficasResumen.ts';
import { AhorroTopes } from './AhorroTopes.tsx';
import { GastoDiaSemana } from './DiaSemana.tsx';
import { EvolucionAnual } from './EvolucionAnual.tsx';
import { RitmoPresupuesto } from './RitmoPresupuesto.tsx';
import { ComparaPeriodos, ComparativaSemanal, FlujoSemana } from './Semanal.tsx';

export type PeriodoGraficas = 'todo' | 'semana' | 'mes' | 'anio' | 'rango';

interface Props {
  datos: Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;
  ahora: Date;
  desde?: string;
  hasta?: string;
  periodo?: PeriodoGraficas;
  /** Cuántos periodos atrás de hoy se mira (0 es el actual). El mes actual se reconoce por las fechas; esto solo es informativo. */
  atras?: number;
}

export function GraficasResumen({ datos, ahora, desde: d0, hasta: h0, periodo = 'mes' }: Props) {
  const base = rangoPeriodo('mes', ahora);
  const desde = d0 ?? base.desde, hasta = h0 ?? base.hasta;
  const vista = vistaDe(periodo, desde, hasta);
  const t = vista === 'todo' ? totalesPeriodo(datos, '0000-01-01', '9999-01-01') : totalesPeriodo(datos, desde, hasta);
  if (!t.gastos && !t.ingresos) return null;
  const suelto = periodo === 'rango';

  if (vista === 'semana') {
    return (
      <>
        <section class="tarjeta" id="grafica-semana-dias"><h3 class="!mt-0">Gasto de cada día</h3><FlujoSemana datos={datos} desde={desde} hasta={hasta} ahora={ahora} /></section>
        <section class="tarjeta" id="grafica-comparar"><h3 class="!mt-0">{suelto ? 'Contra el periodo anterior' : 'Contra la semana anterior'}</h3><ComparaPeriodos datos={datos} desde={desde} hasta={hasta} antes={suelto ? 'los mismos días de antes' : 'la semana anterior'} /></section>
        <section class="tarjeta" id="grafica-ahorro"><h3 class="!mt-0">Metas y topes</h3><AhorroTopes datos={datos} ahora={ahora} desde={desde} hasta={hasta} /></section>
      </>
    );
  }

  if (vista === 'mes') {
    const esMes = periodo === 'mes';
    const actual = desde.slice(0, 7) === aLocal(ahora).slice(0, 7);
    return (
      <>
        {esMes && <section class="tarjeta" id="grafica-ritmo"><h3 class="!mt-0">{actual ? 'Ritmo de gasto y presupuesto' : 'Gasto acumulado del mes'}</h3><RitmoPresupuesto datos={datos} ahora={actual ? ahora : finDeMes(desde)} cerrado={!actual} /></section>}
        <section class="tarjeta" id="grafica-semanal"><h3 class="!mt-0">Ingresos y gastos por semana</h3><ComparativaSemanal datos={datos} ahora={ahora} desde={desde} hasta={hasta} /></section>
        <section class="tarjeta" id="grafica-dia-semana"><h3 class="!mt-0">Gasto por día de la semana</h3><GastoDiaSemana datos={datos} desde={desde} hasta={hasta} ahora={ahora} /></section>
        {!esMes && <section class="tarjeta" id="grafica-comparar"><h3 class="!mt-0">Contra el periodo anterior</h3><ComparaPeriodos datos={datos} desde={desde} hasta={hasta} antes="los mismos días de antes" /></section>}
        <section class="tarjeta" id="grafica-ahorro"><h3 class="!mt-0">Metas y topes</h3><AhorroTopes datos={datos} ahora={ahora} desde={desde} hasta={hasta} /></section>
      </>
    );
  }

  if (vista === 'anio') {
    const barras = barrasPorMes(datos, desde, hasta);
    return (
      <>
        <section class="tarjeta" id="grafica-evolucion"><h3 class="!mt-0">Ingresos y gastos mes a mes</h3><EvolucionAnual barras={barras} /></section>
        <section class="tarjeta" id="grafica-comparar"><h3 class="!mt-0">{suelto ? 'Contra el periodo anterior' : 'Contra el año anterior'}</h3><ComparaPeriodos datos={datos} desde={desde} hasta={hasta} antes={suelto ? 'el periodo anterior' : 'el año anterior'} /></section>
        <section class="tarjeta" id="grafica-ahorro"><h3 class="!mt-0">Metas y topes</h3><AhorroTopes datos={datos} ahora={ahora} desde={desde} hasta={hasta} /></section>
      </>
    );
  }

  // todo el histórico: sin proyección ni topes, que no tienen sentido sin un periodo
  const barras = barrasHistorico(datos);
  return (
    <section class="tarjeta" id="grafica-evolucion"><h3 class="!mt-0">Ingresos y gastos: histórico</h3><EvolucionAnual barras={barras} /></section>
  );
}
