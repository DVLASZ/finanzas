/**
 * Saldos: el «Disponible» grande con malla de color y conteo animado, lo que entró y salió este mes, una
 * tarjeta por cuenta con su color e ícono, y lo que te deben y debes.
 */
import { ArrowDownLeft, ArrowUpRight, HandCoins, Nfc, Scale } from 'lucide-preact';
import {
  calcularAlertas, formatear, gastoPorCategoria, rangoPeriodo, resumenSaldos, totalIngresos,
} from '../../../../packages/core/src/index.ts';
import { quitarEmojis } from '../carta.ts';
import { irA, prellenarChat } from '../estado/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../estado/store.ts';
import { Insignia, visualDeCuenta } from '../ui/iconos.tsx';
import { Escalonado, MontoAnimado } from '../ui/piezas.tsx';

export function Saldos() {
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
          <div class="mt-1 text-[2.6rem] font-extrabold leading-none tracking-tight"><MontoAnimado valor={r.disponibleCop} /></div>
          <div class="mt-2 text-[.8rem] opacity-85">{cuentasEnDisponible} · sin las monedas{r.cuentas.some(x => x.cuenta.moneda === 'USD') ? ' ni los dólares' : ''}</div>
          <div class="mt-4 grid grid-cols-2 gap-2">
            <div class="rounded-2xl bg-black/15 px-3 py-2 backdrop-blur-sm">
              <div class="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-wider opacity-85"><ArrowDownLeft size={14} />Entró este mes</div>
              <div class="mt-0.5 text-lg font-bold"><MontoAnimado valor={entro} /></div>
            </div>
            <div class="rounded-2xl bg-black/15 px-3 py-2 backdrop-blur-sm">
              <div class="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-wider opacity-85"><ArrowUpRight size={14} />Salió este mes</div>
              <div class="mt-0.5 text-lg font-bold"><MontoAnimado valor={salio} /></div>
            </div>
          </div>
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
