/**
 * La tarjeta «Entendí / Guardado»: un pequeño widget financiero con cabecera de estado, el monto grande con
 * color según sea gasto o ingreso, pastillas con ícono, avisos y botones táctiles.
 */
import { AlertTriangle, BarChart3, CalendarDays, Check, HelpCircle, Info, PartyPopper, Pencil, Tag, Undo2, Wallet, X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { estadoPresupuesto, formatear, rangoPeriodo, resumenSaldos, type Boton } from '../../../../packages/core/src/index.ts';
import { sentidoDelMonto, sinEmoji, type DatosCarta, type NotaCarta } from '../carta.ts';
import { ctx, datos as datosSignal } from '../estado/store.ts';
import { BarraAvance, Insignia, visualDeCuenta, visualDeNombre } from './iconos.tsx';
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

/** Cómo quedaste después de guardar: el avance del tope de la categoría en el mes y el saldo de la cuenta. */
function calcularImpacto(pildoras: string[]) {
  const d = datosSignal.value;
  const c = ctx.value;
  if (!d || !c) return null;
  const cat = d.cuentas.find(x => x.tipo === 'categoria' && pildoras.includes(x.nombre));
  const cta = d.cuentas.find(x => x.tipo === 'dinero' && pildoras.includes(x.nombre));
  const mes = rangoPeriodo('mes', c.ahora);
  const tope = cat ? estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, cat.id, mes.desde, mes.hasta, d.config.tope_arrastra === '1') : null;
  const saldo = cta ? resumenSaldos(d.movimientos, d.cuentas, d.config.fecha_apertura ?? '2000-01-01 00:00:00').cuentas.find(x => x.cuenta.id === cta.id)?.saldo : undefined;
  if (!tope && saldo === undefined) return null;
  return { tope, cat, cta, saldo };
}

function Impacto({ info }: { info: NonNullable<ReturnType<typeof calcularImpacto>> }) {
  const { tope, cat, cta, saldo } = info;
  return (
    <div class="impacto">
      {tope && cat && (
        <div>
          <div class="impacto-fila"><span class="flex min-w-0 items-center gap-2"><Insignia v={visualDeNombre(cat.nombre)} tam={24} /><span class="truncate">Tope de {cat.nombre}</span></span><b class="tabular-nums">{tope.porcentaje} %</b></div>
          <BarraAvance porcentaje={tope.porcentaje} alto={8} />
          <div class="sub mt-1 tabular-nums">{formatear(tope.gastado)} de {formatear(tope.tope)} este mes</div>
        </div>
      )}
      {saldo !== undefined && cta && (
        <div class="impacto-fila"><span class="flex min-w-0 items-center gap-2"><Insignia v={visualDeCuenta(cta)} tam={24} /><span class="truncate">Quedó en {cta.nombre}</span></span><b class={`tabular-nums ${saldo < 0 ? 'text-neg' : ''}`}>{formatear(saldo, cta.moneda)}</b></div>
      )}
    </div>
  );
}

export function Carta({ datos, hijos, impacto = false }: { datos: DatosCarta; hijos?: ComponentChildren; impacto?: boolean }) {
  const monto = useRef<HTMLDivElement>(null);
  useEffect(() => { if (monto.current && datos.guardado) entrar(monto.current); }, [datos.guardado]);
  const sentido = sentidoDelMonto(datos);
  const info = impacto && datos.guardado ? calcularImpacto(datos.pildoras) : null;
  // lo que dice la tarjeta de impacto no se repite en las notas de texto
  const notas = info ? datos.notas.filter(n => !(info.cat && n.texto.startsWith(`${info.cat.nombre}: llevas`)) && !(info.cta && n.texto.startsWith(`${info.cta.nombre}: `))) : datos.notas;
  return (
    <>
      <div class={`carta-cab ${datos.guardado ? 'guardado' : 'entendi'}`}>
        <b class="inline-flex items-center gap-1.5">{datos.guardado ? <Check size={15} /> : <Info size={15} />}{datos.guardado ? 'Guardado' : 'Entendí'}</b>
        <span class="tipo">{datos.tipo}</span>
      </div>
      <div class="carta-cuerpo">
        {datos.monto && <div ref={monto} class={`monto-g ${sentido}`}>{datos.monto}</div>}
        {datos.pildoras.length > 0 && <div class="pildoras">{datos.pildoras.map(p => <Pildora key={p} texto={p} />)}</div>}
        {notas.map((n, i) => <Nota key={i} n={n} />)}
        {info && <Impacto info={info} />}
        {hijos}
      </div>
    </>
  );
}
