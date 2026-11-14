/** Cuánto se le pagó a cada trabajador en la semana o el mes. */
import { HardHat } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { describirDia, formatear, pagosATrabajadores, rangoJornales, type CuandoJornales } from '../../../../../packages/core/src/index.ts';
import { Vacio } from '../../components/ui/iconos.tsx';
import { Cargando } from '../../components/ui/piezas.tsx';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

const OPCIONES: [CuandoJornales, string][] = [['semana', 'Esta semana'], ['pasada', 'La pasada'], ['mes', 'Este mes']];

export function Trabajadores() {
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const [cuando, setCuando] = useState<CuandoJornales>('semana');
  if (!datos || !ctx) return <Cargando />;
  const r = rangoJornales(cuando, ctx.ahora);
  const lista = pagosATrabajadores(datos.movimientos, datos.cuentas, r.desde, r.hasta);
  const total = lista.reduce((s, x) => s + x.total, 0);
  const max = Math.max(1, ...lista.map(x => x.total));
  return (
    <div class="pb-10">
      <div class="periodo filtro-tipos">
        {OPCIONES.map(([id, nombre]) => <button key={id} class="chip" aria-pressed={id === cuando} onClick={() => setCuando(id)}>{nombre}</button>)}
      </div>
      <section class="tarjeta grande"><div class="etiqueta">Total {r.titulo}</div><div class="monto">{formatear(total)}</div></section>
      {lista.length ? (
        <ul class="lista">
          {lista.map(x => (
            <li key={x.nombre} class="fila">
              <div>
                <div class="titulo">{x.nombre}</div>
                <div class="sub">{x.veces} {x.veces === 1 ? 'pago' : 'pagos'} · el último {describirDia(x.ultimo.slice(0, 10))}</div>
                <div class="barra-fondo mt-2"><div class="barra-relleno" style={{ width: `${Math.max(4, Math.round((x.total / max) * 100))}%` }} /></div>
              </div>
              <div class="monto">{formatear(x.total)}</div>
            </li>
          ))}
        </ul>
      ) : <Vacio Icono={HardHat} titulo="Sin pagos en este periodo" detalle="Se cuentan los gastos con una persona del grupo Trabajadores, o los de Jornales con nombre: «jornal 50000 felipe»." tono="lima" />}
    </div>
  );
}
