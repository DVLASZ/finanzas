/**
 * Lo que se abre al tocar un bloque del Resumen: una ventana flotante con los movimientos exactos que forman esa cifra, la comparativa por
 * categoría contra el periodo anterior, y atajos para verlos en Movimientos. Todo se calcula con las mismas funciones del núcleo que dibujan
 * los bloques, así lo que suma la lista es lo que se tocó.
 */
import { ArrowDownRight, ArrowUpRight, List, Minus } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { formatear, gastoPorCategoria, ingresosPorFuente, type Datos } from '../../../../../packages/core/src/index.ts';
import { cerrarYLuego, abrirInfo, ListaMovimientos } from '../../components/ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { movimientosDeCategoria, movimientosDeConcepto, movimientosDeMedio, movimientosDeTipos, gastoDeCategoria, gastoDe } from '../../lib/grupos.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';
import type { Movimiento } from '../../../../../packages/core/src/index.ts';

export interface Periodos { desde: string; hasta: string; previoDesde: string; previoHasta: string }

const veces = (n: number) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;

/** La suma de lo gastado (la parte de las categorías) en una lista de gastos. */
const sumaGasto = (datos: Datos, movs: Movimiento[]): number => {
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  return movs.reduce((s, m) => s + gastoDe(m, cats), 0);
};

const verTodos = (texto: string, alTocar: () => void) => ({ id: 'info-ver-movimientos', texto, icono: <List size={18} />, alTocar: () => cerrarYLuego(alTocar) });

/** Un concepto del ranking o de los gastos hormiga («almuerzo», «tinto»). */
export function abrirConcepto(datos: Datos, concepto: string, p: Periodos, soloChicos = false): void {
  const movimientos = movimientosDeConcepto(datos, concepto, p.desde, p.hasta, soloChicos);
  abrirInfo({
    id: soloChicos ? 'hormiga' : 'concepto', titulo: concepto, sub: `${veces(movimientos.length)} · ${formatear(sumaGasto(datos, movimientos))} en este periodo`,
    movimientos, acciones: [verTodos('Ver en Movimientos', () => verMovimientos({ texto: concepto, periodo: 'todo' }))],
  });
}

/** Una categoría de «Por categoría» (con sus subcategorías). */
export function abrirCategoria(datos: Datos, categoriaId: string, nombre: string, p: Periodos): void {
  const movimientos = movimientosDeCategoria(datos, categoriaId, p.desde, p.hasta);
  abrirInfo({
    id: 'categoria', titulo: nombre, sub: `${veces(movimientos.length)} en este periodo`,
    movimientos, acciones: [verTodos('Ver en Movimientos', () => verMovimientos({ categoria: categoriaId, periodo: 'todo' }))],
  });
}

/** Un medio de pago o el grupo de efectivo o digital: se pasan los nombres de las cuentas que lo forman. */
export function abrirMedio(datos: Datos, titulo: string, nombres: string[], p: Periodos): void {
  const ids = datos.cuentas.filter(c => c.tipo === 'dinero' && nombres.includes(c.nombre)).map(c => c.id);
  const vistos = new Set<string>();
  const movimientos = ids.flatMap(id => movimientosDeMedio(datos, id, p.desde, p.hasta)).filter(m => (vistos.has(m.id) ? false : (vistos.add(m.id), true)))
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
  abrirInfo({
    id: 'medio', titulo: `Pagado con ${titulo.toLowerCase()}`, sub: `${veces(movimientos.length)} en este periodo`,
    movimientos, acciones: ids.length === 1 ? [verTodos('Ver en Movimientos', () => verMovimientos({ cuenta: ids[0], periodo: 'todo' }))] : [],
  });
}

function Variacion({ ahora, antes, bueno }: { ahora: number; antes: number; bueno: 'sube' | 'baja' }) {
  if (!antes) return <span class="var-chip var-nueva">{ahora ? 'nuevo' : 'sin dato'}</span>;
  const dif = Math.round(((ahora - antes) / antes) * 100);
  if (dif === 0) return <span class="var-chip var-igual"><Minus size={12} />igual</span>;
  const mejor = (dif > 0) === (bueno === 'sube');
  const clase = mejor ? 'var-baja' : 'var-sube';
  return <span class={`var-chip ${clase}`}>{dif > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{dif > 0 ? '+' : ''}{dif} %</span>;
}

/** La comparativa de gastos o de ingresos contra el periodo anterior, categoría por categoría (o fuente por fuente). */
export function abrirComparativa(datos: Datos, tipo: 'gastos' | 'ingresos', p: Periodos): void {
  const cuentas = datos.cuentas;
  const ahora = tipo === 'gastos' ? gastoPorCategoria(datos.movimientos, cuentas, p.desde, p.hasta) : ingresosPorFuente(datos.movimientos, cuentas, p.desde, p.hasta);
  const antes = tipo === 'gastos' ? gastoPorCategoria(datos.movimientos, cuentas, p.previoDesde, p.previoHasta) : ingresosPorFuente(datos.movimientos, cuentas, p.previoDesde, p.previoHasta);
  const filas = new Map<string, { id: string; nombre: string; ahora: number; antes: number }>();
  for (const x of ahora) filas.set(x.cuenta.id, { id: x.cuenta.id, nombre: x.cuenta.nombre, ahora: x.total, antes: 0 });
  for (const x of antes) { const f = filas.get(x.cuenta.id) ?? { id: x.cuenta.id, nombre: x.cuenta.nombre, ahora: 0, antes: 0 }; f.antes = x.total; filas.set(x.cuenta.id, f); }
  const lista = [...filas.values()].sort((a, b) => Math.max(b.ahora, b.antes) - Math.max(a.ahora, a.antes));
  const bueno = tipo === 'gastos' ? 'baja' : 'sube';
  const max = Math.max(1, ...lista.map(f => Math.max(f.ahora, f.antes)));
  const totalAhora = lista.reduce((s, f) => s + f.ahora, 0), totalAntes = lista.reduce((s, f) => s + f.antes, 0);
  abrirInfo({
    id: `comparativa-${tipo}`, titulo: tipo === 'gastos' ? 'Gastos contra el periodo anterior' : 'Ingresos contra el periodo anterior',
    sub: `Ahora ${formatear(totalAhora)} contra ${formatear(totalAntes)} antes, ${tipo === 'gastos' ? 'categoría' : 'fuente'} por ${tipo === 'gastos' ? 'categoría' : 'fuente'}.`,
    cuerpo: lista.length === 0 ? <p class="sub">No hay nada en estos dos periodos.</p> : (
      <ul class="lista !mt-2" id="info-comparativa">
        {lista.map(f => (
          <li key={f.nombre} class={`fila ${tipo === 'gastos' ? 'toque' : ''}`} style={tipo === 'gastos' ? undefined : { cursor: 'default' }} data-comparar={tipo === 'gastos' ? f.id : undefined}
            role={tipo === 'gastos' ? 'button' : undefined} tabIndex={tipo === 'gastos' ? 0 : undefined}
            onClick={tipo === 'gastos' ? () => abrirCategoriaComparada(datos, f.id, f.nombre, p) : undefined}
            onKeyDown={tipo === 'gastos' ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCategoriaComparada(datos, f.id, f.nombre, p); } } : undefined}>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2"><Insignia v={visualDeNombre(f.nombre)} tam={30} /><span class="titulo min-w-0 truncate">{f.nombre}</span></div>
              <div class="sub">{formatear(f.ahora)} <span class="opacity-70">contra {formatear(f.antes)}</span></div>
              <div class="barra-fondo mt-1.5"><div class={`barra-relleno ${bueno === 'baja' ? (f.ahora > f.antes ? 'mal' : 'pos') : (f.ahora >= f.antes ? 'pos' : 'mal')}`} style={{ width: `${Math.max(3, Math.round((f.ahora / max) * 100))}%` }} /></div>
            </div>
            <Variacion ahora={f.ahora} antes={f.antes} bueno={bueno} />
          </li>
        ))}
      </ul>
    ),
    acciones: [verTodos('Ver en Movimientos', () => verMovimientos({ periodo: 'mes' }))],
  });
}

/** Una categoría contra sí misma: lo de este periodo y lo del anterior, con el total de cada uno, la variación y las dos listas. */
export function abrirCategoriaComparada(datos: Datos, categoriaId: string, nombre: string, p: Periodos, rotulos: { ahora: string; antes: string } = { ahora: 'Este periodo', antes: 'El periodo anterior' }): void {
  const movsAhora = movimientosDeCategoria(datos, categoriaId, p.desde, p.hasta);
  const movsAntes = movimientosDeCategoria(datos, categoriaId, p.previoDesde, p.previoHasta);
  const ahora = gastoDeCategoria(datos, categoriaId, movsAhora), antes = gastoDeCategoria(datos, categoriaId, movsAntes);
  const dif = ahora - antes;
  const frase = antes === 0 ? (ahora === 0 ? 'No hubo gasto en ninguno de los dos periodos.' : 'Antes no había gasto en esta categoría.')
    : `${dif === 0 ? 'Igual que antes' : `${dif > 0 ? 'Subió' : 'Bajó'} ${formatear(Math.abs(dif))}`} (${dif > 0 ? '+' : ''}${Math.round((dif / antes) * 100)} %).`;
  const Bloque = ({ titulo, total, movs, id }: { titulo: string; total: number; movs: Movimiento[]; id: string }): ComponentChildren => (
    <div class="mt-3" data-lado={id}>
      <div class="flex items-baseline justify-between gap-2"><h3 class="!m-0">{titulo}</h3><b class="tabular-nums">{formatear(total)}</b></div>
      <p class="sub !mt-0">{veces(movs.length)}</p>
      <ListaMovimientos movs={movs} id={`info-movs-${id}`} vacio="Sin movimientos en este periodo." />
    </div>
  );
  abrirInfo({
    id: 'comparar-categoria', titulo: nombre, sub: frase,
    cuerpo: <div id="info-comparar"><Bloque titulo={rotulos.ahora} total={ahora} movs={movsAhora} id="ahora" /><Bloque titulo={rotulos.antes} total={antes} movs={movsAntes} id="antes" /></div>,
    acciones: [verTodos('Ver en Movimientos', () => verMovimientos({ categoria: categoriaId, periodo: 'todo' }))],
  });
}

const sumaTipo = (movs: Movimiento[], datos: Datos, tipo: 'gastos' | 'ingresos'): number => {
  if (tipo === 'gastos') return sumaGasto(datos, movs);
  const fuentes = new Set(datos.cuentas.filter(c => c.tipo === 'fuente').map(c => c.id));
  return movs.reduce((s, m) => s + m.asientos.filter(a => fuentes.has(a.cuentaId) && a.moneda === 'COP').reduce((x, a) => x - a.monto, 0), 0);
};

/** La tarjeta de Gastos o de Ingresos: los movimientos que suman la cifra en el periodo. */
export function abrirTotal(datos: Datos, tipo: 'gastos' | 'ingresos', p: Periodos, periodoMov: 'semana' | 'mes' | 'anio' | 'todo' = 'mes'): void {
  const movimientos = movimientosDeTipos(datos, tipo === 'gastos' ? ['gasto', 'compartido'] : ['ingreso'], p.desde, p.hasta);
  abrirInfo({
    id: `info-${tipo}`, titulo: tipo === 'gastos' ? 'Gastos del periodo' : 'Ingresos del periodo',
    sub: `${veces(movimientos.length)} suman ${formatear(sumaTipo(movimientos, datos, tipo))}.`,
    movimientos, acciones: [
      { id: 'info-comparar-previo', texto: 'Contra el periodo anterior', icono: <ArrowUpRight size={18} />, alTocar: () => abrirComparativa(datos, tipo, p) },
      verTodos('Ver en Movimientos', () => verMovimientos({ periodo: periodoMov })),
    ],
  });
}

/** El balance: lo que entró menos lo que salió, con las dos listas juntas. */
export function abrirBalance(datos: Datos, p: Periodos, periodoMov: 'semana' | 'mes' | 'anio' | 'todo' = 'mes'): void {
  const ingresos = movimientosDeTipos(datos, ['ingreso'], p.desde, p.hasta), gastos = movimientosDeTipos(datos, ['gasto', 'compartido'], p.desde, p.hasta);
  const entro = sumaTipo(ingresos, datos, 'ingresos'), salio = sumaTipo(gastos, datos, 'gastos');
  const movimientos = [...ingresos, ...gastos].sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
  abrirInfo({
    id: 'info-balance', titulo: 'Balance del periodo', sub: entro - salio < 0 ? 'Salió más de lo que entró.' : 'Entró más de lo que salió.',
    cuerpo: (
      <dl class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm" id="info-balance-calculo">
        <dt class="text-tx2">Ingresos</dt><dd class="tabular-nums text-pos">{formatear(entro)}</dd>
        <dt class="text-tx2">Gastos</dt><dd class="tabular-nums text-neg">-{formatear(salio)}</dd>
        <dt class="border-t border-white/10 pt-1.5 font-semibold">Balance</dt><dd class="border-t border-white/10 pt-1.5 font-bold tabular-nums">{formatear(entro - salio)}</dd>
      </dl>
    ),
    movimientos, acciones: [verTodos('Ver en Movimientos', () => verMovimientos({ periodo: periodoMov }))],
  });
}
