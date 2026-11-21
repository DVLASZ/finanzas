/** Las tres gráficas interactivas del Resumen, cada una en su tarjeta: ritmo contra presupuesto, semanas y ahorro con topes. */
import type { Datos } from '../../../../../packages/core/src/index.ts';
import { AhorroTopes } from './AhorroTopes.tsx';
import { RitmoPresupuesto } from './RitmoPresupuesto.tsx';
import { ComparativaSemanal } from './Semanal.tsx';

export function GraficasResumen({ datos, ahora }: { datos: Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>; ahora: Date }) {
  return (
    <>
      <section class="tarjeta" id="grafica-ritmo"><h3 class="!mt-0">Ritmo de gasto y presupuesto</h3><RitmoPresupuesto datos={datos} ahora={ahora} /></section>
      <section class="tarjeta" id="grafica-semanal"><h3 class="!mt-0">Ingresos y gastos por semana</h3><ComparativaSemanal datos={datos} ahora={ahora} /></section>
      <section class="tarjeta" id="grafica-ahorro"><h3 class="!mt-0">Metas y topes</h3><AhorroTopes datos={datos} ahora={ahora} /></section>
    </>
  );
}
