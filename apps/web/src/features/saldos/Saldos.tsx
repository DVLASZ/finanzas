/**
 * Saldos: el «Disponible» grande con malla de color y conteo animado, lo que entró y salió este mes, una
 * tarjeta por cuenta con su color e ícono, y lo que te deben y debes.
 */
import { useState } from 'preact/hooks';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, HandCoins, Nfc, PiggyBank, Scale, ShieldCheck } from 'lucide-preact';
import {
  aLocal, calcularAlertas, describirDia, gastoPorCategoria, rangoPeriodo, resumenSaldos, seguroParaGastar, totalIngresos,
} from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { formatear as formatearReal } from '../../../../../packages/core/src/index.ts';
import { quitarEmojis } from '../../lib/carta.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { Arco, BarraApilada, Sparkline } from '../../components/charts/graficos.tsx';
import { Insignia, visualDeCuenta } from '../../components/ui/iconos.tsx';
import { Escalonado, MontoAnimado } from '../../components/ui/piezas.tsx';
import { PresupuestoSemana } from './PresupuestoSemana.tsx';
import { contarEfectivo } from './ContadorEfectivo.tsx';
import { LiquidezProxima } from './LiquidezProxima.tsx';
import { avisar, confirmar, pedir } from '../../components/ui/Dialogo.tsx';
import { verMonto, verTexto } from '../../state/privacidad.ts';

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
  /** Cuadre rápido: cuentas cuánto efectivo tienes y la app compara con lo anotado. Si falta, ofrece anotar el gasto que no se anotó. */
  const cuadrarEfectivo = async () => {
    // un mini-contador de billetes; si prefieres, escribes el total a mano
    const conteo = await contarEfectivo();
    if (conteo === null) return;
    let real = conteo.billetes;
    if (conteo.escritoAMano) {
      const texto = await pedir({ titulo: '¿Cuánto efectivo tienes hoy?', texto: 'Cuenta lo que hay en tu billetera y escribe el total.', tipo: 'numero', aceptar: 'Cuadrar' });
      if (texto === null) return;
      real = Number(texto.replace(/\D/g, ''));
      if (!texto.trim() || !Number.isFinite(real)) { await avisar({ titulo: 'Escribe solo el total, por ejemplo 85000', tono: 'peligro' }); return; }
    }
    // las monedas van en su propia cuenta: si las contaste, se dice cómo van contra lo anotado, sin tocar nada
    const anotadoMonedas = r.cuentas.find(x => x.cuenta.id === 'monedas')?.saldo ?? 0;
    if (conteo.monedas > 0 && conteo.monedas !== anotadoMonedas) {
      await avisar({ titulo: 'Las monedas no coinciden', texto: `Contaste ${formatearReal(conteo.monedas)} y en Monedas hay anotados ${formatearReal(anotadoMonedas)}. Para cuadrarlas escribe «arqueo monedas ${conteo.monedas}» en el chat.`, tono: 'info' });
    }
    const anotado = r.cuentas.find(x => x.cuenta.id === 'efectivo')?.saldo ?? 0;
    const falta = anotado - real;
    if (falta === 0) { await avisar({ titulo: 'Tu efectivo cuadra', texto: 'Lo que tienes es justo lo que está anotado.', tono: 'info' }); return; }
    if (falta > 0) {
      if (await confirmar({ titulo: `Te faltan ${formatearReal(falta)}`, texto: 'Tienes menos efectivo del que está anotado. ¿Anoto «Gastos varios sin anotar» por esa diferencia para que cuadre?', aceptar: 'Sí, anotarlo' })) {
        prellenarChat(`otros ${falta} efectivo gastos varios sin anotar`, true); irA('chat');
      }
      return;
    }
    if (await confirmar({ titulo: `Te sobran ${formatearReal(-falta)}`, texto: 'Tienes más efectivo del que está anotado. ¿Hago un arqueo con lo que contaste? Queda como un ajuste, sin borrar nada.', aceptar: 'Sí, ajustar' })) {
      prellenarChat(`arqueo efectivo ${real}`, true); irA('chat');
    }
  };
  const deuda = (v: { COP: number; USD: number }) => [v.COP && formatear(v.COP), v.USD && formatear(v.USD, 'USD')].filter(Boolean).join(' + ') || formatear(0);
  const PALETA = ['var(--info)', 'var(--pos)', 'var(--adv)', 'var(--acc)', 'var(--marca)'];
  const repartidas = r.cuentas.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP' && x.cuenta.id !== 'monedas' && x.saldo > 0);
  const mayor = Math.max(1, ...r.cuentas.filter(x => x.cuenta.moneda === 'COP').map(x => Math.abs(x.saldo)));
  const cuentasEnDisponible = r.cuentas.filter(x => x.cuenta.enDisponible !== false && x.cuenta.moneda === 'COP').map(x => x.cuenta.nombre).join(' + ');

  return (
    <div class="space-y-3">
      {alertas.map((a, i) => (
        <div key={i} class={`alerta ${a.nivel === 'urgente' ? 'urgente' : a.nivel === 'aviso' ? 'aviso' : ''}`}>
          {verTexto(quitarEmojis(a.texto))}
          {a.acciones?.length ? (
            <div class="botones">{a.acciones.map((x, j) => (
              <button key={j} class="chip" data-aviso={`${i}.${j}`} onClick={() => { prellenarChat(x.texto, x.enviar); irA('chat'); }}>{x.titulo}</button>
            ))}</div>
          ) : null}
        </div>
      ))}

      <section class="tarjeta grande hero-saldo relative overflow-hidden !p-5 ring-1 ring-white/25">
        <div class="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.22) 1px, transparent 1.2px)', backgroundSize: '15px 15px', maskImage: 'linear-gradient(120deg, transparent 10%, #000 55%, transparent 95%)', WebkitMaskImage: 'linear-gradient(120deg, transparent 10%, #000 55%, transparent 95%)' }} />
        <div class="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div class="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
        <div class="pointer-events-none absolute -bottom-16 left-8 h-40 w-40 rounded-full bg-marca/10 blur-2xl" />
        <div class="relative">
          <div class="flex items-center justify-between"><div class="text-xs font-semibold uppercase tracking-[.09em] opacity-85">Disponible</div><Nfc size={22} class="opacity-80" /></div>
          <div data-ajusta class="mt-1 text-[2.6rem] font-extrabold leading-none tracking-tight"><MontoAnimado valor={r.disponibleCop} /></div>
          <div class="mt-2 text-[.8rem] opacity-85">{cuentasEnDisponible} · sin las monedas{r.cuentas.some(x => x.cuenta.moneda === 'USD') ? ' ni los dólares' : ''}</div>
          <div class="-mx-1 mt-3"><Sparkline valores={evolucion} etiquetas={etiquetasEvolucion} /></div>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span class="opacity-90">{cambio === 0 ? 'Sin cambios' : `${cambio > 0 ? '+' : '-'}${formatear(Math.abs(cambio))}`} en {dias} días</span>
            <span class="flex shrink-0 gap-1 whitespace-nowrap">{([14, 30] as const).map(n => <button key={n} class={`rounded-full px-2.5 py-1 font-semibold transition active:scale-95 ${dias === n ? 'bg-marca text-sobre' : 'bg-tx/10'}`} aria-pressed={dias === n} onClick={() => setDias(n)}>{n} d</button>)}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-2xl bg-tx/[.07] px-3 py-2">
              <div class="flex items-center gap-1 text-[.7rem] font-semibold uppercase tracking-wider opacity-85"><ArrowDownLeft size={14} />Entró este mes</div>
              <div data-ajusta class="mt-0.5 text-lg font-bold"><MontoAnimado valor={entro} /></div>
            </div>
            <div class="rounded-2xl bg-tx/[.07] px-3 py-2">
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

      {repartidas.length > 1 && (
        <section class="tarjeta" id="reparto" aria-label="Dónde está tu plata">
          <div class="etiqueta mb-2.5">Dónde está tu plata</div>
          <BarraApilada tramos={repartidas.map((x, i) => ({ nombre: x.cuenta.nombre, valor: x.saldo, color: PALETA[i % PALETA.length] }))} />
        </section>
      )}

      <PresupuestoSemana />
      <LiquidezProxima />

      <button class="secundario w-full" id="cuadre-rapido" onClick={() => void cuadrarEfectivo()}><Scale size={18} />Actualizar efectivo que tengo hoy</button>

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
              {cuenta.moneda === 'COP' && <div class={`mini-barra mt-2 ${saldo < 0 ? 'neg' : ''}`} aria-hidden="true"><span style={{ width: `${Math.max(saldo !== 0 ? 4 : 0, Math.round((Math.abs(saldo) / mayor) * 100))}%` }} /></div>}
            </div>
          );
        })}
      </Escalonado>

      <section class="tarjeta !p-0 overflow-hidden" aria-label="Lo que te deben y lo que debes">
        <div class="p-4 pb-1"><div class="etiqueta mb-0.5">Salud patrimonial</div><div class="sub !mt-0 mb-2.5">Liquidez inmediata, por cobrar y por pagar. Neto: <b class="text-tx">{verMonto(formatear(liquidez + Math.abs(r.teDeben.COP) - Math.abs(r.debes.COP)))}</b></div><BarraApilada tramos={[{ nombre: 'Liquidez inmediata', valor: liquidez, color: 'var(--pos)' }, { nombre: 'Por cobrar', valor: Math.abs(r.teDeben.COP), color: 'var(--info)' }, { nombre: 'Por pagar', valor: Math.abs(r.debes.COP), color: 'var(--neg)' }]} /></div>
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
