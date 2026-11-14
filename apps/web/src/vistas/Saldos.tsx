/**
 * Saldos: el «Disponible» grande con malla de color y conteo animado, lo que entró y salió este mes, una
 * tarjeta por cuenta con su color e ícono, y lo que te deben y debes.
 */
import { ArrowDownLeft, ArrowUpRight, Banknote, Coins, DollarSign, Landmark, PiggyBank, Smartphone, Wallet } from 'lucide-preact';
import {
  calcularAlertas, formatear, gastoPorCategoria, rangoPeriodo, resumenSaldos, totalIngresos, type Cuenta,
} from '../../../../packages/core/src/index.ts';
import { irA, prellenarChat } from '../estado/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../estado/store.ts';
import { Escalonado, MontoAnimado, tintaDe } from '../ui/piezas.tsx';

function iconoDeCuenta(c: Cuenta) {
  if (c.id === 'efectivo') return Banknote;
  if (c.id === 'monedas') return Coins;
  if (c.id === 'alcancia') return PiggyBank;
  if (c.moneda === 'USD') return DollarSign;
  if (/nequi|daviplata|movii|dale/i.test(c.nombre)) return Smartphone;
  if (/banco|bancol|bogot|ahorro|cuenta/i.test(c.nombre)) return Landmark;
  return Wallet;
}

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
          {a.texto}
          {a.acciones?.length ? (
            <div class="botones">{a.acciones.map((x, j) => (
              <button key={j} class="chip" data-aviso={`${i}.${j}`} onClick={() => { prellenarChat(x.texto, x.enviar); irA('chat'); }}>{x.titulo}</button>
            ))}</div>
          ) : null}
        </div>
      ))}

      <section class="tarjeta grande relative overflow-hidden !p-5 text-sobre" style={{ background: 'linear-gradient(135deg, var(--marca), var(--marca-2))' }}>
        <div class="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
        <div class="pointer-events-none absolute -bottom-16 left-8 h-40 w-40 rounded-full bg-black/10 blur-2xl" />
        <div class="relative">
          <div class="text-xs font-semibold uppercase tracking-[.09em] opacity-85">Disponible</div>
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
          const tinta = tintaDe(cuenta.id);
          const Icono = iconoDeCuenta(cuenta);
          return (
            <div key={cuenta.id} class={`tarjeta ${aparte ? 'tenue' : ''}`}>
              <div class={`mb-2 grid h-9 w-9 place-items-center rounded-xl ${tinta.fondo} ${tinta.texto}`}><Icono size={19} /></div>
              <div class="etiqueta">{nombre}</div>
              <div class={`mt-0.5 text-[1.25rem] font-bold ${saldo < 0 ? 'text-neg' : ''}`}><MontoAnimado valor={saldo} moneda={cuenta.moneda} /></div>
            </div>
          );
        })}
      </Escalonado>

      <div class="grid grid-cols-2 gap-3">
        <div class="tarjeta"><div class="etiqueta">Te deben</div><div class="monto bien mt-0.5">{deuda(r.teDeben)}</div></div>
        <div class="tarjeta"><div class="etiqueta">Debes</div><div class="monto mal mt-0.5">{deuda(r.debes)}</div></div>
      </div>
      {r.deOtros > 0 && (
        <div class="alerta">Plata de otros: <b>{formatear(r.deOtros)}</b>. Está dentro de lo de arriba, pero no es tuya: te la mandaron para gastarla por ellos.</div>
      )}
    </div>
  );
}
