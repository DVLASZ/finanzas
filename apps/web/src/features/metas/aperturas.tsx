/**
 * Lo que se abre al tocar una alcancía o el total apartado: cuánto lleva cada meta, cuánto falta, a qué ritmo va y los aportes que
 * la forman. Los números salen de las mismas funciones del núcleo que dibujan las tarjetas.
 */
import { MessageSquarePlus, PiggyBank } from 'lucide-preact';
import { cuotaSemanal, diasParaMeta, formatear, leerMetas, type Datos, type Meta } from '../../../../../packages/core/src/index.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { BarraAvance } from '../../components/ui/iconos.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';

const pct = (m: Meta) => Math.min(100, Math.round((m.apartado / m.meta) * 100));

/** Todas las alcancías: lo apartado en cada una, hasta sumar el total. */
export function abrirMetas(datos: Datos): void {
  const metas = leerMetas(datos.config);
  const apartado = metas.reduce((s, m) => s + m.apartado, 0);
  abrirInfo({
    id: 'info-metas', titulo: 'Lo apartado para metas',
    sub: metas.length === 0 ? 'Todavía no hay alcancías.' : `${formatear(apartado)} en ${metas.length} ${metas.length === 1 ? 'alcancía' : 'alcancías'}. Esa plata sigue dentro de tus saldos, solo está anotada para cada meta.`,
    cuerpo: metas.length === 0 ? undefined : (
      <ul class="lista !mt-2" id="info-metas-lista">
        {metas.map(m => (
          <li key={m.nombre} class="fila" style={{ cursor: 'default' }} data-meta-info={m.nombre}>
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2"><span class="titulo">{m.nombre}</span><span class="tabular-nums text-sm">{pct(m)} %</span></div>
              <div class="sub">{formatear(m.apartado)} de {formatear(m.meta)}</div>
              <div class="mt-1.5"><BarraAvance porcentaje={pct(m)} /></div>
            </div>
          </li>
        ))}
      </ul>
    ),
    acciones: [{ id: 'info-ir-alcancias', texto: 'Ir a alcancías', icono: <PiggyBank size={18} />, alTocar: () => cerrarYLuego(() => irA('alcancias')) }],
  });
}

/** Una alcancía: avance, ritmo, cuota semanal y la lista de lo apartado y sacado. */
export function abrirMeta(meta: Meta, hoy: string): void {
  const dias = diasParaMeta(meta, hoy);
  const cuota = cuotaSemanal(meta, hoy);
  const llegada = dias === null ? null : new Date(Date.parse(`${hoy}T12:00:00Z`) + dias * 86400000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const aportes = [...(meta.aportes ?? [])].reverse();
  const lograda = meta.apartado >= meta.meta;
  abrirInfo({
    id: 'info-meta', titulo: meta.nombre,
    sub: lograda ? 'Meta cumplida.' : `Faltan ${formatear(meta.meta - meta.apartado)} para llegar a ${formatear(meta.meta)}.`,
    cuerpo: (
      <div id="info-meta-detalle">
        <div class="mt-2 flex items-baseline justify-between"><b class="text-lg tabular-nums">{formatear(meta.apartado)}</b><span class="text-tx2 tabular-nums">{pct(meta)} %</span></div>
        <div class="mt-1.5"><BarraAvance porcentaje={pct(meta)} alto={12} /></div>
        {!lograda && <p class="sub">{llegada ? `Al ritmo de los últimos 60 días, llegas hacia el ${llegada}.` : 'Aún no hay aportes suficientes para estimar cuándo llegas.'}</p>}
        {!lograda && cuota && !cuota.vencida && <p class="sub !mt-0">Para llegar a tiempo, apartar {formatear(cuota.porSemana)} por semana ({cuota.semanas} {cuota.semanas === 1 ? 'semana' : 'semanas'}).</p>}
        <h3>Aportes</h3>
        {aportes.length === 0 ? <p class="sub !mt-0" id="info-meta-sin-aportes">Todavía no hay aportes anotados.</p> : (
          <ul class="lista !mt-1" id="info-meta-aportes">
            {aportes.slice(0, 20).map((a, i) => (
              <li key={i} class="fila" style={{ cursor: 'default' }}>
                <div class="titulo">{a.m > 0 ? 'Apartado' : 'Sacado'}</div>
                <div class="sub">{new Date(`${a.f}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>
                <div class={`monto tabular-nums ${a.m > 0 ? 'bien' : 'mal'}`}>{a.m > 0 ? '+' : '-'}{formatear(Math.abs(a.m))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    ),
    acciones: [
      { id: 'info-apartar-chat', texto: 'Apartar desde el chat', icono: <MessageSquarePlus size={18} />, alTocar: () => cerrarYLuego(() => { prellenarChat(`ahorré  para ${meta.nombre.toLowerCase()}`); irA('chat'); }) },
    ],
  });
}
