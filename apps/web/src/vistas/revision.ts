import { revisarMes } from '../../../../packages/core/src/index.ts';
import { prellenarChat } from './chat.ts';
import { leerTodo } from '../app.ts';
import { esc } from '../carta.ts';

/** Lo que conviene mirar este mes, junto en una pantalla. Cada punto con algo por hacer trae su botón. */
export async function vistaRevision(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const puntos = revisarMes(datos, ctx.ahora);
  cont.innerHTML = `
    <h2 style="margin-top:0">Revisión del mes</h2>
    ${puntos.length
      ? puntos.map((p, i) => `<div class="alerta ${p.nivel === 'urgente' ? 'urgente' : p.nivel === 'aviso' ? 'aviso' : ''}">${esc(p.texto)}${p.accion ? `<div class="botones"><button class="chip" data-punto="${i}">${esc(p.accion.titulo)}</button></div>` : ''}</div>`).join('')
      : '<div class="alerta">Todo en orden: saldos al día, sin descuadres grandes y sin cobros viejos.</div>'}`;
  cont.querySelectorAll<HTMLElement>('[data-punto]').forEach(b => b.addEventListener('click', () => {
    const accion = puntos[Number(b.dataset.punto)]?.accion;
    if (!accion) return;
    prellenarChat(accion.texto);
    irAlChat();
  }));
}
