/**
 * Revisión del mes: una nota de salud, los puntos que conviene mirar (cada uno con su botón) y los gastos hormiga.
 */
import { CheckCircle2 } from 'lucide-preact';
import { rangoPeriodo, revisarMes } from '../../../../../packages/core/src/index.ts';
import { quitarEmojis } from '../../lib/carta.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { TarjetaHormiga } from '../resumen/Hormiga.tsx';

export function Revision() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const puntos = revisarMes(datos, ctx.ahora);
  const urgentes = puntos.filter(p => p.nivel === 'urgente').length;
  const avisos = puntos.filter(p => p.nivel === 'aviso').length;
  const otros = puntos.length - urgentes - avisos;
  // una nota simple: cada punto urgente resta mucho y cada aviso resta poco
  const nota = Math.max(0, 100 - urgentes * 30 - avisos * 12 - otros * 4);
  const estado = nota >= 85 ? 'En orden' : nota >= 60 ? 'Con detalles' : 'Pide atención';
  const color = nota >= 85 ? 'var(--pos)' : nota >= 60 ? 'var(--adv)' : 'var(--neg)';
  const mes = rangoPeriodo('mes', ctx.ahora);
  const diasDelMes = new Date(Number(mes.desde.slice(0, 4)), Number(mes.desde.slice(5, 7)), 0).getDate();

  return (
    <div class="space-y-3 pb-10">
      <div class="tarjeta flex items-center gap-4">
        <div class="salud" style={{ '--p': nota, '--c': color } as never}><span>{nota}</span></div>
        <div class="min-w-0">
          <div class="etiqueta">Salud del mes</div>
          <div class="monto" style={{ color }}>{estado}</div>
          <div class="sub">{puntos.length ? `${puntos.length} ${puntos.length === 1 ? 'punto por mirar' : 'puntos por mirar'}` : 'Nada pendiente'}</div>
        </div>
      </div>
      <div class="kpis !mb-0">
        <div class="tarjeta kpi"><div class="etiqueta">Urgentes</div><div class="kpi-v mal">{urgentes}</div></div>
        <div class="tarjeta kpi"><div class="etiqueta">Avisos</div><div class="kpi-v" style={{ color: 'var(--adv)' }}>{avisos}</div></div>
        <div class="tarjeta kpi"><div class="etiqueta">Otros</div><div class="kpi-v">{otros}</div></div>
      </div>

      {puntos.length ? puntos.map((p, i) => (
        <div key={i} class={`alerta !mb-0 ${p.nivel === 'urgente' ? 'urgente' : p.nivel === 'aviso' ? 'aviso' : ''}`}>
          {quitarEmojis(p.texto)}
          {p.accion && <div class="botones"><button class="chip" data-punto={i} onClick={() => { prellenarChat(p.accion!.texto); irA('chat'); }}>{p.accion.titulo}</button></div>}
        </div>
      )) : <div class="alerta !mb-0 flex items-center gap-2"><CheckCircle2 size={18} class="text-pos" />Todo en orden: saldos al día, sin descuadres grandes y sin cobros viejos.</div>}

      <TarjetaHormiga movs={datos.movimientos} cuentas={datos.cuentas} desde={mes.desde} hasta={mes.hasta} dias={diasDelMes} />
    </div>
  );
}
