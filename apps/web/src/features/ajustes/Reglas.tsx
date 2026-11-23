/**
 * «Reglas aprendidas» en Ajustes: las que la persona aceptó al corregir un movimiento («Laura va a Nequi»). Se puede
 * cambiar la cuenta o la categoría de cada una y borrarla. Borrar una regla no toca ningún movimiento: es solo un ajuste.
 */
import { Pause, Pencil, Play, Trash2 } from 'lucide-preact';
import { borrarRegla, editarRegla, type ReglaAprendida } from '../../../../../packages/core/src/index.ts';
import { confirmar, pedir } from '../../components/ui/Dialogo.tsx';
import { Selector } from '../../components/ui/Selector.tsx';
import { reglas, guardarReglas } from '../../state/reglas.ts';
import { datos } from '../../state/store.ts';

const SIN = '';

export function Reglas() {
  const lista = reglas.value;
  const cuentas = datos.value?.cuentas ?? [];
  const opciones = (tipo: 'dinero' | 'categoria', conNinguna: boolean) => [
    ...(conNinguna ? [{ valor: SIN, etiqueta: tipo === 'dinero' ? 'Sin cuenta fija' : 'Sin categoría fija' }] : []),
    ...cuentas.filter(c => c.tipo === tipo && c.id !== 'cat:descuadre' && (tipo !== 'dinero' || c.moneda === 'COP'))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => ({ valor: c.id, etiqueta: c.nombre })),
  ];

  const quitar = async (r: ReglaAprendida) => {
    if (await confirmar({ titulo: `¿Borrar la regla de ${r.clave}?`, texto: 'Los movimientos ya anotados no cambian. Solo dejo de usar esta regla al escribir.', aceptar: 'Sí, borrar', peligro: true })) {
      await guardarReglas(borrarRegla(lista, r.id));
    }
  };

  const renombrar = async (r: ReglaAprendida) => {
    const nueva = await pedir({ titulo: 'Cambiar la palabra de la regla', texto: 'La regla se activa cuando escribes esta palabra.', valor: r.clave, aceptar: 'Guardar' });
    if (nueva?.trim()) await guardarReglas(editarRegla(lista, r.id, { clave: nueva }));
  };

  return (
    <div id="reglas-aprendidas">
      {lista.length === 0 ? (
        <p class="sub" id="reglas-vacio">Todavía no hay reglas. Cuando corrijas la cuenta o la categoría de un movimiento que acabas de anotar, te pregunto si quieres que la próxima vez lo haga solo, por ejemplo «Laura va a Nequi». Aparecen aquí.</p>
      ) : <>
        <p class="sub">Si escribes una de estas palabras y no dices la cuenta, uso la de la regla. Lo que escribas en la frase siempre gana.</p>
        <ul class="lista">
          {lista.map(r => (
            <li key={r.id} class={`fila ${r.pausada ? 'opacity-60' : ''}`} style={{ cursor: 'default' }} data-regla={r.clave} data-pausada={r.pausada ? '1' : undefined}>
              <div class="w-full">
                <div class="titulo flex min-w-0 flex-wrap items-center gap-x-2"><span class="min-w-0 break-words">{r.clave}</span>{r.pausada && <span class="text-[.7rem] font-normal text-tx2">En pausa</span>}</div>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <Selector id={`regla-cuenta-${r.id}`} etiqueta="Cuenta" valor={r.cuentaId ?? SIN} opciones={opciones('dinero', Boolean(r.categoriaId))}
                    alCambiar={v => void guardarReglas(editarRegla(lista, r.id, { cuentaId: v || null }))} />
                  <Selector id={`regla-categoria-${r.id}`} etiqueta="Categoría" valor={r.categoriaId ?? SIN} opciones={opciones('categoria', Boolean(r.cuentaId))}
                    alCambiar={v => void guardarReglas(editarRegla(lista, r.id, { categoriaId: v || null }))} />
                </div>
              </div>
              <span class="flex shrink-0 flex-wrap justify-end gap-1">
                <button class="secundario regla-pausar !min-h-9 !px-2" aria-pressed={Boolean(r.pausada)} aria-label={r.pausada ? `Reanudar la regla de ${r.clave}` : `Pausar la regla de ${r.clave}`} title={r.pausada ? 'Reanudar' : 'Pausar'}
                  onClick={() => void guardarReglas(editarRegla(lista, r.id, { pausada: !r.pausada }))}>{r.pausada ? <Play size={16} /> : <Pause size={16} />}</button>
                <button class="secundario regla-editar !min-h-9 !px-2" aria-label={`Cambiar la palabra de ${r.clave}`} onClick={() => void renombrar(r)}><Pencil size={16} /></button>
                <button class="secundario !min-h-9 !px-2" aria-label={`Borrar la regla de ${r.clave}`} onClick={() => void quitar(r)}><Trash2 size={16} /></button>
              </span>
            </li>
          ))}
        </ul>
      </>}
    </div>
  );
}
