/**
 * Lo que se abre al tocar los pagos fijos: el total del mes o lo que falta por pagar (cada pago con sus fechas) y un pago en
 * particular, con sus próximas fechas y lo que ya se anotó de él.
 */
import { CalendarX, List, Pause, Pencil, Play, Send, Trash2 } from 'lucide-preact';
import { useState } from 'preact/hooks';
import {
  cambiarFijo, describirDia, describirFrecuencia, estadoDeFijo, estaPendiente, formatear, frecuenciaDe, hallarMontos, nombraAlFijo, ocurrencias, quitarFijo, rutaDe,
  leerRecurrentes, leerSubcategorias, yaRegistrado, type Datos, type Frecuencia, type Recurrente,
} from '../../../../../packages/core/src/index.ts';
import { confirmar } from '../../components/ui/Dialogo.tsx';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { atras, irA, prellenarChat } from '../../state/nav.ts';
import { datos as datosSignal } from '../../state/store.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';

const FRECUENCIAS: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: 'mensual', etiqueta: 'Cada mes' }, { valor: 'quincenal', etiqueta: 'Cada quincena' }, { valor: 'semanal', etiqueta: 'Cada semana' }, { valor: 'anual', etiqueta: 'Cada año' },
];
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Guarda la lista de pagos fijos directo en la config (sin pasar por el chat) y sincroniza. */
const guardarLista = (lista: Recurrente[]): Promise<void> => guardarCambio(() => app.repo.setConfig('recurrentes', JSON.stringify(lista)));
/** La lista guardada en este momento (no la de cuando se abrió la hoja). */
const listaActual = (): Recurrente[] => leerRecurrentes(datosSignal.value?.config ?? {});

const aFechaLarga = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

/** Cuentas de dinero en pesos y categorías (con su ruta si son subcategorías), para los selectores. */
export function opcionesDeFijo(datos: Datos): { cuentas: { valor: string; etiqueta: string }[]; categorias: { valor: string; etiqueta: string }[] } {
  const padres = leerSubcategorias(datos.config);
  return {
    cuentas: [{ valor: '', etiqueta: 'La que diga la frase' }, ...datos.cuentas.filter(c => c.tipo === 'dinero' && c.moneda === 'COP').map(c => ({ valor: c.id, etiqueta: c.nombre }))],
    categorias: [{ valor: '', etiqueta: 'La que diga la frase' }, ...datos.cuentas.filter(c => c.tipo === 'categoria' && c.id !== 'cat:descuadre')
      .map(c => ({ valor: c.id, etiqueta: rutaDe(padres, c.id, datos.cuentas) })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))],
  };
}

/** La hoja para editar todo un pago fijo. */
function FormEditar({ r }: { r: Recurrente }) {
  const datos = datosSignal.value;
  const f0 = frecuenciaDe(r);
  const [monto, setMonto] = useState(String(r.monto));
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(f0);
  const [dia, setDia] = useState(String(r.dia));
  const [diaSemana, setDiaSemana] = useState(String(f0 === 'semanal' ? r.dia : 1));
  const [mes, setMes] = useState(String(r.mes ?? 1));
  const [cuentaId, setCuentaId] = useState(r.cuentaId ?? '');
  const [categoriaId, setCategoriaId] = useState(r.categoriaId ?? '');
  const [fin, setFin] = useState(r.fin ?? '');
  const [error, setError] = useState('');
  if (!datos) return null;
  const op = opcionesDeFijo(datos);

  const guardar = async (e: Event) => {
    e.preventDefault();
    const m = Math.round(hallarMontos(monto)[0]?.valor ?? Number(monto));
    const d = frecuencia === 'semanal' ? Number(diaSemana) : Math.round(Number(dia));
    const tope = frecuencia === 'quincenal' ? 13 : frecuencia === 'semanal' ? 7 : 28;
    if (!(m > 0)) return setError('El monto tiene que ser mayor que cero.');
    if (!(d >= 1 && d <= tope)) return setError(`El día va de 1 a ${tope}.`);
    const frase = /\d[\d.,]*\s*$/.test(r.frase) ? r.frase.replace(/\d[\d.,]*\s*$/, String(m)) : `${r.frase} ${m}`;
    const cambios: Partial<Recurrente> = {
      monto: m, frase, frecuencia, dia: d, mes: frecuencia === 'anual' ? Number(mes) : undefined,
      cuentaId: cuentaId || undefined, categoriaId: categoriaId || undefined, fin: fin || undefined,
    };
    await guardarLista(cambiarFijo(listaActual(), r.concepto, cambios));
    atras();
  };

  return (
    <form id="hoja-fijo-editar" class="form-nueva !mt-2 min-w-0" onSubmit={guardar}>
      <div class="fila2">
        <input id="fijo-monto" type="text" inputMode="numeric" aria-label="Monto" placeholder="Monto" value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} />
        <Selector id="fijo-frecuencia" etiqueta="Cada cuánto" valor={frecuencia} alCambiar={v => setFrecuencia(v as Frecuencia)} opciones={FRECUENCIAS} />
      </div>
      <div class="fila2">
        {frecuencia === 'semanal'
          ? <Selector id="fijo-dia-semana" etiqueta="Día de la semana" valor={diaSemana} alCambiar={setDiaSemana} opciones={DIAS.map((x, i) => ({ valor: String(i + 1), etiqueta: x }))} />
          : <input id="fijo-dia" type="number" min="1" max={frecuencia === 'quincenal' ? 13 : 28} aria-label="Día" placeholder={frecuencia === 'quincenal' ? 'Día (1 a 13)' : 'Día (1 a 28)'} value={dia} onInput={e => setDia((e.target as HTMLInputElement).value)} />}
        {frecuencia === 'anual' && <Selector id="fijo-mes" etiqueta="Mes" valor={mes} alCambiar={setMes} opciones={MESES.map((x, i) => ({ valor: String(i + 1), etiqueta: x }))} />}
      </div>
      <Selector id="fijo-cuenta" etiqueta="Cuenta de dinero" valor={cuentaId} alCambiar={setCuentaId} opciones={op.cuentas} />
      <Selector id="fijo-categoria" etiqueta="Categoría" valor={categoriaId} alCambiar={setCategoriaId} opciones={op.categorias} />
      <label class="sub block">Fecha de fin (opcional)
        <input id="fijo-fin-fecha" type="date" class="mt-1 w-full min-w-0" value={fin} onInput={e => setFin((e.target as HTMLInputElement).value)} />
      </label>
      {error && <p class="sub text-neg" id="fijo-error" role="alert">{error}</p>}
      <button class="primario" id="fijo-guardar" type="submit">Guardar cambios</button>
    </form>
  );
}

/** La hoja para programar (o quitar) la fecha en que termina un pago fijo. */
function FormFin({ r }: { r: Recurrente }) {
  const [fin, setFin] = useState(r.fin ?? '');
  const guardar = async (e: Event) => {
    e.preventDefault();
    await guardarLista(cambiarFijo(listaActual(), r.concepto, { fin: fin || undefined }));
    atras();
  };
  return (
    <form id="hoja-fijo-fin" class="form-nueva !mt-2 min-w-0" onSubmit={guardar}>
      <input id="fijo-fin-fecha" type="date" aria-label="Fecha de fin" class="w-full min-w-0" value={fin} onInput={e => setFin((e.target as HTMLInputElement).value)} />
      <button class="primario" id="fijo-fin-guardar" type="submit">{fin ? 'Programar fin' : 'Quitar fecha de fin'}</button>
    </form>
  );
}

const abrirEditar = (r: Recurrente): void => abrirInfo({ id: 'info-fijo-editar', titulo: `Editar ${r.concepto}`, cuerpo: <FormEditar r={r} />, acciones: [] });
const abrirFin = (r: Recurrente): void => abrirInfo({
  id: 'info-fijo-fin', titulo: 'Fecha de fin', sub: 'Pasada esa fecha, el pago ya no se proyecta ni avisa. Déjala vacía para quitarla.', cuerpo: <FormFin r={r} />, acciones: [],
});

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
  const estado = estadoDeFijo(r, hoy.slice(0, 10));
  const activo = estado === 'activo';
  const etiquetaEstado = estado === 'pausado' ? 'En pausa' : estado === 'terminado' ? `Terminado${r.fin ? ` el ${aFechaLarga(r.fin)}` : ''}` : r.fin ? `Activo hasta el ${aFechaLarga(r.fin)}` : 'Activo';
  const op = opcionesDeFijo(datos);
  const nombreDe = (lista: { valor: string; etiqueta: string }[], id?: string) => lista.find(x => x.valor === id && id)?.etiqueta ?? 'Según la frase';
  abrirInfo({
    id: 'info-fijo', titulo: r.concepto,
    sub: `${formatear(r.monto)} · ${describirFrecuencia(r)}${activo ? ` · ${hecho ? 'ya está anotado en este periodo' : 'falta anotarlo en este periodo'}` : ''}.`,
    cuerpo: (
      <div id="info-fijo-detalle" class="min-w-0">
        <p class="sub !mt-0 break-words" id="info-fijo-estado"><strong>{etiquetaEstado}</strong></p>
        <p class="sub !mt-0 break-words" id="info-fijo-cuenta">Cuenta: {nombreDe(op.cuentas, r.cuentaId)} · Categoría: {nombreDe(op.categorias, r.categoriaId)}</p>
        <h3>Próximas fechas</h3>
        {proximas.length === 0 ? <p class="sub !mt-0">No cae en los próximos meses.</p> : <p class="sub !mt-0" id="info-fijo-fechas">{proximas.map(f => describirDia(f)).join(' · ')}</p>}
        <h3>Lo que ya se anotó</h3>
      </div>
    ),
    movimientos,
    acciones: [
      { id: 'fijo-editar', texto: 'Editar', icono: <Pencil size={18} />, alTocar: () => abrirEditar(r) },
      estado === 'pausado'
        ? { id: 'fijo-pausar', texto: 'Reanudar', icono: <Play size={18} />, alTocar: () => { atras(); void guardarLista(cambiarFijo(listaActual(), r.concepto, { pausado: false })); } }
        : { id: 'fijo-pausar', texto: 'Pausar', icono: <Pause size={18} />, alTocar: () => { atras(); void guardarLista(cambiarFijo(listaActual(), r.concepto, { pausado: true })); } },
      { id: 'fijo-fin', texto: r.fin ? 'Cambiar fecha de fin' : 'Fecha de fin', icono: <CalendarX size={18} />, alTocar: () => abrirFin(r) },
      {
        id: 'fijo-eliminar', texto: 'Eliminar', icono: <Trash2 size={18} />,
        alTocar: async () => {
          if (!(await confirmar({ titulo: `¿Eliminar ${r.concepto}?`, texto: 'Los movimientos ya anotados se conservan.', aceptar: 'Sí, eliminar', peligro: true }))) return;
          atras();
          await guardarLista(quitarFijo(listaActual(), r.concepto));
        },
      },
      ...(hecho || !activo ? [] : [{ id: 'info-registrar', texto: 'Registrar pago ahora', icono: <Send size={18} />, alTocar: () => cerrarYLuego(() => { prellenarChat(r.frase, true); irA('chat'); }) }]),
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ texto: r.concepto, periodo: 'todo' })) },
    ],
  });
}
