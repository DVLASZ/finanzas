/**
 * Saldos: el «Disponible» grande con malla de color y conteo animado, lo que entró y salió este mes, una
 * tarjeta por cuenta con su color e ícono, y lo que te deben y debes.
 */
import { useState } from 'preact/hooks';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, HandCoins, Nfc, PiggyBank, Scale, ShieldCheck } from 'lucide-preact';
import {
  aLocal, calcularAlertas, describirDia, formatear, gastoPorCategoria, rangoPeriodo, resumenSaldos, seguroParaGastar, totalIngresos,
} from '../../../../../packages/core/src/index.ts';
import { quitarEmojis } from '../../lib/carta.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { Arco, BarraApilada, Sparkline } from '../../components/charts/graficos.tsx';
import { Insignia, visualDeCuenta } from '../../components/ui/iconos.tsx';
import { Escalonado, MontoAnimado } from '../../components/ui/piezas.tsx';

export function Saldos() {
  const [dias, setDias] = useState<14 | 30>(14);
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return <p class="vacio">Cargando…</p>;
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const r = resumenSaldos(datos.movimientos, datos.cuentas, apertura);
  const alertas = calcularAlertas(datos, ctx.ahora);

  // lo que entró y salió en lo que va del mes
  const mes = rangoPeriodo('mes', ctx.ahora);
  const entro = totalIngresos(datos.movimientos, datos.cuentas, mes.desde, mes.hasta);
  const salio = gastoPorCategoria(datos.movimientos, datos.cuentas, mes.desde, mes.hasta).reduce((s, x) => s + x.total, 0);

  // el saldo disponible al cierre de cada uno de los últimos días
  const evolucion = Array.from({ length: dias }, (_, k) => {
    const d = new Date(ctx.ahora.getTime() - (dias - 1 - k) * 86400000);
    const fin = `${aLocal(d).slice(0, 10)} 23:59:59`;
    return resumenSaldos(datos.movimientos.filter(m => m.ocurridoEn <= fin), datos.cuentas, apertura).disponibleCop;
  });
  const etiquetasEvolucion = Array.from({ length: dias }, (_, k) => describirDia(aLocal(new Date(ctx.ahora.getTime() - (dias - 1 - k) * 86400000)).slice(0, 10)));
  const cambio = evolucion[evolucion.length - 1] - evolucion[0];
  const seguro = seguroParaGastar(datos, ctx.ahora);
  const restaHoy = Math.max(0, seguro.porDia - seguro.gastadoHoy);
  const pctHoy = seguro.porDia > 0 ? (restaHoy / seguro.porDia) * 100 : 0;
  const liquidez = Math.max(0, r.disponibleCop);
  const deuda = (v: { COP: number; USD: number }) => [v.COP && formatear(v.COP), v.USD && formatear(v.USD, 'USD')].filter(Boolean).join(' + ') || '$0';
  const cuentasEnDisponible = r.cuentas.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP').map(x => x.cuenta.nombre).join(' + ');

  return (
    <div class="space-y-3">
      {alertas.map((a, i) => (
        <div key={i} class={`alerta ${a.nivel === 'urgente' ? 'urgente' : a.nivel === 'aviso' ? 'aviso' : ''}`}>
          {quitarEmojis(a.texto)}
          {a.acciones?.length ? (
            <div class="botones">{a.acciones.map((x, j) => (
              <button key={j} class="chip" data-aviso={`${i}.${j}`} onClick={() => { prellenarChat(x.texto, x.enviar); irA('chat'); }}>{x.titulo}</button>
            ))}</div>
          ) : null}
        </div>
      ))}

      <section class="tarjeta grande relative overflow-hidden !p-5 text-sobre ring-1 ring-white/25" style={{ background: 'linear-gradient(135deg, var(--marca), var(--marca-2))' }}>
        <div class="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.22) 1px, transparent 1.2px)', backgroundSize: '15px 15px', maskImage: 'linear-gradient(120deg, transparent 10%, #000 55%, transparent 95%)', WebkitMaskImage: 'linear-gradient(120deg, transparent 10%, #000 55%, transparent 95%)' }} />
        <div class="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div class="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
        <div class="pointer-events-none absolute -bottom-16 left-8 h-40 w-40 rounded-full bg-black/10 blur-2xl" />
        <div class="relative">
          <div class="flex items-center justify-between"><div class="text-xs font-semibold uppercase tracking-[.09em] opacity-85">Disponible</div><Nfc size={22} class="opacity-80" /></div>
          <div data-ajusta class="mt-1 text-[2.6rem] font-extrabold leading-none tracking-tight"><MontoAnimado valor={r.disponibleCop} /></div>
          <div class="mt-2 text-[.8rem] opacity-85">{cuentasEnDisponible} · sin las monedas{r.cuentas.some(x => x.cuenta.moneda === 'USD') ? ' ni los dólares' : ''}</div>
          <div class="-mx-1 mt-3"><Sparkline valores={evolucion} etiquetas={etiquetasEvolucion} claro /></div>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span class="opacity-90">{cambio === 0 ? 'Sin cambios' : `${cambio > 0 ? '+' : '-'}${formatear(Math.abs(cambio))}`} en {dias} días</span>
            <span class="flex shrink-0 gap-1 whitespace-nowrap">{([14, 30] as const).map(n => <button key={n} class={`rounded-full px-2.5 py-1 font-semibold transition active:scale-95 ${dias === n ? 'bg-white/30' : 'bg-black/10'}`} aria-pressed={dias === n} onClick={() => setDias(n)}>{n} d</button>)}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-2xl bg-black/15 px-3 py-2 backdrop-blur-sm">
              <div class="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-wider opacity-85"><ArrowDownLeft size={14} />Entró este mes</div>
              <div data-ajusta class="mt-0.5 text-lg font-bold"><MontoAnimado valor={entro} /></div>
            </div>
            <div class="rounded-2xl bg-black/15 px-3 py-2 backdrop-blur-sm">
              <div class="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-wider opacity-85"><ArrowUpRight size={14} />Salió este mes</div>
              <div data-ajusta class="mt-0.5 text-lg font-bold"><MontoAnimado valor={salio} /></div>
            </div>
          </div>
        </div>
      </section>

      <section class="tarjeta" aria-label="Seguro para gastar hoy">
        <div class="flex items-center justify-between gap-2">
          <h3 class="!m-0 flex items-center gap-1.5"><ShieldCheck size={14} />Seguro para gastar hoy</h3>
          <span class="text-xs text-tx2">{seguro.dias} {seguro.dias === 1 ? 'día' : 'días'} de mes</span>
        </div>
        <div class="mt-3">
          <Arco pct={pctHoy} restante={!seguro.enRojo && restaHoy > 0} alto={118}>
            <b class="text-[1.7rem] font-extrabold tabular-nums"><MontoAnimado valor={restaHoy} /></b>
            <span class="text-xs text-tx2">{seguro.enRojo ? 'Los compromisos ya cubren lo disponible' : `de ${formatear(seguro.porDia)} para hoy`}</span>
          </Arco>
        </div>
        <dl class="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-sm">
          <dt class="text-tx2">Disponible</dt><dd class="tabular-nums">{formatear(seguro.disponible)}</dd>
          <dt class="text-tx2">Pagos fijos que faltan</dt><dd class="tabular-nums text-adv">-{formatear(seguro.fijos)}</dd>
          <dt class="text-tx2">Apartado en alcancías</dt><dd class="tabular-nums text-info">-{formatear(seguro.apartado)}</dd>
          <dt class="border-t border-white/10 pt-1.5 font-semibold">Libre este mes</dt><dd class="border-t border-white/10 pt-1.5 font-bold tabular-nums">{formatear(seguro.libre)}</dd>
        </dl>
        <div class="botones">
          <button class="chip" onClick={() => irA('pagosfijos')}><CalendarClock size={16} />Pagos fijos</button>
          <button class="chip" onClick={() => irA('alcancias')}><PiggyBank size={16} />Alcancías</button>
        </div>
      </section>

      <Escalonado class="grid grid-cols-2 gap-3">
        {r.cuentas.map(({ cuenta, saldo }) => {
          const aparte = cuenta.id === 'monedas' || cuenta.enDisponible === false;
          const nombre = cuenta.id === 'efectivo' ? 'Efectivo (billetera)' : aparte ? `${cuenta.nombre} (aparte)` : cuenta.nombre;
          const visual = visualDeCuenta(cuenta);
          return (
            <div key={cuenta.id} class={`tarjeta ${aparte ? 'tenue' : ''}`}>
              <div class="mb-2"><Insignia v={visual} tam={40} /></div>
              <div class="etiqueta">{nombre}</div>
              <div class={`mt-0.5 text-[1.25rem] font-bold ${saldo < 0 ? 'text-neg' : ''}`}><MontoAnimado valor={saldo} moneda={cuenta.moneda} /></div>
            </div>
          );
        })}
      </Escalonado>

      <section class="tarjeta !p-0 overflow-hidden" aria-label="Lo que te deben y lo que debes">
        <div class="p-4 pb-1"><div class="etiqueta mb-2.5">Liquidez contra deudas</div><BarraApilada tramos={[{ nombre: 'Disponible', valor: liquidez, color: 'var(--pos)' }, { nombre: 'Te deben', valor: Math.abs(r.teDeben.COP), color: 'var(--info)' }, { nombre: 'Debes', valor: Math.abs(r.debes.COP), color: 'var(--neg)' }]} /></div>
        <div class="grid grid-cols-2 divide-x divide-white/10">
          <div class="p-4"><div class="etiqueta flex items-center gap-1.5"><span class="grid h-6 w-6 place-items-center rounded-lg bg-pos/15 text-pos"><HandCoins size={14} /></span>Te deben</div><div class="monto bien mt-1.5">{deuda(r.teDeben)}</div></div>
          <div class="p-4"><div class="etiqueta flex items-center gap-1.5"><span class="grid h-6 w-6 place-items-center rounded-lg bg-neg/15 text-neg"><Scale size={14} /></span>Debes</div><div class="monto mal mt-1.5">{deuda(r.debes)}</div></div>
        </div>
      </section>
      {r.deOtros > 0 && (
        <div class="alerta">Plata de otros: <b>{formatear(r.deOtros)}</b>. Está dentro de lo de arriba, pero no es tuya: te la mandaron para gastarla por ellos.</div>
      )}
    </div>
  );
}
