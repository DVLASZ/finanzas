import { prellenarChat } from '../../state/nav.ts';
import { $ } from '../../lib/dom.ts';
import { deudasPorPersona, gruposDe, describirDia, formatear } from '../../../../../packages/core/src/index.ts';
import { leerTodo } from '../../services/app.ts';
import { esc } from '../../lib/carta.ts';
import { PartyPopper, Users } from 'lucide-preact';
import { insigniaHtml, vacioHtml, visualDePersona } from '../../components/ui/iconos.tsx';


export async function vistaDeudas(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const nombreGrupo = (g: string | null | undefined): string => (g ? gruposDe(ctx).find(x => x.id === g)?.nombre ?? g : '');
  const lista = deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, datos.config.fecha_apertura ?? '2000-01-01 00:00:00');
  const maxD = Math.max(1, ...lista.map(x => Math.abs(x.saldo)));
  const barra = (d: (typeof lista)[number], debes: boolean) => `<div class="barra-fondo mt-2"><div class="barra-relleno ${debes ? 'mal' : 'pos'}" style="width:${Math.max(4, Math.round((Math.abs(d.saldo) / maxD) * 100))}%"></div></div>`;
  const fila = (d: (typeof lista)[number]) => {
    const limite = d.compromisos.map(c => c.fechaLimite).filter(Boolean).sort()[0];
    const motivo = d.compromisos[0]?.motivo;
    const debes = d.saldo < 0;
    const monto = formatear(Math.abs(d.saldo) - (debes ? d.deOtros : 0), d.moneda);
    const accion = debes ? `pagué ${monto.replace('US$', '').replace('$', '')}${d.moneda === 'USD' ? ' usd' : ''} a ${d.persona.nombre} ` : `${d.persona.nombre} me pagó `;
    return `<li class="fila"><div class="flex min-w-0 items-center gap-3">${insigniaHtml(visualDePersona(d.persona.nombre), 42)}<div><div class="titulo">${esc(d.persona.nombre)} <span class="etiq">${esc(nombreGrupo(d.persona.grupo))}</span></div>
      <div class="sub">${motivo ? esc(motivo) : ''}${limite ? ` · antes del ${esc(describirDia(limite))}` : ''}</div>${barra(d, debes)}</div></div>
      <div><div class="monto ${debes ? 'mal' : 'bien'}">${monto}</div><button class="chip" data-accion="${esc(accion)}">${debes ? 'Registrar pago' : 'Registrar cobro'}</button></div></li>`;
  };
  const debes = lista.filter(d => d.saldo < 0 && -d.saldo - d.deOtros > 0);
  const teDeben = lista.filter(d => d.saldo > 0);
  const deOtros = lista.filter(d => d.deOtros > 0);
  const filaOtros = (d: (typeof lista)[number]) => `<li class="fila"><div class="flex min-w-0 items-center gap-3">${insigniaHtml(visualDePersona(d.persona.nombre), 42)}<div><div class="titulo">${esc(d.persona.nombre)} <span class="etiq">${esc(nombreGrupo(d.persona.grupo))}</span></div>
      <div class="sub">${d.compromisos[0]?.motivo ? esc(d.compromisos[0].motivo) + ' · ' : ''}al gastarla escribe «... con plata de ${esc(d.persona.nombre.toLowerCase())}»</div></div></div>
      <div><div class="monto">${formatear(d.deOtros, d.moneda)}</div><button class="chip" data-accion="${esc('pagué ' + d.deOtros + ' a ' + d.persona.nombre)}">Devolver</button></div></li>`;
  const porCobrar = teDeben.filter(d => d.moneda === 'COP').reduce((s, d) => s + d.saldo, 0);
  const porPagar = debes.filter(d => d.moneda === 'COP').reduce((s, d) => s - d.saldo - d.deOtros, 0);
  const kpis = `<div class="kpis"><div class="tarjeta kpi"><div class="etiqueta">Por cobrar</div><div class="kpi-v bien">${formatear(porCobrar)}</div><div class="sub">${teDeben.length} ${teDeben.length === 1 ? 'persona' : 'personas'}</div></div><div class="tarjeta kpi"><div class="etiqueta">Por pagar</div><div class="kpi-v mal">${formatear(porPagar)}</div><div class="sub">${debes.length} ${debes.length === 1 ? 'persona' : 'personas'}</div></div></div>`;
  cont.innerHTML = `
    ${kpis}
    ${deOtros.length ? `<h2>Plata de otros</h2><ul class="lista">${deOtros.map(filaOtros).join('')}</ul><p class="sub">Es plata que te mandaron para gastarla por ellos. No es tuya ni cuenta como deuda.</p>` : ''}
    <h2>Debes</h2><ul class="lista">${debes.map(fila).join('') || `<li>${vacioHtml(PartyPopper, 'No debes nada', 'Estás al día con todos.', 'esmeralda')}</li>`}</ul>
    <h2>Te deben</h2><ul class="lista">${teDeben.map(fila).join('') || `<li>${vacioHtml(Users, 'Nadie te debe', 'Cuando prestes algo, aparece aquí.', 'azul')}</li>`}</ul>
    <p class="sub">Para anotar una deuda o un préstamo, escríbelo en el chat: «le debo 54000 a Pedro por la bici» · «presté 40000 a Ana».</p>`;
  cont.querySelectorAll<HTMLElement>('[data-accion]').forEach(b => b.addEventListener('click', () => { prellenarChat(b.dataset.accion ?? ''); irAlChat(); }));
}
