/**
 * Alcancías: las metas de ahorro como tarjetas. La plata no se mueve de ninguna cuenta: apartar solo anota cuánto
 * de lo que ya tienes es para esa meta (por eso los saldos no cambian). Al llegar al 100 % hay confeti.
 */
import { signal } from '@preact/signals';
import { CalendarCheck, Minus, PartyPopper, PiggyBank, Plus, Sparkles, Trash2 } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { aLocal, diasParaMeta, formatear, hallarMontos, leerMetas, limpiar, type Meta } from '../../../../../packages/core/src/index.ts';
import { BarraAvance, Insignia, Vacio, T } from '../../components/ui/iconos.tsx';
import { MontoAnimado } from '../../components/ui/piezas.tsx';
import { celebrar } from '../../lib/efectos.ts';
import { vibrar } from '../../lib/haptico.ts';
import { app } from '../../services/estado.ts';
import { sincronizar } from '../../services/sincronizacion.ts';
import { ctx as contexto, datos as datosSignal, refrescar } from '../../state/store.ts';

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

async function guardarMetas(metas: Meta[]): Promise<void> {
  await app.repo.setConfig('metas', JSON.stringify(metas.slice(0, 20)));
  void sincronizar();
  await refrescar();
}

/** Aparta (+) o saca (-) plata de una meta, con la misma regla que el chat. */
async function mover(metas: Meta[], nombre: string, valor: number, signo: 1 | -1, hoy: string): Promise<void> {
  const meta = metas.find(m => m.nombre === nombre);
  if (!meta || !(valor > 0)) { aviso.value = 'Escribe un monto para apartar o sacar.'; return; }
  if (signo < 0 && valor > meta.apartado) { aviso.value = `Solo hay ${formatear(meta.apartado)} apartados en ${meta.nombre}.`; return; }
  aviso.value = '';
  meta.apartado += signo * valor;
  meta.aportes = [...(meta.aportes ?? []), { f: hoy, m: signo * valor }].slice(-40);
  vibrar();
  await guardarMetas(metas);
}

function Tarjeta({ meta, indice, metas, hoy }: { meta: Meta; indice: number; metas: Meta[]; hoy: string }) {
  const [monto, setMonto] = useState('');
  const pct = Math.min(100, Math.round((meta.apartado / meta.meta) * 100));
  const lograda = meta.apartado >= meta.meta;
  const tema = T[COLORES[indice % COLORES.length]];
  const dias = diasParaMeta(meta, hoy);
  const cuando = dias === null ? null : new Date(Date.parse(hoy + 'T12:00:00Z') + dias * 86400000).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  // el confeti suena una sola vez por meta lograda
  useEffect(() => {
    if (lograda && !celebradas().includes(meta.nombre)) { recordarCelebrada(meta.nombre); celebrar(0.5); vibrar([18, 40, 18]); }
  }, [lograda]);

  const valor = () => Math.round(hallarMontos(monto)[0]?.valor ?? 0);
  return (
    <article class="tarjeta relative overflow-hidden" data-meta={meta.nombre}>
      <div class={`pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-60 blur-2xl ${tema.fondo}`} />
      <div class="relative flex items-center gap-3">
        <Insignia v={{ Icono: lograda ? PartyPopper : PiggyBank, ...tema }} tam={46} />
        <div class="min-w-0 flex-1"><b class="block truncate">{meta.nombre}</b><span class="sub">{lograda ? 'Lograda' : `Faltan ${formatear(meta.meta - meta.apartado)}`}</span></div>
        <b class="text-lg tabular-nums">{pct} %</b>
      </div>
      <div class="relative mt-3"><BarraAvance porcentaje={pct} alto={12} /></div>
      <div class="relative mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span class="font-semibold tabular-nums"><MontoAnimado valor={meta.apartado} /></span>
        <span class="text-tx2 tabular-nums">de {formatear(meta.meta)}</span>
      </div>
      <p class="relative !mb-0 mt-2 flex items-center gap-1.5 text-xs text-tx2">
        {lograda ? <><Sparkles size={13} class="text-pos" />Meta cumplida</> : cuando ? <><CalendarCheck size={13} class="text-info" />Al ritmo de los últimos 60 días, llegas hacia el {cuando}</> : <><CalendarCheck size={13} />Aparta seguido y te digo cuándo llegas</>}
      </p>
      <div class="relative mt-3 flex flex-wrap items-center gap-2">
        <input type="text" inputMode="numeric" placeholder="Monto" aria-label={`Monto para ${meta.nombre}`} value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} class="!min-h-11 !min-w-0 flex-1 basis-28" />
        <button class="primario !min-h-11 !px-3" aria-label={`Apartar para ${meta.nombre}`} onClick={() => { void mover(metas, meta.nombre, valor(), 1, hoy); setMonto(''); }}><Plus size={18} />Apartar</button>
        <button class="secundario !min-h-11 !px-3" aria-label={`Sacar de ${meta.nombre}`} onClick={() => { void mover(metas, meta.nombre, valor(), -1, hoy); setMonto(''); }}><Minus size={18} /></button>
        <button class="secundario !min-h-11 !px-3 text-neg" aria-label={`Quitar ${meta.nombre}`} onClick={() => { if (confirm(`¿Quitar la alcancía «${meta.nombre}»? La plata sigue en tus cuentas.`)) void guardarMetas(metas.filter(m => m !== meta)); }}><Trash2 size={17} /></button>
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
  const apartado = metas.reduce((s, m) => s + m.apartado, 0);

  const crear = async (e: Event) => {
    e.preventDefault();
    const n = nombre.trim().slice(0, 30);
    const v = Math.round(hallarMontos(objetivo)[0]?.valor ?? 0);
    if (!n || !(v > 0)) { aviso.value = 'Ponle nombre y cuánto quieres juntar.'; return; }
    if (metas.some(m => limpiar(m.nombre) === limpiar(n))) { aviso.value = 'Ya tienes una alcancía con ese nombre.'; return; }
    aviso.value = '';
    setNombre(''); setObjetivo('');
    await guardarMetas([...metas, { nombre: n.charAt(0).toUpperCase() + n.slice(1), meta: v, apartado: 0 }]);
  };

  return (
    <div class="space-y-3 pb-10">
      <div class="tarjeta flex items-center justify-between">
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
        : metas.map((m, i) => <Tarjeta key={m.nombre} meta={m} indice={i} metas={metas} hoy={hoy} />)}

      <p class="callout"><span class="callout-ico"><Sparkles size={16} /></span><span class="callout-txt">Apartar no mueve plata de tu cuenta: solo anota cuánto de lo que ya tienes es para cada meta. Por eso tus saldos no cambian y el «seguro para gastar» sí descuenta lo apartado. También puedes escribirle al chat: «ahorré 50000 para viaje».</span></p>
    </div>
  );
}
