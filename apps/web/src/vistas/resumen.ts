import { $ } from './dom.ts';
import { leerMetas, totalApartado, agruparCategorias, aLocal, describirDia, formatear, ingresosPorFuente, gastoPorCategoria, nombreMes, rangoPeriodo, totalIngresos, estadoPresupuesto } from '../../../../packages/core/src/index.ts';
import { leerTodo } from '../app.ts';
import { esc } from '../carta.ts';


/** La fecha de referencia de un periodo `atras` semanas, meses o años antes de hoy. */
export function fechaAtras(hoy: Date, periodo: 'semana' | 'mes' | 'anio', atras: number): Date {
  const f = new Date(hoy);
  if (periodo === 'semana') f.setDate(f.getDate() - 7 * atras);
  else if (periodo === 'mes') f.setMonth(f.getMonth() - atras, 15); // a mitad de mes: sin riesgo de caer en el mes vecino por la zona horaria
  else f.setFullYear(f.getFullYear() - atras, 5, 15);
  return f;
}

export async function vistaResumen(cont: HTMLElement, periodo: 'semana' | 'mes' | 'anio' = 'mes', atras = 0): Promise<void> {
  const { datos, ctx } = await leerTodo();
  const { desde, hasta } = rangoPeriodo(periodo, fechaAtras(ctx.ahora, periodo, atras));
  const cats = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  const titulo = periodo === 'mes' ? `${nombreMes(desde)} ${desde.slice(0, 4)}` : periodo === 'anio' ? `Año ${desde.slice(0, 4)}` : `Semana del ${describirDia(desde.slice(0, 10))}`;
  const grupos = agruparCategorias(cats, datos.config, datos.cuentas);
  const maximo = Math.max(1, ...grupos.map(c => c.total));
  const meta = Number(datos.config.meta_ahorro_pct ?? '30');
  const topes = Object.keys(datos.presupuestos).map(id => {
    const e = estadoPresupuesto(datos.movimientos, datos.cuentas, datos.presupuestos, id, desde, hasta, datos.config.tope_arrastra === '1');
    const n = datos.cuentas.find(c => c.id === id)?.nombre ?? id;
    return e ? `<div class="tope"><div class="fila-tope"><span>${esc(n)}</span><span>${formatear(e.gastado)} de ${formatear(e.tope)} (${e.porcentaje}%)</span></div>
      <div class="barra-fondo"><div class="barra-relleno ${e.porcentaje >= 100 ? 'mal' : e.porcentaje >= 80 ? 'aviso' : ''}" style="width:${Math.min(100, e.porcentaje)}%"></div></div></div>` : '';
  }).join('');

  cont.innerHTML = `
    <div class="pestanas" role="tablist">
      ${(['semana', 'mes', 'anio'] as const).map(p => `<button class="pestana ${p === periodo ? 'activa' : ''}" data-p="${p}">${p === 'anio' ? 'Año' : p[0].toUpperCase() + p.slice(1)}</button>`).join('')}
    </div>
    <div class="periodo">
      <button class="chip" data-atras="${atras + 1}" aria-label="Ver el periodo anterior">‹ Anterior</button>
      <h2>${esc(titulo)}</h2>
      <button class="chip" data-atras="${atras - 1}" aria-label="Ver el periodo siguiente" ${atras === 0 ? 'disabled' : ''}>Siguiente ›</button>
    </div>
    <div class="rejilla">
      <div class="tarjeta"><div class="etiqueta">Gastos</div><div class="monto mal">${formatear(total)}</div></div>
      ${ingresos > 0 ? `<div class="tarjeta"><div class="etiqueta">Ingresos</div><div class="monto bien">${formatear(ingresos)}</div></div>
      <div class="tarjeta"><div class="etiqueta">Balance</div><div class="monto">${formatear(ingresos - total)}</div></div>
      ${periodo !== 'semana' ? `<div class="tarjeta"><div class="etiqueta">Meta de ahorro (${meta}%)</div><div class="monto">${formatear(Math.round((ingresos * meta) / 100))}</div></div>` : ''}` : ''}
    </div>
    ${topes ? `<h3>Topes</h3>${topes}` : ''}
    ${totalApartado(leerMetas(datos.config)) > 0 ? `<p class="sub">Apartado para metas: <b>${formatear(totalApartado(leerMetas(datos.config)))}</b> (ya está dentro de tus saldos)</p>` : ''}
    <h3>Por categoría</h3>
    <div class="barras">${grupos.map(c => `<div class="barra-fila">
      <span class="barra-nombre">${esc(c.cuenta.nombre)}</span>
      <div class="barra-fondo"><div class="barra-relleno" style="width:${Math.max(2, (c.total / maximo) * 100)}%"></div></div>
      <span class="barra-valor">${formatear(c.total)}</span></div>${c.hijos.map(h => `<div class="barra-fila sub-fila" style="margin-left:${(h.nivel - 1) * 1.2}rem">
      <span class="barra-nombre">· ${esc(h.cuenta.nombre)}</span>
      <div class="barra-fondo"><div class="barra-relleno" style="width:${Math.max(2, (h.total / maximo) * 100)}%"></div></div>
      <span class="barra-valor">${formatear(h.total)}</span></div>`).join('')}`).join('') || '<p class="vacio">Sin gastos en este periodo.</p>'}</div>
    <div class="acciones"><button class="secundario" id="informe">Informe para imprimir o guardar en PDF</button></div>`;
  cont.querySelector('#informe')!.addEventListener('click', () => abrirInforme());
  /** Una hoja limpia con lo mismo que se ve aquí, para imprimir o guardar como PDF desde el navegador. */
  const abrirInforme = () => {
    const fuentes = ingresosPorFuente(datos.movimientos, datos.cuentas, desde, hasta);
    // en el informe del año: ingresos y gastos mes por mes
    const meses = periodo !== 'anio' ? [] : Array.from({ length: 12 }, (_, i) => {
      const anio = Number(desde.slice(0, 4));
      const d = `${anio}-${String(i + 1).padStart(2, '0')}-01 00:00:00`;
      const h = i === 11 ? `${anio + 1}-01-01 00:00:00` : `${anio}-${String(i + 2).padStart(2, '0')}-01 00:00:00`;
      return { mes: nombreMes(d), ing: totalIngresos(datos.movimientos, datos.cuentas, d, h), gas: gastoPorCategoria(datos.movimientos, datos.cuentas, d, h).reduce((s, x) => s + x.total, 0) };
    }).filter(m => m.ing || m.gas);
    const fila = (a: string, b: string, c = '') => `<tr><td>${esc(a)}</td><td style="text-align:right">${esc(b)}</td><td style="text-align:right">${esc(c)}</td></tr>`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ${esc(titulo)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222}h1{margin-bottom:.2rem}table{width:100%;border-collapse:collapse;margin:.5rem 0 1.5rem}td,th{padding:.35rem .5rem;border-bottom:1px solid #ccc;text-align:left}th:not(:first-child){text-align:right}.total td{font-weight:700;border-top:2px solid #222}p.sub{color:#555;margin-top:0}</style></head><body>
      <h1>Informe: ${esc(titulo)}</h1><p class="sub">Hecho el ${esc(describirDia(aLocal(ctx.ahora).slice(0, 10)))}</p>
      <h2>Resumen</h2><table>${fila('Ingresos', formatear(ingresos))}${fila('Gastos', formatear(total))}<tr class="total"><td>Balance</td><td style="text-align:right">${esc(formatear(ingresos - total))}</td><td></td></tr></table>
      ${cats.length ? `<h2>Gastos por categoría</h2><table><tr><th>Categoría</th><th>Valor</th><th>%</th></tr>${cats.map(c => fila(c.cuenta.nombre, formatear(c.total), total ? `${Math.round((c.total / total) * 100)} %` : '')).join('')}<tr class="total"><td>Total</td><td style="text-align:right">${esc(formatear(total))}</td><td></td></tr></table>` : ''}
      ${meses.length > 1 ? `<h2>Mes por mes</h2><table><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th></tr>${meses.map(m => fila(m.mes, formatear(m.ing), formatear(m.gas))).join('')}</table>` : ''}
      ${fuentes.length ? `<h2>Ingresos por fuente</h2><table><tr><th>Fuente</th><th>Valor</th><th>%</th></tr>${fuentes.map(x => fila(x.cuenta.nombre, formatear(x.total), ingresos ? `${Math.round((x.total / ingresos) * 100)} %` : '')).join('')}</table>` : ''}
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('El navegador bloqueó la ventana. Permite las ventanas emergentes para esta página.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  cont.querySelectorAll<HTMLElement>('[data-p]').forEach(b => b.addEventListener('click', () => void vistaResumen(cont, b.dataset.p as 'semana' | 'mes' | 'anio')));
  cont.querySelectorAll<HTMLButtonElement>('[data-atras]').forEach(b => b.addEventListener('click', () => { if (!b.disabled) void vistaResumen(cont, periodo, Number(b.dataset.atras)); }));
}
