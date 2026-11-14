import { describirDia, formatear, pagosATrabajadores, rangoJornales, type CuandoJornales } from '../../../../packages/core/src/index.ts';
import { HardHat } from 'lucide-preact';
import { vacioHtml } from '../ui/iconos.tsx';
import { leerTodo } from '../app.ts';
import { esc } from '../carta.ts';

const OPCIONES: [CuandoJornales, string][] = [['semana', 'Esta semana'], ['pasada', 'La pasada'], ['mes', 'Este mes']];
let cuando: CuandoJornales = 'semana';

/** Cuánto se le pagó a cada trabajador en la semana o el mes. */
export async function vistaTrabajadores(cont: HTMLElement): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const r = rangoJornales(cuando, ctx.ahora);
  const lista = pagosATrabajadores(datos.movimientos, datos.cuentas, r.desde, r.hasta);
  const total = lista.reduce((s, x) => s + x.total, 0);
  const max = Math.max(1, ...lista.map(x => x.total));
  cont.innerHTML = `
    
    <div class="periodo filtro-tipos">${OPCIONES.map(([id, nombre]) => `<button class="chip" data-cuando="${id}" aria-pressed="${id === cuando}">${nombre}</button>`).join('')}</div>
    <section class="tarjeta grande"><div class="etiqueta">Total ${esc(r.titulo)}</div><div class="monto">${formatear(total)}</div></section>
    ${lista.length
      ? `<ul class="lista">${lista.map(x => `<li class="fila"><div><div class="titulo">${esc(x.nombre)}</div><div class="sub">${x.veces} ${x.veces === 1 ? 'pago' : 'pagos'} · el último ${esc(describirDia(x.ultimo.slice(0, 10)))}</div><div class="barra-fondo mt-2"><div class="barra-relleno" style="width:${Math.max(4, Math.round((x.total / max) * 100))}%"></div></div></div><div class="monto">${formatear(x.total)}</div></li>`).join('')}</ul>`
      : vacioHtml(HardHat, 'Sin pagos en este periodo', 'Se cuentan los gastos con una persona del grupo Trabajadores, o los de Jornales con nombre: «jornal 50000 felipe».', 'lima')}`;
  cont.querySelectorAll<HTMLElement>('[data-cuando]').forEach(b => b.addEventListener('click', () => {
    cuando = b.dataset.cuando as CuandoJornales;
    void vistaTrabajadores(cont);
  }));
}
