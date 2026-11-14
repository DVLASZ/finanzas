/**
 * Movimientos: filtros como pastillas, lista agrupada por día y un cajón que sube desde abajo con el detalle,
 * la foto del recibo y el botón de anular. Los filtros se recuerdan entre visitas.
 */
import { signal } from '@preact/signals';
import { Ban, BarChart3, ScanLine, Share2, Camera, Image as IconoFoto, CalendarDays, Tags, ChevronLeft, ChevronRight, ImagePlus, Scale, Search, SearchX, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  aLocal, conSubcategorias, fraseDeOCR, describirDia, describirFecha, formatear, leerSubcategorias, limpiar, nombreMes, rangoPeriodo,
  type Cuenta, type Movimiento,
} from '../../../../../packages/core/src/index.ts';
import { claves, escribir, leer } from '../../services/almacen.ts';
import { app, bajarFoto, borrarFotoEnServidor, sincronizar, subirFoto } from '../../services/app.ts';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { abrirDetalle, atras, detalle, irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal, refrescar } from '../../state/store.ts';
import { reducirFoto } from '../../lib/imagen.ts';
import { compartirTarjeta, dibujarTarjetaDivision } from '../../lib/tarjetaDivision.ts';
import { leerComprobante } from '../../services/ocr.ts';
import { fechaAtras } from '../../lib/periodos.ts';
import { BarrasPeriodo } from '../../components/charts/graficos.tsx';
import { Esqueleto, Insignia, Vacio, visualDeCuenta, visualDeMovimiento, visualDeNombre, visualDePersona } from '../../components/ui/iconos.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { MontoAnimado } from '../../components/ui/piezas.tsx';

type Periodo = 'todo' | 'semana' | 'mes' | 'anio';
type Tipo = 'todos' | 'gastos' | 'ingresos' | 'transferencias' | 'deudas';
interface Filtros { periodo: Periodo; atras: number; tipo: Tipo; categoria: string; cuenta: string; persona: string }

const INICIALES: Filtros = { periodo: 'mes', atras: 0, tipo: 'todos', categoria: '', cuenta: '', persona: '' };
const CLAVE = 'filtros_movimientos';
const TIPOS: [Tipo, string][] = [['todos', 'Todos'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['transferencias', 'Transferencias'], ['deudas', 'Deudas']];
const PERIODOS: [Periodo, string][] = [['todo', 'Todo'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']];
const DE_TIPO: Record<Tipo, string[]> = {
  todos: [], gastos: ['gasto', 'compartido'], ingresos: ['ingreso'], transferencias: ['transferencia', 'cambio_moneda'], deudas: ['prestamo', 'deuda', 'pago'],
};

function leerFiltros(): Filtros {
  try { return { ...INICIALES, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') }; } catch { return { ...INICIALES }; }
}
const filtros = signal<Filtros>(leerFiltros());
const busqueda = signal('');
const verAnulados = signal(false);
const limite = signal(60);
const modoGrafico = signal<'tiempo' | 'categoria'>('tiempo');
/** Los movimientos que tienen foto de recibo guardada en este aparato. */
const conFoto = signal<Set<string>>(new Set());
async function cargarFotos(): Promise<void> {
  conFoto.value = new Set((await claves('recibo:')).map(k => k.slice('recibo:'.length)));
}

function poner(cambio: Partial<Filtros>): void {
  filtros.value = { ...filtros.value, ...cambio };
  limite.value = 60;
  try { localStorage.setItem(CLAVE, JSON.stringify(filtros.value)); } catch { /* sin almacenamiento: no se recuerda y ya */ }
}

/** Qué monto mostrar para un movimiento y de qué clase es. */
function montoVisible(m: Movimiento, cuentas: Cuenta[]): { texto: string; clase: 'mal' | 'bien' | 'neutro' } {
  if (m.tipo === 'apertura') return { texto: '', clase: 'neutro' };
  const tipoDe = (id: string) => cuentas.find(c => c.id === id)?.tipo;
  const cop = (f: (t: string | undefined) => boolean) => m.asientos.filter(a => a.moneda === 'COP' && f(tipoDe(a.cuentaId))).reduce((s, a) => s + a.monto, 0);
  const gasto = cop(t => t === 'categoria');
  if (gasto !== 0) return { texto: formatear(gasto), clase: gasto > 0 ? 'mal' : 'bien' };
  const ingreso = -cop(t => t === 'fuente');
  if (ingreso !== 0) return { texto: '+' + formatear(ingreso), clase: 'bien' };
  const mayor = [...m.asientos].filter(a => tipoDe(a.cuentaId) !== 'sistema').sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0];
  return mayor ? { texto: formatear(Math.abs(mayor.monto), mayor.moneda), clase: 'neutro' } : { texto: '', clase: 'neutro' };
}

export function tituloDelPeriodo(periodo: Periodo, desde: string): string {
  return periodo === 'mes' ? `${nombreMes(desde)} ${desde.slice(0, 4)}` : periodo === 'anio' ? `Año ${desde.slice(0, 4)}` : `Semana del ${describirDia(desde.slice(0, 10))}`;
}

function Detalle({ m }: { m: Movimiento }) {
  const datos = datosSignal.value!;
  const ctx = contexto.value!;
  const hoja = useRef<HTMLDivElement>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [lectura, setLectura] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  // un gasto dividido entre varias personas: lo que debe cada una sale de los asientos de las personas
  const filasDivision = m.tipo === 'compartido'
    ? m.asientos.filter(a => a.moneda === 'COP' && a.monto > 0 && datos.cuentas.find(c => c.id === a.cuentaId)?.tipo === 'persona')
        .map(a => ({ nombre: datos.cuentas.find(c => c.id === a.cuentaId)!.nombre, monto: a.monto }))
    : [];
  // el asiento de la categoría es solo la parte de quien pagó; el total suma lo que deben los demás
  const tuParte = m.asientos.filter(a => a.moneda === 'COP' && a.monto > 0 && datos.cuentas.find(c => c.id === a.cuentaId)?.tipo === 'categoria').reduce((x, a) => x + a.monto, 0);
  const totalGasto = tuParte + filasDivision.reduce((x, f) => x + f.monto, 0);
  const compartir = async () => {
    const blob = await dibujarTarjetaDivision({
      concepto: m.descripcion, fecha: describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora), total: totalGasto, filas: filasDivision,
      tuParte,
    });
    await compartirTarjeta(blob, 'gasto-compartido');
  };
  /** Lee la foto guardada con la IA y ofrece anotarla como gasto. */
  const leerConIA = async () => {
    setLeyendo(true); setLectura('');
    const blob = await leer<Blob>(clave);
    const r = blob ? await leerComprobante(blob) : { error: 'No encuentro la foto en este aparato.' };
    setLeyendo(false);
    if (!r.lectura) { setLectura(r.error ?? 'No pude leerlo.'); return; }
    const l = r.lectura;
    setLectura(`${l.comercio || 'Pago'} por ${formatear(l.monto)}${l.fecha ? ' el ' + l.fecha : ''}${l.categoria ? ' (' + l.categoria + ')' : ''}`);
    prellenarChat(fraseDeOCR(l, aLocal(new Date()).slice(0, 10)));
  };
  const nombre = (id: string) => datos.cuentas.find(c => c.id === id)?.nombre ?? id;
  const clave = `recibo:${m.id}`;
  const claveSubida = `recibo-subido:${m.id}`;

  // La foto se guarda en este aparato y, con internet, también en el servidor: así se ve desde otro celular.
  // Si al tomarla no había internet, se sube la próxima vez que se abra este movimiento.
  const verRecibo = async () => {
    let blob = await leer<Blob>(clave);
    if (blob && !(await leer<boolean>(claveSubida))) { if (await subirFoto(m.id, blob)) await escribir(claveSubida, true); }
    if (!blob) {
      blob = (await bajarFoto(m.id)) ?? undefined;
      if (blob) { await escribir(clave, blob); await escribir(claveSubida, true); }
    }
    setFoto(prev => { if (prev) URL.revokeObjectURL(prev); return blob ? URL.createObjectURL(blob) : null; });
    setCargando(false);
    void cargarFotos();
  };
  useEffect(() => { if (hoja.current) subirDesdeAbajo(hoja.current); void verRecibo(); }, [m.id]);

  const alElegir = async (ev: Event) => {
    const entrada = ev.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = ''; // para poder elegir la misma imagen otra vez
    if (!archivo) return;
    try {
      await escribir(clave, await reducirFoto(archivo));
      await escribir(claveSubida, undefined); // verRecibo la sube si hay internet
      await verRecibo();
    } catch { alert('No pude leer esa imagen.'); }
  };
  const quitar = async () => {
    await escribir(clave, undefined); await escribir(claveSubida, undefined);
    void borrarFotoEnServidor(m.id);
    await verRecibo();
  };
  const anular = async () => {
    if (!confirm(`¿Anular «${m.descripcion}»? No se borra: queda marcado como anulado.`)) return;
    await app.repo.anularMovimiento(m.id, aLocal(new Date()));
    atras();
    void sincronizar();
    await refrescar();
  };

  // va fuera de la pantalla: un ancestro con transform (la animación de entrada) rompería el position: fixed
  return createPortal(
    <div id="detalle" class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) atras(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Detalle del movimiento" class="max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)] ring-1 ring-anillo">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0">{m.descripcion}</h3>
        <p class="sub">{describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora)} · {m.tipo} · {m.origen}{m.estado === 'anulado' ? ' · ANULADO' : ''}</p>
        {m.mensajeOriginal && <p class="sub">Escribiste: «{m.mensajeOriginal}»</p>}
        <ul class="asientos">
          {m.asientos.map((a, i) => <li key={i}><span>{nombre(a.cuentaId)}</span><span class="tabular-nums">{formatear(a.monto, a.moneda)}</span></li>)}
        </ul>
        <div id="recibo" class="recibo">
          {cargando && <Esqueleto class="h-28 w-full" />}
          {foto && <>
            <img src={foto} alt="Foto del recibo" class="max-w-full rounded-2xl ring-1 ring-anillo" />
            <button class="chip" id="quitarFoto" onClick={quitar}><Trash2 size={16} />Quitar la foto</button>
          </>}
        </div>
        {lectura && <p class="callout !mt-3"><span class="callout-ico"><ScanLine size={16} /></span><span class="callout-txt">{lectura}. Dejé la frase lista en el chat para que la confirmes.<br /><button class="chip !min-h-10 mt-2" onClick={() => { atras(); setTimeout(() => irA('chat'), 80); }}>Ir al chat</button></span></p>}
        <div class="acciones">
          {foto && <button class="secundario" id="leerFoto" disabled={leyendo} onClick={leerConIA}><ScanLine size={18} />{leyendo ? 'Leyendo...' : 'Leer con IA'}</button>}
          {filasDivision.length > 0 && <button class="secundario" id="compartirDivision" onClick={compartir}><Share2 size={18} />Compartir cuentas</button>}
          <label class="secundario archivo"><Camera size={18} />Tomar foto<input type="file" id="fotoCamara" accept="image/*" capture="environment" hidden onChange={alElegir} /></label>
          <label class="secundario archivo"><ImagePlus size={18} />Subir imagen<input type="file" id="fotoArchivo" accept="image/*" hidden onChange={alElegir} /></label>
          {m.estado === 'ok' && <button class="peligro" id="anular" onClick={anular}><Ban size={18} />Anular</button>}
          <button class="secundario" id="cerrar" onClick={atras}><X size={18} />Cerrar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Abre Movimientos ya filtrado (lo usa la Revisión del mes): el mes actual, con anulados o con una categoría. */
export function verMovimientos(f: { anulados?: boolean; categoria?: string } = {}): void {
  busqueda.value = '';
  verAnulados.value = Boolean(f.anulados);
  poner({ periodo: 'mes', atras: 0, tipo: 'todos', categoria: f.categoria ?? '', cuenta: '', persona: '' });
  irA('movimientos');
}

export function Movimientos() {
  useEffect(() => { void cargarFotos(); }, []);
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const f = filtros.value;
  const q = limpiar(busqueda.value);
  const nombre = (id: string) => datos.cuentas.find(c => c.id === id)?.nombre ?? id;
  const tocan = (m: Movimiento, id: string) => m.asientos.some(a => a.cuentaId === id);
  const r = f.periodo === 'todo' ? null : rangoPeriodo(f.periodo, fechaAtras(ctx.ahora, f.periodo, f.atras));

  const lista = datos.movimientos
    .filter(m => (verAnulados.value || m.estado === 'ok')
      && (!r || (m.ocurridoEn >= r.desde && m.ocurridoEn < r.hasta))
      && (f.tipo === 'todos' || DE_TIPO[f.tipo].includes(m.tipo))
      && (!f.categoria || conSubcategorias(datos.config, f.categoria).some(id => tocan(m, id)))
      && (!f.cuenta || tocan(m, f.cuenta))
      && (!f.persona || tocan(m, f.persona))
      && (!q || limpiar(`${m.descripcion} ${m.etiqueta ?? ''} ${m.lugarDesde ?? ''} ${m.lugarHasta ?? ''}`).includes(q)))
    .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));

  // totales de lo que se está viendo (sin anulados) y en qué categorías se fue
  let gastos = 0, ingresos = 0;
  const porCat = new Map<string, number>();
  const porTiempo = new Map<string, number>();
  const porMes = f.periodo === 'anio' || f.periodo === 'todo';
  for (const m of lista) {
    if (m.estado !== 'ok') continue;
    for (const a of m.asientos) {
      const c = datos.cuentas.find(x => x.id === a.cuentaId);
      if (a.moneda !== 'COP' || !c) continue;
      if (c.tipo === 'categoria') {
        gastos += a.monto; porCat.set(c.id, (porCat.get(c.id) ?? 0) + a.monto);
        const k = m.ocurridoEn.slice(0, porMes ? 7 : 10);
        porTiempo.set(k, (porTiempo.get(k) ?? 0) + a.monto);
      }
      else if (c.tipo === 'fuente') ingresos -= a.monto;
    }
  }
  const desglose = [...porCat.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);

  // una barra por día (semana o mes) o por mes (año o todo), con ceros donde no hubo gasto
  const claveBarra = (k: string) => (porMes ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`);
  const barras: { etiqueta: string; valor: number }[] = [];
  if (r && !porMes) {
    for (let d = new Date(`${r.desde.slice(0, 10)}T12:00:00Z`); d.toISOString().slice(0, 10) < r.hasta.slice(0, 10); d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      barras.push({ etiqueta: claveBarra(k), valor: Math.max(0, porTiempo.get(k) ?? 0) });
    }
  } else if (r && f.periodo === 'anio') {
    for (let mes = 1; mes <= 12; mes++) { const k = `${r.desde.slice(0, 4)}-${String(mes).padStart(2, '0')}`; barras.push({ etiqueta: claveBarra(k), valor: Math.max(0, porTiempo.get(k) ?? 0) }); }
  } else {
    for (const k of [...porTiempo.keys()].sort()) barras.push({ etiqueta: claveBarra(k), valor: Math.max(0, porTiempo.get(k)!) });
  }
  const usadas = (tipo: Cuenta['tipo']) => {
    const ids = new Set(datos.movimientos.flatMap(m => m.asientos.map(a => a.cuentaId)));
    for (const padre of Object.values(leerSubcategorias(datos.config))) ids.add(padre);
    return datos.cuentas.filter(c => c.tipo === tipo && ids.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };
  const selector = (id: string, etiqueta: string, vacio: string, tipo: Cuenta['tipo'], valor: string, campo: 'categoria' | 'cuenta' | 'persona') => (
    <Selector id={id} etiqueta={etiqueta} valor={valor} alCambiar={v => poner({ [campo]: v })}
      opciones={[{ valor: '', etiqueta: vacio }, ...usadas(tipo).map(c => ({ valor: c.id, etiqueta: c.nombre, visual: tipo === 'categoria' ? visualDeNombre(c.nombre) : tipo === 'dinero' ? visualDeCuenta(c) : visualDePersona(c.nombre) }))]} />
  );

  const hayFiltros = f.tipo !== 'todos' || f.categoria || f.cuenta || f.persona || busqueda.value;
  const visibles = lista.slice(0, limite.value);
  // agrupadas por día, de lo más nuevo a lo más viejo
  const grupos: { dia: string; items: Movimiento[] }[] = [];
  for (const m of visibles) {
    const dia = m.ocurridoEn.slice(0, 10);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.items.push(m); else grupos.push({ dia, items: [m] });
  }
  const abierta = detalle.value ? datos.movimientos.find(m => m.id === detalle.value) : undefined;

  return (
    <div class="space-y-3">
      <div class="pestanas" role="group" aria-label="Periodo">
        {PERIODOS.map(([p, t]) => <button key={p} class={`pestana ${f.periodo === p ? 'activa' : ''}`} data-periodo={p} onClick={() => poner({ periodo: p, atras: 0 })}>{t}</button>)}
      </div>

      {r && (
        <div class="periodo" id="nav-periodo">
          <button class="chip" id="anterior" aria-label="Ver el periodo anterior" onClick={() => poner({ atras: f.atras + 1 })}><ChevronLeft size={16} />Anterior</button>
          <strong id="titulo-periodo">{tituloDelPeriodo(f.periodo, r.desde)}</strong>
          <button class="chip" id="siguiente" aria-label="Ver el periodo siguiente" disabled={f.atras === 0} onClick={() => poner({ atras: Math.max(0, f.atras - 1) })}>Siguiente<ChevronRight size={16} /></button>
        </div>
      )}

      <div class="carrusel no-scrollbar" role="group" aria-label="Tipo">
        {TIPOS.map(([t, e]) => <button key={t} class="chip" data-tipo={t} aria-pressed={f.tipo === t} onClick={() => poner({ tipo: t })}>{e}</button>)}
      </div>

      <div class="barra filtros">
        {selector('f-categoria', 'Categoría', 'Todas las categorías', 'categoria', f.categoria, 'categoria')}
        {selector('f-cuenta', 'Cuenta', 'Cuentas', 'dinero', f.cuenta, 'cuenta')}
        {selector('f-persona', 'Persona', 'Personas', 'persona', f.persona, 'persona')}
      </div>

      <div class="barra">
        <div class="relative flex-1">
          <Search size={17} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx2" />
          <input id="buscar" type="search" class="!pl-10" placeholder="Buscar (concepto, #evento, lugar)" aria-label="Buscar" value={busqueda.value} onInput={e => { busqueda.value = (e.target as HTMLInputElement).value; limite.value = 60; }} />
        </div>
        <label class="check check-chip"><input type="checkbox" id="anulados" checked={verAnulados.value} onChange={e => { verAnulados.value = (e.target as HTMLInputElement).checked; }} /> anulados</label>
        {hayFiltros && <button class="chip" id="limpiar" onClick={() => { busqueda.value = ''; poner({ tipo: 'todos', categoria: '', cuenta: '', persona: '' }); }}><SlidersHorizontal size={15} />Quitar filtros</button>}
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><TrendingUp size={13} class="text-pos" />Ingresos</div><div class="kpi-v bien"><MontoAnimado valor={ingresos} /></div></div>
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><TrendingDown size={13} class="text-neg" />Gastos</div><div class="kpi-v mal"><MontoAnimado valor={gastos} /></div></div>
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><Scale size={13} class="text-info" />Balance</div><div class={`kpi-v ${ingresos - gastos < 0 ? 'mal' : 'bien'}`}><MontoAnimado valor={ingresos - gastos} /></div></div>
      </div>
      <p id="cuenta" class="sub !my-0 px-1">{lista.length} movimientos · Gastos {formatear(gastos)} · Ingresos {formatear(ingresos)}</p>

      {gastos > 0 && (
        <section class="tarjeta" id="desglose" aria-label="Análisis de lo que se ve">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="!m-0 flex items-center gap-1.5"><BarChart3 size={14} />Dónde se concentra</h3>
            <div class="pestanas !p-0.5" role="group" aria-label="Ver por">
              <button class={`pestana !min-h-9 !px-2.5 text-xs ${modoGrafico.value === 'tiempo' ? 'activa' : ''}`} onClick={() => { modoGrafico.value = 'tiempo'; }}><CalendarDays size={13} class="mr-1 inline" />{porMes ? 'Mes' : 'Día'}</button>
              <button class={`pestana !min-h-9 !px-2.5 text-xs ${modoGrafico.value === 'categoria' ? 'activa' : ''}`} onClick={() => { modoGrafico.value = 'categoria'; }}><Tags size={13} class="mr-1 inline" />Categoría</button>
            </div>
          </div>
          {modoGrafico.value === 'tiempo' && barras.length > 1 ? <BarrasPeriodo key={barras.length + f.periodo + f.atras + f.tipo + f.categoria + f.cuenta + q} barras={barras} /> : (
            <div class="space-y-2">
              {desglose.slice(0, 6).map(([id, v]) => (
                <div key={id} class="barra-fila">
                  <span class="barra-nombre flex items-center gap-2"><Insignia v={visualDeNombre(nombre(id))} tam={26} /><span class="truncate">{nombre(id)}</span></span>
                  <span class="barra-fondo"><span class="barra-relleno" style={{ width: `${Math.max(2, Math.round((Math.abs(v) / Math.abs(desglose[0][1] || 1)) * 100))}%` }} /></span>
                  <span class="tabular-nums">{formatear(v)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ul class="lista" id="lista">
        {grupos.length === 0 && <li><Vacio Icono={SearchX} titulo="No hay movimientos" detalle="Prueba con otro periodo o quita los filtros." /></li>}
        {grupos.map(g => [
          <li key={`d${g.dia}`} class="grupo" aria-hidden="true">{describirDia(g.dia)}</li>,
          ...g.items.map((m, idx) => {
            const v = montoVisible(m, datos.cuentas);
            const cs = m.asientos.map(a => datos.cuentas.find(c => c.id === a.cuentaId)).filter((c): c is Cuenta => Boolean(c));
            const categoria = cs.find(c => c.tipo === 'categoria')?.nombre ?? m.tipo;
            const cuenta = cs.find(c => c.tipo === 'dinero')?.nombre ?? '';
            const ruta = m.lugarDesde || m.lugarHasta ? ` · ${m.lugarDesde ?? '?'} a ${m.lugarHasta ?? '?'}` : '';
            const visual = visualDeMovimiento(m, datos.cuentas);
            return (
              <li key={m.id} class={`fila fila-entra ${m.estado === 'anulado' ? 'anulado' : ''}`} style={{ animationDelay: `${Math.min(idx, 12) * 28}ms` }} data-id={m.id} onClick={() => abrirDetalle(m.id)}>
                <div class="flex min-w-0 items-center gap-3">
                  <Insignia v={visual} tam={42} />
                  <div class="min-w-0">
                    <div class="titulo">{m.descripcion}{m.etiqueta && <span class="etiq"> #{m.etiqueta}</span>}{conFoto.value.has(m.id) && <span class="insig-foto" title="Tiene foto del recibo"><IconoFoto size={12} />recibo</span>}</div>
                    <div class="sub">{categoria}{cuenta ? ' · ' + cuenta : ''}{ruta} · {describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora)}</div>
                  </div>
                </div>
                <div class={`monto tabular-nums ${v.clase}`}>{v.texto}</div>
              </li>
            );
          }),
        ])}
      </ul>
      {lista.length > limite.value && <button class="secundario" id="mas" onClick={() => { limite.value += 60; }}>Ver más</button>}
      {abierta && <Detalle m={abierta} />}
    </div>
  );
}
