/**
 * Editar un movimiento ya guardado, en tres pasos y con dos confirmaciones:
 *   1. «¿Seguro que quieres editarlo?» (evita los toques sin querer; si no se puede editar, explica por qué)
 *   2. el formulario, con lo que se puede cambiar según el tipo de movimiento
 *   3. «Esto es lo que cambia»: antes y después de cada dato y de los saldos, con los avisos, y una segunda confirmación
 *
 * Toda la cuenta la hace `previsualizarEdicion` (núcleo): aquí solo se muestran sus resultados. Los renglones se
 * apilan en vez de ir en columnas para que nada se salga de la pantalla con letra grande.
 */
import { signal } from '@preact/signals';
import { AlertTriangle, Ban, Check, Pencil, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  aLocal, capacidadesDeEdicion, describirFecha, formatear, hallarMontos, previsualizarEdicion, aplicarEdicion, type CambiosEdicion, type CampoEditable, type Movimiento, type Propuesta,
} from '../../../../../packages/core/src/index.ts';
import { mostrarConfirmacion } from '../../components/ui/Confirmacion.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { app } from '../../services/estado.ts';
import { anotarActividad } from '../../services/actividad.ts';
import { mostrarDeshacer } from '../../components/ui/ToastDeshacer.tsx';
import { guardarCambio } from '../../state/acciones.ts';
import { detalle } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

/** El movimiento que se está editando (el formulario se abre desde el detalle). */
export const editandoId = signal<string | null>(null);

type Paso = 'confirmar' | 'formulario' | 'resumen';

const comoPropuesta = (m: Movimiento): Propuesta | null => {
  const p = m.propuesta as Propuesta | undefined;
  return p && typeof p === 'object' && typeof p.monto === 'number' ? p : null;
};
/** Lo que se escribe en el campo de monto: el valor sin separadores («12000»; con dólares, «12.5»). */
const textoDeMonto = (p: Propuesta | null): string => (p ? String(p.moneda === 'USD' ? p.monto / 100 : p.monto) : '');
const aCampoFecha = (local: string, sinHora: boolean): string => (sinHora ? local.slice(0, 10) : `${local.slice(0, 10)}T${local.slice(11, 16)}`);
const deCampoFecha = (valor: string, original: string, sinHora: boolean): string => {
  if (!valor) return original;
  if (sinHora) return `${valor.slice(0, 10)} ${original.slice(11, 19)}`;
  // si no se tocó la hora, se conservan los segundos originales
  return valor.slice(0, 16) === original.slice(0, 10) + 'T' + original.slice(11, 16) ? original : `${valor.slice(0, 10)} ${valor.slice(11, 16)}:00`;
};

function Campo({ etiqueta, motivo, children }: { etiqueta: string; motivo?: string; children: preact.ComponentChildren }) {
  return (
    <div class="campo-edicion">
      <div class="etiqueta">{etiqueta}</div>
      {children}
      {motivo && <p class="sub !mt-1">{motivo}</p>}
    </div>
  );
}

export function EditarMovimiento() {
  const id = editandoId.value;
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const m = id && datos ? datos.movimientos.find(x => x.id === id) : undefined;
  const hoja = useRef<HTMLDivElement>(null);
  const [paso, setPaso] = useState<Paso>('confirmar');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const p0 = m ? comoPropuesta(m) : null;
  const [monto, setMonto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [fuenteId, setFuenteId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState('');

  // al abrir otro movimiento, el formulario parte de sus datos
  useEffect(() => {
    if (!m || !datos) return;
    const p = comoPropuesta(m);
    setPaso('confirmar'); setError(''); setGuardando(false);
    setMonto(textoDeMonto(p));
    setCantidad(p?.venta ? String(p.venta.cantidad) : '');
    setCuentaId(p?.cuentaId ?? 'efectivo');
    setDestinoId(p?.cuentaDestinoId ?? '');
    setCategoriaId(p?.categoriaId ?? '');
    setFuenteId(datos.cuentas.find(c => c.tipo === 'fuente' && c.nombre === p?.fuente)?.id ?? '');
    setConcepto(m.descripcion);
    setFecha(aCampoFecha(m.ocurridoEn, m.sinHora));
    if (hoja.current) subirDesdeAbajo(hoja.current);
  }, [id]);
  // si se cierra el detalle (por ejemplo con el gesto «atrás»), se cierra también la edición
  useEffect(() => { if (id && detalle.value !== id) editandoId.value = null; }, [id, detalle.value]);
  useEffect(() => {
    if (!id) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') editandoId.value = null; };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [id]);

  if (!id || !m || !datos || !ctx) return null;
  const cap = capacidadesDeEdicion(m);
  const moneda = p0?.moneda ?? 'COP';
  const cerrar = () => { editandoId.value = null; };

  // lo que la persona cambió respecto a lo guardado
  const cambios: CambiosEdicion = {};
  if (p0) {
    if (cap.campos.monto.editable) { const v = hallarMontos(monto)[0]?.valor ?? NaN; if (monto.trim() && v !== (moneda === 'USD' ? p0.monto / 100 : p0.monto)) cambios.monto = v; }
    if (cap.campos.cantidad.editable && cantidad.trim() && Number(cantidad) !== p0.venta?.cantidad) cambios.cantidad = Number(cantidad);
    if (cap.campos.cuenta.editable && cuentaId && cuentaId !== (p0.cuentaId ?? 'efectivo')) cambios.cuentaId = cuentaId;
    if (cap.campos.cuentaDestino.editable && destinoId && destinoId !== p0.cuentaDestinoId) cambios.cuentaDestinoId = destinoId;
    if (cap.campos.categoria.editable && categoriaId && categoriaId !== p0.categoriaId) cambios.categoriaId = categoriaId;
    if (cap.campos.fuente.editable && fuenteId && fuenteId !== datos.cuentas.find(c => c.tipo === 'fuente' && c.nombre === p0.fuente)?.id) cambios.fuenteId = fuenteId;
  }
  if (concepto.trim() !== m.descripcion) cambios.concepto = concepto;
  const nuevaFecha = deCampoFecha(fecha, m.ocurridoEn, m.sinHora);
  if (nuevaFecha !== m.ocurridoEn) cambios.ocurridoEn = nuevaFecha;

  const prev = previsualizarEdicion(datos, ctx.ahora, m.id, cambios);
  const bloqueos = prev.ok ? prev.bloqueos : [prev.motivo];
  const hayCambios = prev.ok && prev.cambios.length > 0;

  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const original = structuredClone(m); // para poder deshacer: la edición reemplaza el movimiento entero, y esto lo devuelve a como estaba
      await guardarCambio(async () => { await aplicarEdicion(app.repo, new Date(), m.id, cambios); anotarActividad('edicion', 'Se editó un movimiento'); });
      cerrar();
      mostrarConfirmacion('Cambios guardados');
      mostrarDeshacer('Movimiento editado', () => guardarCambio(() => app.repo.editarMovimiento(original, [])));
    } catch (e) {
      setError((e as Error).message);
      setPaso('formulario');
      setGuardando(false);
    }
  };

  const opcionesCuentas = (tipo: 'dinero' | 'categoria' | 'fuente') =>
    datos.cuentas.filter(c => c.tipo === tipo && (tipo !== 'dinero' || c.moneda === moneda) && (tipo !== 'categoria' || c.id !== 'cat:descuadre')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => ({ valor: c.id, etiqueta: c.nombre }));
  const motivo = (c: CampoEditable) => (cap.campos[c].editable ? undefined : cap.campos[c].motivo);
  const visible = (c: CampoEditable) => cap.campos[c].editable || (c === 'monto' && Boolean(p0));

  return createPortal(
    <div id="editar" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Editar movimiento" class="max-h-[94%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] bg-sup p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />

        {paso === 'confirmar' && (
          <div id="paso-confirmar">
            {cap.editable ? <>
              <h3 class="!mt-0">¿Seguro que quieres editar este movimiento?</h3>
              <p class="sub">{m.descripcion} · {describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora)}{p0 ? ` · ${formatear(p0.monto, p0.moneda)}` : ''}</p>
              <p class="sub">Vas a poder cambiar lo que este tipo de movimiento permite. Antes de guardar te muestro cómo quedan los saldos.</p>
              <div class="acciones">
                <button class="primario" id="editar-si" onClick={() => setPaso('formulario')}><Pencil size={18} />Sí, editar</button>
                <button class="secundario" id="editar-no" onClick={cerrar}><X size={18} />No, volver</button>
              </div>
            </> : <>
              <h3 class="!mt-0">Este movimiento no se puede editar</h3>
              <p class="sub">{cap.motivo}</p>
              <div class="acciones"><button class="secundario" id="editar-no" onClick={cerrar}><Check size={18} />Entendido</button></div>
            </>}
          </div>
        )}

        {paso === 'formulario' && (
          <form id="paso-formulario" onSubmit={e => { e.preventDefault(); if (hayCambios && !bloqueos.length) setPaso('resumen'); }}>
            <h3 class="!mt-0">Editar movimiento</h3>
            <p class="sub">Cambia lo que haga falta. Lo que no se puede cambiar de este tipo de movimiento lo explica abajo.</p>

            <Campo etiqueta="Concepto" motivo={motivo('concepto')}>
              <input type="text" id="e-concepto" maxLength={80} value={concepto} onInput={e => setConcepto((e.target as HTMLInputElement).value)} disabled={!cap.campos.concepto.editable} />
            </Campo>

            {visible('monto') && (
              <Campo etiqueta={moneda === 'USD' ? 'Monto en dólares' : 'Monto'} motivo={motivo('monto')}>
                <input type="text" id="e-monto" inputMode="decimal" value={monto} onInput={e => setMonto((e.target as HTMLInputElement).value)} disabled={!cap.campos.monto.editable} />
              </Campo>
            )}
            {cap.campos.cantidad.editable && (
              <Campo etiqueta={`Cantidad de ${p0?.venta?.presentacion ?? 'unidades'}`}>
                <input type="number" id="e-cantidad" min="1" inputMode="numeric" value={cantidad} onInput={e => setCantidad((e.target as HTMLInputElement).value)} />
                {p0?.venta && <p class="sub !mt-1">Precio de cada una: {formatear(p0.venta.precio)}. El monto sale de la cantidad por el precio.</p>}
              </Campo>
            )}
            {cap.campos.cuenta.editable && (
              <Campo etiqueta={m.tipo === 'ingreso' ? 'Entró a' : m.tipo === 'transferencia' ? 'Sale de' : 'Pagado con'}>
                <Selector id="e-cuenta" etiqueta="Cuenta" valor={cuentaId} alCambiar={setCuentaId} opciones={opcionesCuentas('dinero')} />
              </Campo>
            )}
            {cap.campos.cuentaDestino.editable && (
              <Campo etiqueta="Entra a">
                <Selector id="e-destino" etiqueta="Cuenta de destino" valor={destinoId} alCambiar={setDestinoId} opciones={opcionesCuentas('dinero')} />
              </Campo>
            )}
            {cap.campos.categoria.editable && (
              <Campo etiqueta="Categoría">
                <Selector id="e-categoria" etiqueta="Categoría" valor={categoriaId} alCambiar={setCategoriaId} opciones={opcionesCuentas('categoria')} />
              </Campo>
            )}
            {cap.campos.fuente.editable && (
              <Campo etiqueta="Fuente del ingreso">
                <Selector id="e-fuente" etiqueta="Fuente" valor={fuenteId} alCambiar={setFuenteId} opciones={opcionesCuentas('fuente')} />
              </Campo>
            )}
            <Campo etiqueta={m.sinHora ? 'Fecha' : 'Fecha y hora'} motivo={motivo('fecha')}>
              <input type={m.sinHora ? 'date' : 'datetime-local'} id="e-fecha" value={fecha} max={aCampoFecha(aLocal(ctx.ahora), m.sinHora)} onInput={e => setFecha((e.target as HTMLInputElement).value)} disabled={!cap.campos.fecha.editable} />
            </Campo>

            {(bloqueos.length > 0 || error) && (
              <div class="callout !border-neg" role="alert" id="e-bloqueos">
                <span class="callout-ico text-neg"><Ban size={16} /></span>
                <span class="callout-txt">{[error, ...bloqueos].filter(Boolean).map(b => <span key={b} class="block">{b}</span>)}</span>
              </div>
            )}
            {prev.ok && prev.avisos.length > 0 && !bloqueos.length && (
              <div class="callout" id="e-avisos">
                <span class="callout-ico text-adv"><AlertTriangle size={16} /></span>
                <span class="callout-txt">{prev.avisos.map(a => <span key={a} class="block">{a}</span>)}</span>
              </div>
            )}

            <div class="acciones">
              <button class="primario" type="submit" id="e-guardar" disabled={!hayCambios || bloqueos.length > 0}><Check size={18} />Guardar cambios</button>
              <button class="secundario" type="button" id="e-cancelar" onClick={cerrar}><X size={18} />Cancelar</button>
            </div>
            {!hayCambios && !bloqueos.length && <p class="sub">Todavía no cambiaste nada.</p>}
          </form>
        )}

        {paso === 'resumen' && prev.ok && (
          <div id="paso-resumen">
            <h3 class="!mt-0">Esto es lo que cambia</h3>
            <ul class="lista" id="r-cambios">
              {prev.cambios.map(c => (
                <li key={c.campo} class="fila" style={{ cursor: 'default' }}>
                  <div class="w-full">
                    <div class="etiqueta">{c.etiqueta}</div>
                    <div class="sub">Antes: <b class="text-tx">{c.antes || 'sin dato'}</b></div>
                    <div class="sub">Después: <b class="text-tx">{c.despues || 'sin dato'}</b></div>
                  </div>
                </li>
              ))}
            </ul>

            {prev.saldos.length > 0 ? <>
              <h3>Cómo quedan los saldos</h3>
              <ul class="lista" id="r-saldos">
                {prev.saldos.map(s => (
                  <li key={s.cuentaId + s.moneda} class="fila" style={{ cursor: 'default' }}>
                    <div class="w-full">
                      <div class="titulo">{s.nombre}</div>
                      <div class="sub">Antes: <b class="text-tx">{formatear(s.antes, s.moneda)}</b></div>
                      <div class="sub">Después: <b class={s.despues < 0 ? 'text-neg' : 'text-tx'}>{formatear(s.despues, s.moneda)}</b></div>
                    </div>
                  </li>
                ))}
              </ul>
            </> : <p class="sub">Los saldos no cambian.</p>}

            {prev.avisos.length > 0 && (
              <div class="callout" id="r-avisos">
                <span class="callout-ico text-adv"><AlertTriangle size={16} /></span>
                <span class="callout-txt">{prev.avisos.map(a => <span key={a} class="block">{a}</span>)}</span>
              </div>
            )}
            <p class="sub">Al confirmar, el movimiento se reemplaza por esta versión y queda anotado que se editó. No queda un duplicado anulado.</p>

            <div class="acciones">
              <button class="primario" id="r-confirmar" disabled={guardando} onClick={() => void guardar()}><Check size={18} />{guardando ? 'Guardando...' : 'Sí, guardar los cambios'}</button>
              <button class="secundario" id="r-volver" disabled={guardando} onClick={() => setPaso('formulario')}><Pencil size={18} />Volver al formulario</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
