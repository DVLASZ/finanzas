/**
 * «Buzón»: avisos que otras de tus apps te dejaron («Mamá te giró $150.000») y, si esta app tiene
 * destinos, un formulario para avisar a otra. Anotar un aviso deja la frase escrita en el chat.
 */
import { formatear } from '../../../packages/core/src/index.ts';
import { app, avisarAOtraApp, destinosDelBuzon, hayServidor, leerTodo, sincronizar } from './app.ts';
import { esc } from './carta.ts';
import { actualizarEstado, prellenarChat } from './vistas.ts';

interface Aviso { id: string; de: string; monto: number; concepto: string; cuando: string; estado: 'nuevo' | 'hecho' }

function leerAvisos(config: Record<string, string>): Aviso[] {
  try { const l = JSON.parse(config.buzon ?? '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}

export async function vistaBuzon(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos } = await leerTodo();
  const avisos = leerAvisos(datos.config);
  const nuevos = avisos.filter(a => a.estado === 'nuevo').reverse();
  const destinos = hayServidor() ? await destinosDelBuzon() : [];

  cont.innerHTML = `
    <h2 style="margin-top:0">Buzón</h2>
    <p class="sub">Avisos que otras de tus apps te dejaron. Solo es un aviso: tú decides si lo anotas.</p>
    <ul class="lista">${nuevos.map(a => `<li class="fila" style="cursor:default"><div>
      <div class="titulo">${esc(a.de)}: ${esc(formatear(a.monto))}</div>
      <div class="sub">${esc(a.concepto || 'Sin concepto')} · ${esc(a.cuando.slice(0, 10))}</div></div>
      <div class="acciones"><button class="chip" data-anotar="${esc(a.id)}">Anotar</button><button class="chip" data-hecho="${esc(a.id)}">Descartar</button></div></li>`).join('') || '<li class="vacio">No hay avisos nuevos.</li>'}</ul>
    ${destinos.length ? `<h2>Avisar a otra app</h2>
    <form id="formAviso">
      <label>A quién<select id="destino">${destinos.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label>
      <label>Monto<input id="monto" type="number" inputmode="numeric" min="1" placeholder="150000" required /></label>
      <label>Concepto<input id="concepto" type="text" maxlength="80" placeholder="Giro para Cooperativa" /></label>
      <div class="acciones"><button class="primario" type="submit">Avisar</button></div>
      <p class="sub" id="msgAviso"></p>
    </form>` : ''}`;

  const marcar = async (id: string) => {
    await app.repo.setConfig('buzon', JSON.stringify(avisos.map(a => (a.id === id ? { ...a, estado: 'hecho' } : a))));
    void sincronizar().then(() => actualizarEstado());
    await vistaBuzon(cont, irAlChat);
  };
  cont.querySelectorAll<HTMLButtonElement>('[data-anotar]').forEach(b => b.addEventListener('click', async () => {
    const a = avisos.find(x => x.id === b.dataset.anotar);
    if (!a) return;
    await marcar(a.id);
    prellenarChat(`ingreso ${a.monto} ${a.de}`);
    irAlChat();
  }));
  cont.querySelectorAll<HTMLButtonElement>('[data-hecho]').forEach(b => b.addEventListener('click', () => void marcar(b.dataset.hecho ?? '')));
  cont.querySelector('#formAviso')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = cont.querySelector<HTMLElement>('#msgAviso')!;
    msg.textContent = 'Enviando...';
    msg.textContent = await avisarAOtraApp(
      cont.querySelector<HTMLSelectElement>('#destino')!.value,
      Number(cont.querySelector<HTMLInputElement>('#monto')!.value),
      cont.querySelector<HTMLInputElement>('#concepto')!.value,
    );
  });
}
