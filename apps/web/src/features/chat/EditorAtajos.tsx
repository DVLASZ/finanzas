/**
 * El editor de los botones rápidos del chat: crear, cambiar, ordenar y quitar los tuyos, y mostrar u ocultar la barra.
 * Cada atajo tiene dos modos: «plantilla» deja el texto escrito en el cuadro para ponerle el monto y la cuenta, y «frase»
 * (con monto y cuenta ya dichos) arma directo la tarjeta por confirmar.
 */
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { etiquetaDe, MAX_ATAJOS, modoSugerido, moverAtajo, sugerenciasAtajos, type AtajoUsuario } from '../../../../../packages/core/src/index.ts';
import { confirmar } from '../../components/ui/Dialogo.tsx';
import { Insignia, visualDeNombre } from '../../components/ui/iconos.tsx';
import { subirDesdeAbajo } from '../../lib/efectos.ts';
import { atajosUsuario, barraOculta, cargarAtajos, editorAtajos, guardarAtajos, ocultarBarra } from '../../state/atajos.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';

interface Borrador { id: string | null; etiqueta: string; frase: string; modo: AtajoUsuario['modo']; modoTocado: boolean }
const VACIO: Borrador = { id: null, etiqueta: '', frase: '', modo: 'plantilla', modoTocado: false };

export function EditorAtajos() {
  const abierto = editorAtajos.value;
  const lista = atajosUsuario.value;
  const datos = datosSignal.value;
  const ctx = contexto.value;
  const hoja = useRef<HTMLDivElement>(null);
  const [b, setB] = useState<Borrador | null>(null);
  useEffect(() => { if (abierto) { void cargarAtajos(); setB(null); if (hoja.current) subirDesdeAbajo(hoja.current); } }, [abierto]);
  if (!abierto) return null;
  const cerrar = () => { editorAtajos.value = false; };
  const sugeridas = datos && ctx && !b ? sugerenciasAtajos(datos.movimientos, ctx.ahora, lista) : [];

  const guardar = (e: Event) => {
    e.preventDefault();
    if (!b) return;
    const frase = b.frase.trim();
    if (!frase) return;
    const nuevo: AtajoUsuario = { id: b.id ?? `a${Date.now().toString(36)}`, etiqueta: (b.etiqueta.trim() || etiquetaDe(frase)).slice(0, 24), frase: frase.slice(0, 80), modo: b.modo };
    guardarAtajos(b.id ? lista.map(x => (x.id === b.id ? nuevo : x)) : [...lista, nuevo]);
    setB(null);
  };
  const quitar = async (a: AtajoUsuario) => {
    if (await confirmar({ titulo: `¿Quitar «${a.etiqueta}»?`, texto: 'Solo se quita el botón. No cambia ningún movimiento.', aceptar: 'Sí, quitar', peligro: true })) guardarAtajos(lista.filter(x => x.id !== a.id));
  };
  const abrirForm = (x: Partial<Borrador>) => setB({ ...VACIO, ...x });

  return createPortal(
    <div id="atajos-editor" class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={e => { if (e.target === e.currentTarget) cerrar(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (b) setB(null); else cerrar(); } }}>
      <div ref={hoja} role="dialog" aria-modal="true" aria-label="Botones rápidos del chat" class="cristal max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-[1.8rem] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,.6)]">
        <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-bor" />
        <h3 class="!mt-0 !normal-case !tracking-normal !text-tx !text-base">Botones rápidos del chat</h3>
        <p class="sub !mt-0">Tú decides cuáles hay. Una plantilla deja el texto escrito para ponerle el monto; una frase completa arma la tarjeta directo.</p>
        <label class="check-chip check !my-2"><input type="checkbox" id="at-mostrar" checked={!barraOculta.value} onChange={e => ocultarBarra(!(e.target as HTMLInputElement).checked)} />Mostrar la barra en el chat</label>

        {!b && <>
          <ul class="lista !mt-3" id="at-lista">
            {lista.length === 0 && <li class="vacio">Aún no tienes botones. Agrega el primero.</li>}
            {lista.map((a, i) => (
              <li key={a.id} class="fila" style={{ cursor: 'default' }} data-atajo-id={a.id}>
                <span class="flex min-w-0 items-center gap-2.5">
                  <Insignia v={visualDeNombre(a.frase)} tam={34} redondo />
                  <span class="min-w-0"><span class="titulo block truncate">{a.etiqueta}</span><span class="sub block truncate">{a.modo === 'plantilla' ? 'Plantilla' : 'Frase'}: {a.frase}</span></span>
                </span>
                <span class="flex shrink-0 gap-1">
                  <button type="button" class="secundario !min-h-9 !px-2" aria-label={`Subir ${a.etiqueta}`} disabled={i === 0} onClick={() => guardarAtajos(moverAtajo(lista, i, -1))}><ArrowUp size={16} /></button>
                  <button type="button" class="secundario !min-h-9 !px-2" aria-label={`Bajar ${a.etiqueta}`} disabled={i === lista.length - 1} onClick={() => guardarAtajos(moverAtajo(lista, i, 1))}><ArrowDown size={16} /></button>
                  <button type="button" class="secundario !min-h-9 !px-2" aria-label={`Editar ${a.etiqueta}`} data-editar={a.id} onClick={() => abrirForm({ id: a.id, etiqueta: a.etiqueta, frase: a.frase, modo: a.modo, modoTocado: true })}><Pencil size={16} /></button>
                  <button type="button" class="secundario !min-h-9 !px-2 !text-neg" aria-label={`Quitar ${a.etiqueta}`} data-quitar={a.id} onClick={() => void quitar(a)}><Trash2 size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
          {sugeridas.length > 0 && (
            <div class="mt-3">
              <div class="etiqueta mb-1.5">Lo que más repites</div>
              <div class="opciones" id="at-sugeridas">{sugeridas.map(s => <button key={s} type="button" class="chip" onClick={() => abrirForm({ frase: s, modo: modoSugerido(s) })}><Plus size={14} />{s}</button>)}</div>
            </div>
          )}
          <div class="acciones">
            <button type="button" class="primario" id="at-nuevo" disabled={lista.length >= MAX_ATAJOS} onClick={() => abrirForm({})}><Plus size={18} />Nuevo botón</button>
            <button type="button" class="secundario" id="at-cerrar" onClick={cerrar}><Check size={18} />Listo</button>
          </div>
          {lista.length >= MAX_ATAJOS && <p class="sub">Máximo {MAX_ATAJOS} botones.</p>}
        </>}

        {b && (
          <form id="at-form" class="mt-3 grid gap-1" onSubmit={guardar}>
            <label>Lo que dice el botón (opcional)<input id="at-etiqueta" type="text" maxLength={24} placeholder="Ej.: Recarga Nequi" value={b.etiqueta} onInput={e => setB({ ...b, etiqueta: (e.target as HTMLInputElement).value })} /></label>
            <label>Lo que escribe al tocarlo<input id="at-frase" type="text" maxLength={80} required placeholder="Ej.: recarga nequi  (o: mecato 3000 efectivo)" value={b.frase} autoFocus
              onInput={e => { const frase = (e.target as HTMLInputElement).value; setB({ ...b, frase, modo: b.modoTocado ? b.modo : modoSugerido(frase) }); }} /></label>
            <div class="opciones" role="group" aria-label="Qué hace al tocarlo">
              <button type="button" id="at-modo-plantilla" aria-pressed={b.modo === 'plantilla'} onClick={() => setB({ ...b, modo: 'plantilla', modoTocado: true })}>Plantilla</button>
              <button type="button" id="at-modo-frase" aria-pressed={b.modo === 'frase'} onClick={() => setB({ ...b, modo: 'frase', modoTocado: true })}>Frase completa</button>
            </div>
            <p class="sub !mt-1">{b.modo === 'plantilla' ? 'Al tocarlo, el texto queda en el cuadro y tú pones el monto y la cuenta antes de enviar.' : 'Al tocarlo, se arma la tarjeta con esa frase y tú pulsas Confirmar. Escribe monto y cuenta, por ejemplo «recarga 20000 nequi».'}</p>
            <div class="acciones">
              <button type="submit" class="primario" id="at-guardar"><Check size={18} />Guardar</button>
              <button type="button" class="secundario" id="at-cancelar" onClick={() => setB(null)}><X size={18} />Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
