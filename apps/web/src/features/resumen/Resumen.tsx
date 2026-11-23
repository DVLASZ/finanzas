/**
 * Resumen del periodo: cifras que cuentan, dona interactiva por categoría (toca un trozo para verlo), barras
 * comparativas contra el periodo anterior, topes con color según el avance y el informe para imprimir.
 */
import { signal } from '@preact/signals';
import { Receipt, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, FileText, Minus, Share2, PiggyBank, Scale, TrendingDown, TrendingUp } from 'lucide-preact';
import { useState } from 'preact/hooks';
import {
  agruparCategorias, aLocal, describirDia, descuadreDelPeriodo, diasTranscurridos, gastoPorCategoria, ingresosPorFuente, leerMetas,
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
import { Vacio } from '../../components/ui/iconos.tsx';
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
import { abrirComparador } from './Comparador.tsx';
import { imprimirReporte } from './reportePdf.tsx';

type Periodo = 'todo' | 'semana' | 'mes' | 'anio' | 'rango';
const PERIODOS: [Periodo, string][] = [['todo', 'Todo'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['rango', 'Fechas']];
const periodo = signal<Periodo>('mes');
const atras = signal(0);
// el rango propio de Resumen: fechas sueltas 'AAAA-MM-DD', separadas de las de Movimientos
const rangoDesde = signal('');
const rangoHasta = signal('');

const COLORES = ['var(--info)', 'var(--acc)', 'var(--pos)', 'var(--adv)', 'var(--neg)', 'var(--marca)', 'var(--tx2)'];
/** Título del periodo. En «rango» y «todo» hace falta el último día incluido (hasta llega como el día siguiente, sin incluir). */
const titulo = (p: Periodo, desde: string, hasta = '') => {
  if (p === 'mes') return `${nombreMes(desde)} ${desde.slice(0, 4)}`;
  if (p === 'anio') return `Año ${desde.slice(0, 4)}`;
  if (p === 'semana') return `Semana del ${describirDia(desde.slice(0, 10))}`;
  if (p === 'todo') return 'todo el historial';
  const ultimo = diaMas(hasta, -1);
  return ultimo > desde.slice(0, 10) ? `${describirDia(desde.slice(0, 10))} a ${describirDia(ultimo)}` : describirDia(desde.slice(0, 10));
};

/** Una fecha 'AAAA-MM-DD' movida n días, como texto 'AAAA-MM-DD'. */
function diaMas(f: string, n: number): string {
  const d = new Date(`${f.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string): number => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

interface Trozo { id?: string; nombre: string; valor: number; color: string; previo: number }

/** «+12 % que el periodo anterior» o «sin dato anterior». */
const variacion = (v: number, previo: number): string => (previo > 0 ? `${v >= previo ? '+' : '-'}${Math.round((Math.abs(v - previo) / previo) * 100)} % que el anterior` : 'sin dato anterior');

/** Dona en SVG. Cada trozo se puede tocar: el centro muestra su nombre, valor y porcentaje. */
function Dona({ trozos, total, alAbrir }: { trozos: Trozo[]; total: number; alAbrir: (id: string, nombre: string) => void }) {
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
            {sel === i && t.id && <button type="button" class="chip !min-h-9 ml-7 mt-1" data-categoria={t.id} onClick={() => alAbrir(t.id!, t.nombre)}>Ver los movimientos de {t.nombre}</button>}
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
  // un rango sin «desde» todavía se comporta como «Todo» hasta que se elija
  const p: Periodo = periodo.value === 'rango' && !rangoDesde.value ? 'todo' : periodo.value;
  const a = p === 'todo' || p === 'rango' ? 0 : atras.value;
  const manana = `${diaMas(aLocalHoy(ctx.ahora), 1)} 00:00:00`;
  let desde: string, hasta: string, previo: { desde: string; hasta: string };
  if (p === 'todo') {
    const primero = datos.movimientos.reduce((m, x) => (x.ocurridoEn < m ? x.ocurridoEn : m), manana).slice(0, 10);
    desde = `${primero} 00:00:00`; hasta = manana;
    previo = { desde, hasta: desde }; // antes del primer movimiento no hay nada
  } else if (p === 'rango') {
    const fin = rangoHasta.value && rangoHasta.value >= rangoDesde.value ? rangoHasta.value : rangoDesde.value;
    desde = `${rangoDesde.value} 00:00:00`; hasta = `${diaMas(fin, 1)} 00:00:00`;
    previo = { desde: `${diaMas(desde, -diasEntre(desde, hasta))} 00:00:00`, hasta: desde };
  } else {
    ({ desde, hasta } = rangoPeriodo(p, fechaAtras(ctx.ahora, p, a)));
    previo = rangoPeriodo(p, fechaAtras(ctx.ahora, p, a + 1));
  }
  const tit = titulo(p, desde, hasta);

  const cats = gastoPorCategoria(datos.movimientos, datos.cuentas, desde, hasta);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const totalPrevio = gastoPorCategoria(datos.movimientos, datos.cuentas, previo.desde, previo.hasta).reduce((s, c) => s + c.total, 0);
  const ingresos = totalIngresos(datos.movimientos, datos.cuentas, desde, hasta);
  const ingresosPrevio = totalIngresos(datos.movimientos, datos.cuentas, previo.desde, previo.hasta);
  const grupos = agruparCategorias(cats, datos.config, datos.cuentas);
  const meta = Number(datos.config.meta_ahorro_pct ?? '30');
  const apartado = totalApartado(leerMetas(datos.config));

  // el periodo anterior se agrupa igual (con sus subcategorías), si no el grupo se compararía contra solo la categoría suelta
  const previoPorId = new Map(agruparCategorias(gastoPorCategoria(datos.movimientos, datos.cuentas, previo.desde, previo.hasta), datos.config, datos.cuentas).map(g => [g.cuenta.id, g.total]));
  const previoDe = (g: (typeof grupos)[number]) => previoPorId.get(g.cuenta.id) ?? 0;
  // la dona muestra las seis categorías más grandes y junta el resto; una con total cero o negativo (un reembolso) no tiene trozo
  const ordenadas = grupos.filter(g => g.total > 0).sort((x, y) => y.total - x.total);
  const trozos: Trozo[] = ordenadas.slice(0, 6).map((g, i) => ({ id: g.cuenta.id, nombre: g.cuenta.nombre, valor: g.total, color: COLORES[i], previo: previoDe(g) }));
  const resto = ordenadas.slice(6).reduce((s, g) => s + g.total, 0);
  if (resto > 0) trozos.push({ nombre: 'Otras', valor: resto, color: COLORES[6], previo: ordenadas.slice(6).reduce((s, g) => s + previoDe(g), 0) });

  // el ritmo del mes contra el anterior lo dibuja la tarjeta «Ritmo de gasto y presupuesto» (GraficasResumen), con la misma línea del mes pasado
  const diaHoy = ctx.ahora.getDate();
  const verRitmo = p === 'mes' && a === 0;
  const totalDona = trozos.reduce((s, t) => s + t.valor, 0);
  const descuadre = descuadreDelPeriodo(datos.movimientos, desde, hasta);

  const per: Periodos = { desde, hasta, previoDesde: previo.desde, previoHasta: previo.hasta };
  const cambiar = (nuevo: Periodo) => { periodo.value = nuevo; atras.value = 0; };
  const porMovimientos: 'semana' | 'mes' | 'anio' | 'todo' = a === 0 && (p === 'semana' || p === 'mes' || p === 'anio') ? p : 'todo';
  const botonComparar = <button class="secundario" id="abrir-comparador" onClick={() => abrirComparador(datos, ctx.ahora)}><Scale size={18} />Comparar dos fechas</button>;

  const nombreArchivo = (ext: string) => `resumen-${p === 'todo' ? 'todo' : p === 'rango' ? `${desde.slice(0, 10)}_${diaMas(hasta, -1)}` : desde.slice(0, 7)}.${ext}`;
  const bajar = (nombre: string, contenido: string, tipo: string) => {
    const url = URL.createObjectURL(new Blob(['\ufeff' + contenido], { type: `${tipo};charset=utf-8` }));
    Object.assign(document.createElement('a'), { href: url, download: nombre }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  /** Los movimientos del periodo que se ve, en CSV. */
  const descargarCsv = () => bajar(nombreArchivo('csv'), movimientosACsv(filtrarMovimientos(datos, { desde: desde.slice(0, 10), hasta: hasta.slice(0, 10) }), datos.cuentas), 'text/csv');
  /** El resumen en texto: se comparte con el menú del celular (WhatsApp, correo...) o, si no hay, se descarga. */
  const compartirResumen = async () => {
    const texto = resumenEnTexto(datos, tit, desde, hasta);
    try {
      if (navigator.share) { await navigator.share({ title: `Resumen de ${tit}`, text: texto }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    bajar(nombreArchivo('txt'), texto, 'text/plain');
  };

  /** Una hoja limpia con lo mismo que se ve aquí, para imprimir o guardar como PDF desde el navegador. */
  const abrirInforme = () => {
    const t = tit;
    const fuentes = ingresosPorFuente(datos.movimientos, datos.cuentas, desde, hasta);
    // mes por mes para año, todo y rangos largos, recortando el primer y el último mes al periodo
    const largo = p === 'anio' || p === 'todo' || (p === 'rango' && diasEntre(desde, hasta) > 62);
    const meses: { mes: string; ing: number; gas: number }[] = [];
    if (largo) {
      let y = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7));
      while (`${y}-${String(m).padStart(2, '0')}-01` < hasta.slice(0, 10)) {
        const ini = `${y}-${String(m).padStart(2, '0')}-01 00:00:00`;
        const sig = m === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${String(m + 1).padStart(2, '0')}-01 00:00:00`;
        const d = ini < desde ? desde : ini, h = sig > hasta ? hasta : sig;
        const ing = totalIngresos(datos.movimientos, datos.cuentas, d, h);
        const gas = gastoPorCategoria(datos.movimientos, datos.cuentas, d, h).reduce((s, x) => s + x.total, 0);
        if (ing || gas) meses.push({ mes: `${nombreMes(ini)} ${y}`, ing, gas });
        if (m === 12) { y++; m = 1; } else m++;
      }
    }
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
  const barraPeriodo = <>
    <div class="pestanas viva" role="group" aria-label="Periodo" ref={refPestanas}>
      <span class="pildora" aria-hidden="true" />
      {PERIODOS.map(([x, t]) => <button key={x} class={`pestana ${x === periodo.value ? 'activa' : ''}`} data-p={x} onClick={() => { dirPeriodo.value = 0; cambiar(x); }}>{t}</button>)}
    </div>
    {periodo.value === 'rango' && (
      <div class="barra" id="rango">
        <label>Desde<input type="date" id="rango-desde" value={rangoDesde.value} max={rangoHasta.value || undefined} onInput={e => { rangoDesde.value = (e.target as HTMLInputElement).value; }} /></label>
        <label>Hasta<input type="date" id="rango-hasta" value={rangoHasta.value} min={rangoDesde.value || undefined} onInput={e => { rangoHasta.value = (e.target as HTMLInputElement).value; }} /></label>
      </div>
    )}
    {(p === 'semana' || p === 'mes' || p === 'anio') && (
      <div class="periodo">
        <button class="chip" aria-label="Ver el periodo anterior" onClick={() => { dirPeriodo.value = -1; atras.value = a + 1; }}><ChevronLeft size={16} />Anterior</button>
        <h2 class="!m-0">{tit}</h2>
        <button class="chip" aria-label="Ver el periodo siguiente" disabled={a === 0} onClick={() => { dirPeriodo.value = 1; atras.value = Math.max(0, a - 1); }}>Siguiente<ChevronRight size={16} /></button>
      </div>
    )}
  </>;

  // sin gastos ni ingresos en el periodo: solo la barra, la navegación y un aviso limpio
  if (total === 0 && ingresos === 0) {
    return (
      <div class="space-y-3" ref={refRaiz}>
        {barraPeriodo}
        <section class="tarjeta" id="resumen-vacio">
          <Vacio Icono={Receipt} titulo={`No hay movimientos registrados en ${tit}`} detalle="Cuando anotes gastos o ingresos en este periodo, aquí los ves." tono="esmeralda" />
        </section>
        <div class="acciones">{botonComparar}</div>
      </div>
    );
  }

  return (
    <div class="space-y-3" ref={refRaiz}>
      {barraPeriodo}

      <Escalonado class="grid grid-cols-2 gap-3">
        <div class="tarjeta toque" id="card-gastos" {...tocable(() => abrirTotal(datos, 'gastos', per, porMovimientos))}><div class="etiqueta flex items-center gap-1"><TrendingDown size={14} />Gastos</div><div class="monto mal mt-0.5"><MontoAnimado valor={total} /></div></div>
        {ingresos > 0 && <div class="tarjeta toque" id="card-ingresos" {...tocable(() => abrirTotal(datos, 'ingresos', per, porMovimientos))}><div class="etiqueta flex items-center gap-1"><TrendingUp size={14} />Ingresos</div><div class="monto bien mt-0.5"><MontoAnimado valor={ingresos} /></div></div>}
        {ingresos > 0 && <div class="tarjeta toque" id="card-balance" {...tocable(() => abrirBalance(datos, per, porMovimientos))}><div class="etiqueta flex items-center gap-1"><Scale size={14} />Balance</div><div class={`monto mt-0.5 ${ingresos - total < 0 ? 'mal' : 'bien'}`}><MontoAnimado valor={ingresos - total} /></div></div>}
        {ingresos > 0 && (p === 'mes' || p === 'anio') && <div class="tarjeta"><div class="etiqueta flex items-center gap-1"><PiggyBank size={14} />Meta de ahorro ({meta}%)</div><div class="monto mt-0.5"><MontoAnimado valor={Math.round((ingresos * meta) / 100)} /></div></div>}
      </Escalonado>

      {a === 0 && (p === 'semana' || p === 'mes') && <PresupuestoSemana />}
      {vendeProductos(ctx) && <><BotonesCorte /><HojaCorte /></>}

      {apartado > 0 && <p class="sub toque" id="apartado-metas" {...tocable(() => abrirMetas(datos))}>Apartado para metas: <b>{formatear(apartado)}</b> (ya está dentro de tus saldos)</p>}

      {totalDona > 0 && (
        <section class="tarjeta">
          <h3 class="!mt-0">Dónde se fue</h3>
          <Dona trozos={trozos} total={totalDona} alAbrir={(id, nombre) => abrirCategoria(datos, id, nombre, per)} />
          {descuadre !== 0 && <p class="sub !mb-0 mt-2" id="descuadre-periodo">Descuadre de los arqueos: {formatear(Math.abs(descuadre))} {descuadre > 0 ? 'de menos' : 'de más'}. Va aparte: no cuenta como gasto.</p>}
        </section>
      )}
      {totalDona <= 0 && descuadre !== 0 && <p class="sub" id="descuadre-periodo">Descuadre de los arqueos: {formatear(Math.abs(descuadre))} {descuadre > 0 ? 'de menos' : 'de más'}. Va aparte: no cuenta como gasto.</p>}

      {p === 'mes' && (() => {
        // el flujo es siempre del mes que se ve, nunca de otro
        const anio = Number(desde.slice(0, 4)), mes = Number(desde.slice(5, 7));
        const flujo = flujoAcumulado(datos, anio, mes, a === 0 ? diaHoy : undefined);
        return flujo.length > 1 && flujo.some(x => x.neto !== 0) ? (
          <section class="tarjeta" id="flujo-mes">
            <h3 class="!mt-0">Flujo del mes</h3>
            <p class="sub !mt-0 mb-2">Ingresos menos gastos, sumados día a día. Toca la línea para ver un día.</p>
            <FlujoMes puntos={flujo} datos={datos} />
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

      {p === 'mes' && (
        <section class="tarjeta" id="mapa-calor">
          <h3 class="!mt-0">Calor del mes: día por día</h3>
          <MapaCalor dias={gastoDelMes(datos, Number(mesCalor.slice(0, 4)), Number(mesCalor.slice(5, 7)))} hoy={aLocalHoy(ctx.ahora).slice(0, 10)} datos={datos} />
        </section>
      )}

      {p === 'mes' && (
        <section class="tarjeta" id="seis-meses">
          <h3 class="!mt-0">Ingresos y gastos: seis meses</h3>
          <BarrasMeses meses={ingresosGastosPorMes(datos, ctx.ahora, 6)} datos={datos} />
        </section>
      )}

      <GraficasResumen datos={datos} ahora={ctx.ahora} desde={desde} hasta={hasta} periodo={p} atras={a} />

      {verRitmo && <ComparativaMes datos={datos} ahora={ctx.ahora} />}

      <TarjetaHormiga movs={datos.movimientos} cuentas={datos.cuentas} desde={desde} hasta={hasta} dias={diasTranscurridos(desde, hasta, ctx.ahora)} alTocar={x => abrirConcepto(datos, x, per, true)} />

      <TarjetaEtiquetas datos={datos} p={per} />

      <div class="grid gap-3 sm:grid-cols-2">
        <Comparativa id="comp-gastos" nombre="Gastos contra el periodo anterior" ahora={total} antes={totalPrevio} bueno="baja" alTocar={() => abrirComparativa(datos, 'gastos', per)} />
        {(ingresos > 0 || ingresosPrevio > 0) && <Comparativa id="comp-ingresos" nombre="Ingresos contra el periodo anterior" ahora={ingresos} antes={ingresosPrevio} bueno="sube" alTocar={() => abrirComparativa(datos, 'ingresos', per)} />}
      </div>

      <div class="acciones">
        <button class="secundario" id="reporte-pdf" onClick={() => void imprimirReporte(datos, ctx.ahora, `Reporte: ${tit}`, tit, desde, hasta)}><FileText size={18} />Reporte PDF</button>
        <button class="secundario" id="informe" onClick={abrirInforme}><FileText size={18} />Informe para imprimir o guardar en PDF</button>
        <button class="secundario" id="compartir-resumen" onClick={() => void compartirResumen()}><Share2 size={18} />Compartir el resumen</button>
        <button class="secundario" id="resumen-csv" onClick={descargarCsv}><Download size={18} />Bajar los movimientos (CSV)</button>
        {botonComparar}
      </div>
    </div>
  );
}
