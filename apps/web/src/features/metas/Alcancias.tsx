/**
 * Alcancías: las metas de ahorro como tarjetas. La plata no se mueve de ninguna cuenta: apartar solo anota cuánto
 * de lo que ya tienes es para esa meta (por eso los saldos no cambian). Al llegar al 100 % hay confeti.
 */
import { signal } from '@preact/signals';
import { CalendarCheck, Minus, PartyPopper, Pause, PiggyBank, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { aLocal, cuotaSemanal, diasParaMeta, formatear, hallarMontos, idNuevoDeMeta, leerMetas, limpiar, renombrarMeta, totalApartado, type Meta } from '../../../../../packages/core/src/index.ts';
import { BarraAvance, Insignia, Vacio, T } from '../../components/ui/iconos.tsx';
import { confirmar, pedir } from '../../components/ui/Dialogo.tsx';
import { MontoAnimado } from '../../components/ui/piezas.tsx';
import { celebrar } from '../../lib/efectos.ts';
import { vibrar } from '../../lib/haptico.ts';
import { tocable } from '../../lib/tocable.ts';
import { abrirMeta, abrirMetas, guardarMetas } from './aperturas.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

/** Un color distinto para cada alcancía, según su lugar en la lista. */
const COLORES = ['ambar', 'cian', 'violeta', 'esmeralda', 'rosa', 'azul'] as const;
const CLAVE_CELEBRADAS = 'metas_celebradas';
const aviso = signal('');

function celebradas(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_CELEBRADAS) ?? '[]'); } catch { return []; }
}
function recordarCelebrada(nombre: string): void {
  try { localStorage.setItem(CLAVE_CELEBRADAS, JSON.stringify([...celebradas(), nombre])); } catch { /* sin almacenamiento: puede repetir el confeti */ }
}

/** Aparta (+) o saca (-) plata de una meta, con la misma regla que el chat. */
async function mover(metas: Meta[], id: string, valor: number, signo: 1 | -1, hoy: string): Promise<void> {
  const meta = metas.find(m => m.id === id);
  if (!meta || !(valor > 0)) { aviso.value = 'Escribe un monto para apartar o sacar.'; return; }
  if (signo < 0 && valor > meta.apartado) { aviso.value = `Solo hay ${formatear(meta.apartado)} apartados en ${meta.nombre}.`; return; }
  aviso.value = '';
  meta.apartado += signo * valor;
  meta.aportes = [...(meta.aportes ?? []), { f: hoy, m: signo * valor }].slice(-40);
  vibrar();
  await guardarMetas(metas);
}

/** Cambia nombre y monto objetivo con dos preguntas seguidas; la fecha se cambia en la propia tarjeta. */
async function editar(metas: Meta[], meta: Meta): Promise<void> {
  const nombre = await pedir({ titulo: `Nombre de «${meta.nombre}»`, valor: meta.nombre, aceptar: 'Siguiente' });
  if (nombre === null) return;
  const objetivo = await pedir({ titulo: 'Cuánto quieres juntar', valor: String(meta.meta), tipo: 'numero', aceptar: 'Guardar' });
  if (objetivo === null) return;
  const v = Math.round(hallarMontos(objetivo)[0]?.valor ?? 0);
  if (!(v > 0)) { aviso.value = 'El monto objetivo tiene que ser mayor que cero.'; return; }
  const r = renombrarMeta(metas, meta.id!, nombre);
  if (!r.ok) { aviso.value = r.error ?? ''; return; }
  aviso.value = '';
  meta.meta = v;
  await guardarMetas(metas);
}

function Tarjeta({ meta, indice, metas, hoy }: { meta: Meta; indice: number; metas: Meta[]; hoy: string }) {
  const [monto, setMonto] = useState('');
  const pct = Math.min(100, Math.round((meta.apartado / meta.meta) * 100));
  const lograda = meta.apartado >= meta.meta;
  const pausada = !!meta.pausada;
  const tema = T[COLORES[indice % COLORES.length]];
  const dias = diasParaMeta(meta, hoy);
  const cuota = pausada ? null : cuotaSemanal(meta, hoy);
  const cuando = dias === null ? null : new Date(Date.parse(hoy + 'T12:00:00Z') + dias * 86400000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // el confeti suena una sola vez por meta lograda
  useEffect(() => {
    if (lograda && !pausada && !celebradas().includes(meta.id!)) { recordarCelebrada(meta.id!); celebrar(0.5); vibrar([18, 40, 18]); }
  }, [lograda]);

  const valor = () => Math.round(hallarMontos(monto)[0]?.valor ?? 0);
  return (
    <article class={`tarjeta relative overflow-hidden${pausada ? ' meta-pausada' : ''}`} data-meta={meta.nombre} data-meta-id={meta.id}>
      <div class={`pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-60 blur-2xl ${tema.fondo}`} />
      <div class="relative flex items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-3 toque" data-meta-abrir={meta.nombre} {...tocable(() => abrirMeta(meta, hoy))}>
          <Insignia v={{ Icono: lograda ? PartyPopper : PiggyBank, ...tema }} tam={46} />
          <div class="min-w-0 flex-1"><b class="block truncate">{meta.nombre}</b><span class="sub">{pausada && <em class="meta-etiqueta-pausa">En pausa</em>}{lograda ? 'Lograda' : `Faltan ${formatear(meta.meta - meta.apartado)}`}</span></div>
          <b class="text-lg tabular-nums">{pct} %</b>
        </div>
        <button class="secundario !min-h-11 !min-w-11 !px-2" id="meta-editar" aria-label={`Editar ${meta.nombre}`} title="Editar nombre y monto" onClick={() => void editar(metas, meta)}><Pencil size={16} /></button>
      </div>
      <div class="relative mt-3"><BarraAvance porcentaje={pct} alto={12} /></div>
      <div class="relative mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span class="font-semibold tabular-nums"><MontoAnimado valor={meta.apartado} /></span>
        <span class="text-tx2 tabular-nums">de {formatear(meta.meta)}</span>
      </div>
      <p class="relative !mb-0 mt-2 flex items-center gap-1.5 text-xs text-tx2">
        {lograda ? <><Sparkles size={13} class="text-pos" />Meta cumplida</> : cuando ? <><CalendarCheck size={13} class="text-info" />Al ritmo de los últimos 60 días, llegas hacia el {cuando}</> : <><CalendarCheck size={13} />Aparta seguido y te digo cuándo llegas</>}
      </p>
      {!lograda && (
        <div class="relative mt-2 grid gap-1.5" data-cuota={meta.nombre}>
          <div class="flex flex-wrap items-center gap-2">
            <label class="!m-0 flex flex-wrap items-center gap-2 text-xs">Fecha objetivo (opcional)
              <input type="date" class="!min-h-9 !w-auto !py-1" aria-label={`Fecha objetivo de ${meta.nombre}`} value={meta.fecha ?? ''} min={hoy}
                onChange={e => { const v = (e.target as HTMLInputElement).value; meta.fecha = v || undefined; void guardarMetas(metas); }} />
            </label>
            {meta.fecha && <button class="chip" id="meta-quitar-fecha" onClick={() => { meta.fecha = undefined; void guardarMetas(metas); }}>Quitar fecha</button>}
          </div>
          {cuota && !cuota.vencida && (
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Para llegar a tiempo, aparta <b class="tabular-nums">{formatear(cuota.porSemana)}</b> por semana ({cuota.semanas} {cuota.semanas === 1 ? 'semana' : 'semanas'}).</span>
              <button class="chip" data-apartar-cuota={meta.nombre} onClick={() => void mover(metas, meta.id!, cuota.porSemana, 1, hoy)}><Plus size={16} />Apartar la cuota de esta semana</button>
            </div>
          )}
          {cuota?.vencida && <span class="text-xs text-adv">La fecha ya pasó: elige otra o aparta lo que falta.</span>}
        </div>
      )}
      <div class="relative mt-3 flex flex-wrap items-center gap-2">
        <input type="text" inputMode="numeric" placeholder="Monto" aria-label={`Monto para ${meta.nombre}`} value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} class="!min-h-11 !min-w-0 flex-1 basis-28" />
        <button class="primario !min-h-11 !px-3" aria-label={`Apartar para ${meta.nombre}`} onClick={() => { void mover(metas, meta.id!, valor(), 1, hoy); setMonto(''); }}><Plus size={18} />Apartar</button>
        <button class="secundario !min-h-11 !px-3" aria-label={`Sacar de ${meta.nombre}`} title="Sacar el monto escrito" onClick={() => { void mover(metas, meta.id!, valor(), -1, hoy); setMonto(''); }}><Minus size={18} /></button>
        {meta.apartado > 0 && <button class="chip" id="meta-sacar-todo" aria-label={`Sacar todo de ${meta.nombre}`} onClick={() => { void mover(metas, meta.id!, meta.apartado, -1, hoy); setMonto(''); }}>Sacar todo</button>}
        <button class="secundario !min-h-11 !px-3" id="meta-pausar" aria-label={`${pausada ? 'Reanudar' : 'Pausar'} ${meta.nombre}`} title={pausada ? 'Reanudar' : 'Pausar'} onClick={() => { meta.pausada = pausada ? undefined : true; void guardarMetas(metas); }}>{pausada ? <Play size={17} /> : <Pause size={17} />}</button>
        <button class="secundario !min-h-11 !px-3 text-neg" aria-label={`Quitar ${meta.nombre}`} title="Quitar alcancía" onClick={() => {
          const texto = meta.apartado > 0 ? `Tenías ${formatear(meta.apartado)} apartados; la plata sigue en tus cuentas.` : 'La plata sigue en tus cuentas.';
          void confirmar({ titulo: `¿Quitar la alcancía «${meta.nombre}»?`, texto, aceptar: 'Sí, quitar', peligro: true }).then(si => { if (si) void guardarMetas(metas.filter(m => m !== meta)); });
        }}><Trash2 size={17} /></button>
      </div>
    </article>
  );
}

export function Alcancias() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('');
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const metas = leerMetas(datos.config);
  const hoy = aLocal(ctx.ahora).slice(0, 10);
  const apartado = totalApartado(metas);

  const crear = async (e: Event) => {
    e.preventDefault();
    const n = nombre.trim().slice(0, 30);
    const v = Math.round(hallarMontos(objetivo)[0]?.valor ?? 0);
    if (!n || !(v > 0)) { aviso.value = 'Ponle nombre y cuánto quieres juntar.'; return; }
    if (metas.some(m => limpiar(m.nombre) === limpiar(n))) { aviso.value = 'Ya tienes una alcancía con ese nombre.'; return; }
    aviso.value = '';
    setNombre(''); setObjetivo('');
    await guardarMetas([...metas, { id: idNuevoDeMeta(n), nombre: n.charAt(0).toUpperCase() + n.slice(1), meta: v, apartado: 0 }]);
  };

  return (
    <div class="space-y-3 pb-10">
      <div class="tarjeta toque flex items-center justify-between" id="total-apartado" {...tocable(() => abrirMetas(datos))}>
        <div><div class="etiqueta">Total apartado</div><div class="monto mt-0.5"><MontoAnimado valor={apartado} /></div></div>
        <span class="text-xs text-tx2">{metas.length} {metas.length === 1 ? 'alcancía' : 'alcancías'}</span>
      </div>

      <form class="form-nueva" onSubmit={crear}>
        <input type="text" placeholder="Nueva alcancía: Viaje" aria-label="Nombre de la alcancía" value={nombre} onInput={e => setNombre((e.target as HTMLInputElement).value)} />
        <div class="fila2">
          <input type="text" inputMode="numeric" placeholder="Meta: 500000" aria-label="Cuánto quieres juntar" value={objetivo} onInput={e => setObjetivo((e.target as HTMLInputElement).value)} />
          <button class="primario" type="submit">Crear</button>
        </div>
      </form>
      {aviso.value && <p class="alerta aviso !mb-0">{aviso.value}</p>}

      {metas.length === 0
        ? <Vacio Icono={PiggyBank} titulo="Todavía no tienes alcancías" detalle="Crea una para el viaje, el fondo de emergencia o lo que quieras juntar." tono="rosa" />
        : metas.map((m, i) => <Tarjeta key={m.id} meta={m} indice={i} metas={metas} hoy={hoy} />)}

      <p class="callout"><span class="callout-ico"><Sparkles size={16} /></span><span class="callout-txt">Apartar no mueve plata de tu cuenta: solo anota cuánto de lo que ya tienes es para cada meta. Por eso tus saldos no cambian y el «seguro para gastar» sí descuenta lo apartado. También puedes escribirle al chat: «ahorré 50000 para viaje».</span></p>
    </div>
  );
}
