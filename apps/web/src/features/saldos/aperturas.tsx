/**
 * Lo que se abre al tocar un bloque de Saldos: una cuenta (sus últimos movimientos y atajos para cuadrarla o pasar plata) y los pagos
 * fijos que entran en la cuenta de los próximos 30 días.
 */
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, List, Scale } from 'lucide-preact';
import { describirDia, formatear, type Cuenta, type Datos } from '../../../../../packages/core/src/index.ts';
import type { CuentaProyectada } from '../../../../../packages/core/src/liquidez.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { movimientosDeCuenta } from '../../lib/grupos.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';

/** Una cuenta de dinero: sus últimos movimientos y las acciones de siempre sobre ella. */
export function abrirCuenta(datos: Datos, cuenta: Cuenta, saldo: number, cuadrarEfectivo: () => void): void {
  const nombre = cuenta.nombre.toLowerCase();
  const alChat = (texto: string) => () => { prellenarChat(texto); irA('chat'); };
  abrirInfo({
    id: `cuenta-${cuenta.id}`, titulo: cuenta.nombre, sub: `Saldo ahora: ${formatear(saldo, cuenta.moneda)}. Estos son sus últimos movimientos.`,
    movimientos: movimientosDeCuenta(datos, cuenta.id, 12),
    acciones: [
      { id: 'info-cuadrar', texto: 'Cuadrar saldo', icono: <Scale size={18} />, alTocar: () => cerrarYLuego(cuenta.id === 'efectivo' ? cuadrarEfectivo : alChat(`arqueo ${nombre} `)) },
      { id: 'info-desde', texto: 'Pasar plata desde aquí', icono: <ArrowUpFromLine size={18} />, alTocar: () => cerrarYLuego(alChat(`pasé  de ${nombre} a `)) },
      { id: 'info-hacia', texto: 'Pasar plata hacia aquí', icono: <ArrowDownToLine size={18} />, alTocar: () => cerrarYLuego(alChat(`pasé  de  a ${nombre}`)) },
      { id: 'info-ver-movimientos', texto: 'Ver todos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ cuenta: cuenta.id, periodo: 'todo' })) },
    ],
  });
}

/** Los pagos fijos de los próximos 30 días que se tuvieron en cuenta, cuenta por cuenta. */
export function abrirProximos(cuentas: CuentaProyectada[]): void {
  abrirInfo({
    id: 'proximos-30', titulo: 'Próximos 30 días', sub: 'Estos son los pagos fijos que faltan y que entraron en la cuenta de cada cuenta.',
    cuerpo: (
      <div id="info-proximos">
        {cuentas.map(c => (
          <div key={c.cuentaId}>
            <h3>{c.nombre}</h3>
            <ul class="lista !mt-1">
              {c.pagos.map(p => (
                <li key={p.fecha + p.concepto} class="fila" style={{ cursor: 'default' }}>
                  <div class="min-w-0"><div class="titulo">{p.concepto}</div><div class="sub">{describirDia(p.fecha)}</div></div>
                  <div class="monto mal tabular-nums">{formatear(p.monto)}</div>
                </li>
              ))}
            </ul>
            <p class={`sub ${c.corta ? 'text-neg' : ''}`}>{c.corta ? `Se queda corta: faltan ${formatear(c.corta.faltan)} el ${describirDia(c.corta.fecha)}.` : `Alcanza, y te quedarían ${formatear(c.minimo)}.`}</p>
          </div>
        ))}
      </div>
    ),
    acciones: [{ id: 'info-pagos-fijos', texto: 'Ver pagos fijos', icono: <CalendarClock size={18} />, alTocar: () => cerrarYLuego(() => irA('pagosfijos')) }],
  });
}
