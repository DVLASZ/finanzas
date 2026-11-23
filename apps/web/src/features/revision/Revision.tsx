/**
 * Revisión del mes: una nota de salud, los hallazgos (cada uno con su nivel, su explicación y botones que llevan
 * directo a donde se arreglan) y los gastos hormiga.
 */
import { AlertTriangle, Ban, CheckCircle2, CircleDollarSign, Gauge, HandCoins, Info, Landmark, Scale, Shapes, Wallet, type LucideIcon } from 'lucide-preact';
import { rangoPeriodo, revisarMes, type PuntoRevision } from '../../../../../packages/core/src/index.ts';
import { quitarEmojis } from '../../lib/carta.ts';
import { irA, prellenarChat, type Pantalla } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';
import { TarjetaHormiga } from '../resumen/Hormiga.tsx';
import { abrirAnulados } from './Anulados.tsx';

interface Accion { titulo: string; hacer: () => void }

const ICONOS: Record<PuntoRevision['tipo'], LucideIcon> = {
  'saldo-inicial': Wallet, 'saldo-negativo': CircleDollarSign, deuda: HandCoins, arqueo: Scale, descuadre: Scale,
  otros: Shapes, cobro: HandCoins, anulados: Ban, tope: Gauge,
};
const NIVEL = {
  urgente: { nombre: 'Urgente', icono: 'bg-neg/15 text-neg', badge: 'bg-neg/15 text-neg', borde: 'var(--neg)' },
  aviso: { nombre: 'Aviso', icono: 'bg-adv/15 text-adv', badge: 'bg-adv/15 text-adv', borde: 'var(--adv)' },
  info: { nombre: 'Info', icono: 'bg-info/15 text-info', badge: 'bg-info/15 text-info', borde: 'var(--info)' },
} as const;

/** Los botones de cada hallazgo, según de qué trata. */
function accionesDe(p: PuntoRevision): Accion[] {
  const ir = (titulo: string, pantalla: Pantalla): Accion => ({ titulo, hacer: () => irA(pantalla) });
  const alChat: Accion[] = p.accion ? [{ titulo: p.accion.titulo, hacer: () => { prellenarChat(p.accion!.texto); irA('chat'); } }] : [];
  switch (p.tipo) {
    case 'saldo-inicial': case 'arqueo': return alChat;
    case 'saldo-negativo': return [...alChat, { titulo: 'Ver movimientos', hacer: () => verMovimientos() }];
    case 'deuda': return [...alChat, ir('Ver deudas', 'deudas')];
    case 'cobro': return [ir('Ver deudas', 'deudas')];
    case 'descuadre': return [{ titulo: 'Ver descuadres', hacer: () => verMovimientos({ categoria: p.categoriaId }) }, ir('Ir a conciliar', 'conciliar')];
    case 'otros': return [{ titulo: 'Ver lo de Otros', hacer: () => verMovimientos({ categoria: p.categoriaId }) }];
    case 'anulados': return [{ titulo: 'Ver anulados', hacer: () => { const d = datosSignal.value, c = contexto.value; if (d && c) abrirAnulados(d, c.ahora); } }];
    case 'tope': return [ir('Ajustar tope', 'cuentas'), { titulo: 'Ver gastos', hacer: () => verMovimientos({ categoria: p.categoriaId }) }];
  }
}

function Hallazgo({ p, i }: { p: PuntoRevision; i: number }) {
  const n = NIVEL[p.nivel];
  const Icono = ICONOS[p.tipo] ?? Info;
  const acciones = accionesDe(p);
  return (
    <article class="tarjeta hallazgo" data-tipo-punto={p.tipo} style={{ boxShadow: `inset 3px 0 0 ${n.borde}, 0 0 0 1px var(--anillo)` }}>
      <div class="flex items-start gap-3">
        <span class={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${n.icono}`}><Icono size={20} /></span>
        <div class="min-w-0 flex-1">
          <span class={`inline-block rounded-full px-2.5 py-0.5 text-[.7rem] font-bold uppercase tracking-wider ${n.badge}`}>{n.nombre}</span>
          <h4 class="m-0 mt-1 text-base font-bold">{p.titulo}</h4>
          <p class="m-0 mt-1 text-sm leading-relaxed text-tx2">{quitarEmojis(p.texto)}</p>
        </div>
      </div>
      {acciones.length > 0 && (
        <div class="botones">
          {acciones.map((a, j) => <button key={a.titulo} class={`chip ${j === 0 ? 'principal' : ''}`} data-punto={i} onClick={a.hacer}>{a.titulo}</button>)}
        </div>
      )}
    </article>
  );
}

export function Revision() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const puntos = revisarMes(datos, ctx.ahora);
  const urgentes = puntos.filter(p => p.nivel === 'urgente').length;
  const avisos = puntos.filter(p => p.nivel === 'aviso').length;
  const otros = puntos.length - urgentes - avisos;
  // una nota simple: cada punto urgente resta mucho y cada aviso resta poco
  const nota = Math.max(0, 100 - urgentes * 30 - avisos * 12 - otros * 4);
  const estado = nota >= 85 ? 'En orden' : nota >= 60 ? 'Con detalles' : 'Pide atención';
  const color = nota >= 85 ? 'var(--pos)' : nota >= 60 ? 'var(--adv)' : 'var(--neg)';
  const mes = rangoPeriodo('mes', ctx.ahora);
  const diasDelMes = new Date(Date.UTC(Number(mes.desde.slice(0, 4)), Number(mes.desde.slice(5, 7)), 0)).getUTCDate();

  return (
    <div class="space-y-3 pb-10">
      <div class="tarjeta flex items-center gap-4">
        <div class="salud" style={{ '--p': nota, '--c': color } as never}><span>{nota}</span></div>
        <div class="min-w-0">
          <div class="etiqueta">Salud del mes</div>
          <div class="monto" style={{ color }}>{estado}</div>
          <div class="sub">{puntos.length ? `${puntos.length} ${puntos.length === 1 ? 'hallazgo por mirar' : 'hallazgos por mirar'}` : 'Nada pendiente'}</div>
        </div>
      </div>
      <div class="kpis !mb-0">
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><AlertTriangle size={13} class="text-neg" />Urgentes</div><div class="kpi-v mal">{urgentes}</div></div>
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><Info size={13} class="text-adv" />Avisos</div><div class="kpi-v" style={{ color: 'var(--adv)' }}>{avisos}</div></div>
        <div class="tarjeta kpi"><div class="etiqueta flex items-center gap-1"><Landmark size={13} class="text-info" />Info</div><div class="kpi-v">{otros}</div></div>
      </div>

      {puntos.length
        ? puntos.map((p, i) => <Hallazgo key={p.tipo + i} p={p} i={i} />)
        : <div class="alerta !mb-0 flex items-center gap-2"><CheckCircle2 size={18} class="text-pos" />Todo en orden: saldos al día, sin descuadres grandes y sin cobros viejos.</div>}

      <TarjetaHormiga movs={datos.movimientos} cuentas={datos.cuentas} desde={mes.desde} hasta={mes.hasta} dias={diasDelMes} />
    </div>
  );
}
