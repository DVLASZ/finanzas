import { $ } from './dom.ts';
import { calcularAlertas, formatear, resumenSaldos } from '../../../../packages/core/src/index.ts';
import { leerTodo } from '../app.ts';
import { esc } from '../carta.ts';
import { prellenarChat } from './chat.ts';


export async function vistaSaldos(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const r = resumenSaldos(datos.movimientos, datos.cuentas, datos.config.fecha_apertura ?? '2000-01-01 00:00:00');
  const alertas = calcularAlertas(datos, ctx.ahora);

  const tarjetas = r.cuentas.map(({ cuenta, saldo }) => {
    const nombre = cuenta.id === 'efectivo' ? 'Efectivo (billetera)' : cuenta.id === 'monedas' || cuenta.enDisponible === false ? `${cuenta.nombre} (aparte)` : cuenta.nombre;
    return `<div class="tarjeta ${cuenta.id === 'monedas' ? 'tenue' : ''}"><div class="etiqueta">${esc(nombre)}</div><div class="monto">${formatear(saldo, cuenta.moneda)}</div></div>`;
  }).join('');
  const deuda = (v: { COP: number; USD: number }) => [v.COP && formatear(v.COP), v.USD && formatear(v.USD, 'USD')].filter(Boolean).join(' + ') || '$0';

  cont.innerHTML = `
    ${alertas.map((a, i) => `<div class="alerta ${a.nivel}">${esc(a.texto)}${a.acciones?.length ? `<div class="botones">${a.acciones.map((x, j) => `<button class="chip" data-aviso="${i}.${j}">${esc(x.titulo)}</button>`).join('')}</div>` : ''}</div>`).join('')}
    <section class="tarjeta grande">
      <div class="etiqueta">Disponible</div>
      <div class="monto">${formatear(r.disponibleCop)}</div>
      <div class="sub">${esc(r.cuentas.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP').map(x => x.cuenta.nombre).join(' + '))} · sin las monedas${r.cuentas.some(x => x.cuenta.moneda === 'USD') ? ' ni los dólares' : ''}</div>
    </section>
    <div class="rejilla">${tarjetas}</div>
    <div class="rejilla">
      <div class="tarjeta"><div class="etiqueta">Te deben</div><div class="monto bien">${deuda(r.teDeben)}</div></div>
      <div class="tarjeta"><div class="etiqueta">Debes</div><div class="monto mal">${deuda(r.debes)}</div></div>
    </div>
    ${r.deOtros > 0 ? `<div class="alerta">Plata de otros: <b>${formatear(r.deOtros)}</b>. Está dentro de lo de arriba, pero no es tuya: te la mandaron para gastarla por ellos.</div>` : ''}`;
  cont.querySelectorAll<HTMLElement>('[data-aviso]').forEach(b => b.addEventListener('click', () => {
    const [i, j] = b.dataset.aviso!.split('.').map(Number);
    const accion = alertas[i]?.acciones?.[j];
    if (!accion) return;
    prellenarChat(accion.texto, accion.enviar);
    irAlChat();
  }));
}
