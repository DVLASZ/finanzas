/**
 * Resumen del periodo: cifras que cuentan, dona interactiva por categoría (toca un trozo para verlo), barras
 * comparativas contra el periodo anterior, topes con color según el avance y el informe para imprimir.
 */
import { signal } from '@preact/signals';
import { Receipt, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, FileText, Minus, Share2, PiggyBank, Scale, TrendingDown, TrendingUp } from 'lucide-preact';
import { useState } from 'preact/hooks';
import {
  agruparCategorias, aLocal, describirDia, estadoPresupuesto, gastoPorCategoria, ingresosPorFuente, leerMetas,
  filtrarMovimientos, movimientosACsv, nombreMes, rangoPeriodo, resumenEnTexto, totalApartado, totalIngresos,
} from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { formatear as formatearReal } from '../../../../../packages/core/src/index.ts';
import { esc } from '../../lib/carta.ts';
import { avisar } from '../../components/ui/Dialogo.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { fechaAtras } from '../../lib/periodos.ts';
import { TarjetaHormiga } from './Hormiga.tsx';
import { TarjetaEtiquetas } from './Etiquetas.tsx';
import { abrirBalance, abrirCategoria, abrirComparativa, abrirConcepto, abrirMedio, abrirTotal, type Periodos } from './aperturas.tsx';
import { ComparativaMes } from './ComparativaMes.tsx';
import { Ritmo } from '../../components/charts/graficos.tsx';
import { BarraAvance, Insignia, Vacio, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Escalonado, MontoAnimado } from '../../components/ui/piezas.tsx';
import { BarrasMeses, MapaCalor } from '../../components/charts/Calendario.tsx';
import { PresupuestoSemana } from '../saldos/PresupuestoSemana.tsx';
import { abrirMetas } from '../metas/aperturas.tsx';
import { tocable } from '../../lib/tocable.ts';
import { dirPeriodo, usarEntradaPeriodo, usarPildora } from '../../lib/periodoVivo.ts';
import { BotonesCorte, HojaCorte } from './CorteTurno.tsx';
import { vendeProductos, aLocal as aLocalHoy, gastoDelMes, ingresosGastosPorMes, flujoAcumulado, gastoPorMedio, topConceptos } from '../../../../../packages/core/src/index.ts';
import { AnilloMedios, FlujoMes, RankingConceptos } from '../../components/charts/Flujo.tsx';
import { GraficasResumen } from '../../components/charts/GraficasResumen.tsx';
import { ComparadorFechas } from './Comparador.tsx';
import { imprimirReporte } from './reportePdf.tsx';

type Periodo = 'semana' | 'mes' | 'anio';
const periodo = signal<Periodo>('mes');
const atras = signal(0);

const COLORES = ['var(--info)', 'var(--acc)', 'var(--pos)', 'var(--adv)', 'var(--neg)', 'var(--marca)', 'var(--tx2)'];
const titulo = (p: Periodo, desde: string) =>
  p === 'mes' ? `${nombreMes(desde)} ${desde.slice(0, 4)}` : p === 'anio' ? `Año ${desde.slice(0, 4)}` : `Semana del ${describirDia(desde.slice(0, 10))}`;

interface Trozo { nombre: string; valor: number; color: string; previo: number }

/** «+12 % que el periodo anterior» o «sin dato anterior». */
const variacion = (v: number, previo: number): string => (previo > 0 ? `${v >= previo ? '+' : '-'}${Math.round((Math.abs(v - previo) / previo) * 100)} % que el anterior` : 'sin dato anterior');

/** Dona en SVG. Cada trozo se puede tocar: el centro muestra su nombre, valor y porcentaje. */
function Dona({ trozos, total }: { trozos: Trozo[]; total: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const R = 52, C = 2 * Math.PI * R;
  let acumulado = 0;
  const s = sel !== null ? trozos[sel] : null;
  return (
    <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" class="h-44 w-44 shrink-0 -rotate-90" role="img" aria-label="Gastos por categoría">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--elev)" stroke-width="16" />
        {trozos.map((t, i) => {
          const largo = (t.valor / total) * C;
          const el = (
            <circle key={t.nombre} cx="70" cy="70" r={R} fill="none" stroke={t.color} stroke-width={sel === i ? 20 : 16}
              stroke-dasharray={`${Math.max(0, largo - 2)} ${C - Math.max(0, largo - 2)}`} stroke-dashoffset={-acumulado}
              class="cursor-pointer transition-all duration-300" style={{ opacity: sel === null || sel === i ? 1 : 0.35 }}
              onClick={() => setSel(sel === i ? null : i)} />
          );
          acumulado += largo;
          return el;
        })}
        <g class="rotate-90" style={{ transformOrigin: '70px 70px' }} pointer-events="none">
          <text x="70" y={s ? 58 : 66} text-anchor="middle" class="fill-tx2" style={{ fontSize: '9.5px' }}>{s ? s.nombre.slice(0, 16) : 'Gastos'}</text>
          <text x="70" y={s ? 74 : 82} text-anchor="middle" class="fill-tx tabular-nums" style={{ fontSize: '13px', fontWeight: 700 }}>{formatear(s ? s.valor : total)}</text>
          {s && <text x="70" y="87" text-anchor="middle" class="fill-tx2" style={{ fontSize: '9px' }}>{Math.round((s.valor / total) * 100)} % del total</text>}
          {s && <text x="70" y="99" text-anchor="middle" class={s.previo > 0 && s.valor > s.previo ? 'fill-neg' : 'fill-pos'} style={{ fontSize: '8.5px', fontWeight: 600 }}>{variacion(s.valor, s.previo)}</text>}
        </g>
      </svg>
      <ul class="m-0 grid w-full list-none gap-1.5 p-0">
        {trozos.map((t, i) => (
          <li key={t.nombre}>
            <button class={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition active:scale-[.98] ${sel === i ? 'bg-elev ring-1 ring-anillo' : ''}`} onClick={() => setSel(sel === i ? null : i)}>
              <span class="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
              <span class="min-w-0 flex-1 truncate">{t.nombre}</span>
              <span class="tabular-nums text-tx2">{sel === i && t.previo > 0 ? variacion(t.valor, t.previo).replace(' que el anterior', '') : `${Math.round((t.valor / total) * 100)} %`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dos barras, la de ahora y la del periodo anterior, con la diferencia al lado. */
function Comparativa({ nombre, ahora, antes, bueno, alTocar, id }: { nombre: string; ahora: number; antes: number; bueno: 'sube' | 'baja'; alTocar?: () => void; id?: string }) {
  const max = Math.max(1, ahora, antes);
  const dif = antes ? Math.round(((ahora - antes) / antes) * 100) : null;
  const mejor = dif === null || dif === 0 ? null : (dif > 0) === (bueno === 'sube');
  const Flecha = dif === null || dif === 0 ? Minus : dif > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div class="tarjeta toque !p-3.5" id={id} role="button" tabIndex={0} onClick={alTocar} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocar?.(); } }}>
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="etiqueta min-w-0">{nombre}</span>
        <span class={`comp-pct inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-semibold ${mejor === null ? 'text-tx2' : mejor ? 'text-pos' : 'text-neg'}`}>
          <Flecha size={14} />{dif === null ? 'sin dato anterior' : `${Math.abs(dif)} %`}
        </span>
      </div>
      <div class="space-y-1.5">
        {[['Ahora', ahora, 'var(--marca)'], ['Antes', antes, 'var(--bor)']].map(([t, v, c]) => (
          <div key={t as string} class="comp-fila text-xs">
            <span class="text-tx2">{t}</span>
            <span class="whitespace-nowrap text-right tabular-nums">{formatear(v as number)}</span>
            <span class="comp-barra-fondo"><span class="block h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, ((v as number) / max) * 100)}%`, background: c as string }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Resumen() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  // periodo vivo: pildora deslizante y entrada direccional (los hooks van antes del return temprano)
  const refPestanas = usarPildora();
  const refRaiz = usarEntradaPeriodo(`${periodo.value}|${atras.value}`);
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const p = periodo.value;
  const a = atras.value;
  const { desde, hasta } = rangoPeriodo(p, fechaAtras(ctx.ahora, p, a));
  const previo = rangoPeriodo(p, fechaAtras(ctx.ahora, p, a + 1));

  const cats = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const totalPrevio = gastoPorCategoria(datos.movimientos, datos.cuentas, previo.desde, previo.hasta).reduce((s, c) => s + c.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  const ingresosPrevio = totalIngresos(datos.movimientos, datos.cuentas, previo.desde, previo.hasta);
  const grupos = agruparCategorias(cats, datos.config, datos.cuentas);
  const maximo = Math.max(1, ...grupos.map(c => c.total));
  const meta = Number(datos.config.meta_ahorro_pct ?? '30');
  const apartado = totalApartado(leerMetas(datos.config));

  const topes = Object.keys(datos.presupuestos).map(id => {
    const e = estadoPresupuesto(datos.movimientos, datos.cuentas, datos.presupuestos, id, desde, hasta, datos.config.tope_arrastra === '1');
    return e ? { nombre: datos.cuentas.find(c => c.id === id)?.nombre ?? id, ...e } : null;
  }).filter((x): x is NonNullable<typeof x> => Boolean(x));

  const previoPorId = new Map(gastoPorCategoria(datos.movimientos, datos.cuentas, previo.desde, previo.hasta).map(c => [c.cuenta.id, c.total]));
  const previoDe = (g: (typeof grupos)[number]) => previoPorId.get(g.cuenta.id) ?? 0;
  // la dona muestra las cinco categorías más grandes y junta el resto
  const ordenadas = [...grupos].sort((x, y) => y.total - x.total);
  const trozos: Trozo[] = ordenadas.slice(0, 6).map((g, i) => ({ nombre: g.cuenta.nombre, valor: g.total, color: COLORES[i], previo: previoDe(g) }));
  const resto = ordenadas.slice(6).reduce((s, g) => s + g.total, 0);
  if (resto > 0) trozos.push({ nombre: 'Otras', valor: resto, color: COLORES[6], previo: ordenadas.slice(6).reduce((s, g) => s + previoDe(g), 0) });

  // ritmo del mes: gasto acumulado día a día contra el mes anterior
  const diaHoy = ctx.ahora.getDate();
  const acumulado = (rango: { desde: string; hasta: string }): number[] => {
    const dias = new Date(Date.UTC(Number(rango.desde.slice(0, 4)), Number(rango.desde.slice(5, 7)), 0)).getUTCDate();
    let suma = 0;
    return Array.from({ length: dias }, (_, i) => {
      const d = `${rango.desde.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      const sig = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, i + 2)).toISOString().slice(0, 10);
      suma += gastoPorCategoria(datos.movimientos, datos.cuentas, `${d} 00:00:00`, `${sig} 00:00:00`).reduce((x, c) => x + c.total, 0);
      return suma;
    });
  };
  const verRitmo = p === 'mes' && a === 0;
  const ritmoAhora = verRitmo ? acumulado({ desde, hasta }) : [];
  const ritmoAntes = verRitmo ? acumulado(previo) : [];
  const esperado = verRitmo ? ritmoAntes[Math.min(diaHoy, ritmoAntes.length) - 1] ?? 0 : 0;
  const llevo = verRitmo ? ritmoAhora[Math.min(diaHoy, ritmoAhora.length) - 1] ?? 0 : 0;
  const pctRitmo = esperado > 0 ? Math.round((Math.abs(llevo - esperado) / esperado) * 100) : null;

  const per: Periodos = { desde, hasta, previoDesde: previo.desde, previoHasta: previo.hasta };
  const cambiar = (nuevo: Periodo) => { periodo.value = nuevo; atras.value = 0; };

  const nombreArchivo = (ext: string) => `resumen-${desde.slice(0, 7)}.${ext}`;
  const bajar = (nombre: string, contenido: string, tipo: string) => {
    const url = URL.createObjectURL(new Blob(['\ufeff' + contenido], { type: `${tipo};charset=utf-8` }));
    Object.assign(document.createElement('a'), { href: url, download: nombre }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  /** Los movimientos del periodo que se ve, en CSV. */
  const descargarCsv = () => bajar(nombreArchivo('csv'), movimientosACsv(filtrarMovimientos(datos, { desde: desde.slice(0, 10), hasta: hasta.slice(0, 10) }), datos.cuentas), 'text/csv');
  /** El resumen en texto: se comparte con el menú del celular (WhatsApp, correo...) o, si no hay, se descarga. */
  const compartirResumen = async () => {
    const texto = resumenEnTexto(datos, titulo(p, desde), desde, hasta);
    try {
      if (navigator.share) { await navigator.share({ title: `Resumen de ${titulo(p, desde)}`, text: texto }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    bajar(nombreArchivo('txt'), texto, 'text/plain');
  };

  /** Una hoja limpia con lo mismo que se ve aquí, para imprimir o guardar como PDF desde el navegador. */
  const abrirInforme = () => {
    const t = titulo(p, desde);
    const fuentes = ingresosPorFuente(datos.movimientos, datos.cuentas, desde, hasta);
    const meses = p !== 'anio' ? [] : Array.from({ length: 12 }, (_, i) => {
      const anio = Number(desde.slice(0, 4));
      const d = `${anio}-${String(i + 1).padStart(2, '0')}-01 00:00:00`;
      const h = i === 11 ? `${anio + 1}-01-01 00:00:00` : `${anio}-${String(i + 2).padStart(2, '0')}-01 00:00:00`;
      return { mes: nombreMes(d), ing: totalIngresos(datos.movimientos, datos.cuentas, d, h), gas: gastoPorCategoria(datos.movimientos, datos.cuentas, d, h).reduce((s, x) => s + x.total, 0) };
    }).filter(m => m.ing || m.gas);
    const fila = (x: string, y: string, z = '') => `<tr><td>${esc(x)}</td><td style="text-align:right">${esc(y)}</td><td style="text-align:right">${esc(z)}</td></tr>`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe ${esc(t)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222}h1{margin-bottom:.2rem}table{width:100%;border-collapse:collapse;margin:.5rem 0 1.5rem}td,th{padding:.35rem .5rem;border-bottom:1px solid #ccc;text-align:left}th:not(:first-child){text-align:right}.total td{font-weight:700;border-top:2px solid #222}p.sub{color:#555;margin-top:0}</style></head><body>
      <h1>Informe: ${esc(t)}</h1><p class="sub">Hecho el ${esc(describirDia(aLocal(ctx.ahora).slice(0, 10)))}</p>
      <h2>Resumen</h2><table>${fila('Ingresos', formatearReal(ingresos))}${fila('Gastos', formatearReal(total))}<tr class="total"><td>Balance</td><td style="text-align:right">${esc(formatearReal(ingresos - total))}</td><td></td></tr></table>
      ${cats.length ? `<h2>Gastos por categoría</h2><table><tr><th>Categoría</th><th>Valor</th><th>%</th></tr>${cats.map(c => fila(c.cuenta.nombre, formatearReal(c.total), total ? `${Math.round((c.total / total) * 100)} %` : '')).join('')}<tr class="total"><td>Total</td><td style="text-align:right">${esc(formatearReal(total))}</td><td></td></tr></table>` : ''}
      ${meses.length > 1 ? `<h2>Mes por mes</h2><table><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th></tr>${meses.map(m => fila(m.mes, formatearReal(m.ing), formatearReal(m.gas))).join('')}</table>` : ''}
      ${fuentes.length ? `<h2>Ingresos por fuente</h2><table><tr><th>Fuente</th><th>Valor</th><th>%</th></tr>${fuentes.map(x => fila(x.cuenta.nombre, formatearReal(x.total), ingresos ? `${Math.round((x.total / ingresos) * 100)} %` : '')).join('')}</table>` : ''}
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { void avisar({ titulo: 'El navegador bloqueó la ventana', texto: 'Permite las ventanas emergentes para esta página y vuelve a intentarlo.', tono: 'peligro' }); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  // el mapa de calor es del mes que se está viendo (o del actual si se mira una semana o un año)
  const mesCalor = p === 'mes' ? desde.slice(0, 7) : aLocalHoy(ctx.ahora).slice(0, 7);
  return (
    <div class="space-y-3" ref={refRaiz}>
      <div class="pestanas viva" role="tablist" ref={refPestanas}>
        <span class="pildora" aria-hidden="true" />
        {(['semana', 'mes', 'anio'] as const).map(x => <button key={x} class={`pestana ${x === p ? 'activa' : ''}`} data-p={x} onClick={() => { dirPeriodo.value = 0; cambiar(x); }}>{x === 'anio' ? 'Año' : x[0].toUpperCase() + x.slice(1)}</button>)}
      </div>
      <div class="periodo">
        <button class="chip" aria-label="Ver el periodo anterior" onClick={() => { dirPeriodo.value = -1; atras.value = a + 1; }}><ChevronLeft size={16} />Anterior</button>
        <h2 class="!m-0">{titulo(p, desde)}</h2>
        <button class="chip" aria-label="Ver el periodo siguiente" disabled={a === 0} onClick={() => { dirPeriodo.value = 1; atras.value = Math.max(0, a - 1); }}>Siguiente<ChevronRight size={16} /></button>
      </div>

      <Escalonado class="grid grid-cols-2 gap-3">
        <div class="tarjeta toque" id="card-gastos" {...tocable(() => abrirTotal(datos, 'gastos', per, a === 0 ? p : 'todo'))}><div class="etiqueta flex items-center gap-1"><TrendingDown size={14} />Gastos</div><div class="monto mal mt-0.5"><MontoAnimado valor={total} /></div></div>
        {ingresos > 0 && <div class="tarjeta toque" id="card-ingresos" {...tocable(() => abrirTotal(datos, 'ingresos', per, a === 0 ? p : 'todo'))}><div class="etiqueta flex items-center gap-1"><TrendingUp size={14} />Ingresos</div><div class="monto bien mt-0.5"><MontoAnimado valor={ingresos} /></div></div>}
        {ingresos > 0 && <div class="tarjeta toque" id="card-balance" {...tocable(() => abrirBalance(datos, per, a === 0 ? p : 'todo'))}><div class="etiqueta flex items-center gap-1"><Scale size={14} />Balance</div><div class={`monto mt-0.5 ${ingresos - total < 0 ? 'mal' : 'bien'}`}><MontoAnimado valor={ingresos - total} /></div></div>}
        {ingresos > 0 && p !== 'semana' && <div class="tarjeta"><div class="etiqueta flex items-center gap-1"><PiggyBank size={14} />Meta de ahorro ({meta}%)</div><div class="monto mt-0.5"><MontoAnimado valor={Math.round((ingresos * meta) / 100)} /></div></div>}
      </Escalonado>

      {a === 0 && <PresupuestoSemana />}
      {vendeProductos(ctx) && <><BotonesCorte /><HojaCorte /></>}

      {topes.length > 0 && (
        <section class="tarjeta space-y-3">
          <h3 class="!m-0">Topes</h3>
          {topes.map(t => {
            return (
              <div key={t.nombre} class="tope">
                <div class="fila-tope"><span>{t.nombre}</span><span class="tabular-nums">{formatear(t.gastado)} de {formatear(t.tope)} ({t.porcentaje}%)</span></div>
                <BarraAvance porcentaje={t.porcentaje} />
              </div>
            );
          })}
        </section>
      )}
      {apartado > 0 && <p class="sub toque" id="apartado-metas" {...tocable(() => abrirMetas(datos))}>Apartado para metas: <b>{formatear(apartado)}</b> (ya está dentro de tus saldos)</p>}

      {total > 0 && (
        <section class="tarjeta">
          <h3 class="!mt-0">Dónde se fue</h3>
          <Dona trozos={trozos} total={total} />
        </section>
      )}

      {p === 'mes' && (() => {
        const anio = Number(desde.slice(0, 4)), mes = Number(desde.slice(5, 7));
        const flujo = flujoAcumulado(datos, anio, mes, a === 0 ? diaHoy : undefined);
        return flujo.length > 1 && flujo.some(x => x.neto !== 0) ? (
          <section class="tarjeta" id="flujo-mes">
            <h3 class="!mt-0">Flujo del mes</h3>
            <p class="sub !mt-0 mb-2">Ingresos menos gastos, sumados día a día. Toca la línea para ver un día.</p>
            <FlujoMes puntos={flujo} />
          </section>
        ) : null;
      })()}

      {total > 0 && (() => {
        const top = topConceptos(datos, desde, hasta, 5);
        const medios = gastoPorMedio(datos, desde, hasta);
        return <>
          {top.length > 0 && <section class="tarjeta" id="ranking-conceptos"><h3 class="!mt-0">Dónde más se va la plata</h3><RankingConceptos top={top} alTocar={x => abrirConcepto(datos, x, per)} /></section>}
          {medios.length > 0 && <section class="tarjeta" id="medios-pago"><h3 class="!mt-0">Con qué pagas</h3><AnilloMedios medios={medios} alTocar={(titulo, nombres) => abrirMedio(datos, titulo, nombres, per)} /></section>}
        </>;
      })()}

      <section class="tarjeta" id="mapa-calor">
        <h3 class="!mt-0">Calor del mes: día por día</h3>
        <MapaCalor dias={gastoDelMes(datos, Number(mesCalor.slice(0, 4)), Number(mesCalor.slice(5, 7)))} hoy={aLocalHoy(ctx.ahora).slice(0, 10)} />
      </section>

      <section class="tarjeta" id="seis-meses">
        <h3 class="!mt-0">Ingresos y gastos: seis meses</h3>
        <BarrasMeses meses={ingresosGastosPorMes(datos, ctx.ahora, 6)} />
      </section>

      <GraficasResumen datos={datos} ahora={ctx.ahora} desde={desde} hasta={hasta} />

      {verRitmo && <ComparativaMes datos={datos} ahora={ctx.ahora} />}

      {verRitmo && ritmoAhora.length > 0 && (
        <section class="tarjeta">
          <h3 class="!mt-0">Ritmo de gasto</h3>
          <p class={`!mt-0 mb-2 text-sm font-semibold ${pctRitmo === null ? 'text-tx2' : llevo > esperado ? 'text-neg' : 'text-pos'}`}>
            {pctRitmo === null ? 'Aún no hay un mes anterior con qué comparar.' : llevo === esperado ? 'Vas igual que tu ritmo habitual.' : `Vas un ${pctRitmo} % ${llevo > esperado ? 'por encima' : 'por debajo'} de tu ritmo habitual.`}
          </p>
          <Ritmo ahora={ritmoAhora} antes={ritmoAntes} hastaDia={Math.min(diaHoy, ritmoAhora.length)} />
        </section>
      )}

      <TarjetaHormiga movs={datos.movimientos} cuentas={datos.cuentas} desde={desde} hasta={hasta} dias={Math.max(1, Math.round((Date.parse(hasta.replace(' ', 'T') + 'Z') - Date.parse(desde.replace(' ', 'T') + 'Z')) / 86400000))} alTocar={x => abrirConcepto(datos, x, per, true)} />

      <TarjetaEtiquetas datos={datos} p={per} />

      <div class="grid gap-3 sm:grid-cols-2">
        <Comparativa id="comp-gastos" nombre="Gastos contra el periodo anterior" ahora={total} antes={totalPrevio} bueno="baja" alTocar={() => abrirComparativa(datos, 'gastos', per)} />
        {(ingresos > 0 || ingresosPrevio > 0) && <Comparativa id="comp-ingresos" nombre="Ingresos contra el periodo anterior" ahora={ingresos} antes={ingresosPrevio} bueno="sube" alTocar={() => abrirComparativa(datos, 'ingresos', per)} />}
      </div>

      <section class="tarjeta">
        <h3 class="!mt-0">Por categoría</h3>
        <div class="barras">
          {grupos.length === 0 && <Vacio Icono={Receipt} titulo="Sin gastos en este periodo" detalle="Cuando anotes gastos, aquí ves en qué se fueron." tono="esmeralda" />}
          {grupos.map(c => [
            <div key={c.cuenta.id} class="barra-fila toque" role="button" tabIndex={0} data-categoria={c.cuenta.id} onClick={() => abrirCategoria(datos, c.cuenta.id, c.cuenta.nombre, per)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirCategoria(datos, c.cuenta.id, c.cuenta.nombre, per); } }}>
              <span class="barra-nombre flex items-center gap-2"><Insignia v={visualDeNombre(c.cuenta.nombre)} tam={26} /><span class="truncate">{c.cuenta.nombre}</span></span>
              <div class="barra-fondo"><div class="barra-relleno" style={{ width: `${Math.max(2, (c.total / maximo) * 100)}%` }} /></div>
              <span class="barra-valor tabular-nums">{formatear(c.total)}</span>
            </div>,
            ...c.hijos.map(h => (
              <div key={h.cuenta.id} class="barra-fila sub-fila toque" role="button" tabIndex={0} data-categoria={h.cuenta.id} style={{ marginLeft: `${(h.nivel - 1) * 1.2}rem` }} onClick={() => abrirCategoria(datos, h.cuenta.id, h.cuenta.nombre, per)}>
                <span class="barra-nombre">· {h.cuenta.nombre}</span>
                <div class="barra-fondo"><div class="barra-relleno" style={{ width: `${Math.max(2, (h.total / maximo) * 100)}%` }} /></div>
                <span class="barra-valor tabular-nums">{formatear(h.total)}</span>
              </div>
            )),
          ])}
        </div>
      </section>

      <ComparadorFechas datos={datos} ahora={ctx.ahora} />

      <div class="acciones">
        <button class="secundario" id="reporte-pdf" onClick={() => void imprimirReporte(datos, ctx.ahora, `Reporte: ${titulo(p, desde)}`, titulo(p, desde), desde, hasta)}><FileText size={18} />Reporte PDF</button>
        <button class="secundario" id="informe" onClick={abrirInforme}><FileText size={18} />Informe para imprimir o guardar en PDF</button>
        <button class="secundario" id="compartir-resumen" onClick={() => void compartirResumen()}><Share2 size={18} />Compartir el resumen</button>
        <button class="secundario" id="resumen-csv" onClick={descargarCsv}><Download size={18} />Bajar los movimientos (CSV)</button>
      </div>
    </div>
  );
}
