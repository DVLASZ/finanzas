/** Las tres gráficas interactivas del Resumen, cada una en su tarjeta: ritmo contra presupuesto, semanas y ahorro con topes. */
import type { Datos } from '../../../../../packages/core/src/index.ts';
import { AhorroTopes } from './AhorroTopes.tsx';
import { GastoDiaSemana } from './DiaSemana.tsx';
import { RitmoPresupuesto } from './RitmoPresupuesto.tsx';
import { ComparativaSemanal } from './Semanal.tsx';

export function GraficasResumen({ datos, ahora, desde, hasta }: { datos: Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>; ahora: Date; desde?: string; hasta?: string }) {
  return (
    <>
      <section class="tarjeta" id="grafica-ritmo"><h3 class="!mt-0">Ritmo de gasto y presupuesto</h3><RitmoPresupuesto datos={datos} ahora={ahora} /></section>
      <section class="tarjeta" id="grafica-semanal"><h3 class="!mt-0">Ingresos y gastos por semana</h3><ComparativaSemanal datos={datos} ahora={ahora} /></section>
      {desde && hasta && <section class="tarjeta" id="grafica-dia-semana"><h3 class="!mt-0">Gasto por día de la semana</h3><GastoDiaSemana datos={datos} desde={desde} hasta={hasta} ahora={ahora} /></section>}
      <section class="tarjeta" id="grafica-ahorro"><h3 class="!mt-0">Metas y topes</h3><AhorroTopes datos={datos} ahora={ahora} /></section>
    </>
  );
}
