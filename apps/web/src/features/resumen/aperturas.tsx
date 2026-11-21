/**
 * Lo que se abre al tocar un bloque del Resumen: una ventana flotante con los movimientos exactos que forman esa cifra, la comparativa por
 * categoría contra el periodo anterior, y atajos para verlos en Movimientos. Todo se calcula con las mismas funciones del núcleo que dibujan
 * los bloques, así lo que suma la lista es lo que se tocó.
 */
import { ArrowDownRight, ArrowUpRight, List, Minus } from 'lucide-preact';
import { formatear, gastoPorCategoria, ingresosPorFuente, type Datos } from '../../../../../packages/core/src/index.ts';
import { cerrarYLuego, abrirInfo } from '../../components/ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { movimientosDeCategoria, movimientosDeConcepto, movimientosDeMedio, gastoDe } from '../../lib/grupos.ts';
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
  const filas = new Map<string, { nombre: string; ahora: number; antes: number }>();
  for (const x of ahora) filas.set(x.cuenta.id, { nombre: x.cuenta.nombre, ahora: x.total, antes: 0 });
  for (const x of antes) { const f = filas.get(x.cuenta.id) ?? { nombre: x.cuenta.nombre, ahora: 0, antes: 0 }; f.antes = x.total; filas.set(x.cuenta.id, f); }
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
          <li key={f.nombre} class="fila" style={{ cursor: 'default' }}>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2"><Insignia v={visualDeNombre(f.nombre)} tam={30} /><span class="titulo">{f.nombre}</span></div>
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
