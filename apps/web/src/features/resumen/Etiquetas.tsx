/**
 * Tarjeta de etiquetas: lo gastado en cada #proyecto o #evento durante el periodo que se ve. Cada fila abre una ventana con los
 * movimientos que la forman. Si en el periodo no hay ninguna etiqueta, la tarjeta no aparece.
 */
import { Hash, List, Pencil, Tag } from 'lucide-preact';
import { aplicarEdicion, formatear as formatearReal, reemplazarEtiqueta, tokensDeEtiqueta, type Datos } from '../../../../../packages/core/src/index.ts';
import { mostrarConfirmacion } from '../../components/ui/Confirmacion.tsx';
import { confirmar, avisar, pedir } from '../../components/ui/Dialogo.tsx';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
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

/** Cuántos movimientos (de cualquier fecha) llevan cada etiqueta, la más usada primero. */
function conteoTotal(datos: Datos): { etiqueta: string; n: number }[] {
  const por = new Map<string, number>();
  for (const m of datos.movimientos) for (const e of new Set(tokensDeEtiqueta(m.etiqueta))) por.set(e, (por.get(e) ?? 0) + 1);
  return [...por].map(([etiqueta, n]) => ({ etiqueta, n })).sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

/**
 * Cambia o quita una etiqueta en TODOS los movimientos que la llevan, con la misma vía que la edición de un movimiento, en
 * un solo guardado. Lo que no se pueda editar se salta y se avisa al final.
 */
async function cambiarEtiqueta(datos: Datos, de: string, a: string | null): Promise<void> {
  const afectados = datos.movimientos.filter(m => tokensDeEtiqueta(m.etiqueta).includes(de));
  let hechos = 0, fallos = 0;
  await guardarCambio(async () => {
    const ahora = new Date();
    for (const m of afectados) {
      try { await aplicarEdicion(app.repo, ahora, m.id, { etiqueta: reemplazarEtiqueta(m.etiqueta, de, a) ?? '' }); hechos++; } catch { fallos++; }
    }
  });
  cerrarYLuego(() => {
    if (fallos) void avisar({ titulo: 'Quedaron movimientos sin cambiar', texto: `Se cambiaron ${hechos} y ${fallos} no se pudieron editar.`, tono: 'info' });
    else mostrarConfirmacion(a ? `#${de} ahora es #${a}` : `#${de} se quitó de ${hechos} movimientos`);
  });
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
    acciones: [
      {
        id: 'etiqueta-renombrar', texto: 'Renombrar o fusionar', icono: <Pencil size={16} />,
        alTocar: () => void (async () => {
          const nuevo = await pedir({ titulo: `Renombrar #${etiqueta}`, texto: 'Si el nombre nuevo ya existe, las dos etiquetas se juntan. Cambia en todos los movimientos.', valor: etiqueta, aceptar: 'Cambiar' });
          const limpio = nuevo?.trim().replace(/^#/, '').toLowerCase();
          if (!limpio || limpio === etiqueta) return;
          try { reemplazarEtiqueta(etiqueta, etiqueta, limpio); } catch (e) { void avisar({ titulo: 'Nombre no válido', texto: (e as Error).message, tono: 'info' }); return; }
          await cambiarEtiqueta(datos, etiqueta, limpio);
        })(),
      },
      {
        id: 'etiqueta-quitar', texto: 'Quitar de todos', icono: <Tag size={16} />,
        alTocar: () => void (async () => {
          const n = datos.movimientos.filter(m => tokensDeEtiqueta(m.etiqueta).includes(etiqueta)).length;
          if (await confirmar({ titulo: `¿Quitar #${etiqueta} de todos?`, texto: `Se cambia en ${n} ${n === 1 ? 'movimiento' : 'movimientos'}. Los movimientos y sus montos no cambian.`, aceptar: 'Sí, quitar', peligro: true })) await cambiarEtiqueta(datos, etiqueta, null);
        })(),
      },
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', alTocar: () => cerrarYLuego(() => verMovimientos({ etiqueta, periodo: 'todo' })) },
    ],
  });
}

/** La lista completa de etiquetas con su cuenta, de cualquier fecha; tocar una abre su ventana. */
function abrirTodasLasEtiquetas(datos: Datos, p: Periodos): void {
  const todas = conteoTotal(datos);
  abrirInfo({
    id: 'etiquetas-todas', titulo: 'Todas las etiquetas', sub: `${todas.length} en total, de cualquier fecha`,
    cuerpo: (
      <ul class="m-0 grid list-none gap-1.5 p-0">
        {todas.map(t => (
          <li key={t.etiqueta}>
            <button type="button" class="secundario flex w-full min-w-0 items-center justify-between gap-2 !text-left" data-etiqueta={t.etiqueta} onClick={() => abrirEtiqueta(datos, t.etiqueta, p)}>
              <span class="min-w-0 truncate">#{t.etiqueta}</span><span class="shrink-0 text-[.75rem] text-tx2">{t.n}</span>
            </button>
          </li>
        ))}
      </ul>
    ),
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
      <button type="button" class="secundario mt-3 flex min-w-0 items-center gap-1.5" id="etiquetas-todas" onClick={() => abrirTodasLasEtiquetas(datos, p)}><List size={16} />Ver todas</button>
    </section>
  );
}
