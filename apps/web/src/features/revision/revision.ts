import { revisarMes } from '../../../../../packages/core/src/index.ts';
import { prellenarChat } from '../../state/nav.ts';
import { leerTodo } from '../../services/app.ts';
import { esc, quitarEmojis } from '../../lib/carta.ts';

/** Lo que conviene mirar este mes, junto en una pantalla. Cada punto con algo por hacer trae su botón. */
export async function vistaRevision(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const puntos = revisarMes(datos, ctx.ahora);
  const urgentes = puntos.filter(p => p.nivel === 'urgente').length;
  const avisos = puntos.filter(p => p.nivel === 'aviso').length;
  const otros = puntos.length - urgentes - avisos;
  // una nota simple: cada punto urgente resta mucho y cada aviso resta poco
  const nota = Math.max(0, 100 - urgentes * 30 - avisos * 12 - otros * 4);
  const estado = nota >= 85 ? 'En orden' : nota >= 60 ? 'Con detalles' : 'Pide atención';
  const color = nota >= 85 ? 'var(--pos)' : nota >= 60 ? 'var(--adv)' : 'var(--neg)';
  cont.innerHTML = `
    <div class="tarjeta flex items-center gap-4">
      <div class="salud" style="--p:${nota};--c:${color}"><span>${nota}</span></div>
      <div class="min-w-0"><div class="etiqueta">Salud del mes</div><div class="monto" style="color:${color}">${estado}</div>
      <div class="sub">${puntos.length ? `${puntos.length} ${puntos.length === 1 ? 'punto por mirar' : 'puntos por mirar'}` : 'Nada pendiente'}</div></div>
    </div>
    <div class="kpis mt-3">
      <div class="tarjeta kpi"><div class="etiqueta">Urgentes</div><div class="kpi-v mal">${urgentes}</div></div>
      <div class="tarjeta kpi"><div class="etiqueta">Avisos</div><div class="kpi-v" style="color:var(--adv)">${avisos}</div></div>
      <div class="tarjeta kpi"><div class="etiqueta">Otros</div><div class="kpi-v">${otros}</div></div>
    </div>
    ${puntos.length
      ? puntos.map((p, i) => `<div class="alerta ${p.nivel === 'urgente' ? 'urgente' : p.nivel === 'aviso' ? 'aviso' : ''}">${esc(quitarEmojis(p.texto))}${p.accion ? `<div class="botones"><button class="chip" data-punto="${i}">${esc(p.accion.titulo)}</button></div>` : ''}</div>`).join('')
      : '<div class="alerta">Todo en orden: saldos al día, sin descuadres grandes y sin cobros viejos.</div>'}`;
  cont.querySelectorAll<HTMLElement>('[data-punto]').forEach(b => b.addEventListener('click', () => {
    const accion = puntos[Number(b.dataset.punto)]?.accion;
    if (!accion) return;
    prellenarChat(accion.texto);
    irAlChat();
  }));
}
