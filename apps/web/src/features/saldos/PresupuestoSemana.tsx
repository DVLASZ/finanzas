/** «Cuánto puedo gastar esta semana»: lo que queda para los días de la semana, el ritmo por semana y lo ya gastado. */
import { CalendarRange } from 'lucide-preact';
import { presupuestoSemanal } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { MontoAnimado } from '../../components/ui/piezas.tsx';
import { montosOcultos, PUNTOS } from '../../state/privacidad.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

export function PresupuestoSemana() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return null;
  const p = presupuestoSemanal(datos, ctx.ahora);
  const total = p.gastadoSemana + p.restoDeLaSemana;
  const pct = total > 0 ? Math.round((p.gastadoSemana / total) * 100) : 0;
  const oculto = montosOcultos.value;
  return (
    <section class="tarjeta" id="presupuesto-semana" aria-label="Cuánto puedo gastar esta semana">
      <div class="flex items-center justify-between gap-2">
        <h3 class="!m-0 flex items-center gap-1.5"><CalendarRange size={14} />Esta semana</h3>
        <span class="text-xs text-tx2">{p.diasDeLaSemana} {p.diasDeLaSemana === 1 ? 'día' : 'días'} por delante</span>
      </div>
      {p.enRojo ? (
        <p class="sub !mt-2">Tus pagos fijos y lo apartado para metas ya cubren todo lo disponible. No hay margen libre esta semana.</p>
      ) : <>
        <div class="mt-1 text-[1.8rem] font-extrabold leading-tight tabular-nums" data-ajusta><MontoAnimado valor={p.restoDeLaSemana} /></div>
        <div class="sub">para gastar lo que queda de la semana · una semana completa a este ritmo: {oculto ? PUNTOS : formatear(p.porSemana)}</div>
        <div class="mini-barra mt-3" role="img" aria-label={`Ya gastaste el ${pct} % de lo de esta semana`}><span style={{ width: `${pct}%` }} /></div>
        <div class="mt-1 flex justify-between text-xs text-tx2"><span>Gastado: {oculto ? PUNTOS : formatear(p.gastadoSemana)}</span>{p.fijos > 0 && <span>Pagos fijos descontados: {oculto ? PUNTOS : formatear(p.fijos)}</span>}</div>
      </>}
    </section>
  );
}
