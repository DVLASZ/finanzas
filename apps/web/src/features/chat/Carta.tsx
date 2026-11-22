/**
 * La tarjeta «Entendí / Guardado»: un pequeño widget financiero con cabecera de estado, el monto grande con
 * color según sea gasto o ingreso, pastillas con ícono, avisos y botones táctiles.
 */
import { AlertTriangle, BarChart3, CalendarDays, Check, HelpCircle, Info, PartyPopper, Pencil, Plus, Tag, Undo2, Wallet, X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { estadoPresupuesto, etiquetasDeTexto, formatear, MAX_ETIQUETAS, MAX_LARGO_ETIQUETA, rangoPeriodo, resumenSaldos, sugerirEtiquetas, tokensDeEtiqueta, type Boton } from '../../../../../packages/core/src/index.ts';
import { sentidoDelMonto, sinEmoji, type DatosCarta, type NotaCarta } from '../../lib/carta.ts';
import { ctx, datos as datosSignal } from '../../state/store.ts';
import { BarraAvance, Insignia, visualDeCuenta, visualDeNombre } from '../../components/ui/iconos.tsx';
import { MontoAnimado } from '../../components/ui/piezas.tsx';
import { entrar } from '../../lib/efectos.ts';

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
  const tope = cat ? estadoPresupuesto(d.movimientos, d.cuentas, d.presupuestos, cat.id, mes.desde, mes.hasta, d.config.tope_arrastra === '1', d.config) : null;
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

/** Las etiquetas que ya trae la tarjeta («Evento: #viaje #claude») y la nota que las dice. */
function etiquetasDeCarta(datos: DatosCarta): { puestas: string[]; nota?: NotaCarta } {
  const nota = datos.notas.find(n => n.texto.startsWith('Evento: #'));
  return { puestas: nota ? tokensDeEtiqueta(nota.texto.slice('Evento: '.length)) : [], nota };
}

/** Con qué se parece este movimiento, leído de la tarjeta: concepto, categoría y persona. Sirve para sugerir etiquetas. */
function baseDeSugerencia(datos: DatosCarta, puestas: string[]) {
  const d = datosSignal.value;
  if (!d) return { etiquetas: puestas };
  const cat = d.cuentas.find(c => c.tipo === 'categoria' && datos.pildoras.includes(c.nombre));
  const concepto = datos.notas.find(n => n.texto.startsWith('Concepto: '))?.texto.slice('Concepto: '.length) ?? cat?.nombre ?? '';
  const textos = [...datos.pildoras, ...datos.notas.map(n => n.texto)].join(' | ');
  const persona = d.cuentas.find(c => c.tipo === 'persona' && textos.includes(c.nombre));
  return { concepto, categoriaId: cat?.id, persona: persona?.nombre, etiquetas: puestas };
}

/**
 * Fila rápida de etiquetas de la tarjeta por confirmar: las puestas (con ✕), una o dos sugerencias y «Etiqueta» para escribir
 * otra. No arma asientos: manda el conjunto completo («#viaje #claude») como una corrección más de la tarjeta.
 */
function FilaEtiquetas({ puestas, base, alCambiar }: { puestas: string[]; base: ReturnType<typeof baseDeSugerencia>; alCambiar: (texto: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const lleno = puestas.length >= MAX_ETIQUETAS;
  const sugeridas = lleno ? [] : sugerirEtiquetas(datosSignal.value?.movimientos ?? [], base, 2);
  const enviar = (lista: string[]) => alCambiar(lista.length ? lista.map(e => `#${e}`).join(' ') : 'sin etiquetas');
  const agregar = () => {
    const r = etiquetasDeTexto(valor);
    if (r.error) { setError(r.error); return; }
    const nuevas = tokensDeEtiqueta(r.valor).filter(e => !puestas.includes(e));
    if (!nuevas.length) { setAbierto(false); setValor(''); return; }
    if (puestas.length + nuevas.length > MAX_ETIQUETAS) { setError(`Máximo ${MAX_ETIQUETAS} etiquetas por movimiento.`); return; }
    enviar([...puestas, ...nuevas]);
  };
  return (
    <div class="etiquetas-fila" data-etiquetas>
      {puestas.map(e => (
        <span key={e} class="etq etq-puesta" data-etiqueta={e}>
          #{e}
          <button type="button" class="etq-quitar" aria-label={`Quitar la etiqueta ${e}`} data-quitar-etiqueta={e} onClick={() => enviar(puestas.filter(x => x !== e))}><X size={13} aria-hidden="true" /></button>
        </span>
      ))}
      {sugeridas.map(e => (
        <button key={e} type="button" class="etq etq-sugerida" data-sugerida={e} aria-label={`Agregar la etiqueta ${e}`} onClick={() => enviar([...puestas, e])}>#{e}</button>
      ))}
      {!lleno && !abierto && <button type="button" class="etq etq-nueva" data-etiqueta-nueva onClick={() => setAbierto(true)}><Plus size={13} aria-hidden="true" />Etiqueta</button>}
      {abierto && (
        <form class="etq-campo" onSubmit={e => { e.preventDefault(); agregar(); }}>
          <input type="text" aria-label="Escribe una etiqueta" placeholder="viaje" maxLength={MAX_LARGO_ETIQUETA + 1} autoCapitalize="none" autoComplete="off" enterkeyhint="done" data-etiqueta-campo value={valor}
            onInput={e => { setValor((e.target as HTMLInputElement).value); setError(''); }} />
          <button type="submit" class="etq etq-sugerida" aria-label="Agregar etiqueta"><Check size={14} aria-hidden="true" /></button>
          <button type="button" class="etq" aria-label="Cancelar" onClick={() => { setAbierto(false); setValor(''); setError(''); }}><X size={14} aria-hidden="true" /></button>
        </form>
      )}
      {error && <div class="etq-error" role="alert">{error}</div>}
    </div>
  );
}

export function Carta({ datos, hijos, impacto = false, alEtiquetar }: { datos: DatosCarta; hijos?: ComponentChildren; impacto?: boolean; alEtiquetar?: (texto: string) => void }) {
  const monto = useRef<HTMLDivElement>(null);
  useEffect(() => { if (monto.current && datos.guardado) entrar(monto.current); }, [datos.guardado]);
  const sentido = sentidoDelMonto(datos);
  // un monto en pesos «llega» contando; los demás (dólares, rangos) se muestran tal cual
  const pesos = /^\$\d{1,3}(\.\d{3})*$/.test(datos.monto ?? '') ? Number((datos.monto ?? '').replace(/\D/g, '')) : 0;
  const info = impacto && datos.guardado ? calcularImpacto(datos.pildoras) : null;
  // lo que dice la tarjeta de impacto no se repite en las notas de texto
  const { puestas, nota: notaEtiquetas } = etiquetasDeCarta(datos);
  const conFila = Boolean(alEtiquetar) && !datos.guardado && !/^(saldo inicial|contar la plata|cuadrar con)/i.test(datos.tipo);
  const notas = conFila && notaEtiquetas ? datos.notas.filter(n => n !== notaEtiquetas) : datos.notas;
  const notasSinImpacto = info ? notas.filter(n => !(info.cat && n.texto.startsWith(`${info.cat.nombre}: llevas`)) && !(info.cta && n.texto.startsWith(`${info.cta.nombre}: `))) : notas;
  return (
    <>
      <div class={`carta-cab ${datos.guardado ? 'guardado' : 'entendi'}`}>
        <b class="inline-flex items-center gap-1.5">{datos.guardado ? <Check size={15} /> : <Info size={15} />}{datos.guardado ? 'Guardado' : 'Entendí'}</b>
        <span class="tipo">{datos.tipo}</span>
      </div>
      <div class="carta-cuerpo">
        {datos.monto && <div ref={monto} class={`monto-g ${sentido}`}>{pesos ? <MontoAnimado valor={pesos} /> : datos.monto}</div>}
        {datos.pildoras.length > 0 && <div class="pildoras">{datos.pildoras.map(p => <Pildora key={p} texto={p} />)}</div>}
        {notasSinImpacto.map((n, i) => <Nota key={i} n={n} />)}
        {conFila && alEtiquetar && <FilaEtiquetas puestas={puestas} base={baseDeSugerencia(datos, puestas)} alCambiar={alEtiquetar} />}
        {info && <Impacto info={info} />}
        {hijos}
      </div>
    </>
  );
}
