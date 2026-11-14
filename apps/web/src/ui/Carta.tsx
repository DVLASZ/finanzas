/**
 * La tarjeta «Entendí / Guardado»: un pequeño widget financiero con cabecera de estado, el monto grande con
 * color según sea gasto o ingreso, pastillas con ícono, avisos y botones táctiles.
 */
import { AlertTriangle, BarChart3, CalendarDays, Check, HelpCircle, Info, PartyPopper, Pencil, Tag, Undo2, Wallet, X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Boton } from '../../../../packages/core/src/index.ts';
import { sentidoDelMonto, sinEmoji, type DatosCarta, type NotaCarta } from '../carta.ts';
import { ctx } from '../estado/store.ts';
import { entrar } from '../efectos.ts';

const ES_FECHA = /^(hoy|ayer|anteayer|lun|mar|mié|jue|vie|sáb|dom|\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))/i;

function Pildora({ texto }: { texto: string }) {
  const cuentas = ctx.value?.cuentas ?? [];
  const esCuenta = cuentas.some(c => c.tipo === 'dinero' && c.nombre === texto);
  const Icono = ES_FECHA.test(texto) ? CalendarDays : esCuenta ? Wallet : Tag;
  return <span class="pildora"><Icono size={13} aria-hidden="true" />{texto}</span>;
}

const ICONO_NOTA: Record<NotaCarta['clase'], typeof Info> = { aviso: AlertTriangle, pregunta: HelpCircle, ok: Check, info: Info, suelta: Info };

function Nota({ n }: { n: NotaCarta }) {
  if (n.clase === 'suelta') return <div class="suelta">{n.texto}</div>;
  const Icono = n.celebra ? PartyPopper : n.clase === 'ok' ? BarChart3 : ICONO_NOTA[n.clase];
  return <div class={`nota ${n.clase}`}><Icono size={18} aria-hidden="true" /><span>{n.texto}</span></div>;
}

/** Los botones de una respuesta del bot. Solo los de la última burbuja se pueden tocar. */
export function BotonesBot({ botones, activo, alPulsar, dentroDeCarta = false }: { botones: Boton[]; activo: boolean; alPulsar: (b: Boton) => void; dentroDeCarta?: boolean }) {
  if (!botones.length) return null;
  return (
    <div class="botones">
      {botones.map(x => {
        const Icono = x.id === 'ok' ? Check : x.id === 'no' ? X : x.id.startsWith('edit') ? Pencil : x.id.startsWith('undo') ? Undo2 : null;
        const clase = x.id === 'ok' ? 'principal' : x.id === 'no' ? 'no' : '';
        return (
          <button key={x.id} class={`chip ${clase} ${activo ? '' : 'inactivo'}`} data-boton={x.id} disabled={!activo} onClick={() => alPulsar(x)}>
            {Icono && <Icono size={dentroDeCarta ? 19 : 17} aria-hidden="true" />}{sinEmoji(x.titulo)}
          </button>
        );
      })}
    </div>
  );
}

export function Carta({ datos, hijos }: { datos: DatosCarta; hijos?: ComponentChildren }) {
  const monto = useRef<HTMLDivElement>(null);
  useEffect(() => { if (monto.current && datos.guardado) entrar(monto.current); }, [datos.guardado]);
  const sentido = sentidoDelMonto(datos);
  return (
    <>
      <div class={`carta-cab ${datos.guardado ? 'guardado' : 'entendi'}`}>
        <b class="inline-flex items-center gap-1.5">{datos.guardado ? <Check size={15} /> : <Info size={15} />}{datos.guardado ? 'Guardado' : 'Entendí'}</b>
        <span class="tipo">{datos.tipo}</span>
      </div>
      <div class="carta-cuerpo">
        {datos.monto && <div ref={monto} class={`monto-g ${sentido}`}>{datos.monto}</div>}
        {datos.pildoras.length > 0 && <div class="pildoras">{datos.pildoras.map(p => <Pildora key={p} texto={p} />)}</div>}
        {datos.notas.map((n, i) => <Nota key={i} n={n} />)}
        {hijos}
      </div>
    </>
  );
}
