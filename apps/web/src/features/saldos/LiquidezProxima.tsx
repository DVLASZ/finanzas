/** «Próximos 30 días»: cómo queda cada cuenta si solo salen los pagos fijos que vienen. Avisa antes de que una cuenta no alcance. */
import { CalendarClock } from 'lucide-preact';
import { proyeccionLiquidez } from '../../../../../packages/core/src/index.ts';
import { formatear } from '../../lib/formatear.ts';
import { abrirProximos } from './aperturas.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

export function LiquidezProxima() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  if (!datos || !ctx) return null;
  const cuentas = proyeccionLiquidez(datos, ctx.ahora, 30);
  if (!cuentas.length) return null;
  return (
    <section class="tarjeta toque" id="liquidez-30" aria-label="Próximos 30 días" role="button" tabIndex={0} onClick={() => abrirProximos(cuentas)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirProximos(cuentas); } }}>
      <h3 class="!mt-0 flex items-center gap-1.5"><CalendarClock size={14} />Próximos 30 días</h3>
      <ul class="m-0 list-none space-y-2.5 p-0">
        {cuentas.map(c => (
          <li key={c.cuentaId} class="text-sm" data-cuenta={c.cuentaId}>
            <div class="flex items-baseline justify-between gap-2">
              <b>{c.nombre}</b>
              <span class={`tabular-nums ${c.corta ? 'text-neg' : 'text-pos'}`}>{c.corta ? 'Se queda corta' : 'Alcanza'}</span>
            </div>
            <div class="sub">Hoy {formatear(c.saldo)} · pagos fijos {formatear(c.saldo - c.minimo)}{c.corta ? ` · faltan ${formatear(c.corta.faltan)} el ${Number(c.corta.fecha.slice(8))}/${Number(c.corta.fecha.slice(5, 7))} (${c.corta.concepto})` : ` · te quedarían ${formatear(c.minimo)}`}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
