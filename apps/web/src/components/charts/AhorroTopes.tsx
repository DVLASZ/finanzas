/**
 * Metas de ahorro y topes por categoría, en barras que crecen al aparecer. Las metas muestran cuánto falta para llegar; los topes,
 * lo gastado del mes contra el límite, con el color según el avance. Tocar una meta abre su detalle y tocar un tope abre la
 * categoría con sus movimientos del mes.
 */
import { Target } from 'lucide-preact';
import { describirDia, filtrarMovimientos, formatear as formatearReal, rangoPeriodo, type Datos } from '../../../../../packages/core/src/index.ts';
import { abrirCategoria } from '../../features/resumen/aperturas.tsx';
import { avanceMetas, avanceTopes, avanceTopesRango, diasEntre, rangoAnterior, type AvanceMeta } from '../../lib/graficasResumen.ts';
import { fechaAtras } from '../../lib/periodos.ts';
import { formatear } from '../../lib/formatear.ts';
import { verMonto } from '../../state/privacidad.ts';
import { abrirInfo } from '../ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../ui/iconos.tsx';
import { MontoAnimado } from '../ui/piezas.tsx';

type Fuente = Pick<Datos, 'movimientos' | 'cuentas' | 'config' | 'presupuestos'>;

const colorTope = (pct: number) => (pct >= 100 ? 'var(--neg)' : pct >= 80 ? 'var(--adv)' : 'var(--pos)');

function abrirMeta(datos: Fuente, a: AvanceMeta): void {
  const m = a.meta;
  const movimientos = filtrarMovimientos(datos, { texto: m.nombre }).sort((x, y) => y.ocurridoEn.localeCompare(x.ocurridoEn));
  const aportes = (m.aportes ?? []).slice(-5).reverse();
  abrirInfo({
    id: 'info-meta-ahorro', titulo: m.nombre,
    sub: a.falta > 0 ? `Llevas ${a.pct} %. Faltan ${formatearReal(a.falta)}${m.fecha ? ` para el ${describirDia(m.fecha)}` : ''}.` : 'Meta cumplida.',
    cuerpo: (
      <div class="grid gap-2">
        <div class="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))]">
          <div><div class="etiqueta">Apartado</div><b class="text-pos tabular-nums">{formatearReal(m.apartado)}</b></div>
          <div><div class="etiqueta">Meta</div><b class="tabular-nums">{formatearReal(m.meta)}</b></div>
        </div>
        <div class="barra-fondo"><div class="ahorro-relleno" style={{ width: `${Math.max(2, a.pct)}%`, background: 'var(--pos)' }} /></div>
        {aportes.length > 0 && <ul class="m-0 grid list-none gap-1 p-0 text-sm">{aportes.map((p, i) => <li key={i} class="flex justify-between gap-3"><span class="text-tx2">{describirDia(p.f)}</span><b class={`tabular-nums ${p.m < 0 ? 'text-neg' : 'text-pos'}`}>{formatearReal(p.m)}</b></li>)}</ul>}
      </div>
    ),
    movimientos: movimientos.length ? movimientos : undefined,
  });
}

/** Con `desde` y `hasta` los topes se escalan a ese periodo (mes, año o los días que sean); sin ellos, al mes de hoy. */
export function AhorroTopes({ datos, ahora, desde, hasta }: { datos: Fuente; ahora: Date; desde?: string; hasta?: string }) {
  const metas = avanceMetas(datos);
  const propio = Boolean(desde && hasta);
  const topes = propio ? avanceTopesRango(datos, desde!, hasta!) : avanceTopes(datos, ahora);
  const dias = propio ? diasEntre(desde!, hasta!) : 30;
  const unidad = !propio ? 'del mes' : dias <= 8 ? 'de la semana' : dias <= 92 ? 'del mes' : 'del periodo';
  const apartado = metas.reduce((s, a) => s + a.meta.apartado, 0);
  const mes = propio ? { desde: `${desde!.slice(0, 10)} 00:00:00`, hasta: `${hasta!.slice(0, 10)} 00:00:00` } : rangoPeriodo('mes', ahora);
  const previo = propio ? rangoAnterior(mes.desde, mes.hasta) : rangoPeriodo('mes', fechaAtras(ahora, 'mes', 1));
  const per = { desde: mes.desde, hasta: mes.hasta, previoDesde: previo.desde, previoHasta: previo.hasta };
  if (!metas.length && !topes.length) return <p class="sub !mt-0">Cuando crees una meta («meta moto 2000000») o un tope por categoría, aquí ves cómo avanzan.</p>;
  return (
    <div id="ahorro-grafica" class="grid gap-4">
      <p class="sub !mt-0">Las barras verdes son lo que has apartado para cada meta. Las de topes comparan lo gastado en el periodo con el límite. Toca una para ver el detalle.</p>
      {metas.length > 0 && (
        <div>
          <div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3"><span class="etiqueta flex items-center gap-1"><Target size={14} />Metas de ahorro</span><b class="tabular-nums text-sm"><MontoAnimado valor={apartado} /> apartado</b></div>
          <ul class="ahorro-lista" id="ahorro-metas">
            {metas.map((a, i) => (
              <li key={a.meta.nombre}>
                <button type="button" class="ahorro-fila toque" data-meta-grafica={a.meta.nombre} onClick={() => abrirMeta(datos, a)}>
                  <span class="ahorro-nombre"><Insignia v={visualDeNombre(a.meta.nombre)} tam={26} /><span class="min-w-0">{a.meta.nombre}</span></span>
                  <span class="ahorro-valor tabular-nums">{verMonto(formatear(a.meta.apartado))} de {verMonto(formatear(a.meta.meta))} · {a.pct} %</span>
                  <span class="barra-fondo ahorro-pista"><span class="ahorro-relleno" style={{ width: `${Math.max(2, a.pct)}%`, background: a.pct >= 100 ? 'var(--acc)' : 'var(--pos)', animationDelay: `${i * 80}ms` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {topes.length > 0 && (
        <div>
          <div class="etiqueta mb-1.5">Topes {unidad} por categoría</div>
          <ul class="ahorro-lista" id="ahorro-topes">
            {topes.map((t, i) => (
              <li key={t.id}>
                <button type="button" class="ahorro-fila toque" data-tope-grafica={t.id} onClick={() => abrirCategoria(datos, t.id, t.nombre, per)}>
                  <span class="ahorro-nombre"><Insignia v={visualDeNombre(t.nombre)} tam={26} /><span class="min-w-0">{t.nombre}</span></span>
                  <span class="ahorro-valor tabular-nums">{verMonto(formatear(t.gastado))} de {verMonto(formatear(t.tope))} · {t.pct} %</span>
                  <span class="barra-fondo ahorro-pista"><span class="ahorro-relleno" style={{ width: `${Math.max(2, Math.min(100, t.pct))}%`, background: colorTope(t.pct), animationDelay: `${i * 80}ms` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
