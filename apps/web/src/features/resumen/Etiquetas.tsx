/**
 * Tarjeta de etiquetas: lo gastado en cada #proyecto o #evento durante el periodo que se ve. Cada fila abre una ventana con los
 * movimientos que la forman. Si en el periodo no hay ninguna etiqueta, la tarjeta no aparece.
 */
import { Hash } from 'lucide-preact';
import { formatear as formatearReal, tokensDeEtiqueta, type Datos } from '../../../../../packages/core/src/index.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { formatear } from '../../lib/formatear.ts';
import { gastoDe, movimientosDeEtiqueta } from '../../lib/grupos.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';
import type { Periodos } from './aperturas.tsx';

/** Por etiqueta: cuántos movimientos y cuánto se gastó en el periodo, lo más gastado primero. */
function acumular(datos: Datos, p: Periodos): { etiqueta: string; n: number; total: number }[] {
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const por = new Map<string, { etiqueta: string; n: number; total: number }>();
  for (const m of datos.movimientos) {
    if (m.estado !== 'ok' || !m.etiqueta || m.ocurridoEn < p.desde || m.ocurridoEn >= p.hasta) continue;
    const g = gastoDe(m, cats);
    for (const e of new Set(tokensDeEtiqueta(m.etiqueta))) {
      const x = por.get(e) ?? { etiqueta: e, n: 0, total: 0 };
      x.n++; x.total += g;
      por.set(e, x);
    }
  }
  return [...por.values()].sort((a, b) => b.total - a.total || b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export function abrirEtiqueta(datos: Datos, etiqueta: string, p: Periodos): void {
  const movimientos = movimientosDeEtiqueta(datos, etiqueta, p.desde, p.hasta);
  const cats = new Set(datos.cuentas.filter(c => c.tipo === 'categoria').map(c => c.id));
  const total = movimientos.reduce((s, m) => s + gastoDe(m, cats), 0);
  abrirInfo({
    id: 'info-etiqueta', titulo: `#${etiqueta}`,
    // la ventana se abrió a propósito: muestra la cifra real, sin la máscara de privacidad
    sub: `${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'} · ${formatearReal(total)} gastados en este periodo`,
    movimientos,
    acciones: [{ id: 'info-ver-movimientos', texto: 'Ver en Movimientos', alTocar: () => cerrarYLuego(() => verMovimientos({ etiqueta, periodo: 'todo' })) }],
  });
}

export function TarjetaEtiquetas({ datos, p }: { datos: Datos; p: Periodos }) {
  const filas = acumular(datos, p);
  if (!filas.length) return null;
  const max = Math.max(1, ...filas.map(f => f.total));
  return (
    <section class="tarjeta" id="tarjeta-etiquetas" aria-label="Etiquetas">
      <h3 class="!mt-0 flex items-center gap-1.5"><Hash size={16} />Etiquetas</h3>
      <ul class="m-0 grid list-none gap-2.5 p-0">
        {filas.slice(0, 8).map(f => (
          <li key={f.etiqueta} class="barra-fila toque !my-0" role="button" tabIndex={0} data-etiqueta={f.etiqueta} onClick={() => abrirEtiqueta(datos, f.etiqueta, p)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirEtiqueta(datos, f.etiqueta, p); } }}>
            <span class="min-w-0"><span class="block truncate">#{f.etiqueta}</span><span class="text-[.7rem] text-tx2">{f.n} {f.n === 1 ? 'movimiento' : 'movimientos'}</span></span>
            <span class="barra-fondo"><span class="barra-relleno" style={{ width: `${Math.max(4, (f.total / max) * 100)}%` }} /></span>
            <span class="tabular-nums">{formatear(f.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
