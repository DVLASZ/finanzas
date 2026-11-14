/**
 * Tarjeta de gastos hormiga: las compras chicas que se repiten, lo que suman en el periodo, lo que serían en un año
 * y los tres conceptos por donde más se va la plata.
 */
import { Bug } from 'lucide-preact';
import { formatear, gastosHormiga, TOPE_HORMIGA, VECES_HORMIGA, type Cuenta, type Movimiento } from '../../../../../packages/core/src/index.ts';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { MontoAnimado } from '../../components/ui/piezas.tsx';

export function TarjetaHormiga({ movs, cuentas, desde, hasta, dias }: { movs: Movimiento[]; cuentas: Cuenta[]; desde: string; hasta: string; dias: number }) {
  const h = gastosHormiga(movs, cuentas, desde, hasta, dias);
  if (h.top.length === 0) return null;
  const max = Math.max(1, ...h.top.map(x => x.total));
  return (
    <section class="tarjeta relative overflow-hidden" aria-label="Gastos hormiga">
      <div class="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-amber-400/20 blur-2xl" />
      <div class="relative flex items-center gap-2">
        <span class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-400 ring-1 ring-white/10"><Bug size={19} /></span>
        <h3 class="!m-0">Gastos hormiga</h3>
      </div>
      <div class="relative mt-3 grid grid-cols-2 gap-3">
        <div><div class="etiqueta">En este periodo</div><div class="monto mal mt-0.5"><MontoAnimado valor={h.total} /></div><div class="sub">{h.compras} compras chicas</div></div>
        <div><div class="etiqueta">Al año serían</div><div class="monto mt-0.5" style={{ color: 'var(--adv)' }}><MontoAnimado valor={h.proyeccionAnual} /></div><div class="sub">si sigues igual</div></div>
      </div>
      <ul class="relative m-0 mt-4 grid list-none gap-2.5 p-0">
        {h.top.map(x => (
          <li key={x.concepto} class="barra-fila !my-0" style={{ gridTemplateColumns: 'minmax(7rem, 11rem) 1fr auto' }}>
            <span class="flex items-center gap-2"><Insignia v={visualDeNombre(x.concepto)} tam={28} /><span class="min-w-0"><span class="block truncate">{x.concepto}</span><span class="text-[.7rem] text-tx2">{x.veces} veces</span></span></span>
            <span class="barra-fondo"><span class="barra-relleno aviso" style={{ width: `${Math.max(4, (x.total / max) * 100)}%` }} /></span>
            <span class="tabular-nums">{formatear(x.total)}</span>
          </li>
        ))}
      </ul>
      <p class="sub relative !mb-0 mt-3">Cuentan las compras de {formatear(TOPE_HORMIGA)} o menos que se repiten {VECES_HORMIGA} veces o más.</p>
    </section>
  );
}
