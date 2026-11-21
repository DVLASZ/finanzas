/**
 * Pagos fijos: lo que se repite (arriendo, internet, el bus de cada lunes, el seguro del año). La app no registra nada
 * sola: avisa antes, y aquí cada pago pendiente trae un botón que deja la frase lista en el chat para confirmar con un toque.
 * Se crean y se quitan escribiéndole al chat («cada mes el 5 internet 60000»); aquí también hay un formulario.
 */
import { CalendarClock, CalendarPlus, Check, Clock, Sparkles } from 'lucide-preact';
import { useState } from 'preact/hooks';
import {
  aLocal, describirFrecuencia, estaPendiente, formatear, hallarMontos, leerRecurrentes, ocurrencias, periodoDe, yaRegistrado, type Frecuencia,
} from '../../../../../packages/core/src/index.ts';
import { Insignia, Vacio, visualDeNombre } from '../../components/ui/iconos.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { tocable } from '../../lib/tocable.ts';
import { abrirFijos, abrirPagoFijo } from './aperturas.tsx';

const FRECUENCIAS: { valor: Frecuencia; etiqueta: string }[] = [
  { valor: 'mensual', etiqueta: 'Cada mes' }, { valor: 'quincenal', etiqueta: 'Cada quincena' }, { valor: 'semanal', etiqueta: 'Cada semana' }, { valor: 'anual', etiqueta: 'Cada año' },
];
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** La frase que entiende el chat para crear el pago fijo. */
function fraseDeCreacion(frecuencia: Frecuencia, dia: number, mes: number, concepto: string, monto: number): string {
  const resto = `${concepto.trim().toLowerCase()} ${monto}`;
  if (frecuencia === 'semanal') return `cada ${DIAS[dia - 1].normalize('NFD').replace(/[̀-ͯ]/g, '')} ${resto}`;
  if (frecuencia === 'quincenal') return `cada quincena el ${dia} ${resto}`;
  if (frecuencia === 'anual') return `cada año el ${dia} de ${MESES[mes - 1]} ${resto}`;
  return `cada mes el ${dia} ${resto}`;
}

export function PagosFijos() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual');
  const [dia, setDia] = useState('');
  const [diaSemana, setDiaSemana] = useState('1');
  const [mes, setMes] = useState('1');
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const hoy = aLocal(ctx.ahora);
  const lista = [...leerRecurrentes(datos.config)].sort((a, b) => a.dia - b.dia);
  // cuánto suman este mes, contando todas las veces que cae (una semanal cae cuatro o cinco)
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const total = lista.reduce((s, r) => s + r.monto * ocurrencias(r, inicioMes, finMes).length, 0);
  const pendiente = lista.filter(r => estaPendiente(r, datos.movimientos, hoy)).reduce((s, r) => s + r.monto, 0);

  const registrar = (frase: string) => { prellenarChat(frase, true); irA('chat'); };
  const crear = (e: Event) => {
    e.preventDefault();
    const m = Math.round(hallarMontos(monto)[0]?.valor ?? 0);
    const d = frecuencia === 'semanal' ? Number(diaSemana) : Math.round(Number(dia));
    const tope = frecuencia === 'quincenal' ? 13 : frecuencia === 'semanal' ? 7 : 28;
    if (!concepto.trim() || !(m > 0) || !(d >= 1 && d <= tope)) return;
    prellenarChat(fraseDeCreacion(frecuencia, d, Number(mes), concepto, m), true);
    irA('chat');
  };

  return (
    <div class="space-y-3 pb-10">
      <div class="kpis !mb-0">
        <div class="tarjeta kpi toque" id="kpi-fijos-mes" {...tocable(() => abrirFijos(datos, lista, hoy, 'mes'))}><div class="etiqueta">Este mes</div><div class="kpi-v">{formatear(total)}</div></div>
        <div class="tarjeta kpi toque" id="kpi-fijos-pendiente" {...tocable(() => abrirFijos(datos, lista, hoy, 'pendiente'))}><div class="etiqueta">Falta por pagar</div><div class="kpi-v" style={{ color: 'var(--adv)' }}>{formatear(pendiente)}</div></div>
      </div>

      {lista.length === 0 ? <Vacio Icono={CalendarClock} titulo="Sin pagos fijos" detalle="Agrega el arriendo, el internet o lo que pagas cada mes." tono="ambar" /> : (
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
          <button class="primario" type="submit"><CalendarPlus size={18} />Agregar</button>
        </div>
      </form>

      <p class="callout"><span class="callout-ico"><Sparkles size={16} /></span><span class="callout-txt">Dos días antes del cobro la app te avisa al celular, y desde ahí el pago aparece aquí listo para registrar con un toque.</span></p>
    </div>
  );
}
