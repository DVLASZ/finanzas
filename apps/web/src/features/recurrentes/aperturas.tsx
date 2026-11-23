/**
 * Lo que se abre al tocar los pagos fijos: el total del mes o lo que falta por pagar (cada pago con sus fechas) y un pago en
 * particular, con sus próximas fechas y lo que ya se anotó de él.
 */
import { List, Send } from 'lucide-preact';
import {
  describirDia, describirFrecuencia, estaPendiente, formatear, nombraAlFijo, ocurrencias, yaRegistrado, type Datos, type Recurrente,
} from '../../../../../packages/core/src/index.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';

const sumarDias = (f: string, n: number): string => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** El total del mes (`mes`) o lo que falta por pagar (`pendiente`), pago por pago. */
export function abrirFijos(datos: Datos, lista: Recurrente[], hoy: string, cual: 'mes' | 'pendiente'): void {
  const inicio = `${hoy.slice(0, 7)}-01`;
  const fin = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const filas = lista
    .map(r => ({ r, fechas: ocurrencias(r, inicio, fin), pendiente: estaPendiente(r, datos.movimientos, hoy) }))
    .filter(x => (cual === 'mes' ? x.fechas.length > 0 : x.pendiente))
    .map(x => ({ ...x, valor: cual === 'mes' ? x.r.monto * x.fechas.length : x.r.monto }));
  const suma = filas.reduce((s, x) => s + x.valor, 0);
  abrirInfo({
    id: cual === 'mes' ? 'info-fijos-mes' : 'info-fijos-pendientes', titulo: cual === 'mes' ? 'Pagos fijos de este mes' : 'Falta por pagar',
    sub: filas.length === 0 ? (cual === 'mes' ? 'Este mes no cae ningún pago fijo.' : 'Estás al día con los pagos fijos.') : `${formatear(suma)} en ${filas.length} ${filas.length === 1 ? 'pago' : 'pagos'}${cual === 'mes' ? ', contando cada vez que cae.' : '.'}`,
    cuerpo: filas.length === 0 ? undefined : (
      <ul class="lista !mt-2" id="info-fijos-lista">
        {filas.map(({ r, fechas, valor }) => (
          <li key={r.frase} class="fila" style={{ cursor: 'default' }} data-fijo={r.concepto}>
            <div class="flex min-w-0 items-center gap-3">
              <Insignia v={visualDeNombre(r.concepto)} tam={38} />
              <div class="min-w-0"><div class="titulo">{r.concepto}</div><div class="sub">{fechas.length > 0 ? fechas.map(f => describirDia(f)).join(', ') : describirFrecuencia(r)}</div></div>
            </div>
            <div class="monto tabular-nums">{formatear(valor)}</div>
          </li>
        ))}
      </ul>
    ),
    acciones: [],
  });
}

/** Un pago fijo: cada cuánto cae, cuándo es el próximo y lo que ya se anotó de él. */
export function abrirPagoFijo(datos: Datos, r: Recurrente, hoy: string): void {
  const hecho = yaRegistrado(r, datos.movimientos, hoy);
  const proximas = ocurrencias(r, hoy.slice(0, 10), sumarDias(hoy.slice(0, 10), 120)).slice(0, 4);
  const movimientos = datos.movimientos
    .filter(m => m.estado === 'ok' && m.tipo === 'gasto' && nombraAlFijo(r, m.descripcion))
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
  abrirInfo({
    id: 'info-fijo', titulo: r.concepto,
    sub: `${formatear(r.monto)} · ${describirFrecuencia(r)} · ${hecho ? 'ya está anotado en este periodo' : 'falta anotarlo en este periodo'}.`,
    cuerpo: (
      <div id="info-fijo-detalle">
        <h3>Próximas fechas</h3>
        {proximas.length === 0 ? <p class="sub !mt-0">No cae en los próximos meses.</p> : <p class="sub !mt-0" id="info-fijo-fechas">{proximas.map(f => describirDia(f)).join(' · ')}</p>}
        <h3>Lo que ya se anotó</h3>
      </div>
    ),
    movimientos,
    acciones: [
      ...(hecho ? [] : [{ id: 'info-registrar', texto: 'Registrar pago ahora', icono: <Send size={18} />, alTocar: () => cerrarYLuego(() => { prellenarChat(r.frase, true); irA('chat'); }) }]),
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ texto: r.concepto, periodo: 'todo' })) },
    ],
  });
}
