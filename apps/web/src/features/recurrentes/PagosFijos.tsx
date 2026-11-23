/**
 * Pagos fijos: lo que se repite (arriendo, internet, el bus de cada lunes, el seguro del año). La app no registra nada
 * sola: avisa antes, y aquí cada pago pendiente trae un botón que deja la frase lista en el chat para confirmar con un toque.
 * Se crean y se quitan escribiéndole al chat («cada mes el 5 internet 60000»); aquí también hay un formulario.
 */
import { CalendarClock, CalendarPlus, Check, Clock, Sparkles } from 'lucide-preact';
import { useState } from 'preact/hooks';
import {
  aLocal, describirFrecuencia, estadoDeFijo, estaPendiente, formatear, hallarMontos, leerRecurrentes, ocurrencias, periodoDe, yaRegistrado, type Frecuencia, type Recurrente,
} from '../../../../../packages/core/src/index.ts';
import { avisar } from '../../components/ui/Dialogo.tsx';
import { Insignia, Vacio, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { tocable } from '../../lib/tocable.ts';
import { abrirFijos, abrirPagoFijo, opcionesDeFijo } from './aperturas.tsx';

const FRECUENCIAS: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: 'mensual', etiqueta: 'Cada mes' }, { valor: 'quincenal', etiqueta: 'Cada quincena' }, { valor: 'semanal', etiqueta: 'Cada semana' }, { valor: 'anual', etiqueta: 'Cada año' },
];
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];


export function PagosFijos() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual');
  const [dia, setDia] = useState('');
  const [diaSemana, setDiaSemana] = useState('1');
  const [mes, setMes] = useState('1');
  const [cuentaId, setCuentaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [fin, setFin] = useState('');
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const hoy = aLocal(ctx.ahora);
  const todos = [...leerRecurrentes(datos.config)].sort((a, b) => a.dia - b.dia);
  // los pausados y los terminados no cuentan en lo que falta ni en el total del mes: van aparte, al final
  const lista = todos.filter(r => estadoDeFijo(r, hoy.slice(0, 10)) === 'activo');
  const inactivos = todos.filter(r => estadoDeFijo(r, hoy.slice(0, 10)) !== 'activo');
  const op = opcionesDeFijo(datos);
  // cuánto suman este mes, contando todas las veces que cae (una semanal cae cuatro o cinco)
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const total = lista.reduce((s, r) => s + r.monto * ocurrencias(r, inicioMes, finMes).length, 0);
  const pendiente = lista.filter(r => estaPendiente(r, datos.movimientos, hoy)).reduce((s, r) => s + r.monto, 0);

  const registrar = (frase: string) => { prellenarChat(frase, true); irA('chat'); };
  const crear = async (e: Event) => {
    e.preventDefault();
    const m = Math.round(hallarMontos(monto)[0]?.valor ?? 0);
    const d = frecuencia === 'semanal' ? Number(diaSemana) : Math.round(Number(dia));
    const tope = frecuencia === 'quincenal' ? 13 : frecuencia === 'semanal' ? 7 : 28;
    const nombre = concepto.trim().replace(/^./, c => c.toUpperCase());
    if (!nombre || !(m > 0) || !(d >= 1 && d <= tope)) return;
    if (todos.some(r => r.concepto.toLowerCase() === nombre.toLowerCase())) { await avisar('Ya tienes un pago fijo con ese nombre.'); return; }
    const nuevo: Recurrente = {
      dia: d, frase: `${nombre.toLowerCase()} ${m}`, concepto: nombre, monto: m, frecuencia,
      ...(frecuencia === 'anual' ? { mes: Number(mes) } : {}),
      ...(cuentaId ? { cuentaId } : {}), ...(categoriaId ? { categoriaId } : {}), ...(fin ? { fin } : {}),
    };
    await guardarCambio(() => app.repo.setConfig('recurrentes', JSON.stringify([...todos, nuevo])));
    setConcepto(''); setMonto(''); setDia(''); setCuentaId(''); setCategoriaId(''); setFin('');
  };

  return (
    <div class="space-y-3 pb-10">
      <div class="kpis !mb-0">
        <div class="tarjeta kpi toque" id="kpi-fijos-mes" {...tocable(() => abrirFijos(datos, lista, hoy, 'mes'))}><div class="etiqueta">Este mes</div><div class="kpi-v">{formatear(total)}</div></div>
        <div class="tarjeta kpi toque" id="kpi-fijos-pendiente" {...tocable(() => abrirFijos(datos, lista, hoy, 'pendiente'))}><div class="etiqueta">Falta por pagar</div><div class="kpi-v" style={{ color: 'var(--adv)' }}>{formatear(pendiente)}</div></div>
      </div>

      {lista.length === 0 && inactivos.length > 0 ? null : lista.length === 0 ? <Vacio Icono={CalendarClock} titulo="Sin pagos fijos" detalle="Agrega el arriendo, el internet o lo que pagas cada mes." tono="ambar" /> : (
        <ul class="lista">
          {lista.map(r => {
            const hecho = yaRegistrado(r, datos.movimientos, hoy);
            const toca = estaPendiente(r, datos.movimientos, hoy);
            return (
              <li key={r.frase} class="fila toque" data-fijo={r.concepto} {...tocable(() => abrirPagoFijo(datos, r, hoy))}>
                <div class="flex min-w-0 items-center gap-3">
                  <Insignia v={visualDeNombre(r.concepto)} tam={42} />
                  <div class="min-w-0"><div class="titulo">{r.concepto}</div>
                    <div class="sub flex items-center gap-1">{hecho ? <><Check size={13} class="text-pos" />Pagado {periodoDe(r)}</> : toca ? <><Clock size={13} class="text-adv" />Toca {periodoDe(r)} · {describirFrecuencia(r)}</> : <>{describirFrecuencia(r).replace(/^./, c => c.toUpperCase())}</>}</div></div>
                </div>
                <div class="text-right"><div class="monto">{formatear(r.monto)}</div>
                  {!hecho && <button class="chip !min-h-10 mt-1" onClick={e => { e.stopPropagation(); registrar(r.frase); }}>Registrar pago ahora</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {inactivos.length > 0 && (
        <div id="fijos-inactivos" class="min-w-0">
          <h3>Pausados y terminados</h3>
          <ul class="lista">
            {inactivos.map(r => {
              const terminado = estadoDeFijo(r, hoy.slice(0, 10)) === 'terminado';
              return (
                <li key={r.frase} class="fila toque opacity-60" data-fijo={r.concepto} data-estado={terminado ? 'terminado' : 'pausado'} {...tocable(() => abrirPagoFijo(datos, r, hoy))}>
                  <div class="flex min-w-0 items-center gap-3">
                    <Insignia v={visualDeNombre(r.concepto)} tam={42} />
                    <div class="min-w-0"><div class="titulo truncate">{r.concepto}</div><div class="sub break-words">{describirFrecuencia(r).replace(/^./, c => c.toUpperCase())}</div></div>
                  </div>
                  <div class="text-right"><div class="monto">{formatear(r.monto)}</div><span class="chip !min-h-0 mt-1">{terminado ? 'Terminado' : 'Pausado'}</span></div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form class="form-nueva" onSubmit={crear}>
        <input type="text" placeholder="Nuevo pago fijo: Internet" aria-label="Concepto" value={concepto} onInput={e => setConcepto((e.target as HTMLInputElement).value)} />
        <div class="fila2">
          <Selector etiqueta="Cada cuánto" valor={frecuencia} alCambiar={v => setFrecuencia(v as Frecuencia)} opciones={FRECUENCIAS.map(x => ({ valor: x.valor, etiqueta: x.etiqueta }))} />
          <input type="text" inputMode="numeric" placeholder="Monto" aria-label="Monto" value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} />
        </div>
        <div class="fila2">
          {frecuencia === 'semanal'
            ? <Selector etiqueta="Día de la semana" valor={diaSemana} alCambiar={setDiaSemana} opciones={DIAS.map((d, i) => ({ valor: String(i + 1), etiqueta: d.replace(/^./, c => c.toUpperCase()) }))} />
            : <input type="number" min="1" max={frecuencia === 'quincenal' ? 13 : 28} placeholder={frecuencia === 'quincenal' ? 'Día (1 a 13)' : 'Día'} aria-label="Día" value={dia} onInput={e => setDia((e.target as HTMLInputElement).value)} />}
          {frecuencia === 'anual' && <Selector etiqueta="Mes" valor={mes} alCambiar={setMes} opciones={MESES.map((m, i) => ({ valor: String(i + 1), etiqueta: m.replace(/^./, c => c.toUpperCase()) }))} />}
        </div>
        <div class="fila2">
          <Selector id="nuevo-fijo-cuenta" etiqueta="Cuenta (opcional)" valor={cuentaId} alCambiar={setCuentaId} opciones={op.cuentas} />
          <Selector id="nuevo-fijo-categoria" etiqueta="Categoría (opcional)" valor={categoriaId} alCambiar={setCategoriaId} opciones={op.categorias} />
        </div>
        <div class="fila2">
          <label class="sub block min-w-0">Fecha de fin (opcional)
            <input id="nuevo-fijo-fin" type="date" class="mt-1 w-full min-w-0" value={fin} onInput={e => setFin((e.target as HTMLInputElement).value)} />
          </label>
          <button class="primario" type="submit"><CalendarPlus size={18} />Agregar</button>
        </div>
      </form>

      <p class="callout"><span class="callout-ico"><Sparkles size={16} /></span><span class="callout-txt">Dos días antes del cobro la app te avisa al celular, y desde ahí el pago aparece aquí listo para registrar con un toque.</span></p>
    </div>
  );
}
